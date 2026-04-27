import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from rapidfuzz import fuzz
from sqlalchemy import or_
from sqlalchemy.orm import Session

from db_service.main import DuplicateCandidate, Ticket, TicketRepository


MATCH_THRESHOLD = 60.0
LOOKBACK_DAYS = 14
MAX_CANDIDATES = 8

IGNORED_TICKET_STATUSES = {"DELETE", "REJECTED"}
PAIR_FINAL_STATUSES = {"DISMISSED", "MERGED"}

CATEGORY_ALIASES = {
    "garbage": "litter",
    "trash": "litter",
    "snow": "sidewalk_snow",
    "ice": "sidewalk_snow",
    "hole": "pothole",
    "road_damage": "pothole",
}

STREET_REPLACEMENTS = {
    "st": "street",
    "str": "street",
    "rd": "road",
    "ave": "avenue",
    "av": "avenue",
    "blvd": "boulevard",
    "dr": "drive",
    "ln": "lane",
    "ct": "court",
    "cres": "crescent",
    "n": "north",
    "s": "south",
    "e": "east",
    "w": "west",
}


def _normalize_category(value: Optional[str]) -> str:
    text = re.sub(r"[^a-z0-9_ ]+", " ", str(value or "").lower()).strip()
    text = re.sub(r"\s+", "_", text)
    return CATEGORY_ALIASES.get(text, text)


def _normalize_text(value: Optional[str]) -> str:
    text = re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())
    tokens = [STREET_REPLACEMENTS.get(tok, tok) for tok in text.split()]
    return " ".join(tokens)


def _ticket_text(ticket: Ticket) -> str:
    return " ".join(
        part
        for part in [
            ticket.description or "",
            ticket.transcript or "",
            ticket.notes or "",
        ]
        if part
    )


def _is_merged_duplicate_ticket(ticket: Ticket) -> bool:
    return (
        str(ticket.ticket_status or "").upper() == "RESOLVED"
        and (
            str(ticket.routing_status or "").upper() == "MERGED"
            or str(ticket.workflow_stage or "").upper() == "MERGED_DUPLICATE"
        )
    )


def _category_score(a: Ticket, b: Ticket) -> float:
    left = _normalize_category(a.category)
    right = _normalize_category(b.category)
    if not left or not right:
        return 45.0
    if left == right:
        return 100.0
    return float(fuzz.token_set_ratio(left, right))


_DIRECTION_TOKENS = {"east", "west", "north", "south"}


def _extract_street_number(location: str) -> Optional[int]:
    m = re.match(r"(\d+)\s+", location.strip())
    return int(m.group(1)) if m else None


def _location_score(a: Ticket, b: Ticket) -> float:
    left = _normalize_text(a.location)
    right = _normalize_text(b.location)
    if not left or not right:
        return 0.0

    left_dirs = _DIRECTION_TOKENS & set(left.split())
    right_dirs = _DIRECTION_TOKENS & set(right.split())
    if left_dirs and right_dirs and left_dirs != right_dirs:
        # Both addresses have a direction suffix but they differ → different street branches
        return 10.0

    base = float(fuzz.token_set_ratio(left, right))

    num_a = _extract_street_number(left)
    num_b = _extract_street_number(right)
    if num_a and num_b and num_a != num_b:
        diff = abs(num_a - num_b)
        if diff > 50:
            return min(base, 35.0)
        if diff > 20:
            return min(base, 60.0)

    return base


def _text_score(a: Ticket, b: Ticket) -> float:
    left = _normalize_text(_ticket_text(a))
    right = _normalize_text(_ticket_text(b))
    if not left or not right:
        return 0.0
    return float(fuzz.token_set_ratio(left, right))


def _time_score(a: Ticket, b: Ticket) -> float:
    if not a.created_at or not b.created_at:
        return 50.0
    delta_hours = abs((a.created_at - b.created_at).total_seconds()) / 3600
    if delta_hours <= 24:
        return 100.0
    if delta_hours >= LOOKBACK_DAYS * 24:
        return 0.0
    return max(0.0, 100.0 - (delta_hours / (LOOKBACK_DAYS * 24)) * 100.0)


def score_ticket_pair(ticket: Ticket, candidate: Ticket) -> Dict[str, object]:
    category = _category_score(ticket, candidate)
    location = _location_score(ticket, candidate)
    text = _text_score(ticket, candidate)
    time = _time_score(ticket, candidate)

    match = (0.25 * category) + (0.45 * location) + (0.20 * text) + (0.10 * time)
    reasons: List[str] = []
    if category >= 95:
        reasons.append("same_category")
    elif category >= 70:
        reasons.append("similar_category")
    if location >= 85:
        reasons.append("same_or_near_location")
    elif location >= 70:
        reasons.append("similar_location")
    if text >= 80:
        reasons.append("similar_description")
    if time >= 85:
        reasons.append("recent_report")

    return {
        "match_score": round(match, 2),
        "category_score": round(category, 2),
        "location_score": round(location, 2),
        "text_score": round(text, 2),
        "time_score": round(time, 2),
        "reason_codes": reasons,
    }


class DuplicateCandidateRepository:
    def __init__(self, db: Session):
        self.db = db

    def _find_existing(self, ticket_id: str, candidate_ticket_id: str) -> Optional[DuplicateCandidate]:
        return (
            self.db.query(DuplicateCandidate)
            .filter(
                or_(
                    (DuplicateCandidate.ticket_id == ticket_id)
                    & (DuplicateCandidate.candidate_ticket_id == candidate_ticket_id),
                    (DuplicateCandidate.ticket_id == candidate_ticket_id)
                    & (DuplicateCandidate.candidate_ticket_id == ticket_id),
                )
            )
            .first()
        )

    def upsert_pending(self, ticket_id: str, candidate_ticket_id: str, score: Dict[str, object]) -> DuplicateCandidate:
        existing = self._find_existing(ticket_id, candidate_ticket_id)
        if existing:
            if existing.status in PAIR_FINAL_STATUSES:
                return existing
            existing.ticket_id = ticket_id
            existing.candidate_ticket_id = candidate_ticket_id
            existing.match_score = score["match_score"]
            existing.category_score = score["category_score"]
            existing.location_score = score["location_score"]
            existing.text_score = score["text_score"]
            existing.time_score = score["time_score"]
            existing.reason_codes = score["reason_codes"]
            existing.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(existing)
            return existing

        candidate = DuplicateCandidate(
            duplicate_id=f"DUP-{uuid4().hex[:12].upper()}",
            ticket_id=ticket_id,
            candidate_ticket_id=candidate_ticket_id,
            match_score=score["match_score"],
            category_score=score["category_score"],
            location_score=score["location_score"],
            text_score=score["text_score"],
            time_score=score["time_score"],
            reason_codes=score["reason_codes"],
            status="PENDING",
        )
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def list_candidates(self, status: Optional[str] = None, limit: int = 50) -> List[DuplicateCandidate]:
        query = self.db.query(DuplicateCandidate)
        if status:
            query = query.filter(DuplicateCandidate.status == status.upper())
        else:
            query = query.filter(DuplicateCandidate.status != "DISMISSED")
        return query.order_by(DuplicateCandidate.created_at.desc()).limit(limit).all()

    def get(self, duplicate_id: str) -> Optional[DuplicateCandidate]:
        return (
            self.db.query(DuplicateCandidate)
            .filter(DuplicateCandidate.duplicate_id == duplicate_id)
            .first()
        )

    def set_status(self, duplicate_id: str, status: str, reviewed_by: Optional[str] = None) -> Optional[DuplicateCandidate]:
        candidate = self.get(duplicate_id)
        if not candidate:
            return None
        candidate.status = status.upper()
        candidate.reviewed_by = reviewed_by
        candidate.reviewed_at = datetime.utcnow()
        candidate.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(candidate)
        return candidate


def find_and_store_duplicates(
    db: Session,
    ticket_id: str,
    threshold: float = MATCH_THRESHOLD,
    lookback_days: int = LOOKBACK_DAYS,
    max_candidates: int = MAX_CANDIDATES,
) -> List[DuplicateCandidate]:
    ticket = TicketRepository(db).get_ticket_by_number(ticket_id)
    if not ticket:
        return []
    if _is_merged_duplicate_ticket(ticket):
        return []

    since = (ticket.created_at or datetime.utcnow()) - timedelta(days=lookback_days)
    repo = DuplicateCandidateRepository(db)

    query = (
        db.query(Ticket)
        .filter(Ticket.ticket_id != ticket.ticket_id)
        .filter(Ticket.created_at >= since)
    )

    if ticket.category:
        normalized_category = _normalize_category(ticket.category)
        possible_categories = {normalized_category}
        possible_categories.update(k for k, v in CATEGORY_ALIASES.items() if v == normalized_category)
        query = query.filter(Ticket.category != None)  # noqa: E711

    candidates = []
    for candidate in query.order_by(Ticket.created_at.desc()).limit(250).all():
        status = str(candidate.ticket_status or "").upper()
        if status in IGNORED_TICKET_STATUSES:
            continue
        if _is_merged_duplicate_ticket(candidate):
            continue
        score = score_ticket_pair(ticket, candidate)
        if score["category_score"] < 70:
            continue
        if score["location_score"] < 70 and score["text_score"] < 80:
            continue
        if score["match_score"] >= threshold:
            candidates.append((score["match_score"], candidate, score))

    saved = []
    for _, candidate, score in sorted(candidates, key=lambda item: item[0], reverse=True)[:max_candidates]:
        saved.append(repo.upsert_pending(ticket.ticket_id, candidate.ticket_id, score))
    return saved


def append_note(existing: Optional[str], note: str) -> str:
    existing_text = str(existing or "").strip()
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    line = f"[{timestamp}] {note}"
    return f"{existing_text}\n{line}".strip() if existing_text else line
