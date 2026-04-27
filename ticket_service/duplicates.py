from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from db_service.main import DuplicateCandidate, Ticket, TicketRepository, get_db
from ticket_service.duplicate_detection import (
    DuplicateCandidateRepository,
    append_note,
    find_and_store_duplicates,
)

router = APIRouter()


class ReviewRequest(BaseModel):
    reviewed_by: Optional[str] = None


def _resolve_canonical_parent_id(ticket_id: str, db: Session) -> str:
    """Follow merged duplicate links until the active parent ticket is found."""
    current_id = ticket_id
    visited = set()
    ticket_repo = TicketRepository(db)

    while current_id and current_id not in visited:
        visited.add(current_id)
        current_ticket = ticket_repo.get_ticket_by_number(current_id)
        if not _is_merged_ticket(current_ticket):
            break
        parent_link = (
            db.query(DuplicateCandidate)
            .filter(
                DuplicateCandidate.ticket_id == current_id,
                DuplicateCandidate.status == "MERGED",
            )
            .order_by(DuplicateCandidate.reviewed_at.desc().nullslast(), DuplicateCandidate.updated_at.desc())
            .first()
        )
        if not parent_link or not parent_link.candidate_ticket_id:
            break
        current_id = parent_link.candidate_ticket_id

    return current_id or ticket_id


def _is_merged_ticket(ticket: Optional[Ticket]) -> bool:
    if not ticket:
        return False
    return (
        str(ticket.ticket_status or "").upper() == "RESOLVED"
        and str(ticket.routing_status or "").upper() == "MERGED"
    )


def _find_existing_pair(
    db: Session,
    ticket_id: str,
    candidate_ticket_id: str,
    exclude_duplicate_id: Optional[str] = None,
) -> Optional[DuplicateCandidate]:
    query = db.query(DuplicateCandidate).filter(
        or_(
            (DuplicateCandidate.ticket_id == ticket_id)
            & (DuplicateCandidate.candidate_ticket_id == candidate_ticket_id),
            (DuplicateCandidate.ticket_id == candidate_ticket_id)
            & (DuplicateCandidate.candidate_ticket_id == ticket_id),
        )
    )
    if exclude_duplicate_id:
        query = query.filter(DuplicateCandidate.duplicate_id != exclude_duplicate_id)
    return query.first()


def _append_unique_note(existing: Optional[str], note: str) -> str:
    existing_text = str(existing or "")
    if note in existing_text:
        return existing_text
    return append_note(existing_text, note)


def _set_candidate_status(candidate: DuplicateCandidate, status: str, reviewer: str, db: Session) -> DuplicateCandidate:
    candidate.status = status.upper()
    candidate.reviewed_by = reviewer
    candidate.reviewed_at = datetime.utcnow()
    candidate.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(candidate)
    return candidate


def _mark_ticket_as_merged_duplicate(
    ticket_repo: TicketRepository,
    duplicate: Ticket,
    primary: Ticket,
    reviewer: str,
    note: Optional[str] = None,
) -> None:
    ticket_repo.update_ticket_fields(
        duplicate.ticket_id,
        {
            "ticket_status": primary.ticket_status,
            "routing_status": "MERGED",
            "workflow_stage": "MERGED_DUPLICATE",
            "notes": _append_unique_note(
                duplicate.notes,
                note
                or f"Marked as duplicate of {primary.ticket_id} by {reviewer}. Evidence preserved on this ticket.",
            ),
        },
    )


def _choose_group_parent_id(left_id: str, right_id: str, db: Session) -> str:
    """Pick the canonical active parent for a duplicate group."""
    repo = TicketRepository(db)
    left_root_id = _resolve_canonical_parent_id(left_id, db)
    right_root_id = _resolve_canonical_parent_id(right_id, db)
    if left_root_id == right_root_id:
        return left_root_id
    if left_root_id != left_id and right_root_id == right_id:
        return left_root_id
    if right_root_id != right_id and left_root_id == left_id:
        return right_root_id

    left = repo.get_ticket_by_number(left_root_id)
    right = repo.get_ticket_by_number(right_root_id)
    if not left:
        return right_root_id
    if not right:
        return left_root_id

    left_is_merged = _is_merged_ticket(left)
    right_is_merged = _is_merged_ticket(right)
    if left_is_merged and not right_is_merged:
        return right_root_id
    if right_is_merged and not left_is_merged:
        return left_root_id

    left_created = left.created_at
    right_created = right.created_at
    if left_created and right_created:
        return left_root_id if left_created <= right_created else right_root_id
    return left_root_id


def _choose_component_parent_id(ticket_ids: set, db: Session) -> Optional[str]:
    repo = TicketRepository(db)
    tickets = {ticket_id: repo.get_ticket_by_number(ticket_id) for ticket_id in ticket_ids}
    inbound_counts = {
        ticket_id: (
            db.query(DuplicateCandidate)
            .filter(
                DuplicateCandidate.status == "MERGED",
                DuplicateCandidate.candidate_ticket_id == ticket_id,
                DuplicateCandidate.ticket_id != ticket_id,
            )
            .count()
        )
        for ticket_id in ticket_ids
    }

    def sort_key(ticket_id: str):
        ticket = tickets.get(ticket_id)
        is_merged = _is_merged_ticket(ticket)
        created_at = ticket.created_at if ticket and ticket.created_at else datetime.max
        return (is_merged, -inbound_counts.get(ticket_id, 0), created_at, ticket_id)

    existing = [ticket_id for ticket_id, ticket in tickets.items() if ticket]
    return sorted(existing, key=sort_key)[0] if existing else None


def _connected_merged_ticket_ids(seed_ids: set, db: Session) -> set:
    if not seed_ids:
        return set()

    rows = db.query(DuplicateCandidate).filter(DuplicateCandidate.status == "MERGED").all()
    graph = {}
    for row in rows:
        if row.ticket_id == row.candidate_ticket_id:
            continue
        graph.setdefault(row.ticket_id, set()).add(row.candidate_ticket_id)
        graph.setdefault(row.candidate_ticket_id, set()).add(row.ticket_id)

    seen = set(seed_ids)
    queue = list(seed_ids)
    while queue:
        current = queue.pop(0)
        for neighbor in graph.get(current, set()):
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
    return seen


def _ensure_group_candidate(child_id: str, parent_id: str, reviewer: str, db: Session) -> Optional[DuplicateCandidate]:
    if not child_id or not parent_id or child_id == parent_id:
        return None

    existing = _find_existing_pair(db, child_id, parent_id)
    if existing:
        if existing.ticket_id != child_id or existing.candidate_ticket_id != parent_id:
            same_direction = _find_existing_pair(db, child_id, parent_id, existing.duplicate_id)
            if not same_direction:
                existing.ticket_id = child_id
                existing.candidate_ticket_id = parent_id
        if existing.status != "MERGED":
            existing.status = "MERGED"
        existing.reviewed_by = reviewer
        existing.reviewed_at = datetime.utcnow()
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    candidate = DuplicateCandidate(
        duplicate_id=f"DUP-{uuid4().hex[:12].upper()}",
        ticket_id=child_id,
        candidate_ticket_id=parent_id,
        match_score=100,
        category_score=100,
        location_score=100,
        text_score=100,
        time_score=100,
        reason_codes=["chain_repair"],
        status="MERGED",
        reviewed_by=reviewer,
        reviewed_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _enforce_duplicate_group(seed_ids: set, reviewer: str, db: Session) -> list:
    ticket_repo = TicketRepository(db)
    group_ids = _connected_merged_ticket_ids(seed_ids, db) | set(seed_ids or [])
    parent_id = _choose_component_parent_id(group_ids, db)
    if not parent_id:
        return []

    parent = ticket_repo.get_ticket_by_number(parent_id)
    repaired = []

    for candidate in (
        db.query(DuplicateCandidate)
        .filter(
            DuplicateCandidate.status == "MERGED",
            DuplicateCandidate.ticket_id.in_(group_ids),
            DuplicateCandidate.ticket_id == DuplicateCandidate.candidate_ticket_id,
        )
        .all()
    ):
        _set_candidate_status(candidate, "DISMISSED", reviewer, db)

    for child_id in sorted(group_ids):
        if child_id == parent_id:
            continue
        child = ticket_repo.get_ticket_by_number(child_id)
        if not child:
            continue

        existing = _ensure_group_candidate(child_id, parent_id, reviewer, db)
        if existing:
            repaired.append(existing)

        _mark_ticket_as_merged_duplicate(
            ticket_repo,
            child,
            parent,
            reviewer,
            f"Marked as duplicate of {parent.ticket_id} during duplicate chain repair by {reviewer}.",
        )
        ticket_repo.update_ticket_fields(
            parent.ticket_id,
            {
                "notes": _append_unique_note(
                    parent.notes,
                    f"Duplicate report {child.ticket_id} re-linked into duplicate group by {reviewer}.",
                ),
            },
        )

    stale_edges = (
        db.query(DuplicateCandidate)
        .filter(
            DuplicateCandidate.status == "MERGED",
            DuplicateCandidate.ticket_id.in_(group_ids),
            DuplicateCandidate.candidate_ticket_id.in_(group_ids),
            DuplicateCandidate.candidate_ticket_id != parent_id,
        )
        .all()
    )
    for edge in stale_edges:
        _set_candidate_status(edge, "DISMISSED", reviewer, db)

    return repaired


def _relink_merged_children(old_parent_id: str, new_parent_id: str, reviewer: str, db: Session) -> list:
    """Move already-merged children from an intermediate parent to the canonical parent."""
    if not old_parent_id or old_parent_id == new_parent_id:
        return []

    ticket_repo = TicketRepository(db)
    primary = ticket_repo.get_ticket_by_number(new_parent_id)
    if not primary:
        return []

    relinked = []
    children = (
        db.query(DuplicateCandidate)
        .filter(
            DuplicateCandidate.candidate_ticket_id == old_parent_id,
            DuplicateCandidate.status == "MERGED",
            DuplicateCandidate.ticket_id != new_parent_id,
        )
        .all()
    )

    for child in children:
        if child.ticket_id == new_parent_id:
            continue
        existing = _find_existing_pair(db, child.ticket_id, new_parent_id, child.duplicate_id)
        if existing:
            relinked.append(existing)
            continue

        duplicate = ticket_repo.get_ticket_by_number(child.ticket_id)
        child.candidate_ticket_id = new_parent_id
        db.commit()
        db.refresh(child)
        if duplicate:
            _mark_ticket_as_merged_duplicate(
                ticket_repo,
                duplicate,
                primary,
                reviewer,
                f"Duplicate parent corrected from {old_parent_id} to {new_parent_id} by {reviewer}.",
            )
            ticket_repo.update_ticket_fields(
                primary.ticket_id,
                {
                    "notes": _append_unique_note(
                        primary.notes,
                        f"Duplicate report {duplicate.ticket_id} re-linked from {old_parent_id} by {reviewer}.",
                    ),
                },
            )
        relinked.append(child)

    return relinked


def _ticket_summary(ticket: Optional[Ticket]) -> Optional[dict]:
    if not ticket:
        return None
    return {
        "id": ticket.ticket_id,
        "ticket_id": ticket.ticket_id,
        "status": ticket.ticket_status,
        "category": ticket.category,
        "location": ticket.location,
        "description": ticket.description or ticket.transcript or ticket.notes or "",
        "caller": ticket.caller_name,
        "phone": ticket.phone_number,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }


def duplicate_to_dict(candidate: DuplicateCandidate, db: Session) -> dict:
    repo = TicketRepository(db)
    new_ticket = repo.get_ticket_by_number(candidate.ticket_id)
    canonical_parent_id = _resolve_canonical_parent_id(candidate.candidate_ticket_id, db)
    existing_ticket = repo.get_ticket_by_number(canonical_parent_id)
    return {
        "id": candidate.duplicate_id,
        "duplicate_id": candidate.duplicate_id,
        "status": candidate.status.lower(),
        "match_score": round(float(candidate.match_score or 0), 1),
        "category_score": round(float(candidate.category_score or 0), 1),
        "location_score": round(float(candidate.location_score or 0), 1),
        "text_score": round(float(candidate.text_score or 0), 1),
        "time_score": round(float(candidate.time_score or 0), 1),
        "reason_codes": candidate.reason_codes or [],
        "detected_at": candidate.created_at.isoformat() if candidate.created_at else None,
        "reviewed_at": candidate.reviewed_at.isoformat() if candidate.reviewed_at else None,
        "reviewed_by": candidate.reviewed_by,
        "ticket_id": candidate.ticket_id,
        "candidate_ticket_id": canonical_parent_id,
        "direct_candidate_ticket_id": candidate.candidate_ticket_id,
        "category": (new_ticket.category if new_ticket else None) or (existing_ticket.category if existing_ticket else None),
        "original": _ticket_summary(existing_ticket),
        "duplicate": _ticket_summary(new_ticket),
    }


@router.get("/")
def list_duplicates(status: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    repo = DuplicateCandidateRepository(db)
    candidates = repo.list_candidates(status=status, limit=limit)
    return {
        "total": len(candidates),
        "duplicates": [duplicate_to_dict(candidate, db) for candidate in candidates],
    }


@router.get("/ticket/{ticket_id}")
def list_ticket_duplicates(ticket_id: str, db: Session = Depends(get_db)):
    repo = DuplicateCandidateRepository(db)
    candidates = (
        db.query(DuplicateCandidate)
        .filter(
            (DuplicateCandidate.ticket_id == ticket_id)
            | (DuplicateCandidate.candidate_ticket_id == ticket_id)
        )
        .order_by(DuplicateCandidate.match_score.desc())
        .all()
    )
    return {
        "total": len(candidates),
        "duplicates": [duplicate_to_dict(candidate, db) for candidate in candidates],
    }


@router.post("/ticket/{ticket_id}/recompute")
def recompute_ticket_duplicates(ticket_id: str, db: Session = Depends(get_db)):
    if not TicketRepository(db).get_ticket_by_number(ticket_id):
        raise HTTPException(status_code=404, detail="Ticket not found")
    candidates = find_and_store_duplicates(db, ticket_id)
    return {
        "total": len(candidates),
        "duplicates": [duplicate_to_dict(candidate, db) for candidate in candidates],
    }


@router.post("/{duplicate_id}/dismiss")
def dismiss_duplicate(duplicate_id: str, body: ReviewRequest = ReviewRequest(), db: Session = Depends(get_db)):
    repo = DuplicateCandidateRepository(db)
    candidate = repo.set_status(duplicate_id, "DISMISSED", reviewed_by=body.reviewed_by)
    if not candidate:
        raise HTTPException(status_code=404, detail="Duplicate candidate not found")
    return duplicate_to_dict(candidate, db)


@router.post("/{duplicate_id}/merge")
def merge_duplicate(duplicate_id: str, body: ReviewRequest = ReviewRequest(), db: Session = Depends(get_db)):
    repo = DuplicateCandidateRepository(db)
    candidate = repo.get(duplicate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Duplicate candidate not found")
    if float(candidate.match_score or 0) < 80:
        raise HTTPException(status_code=400, detail="Merge requires at least 80% similarity")

    reviewer = body.reviewed_by or "system"
    ticket_repo = TicketRepository(db)
    parent_id = _choose_group_parent_id(candidate.ticket_id, candidate.candidate_ticket_id, db)
    left_root_id = _resolve_canonical_parent_id(candidate.ticket_id, db)
    right_root_id = _resolve_canonical_parent_id(candidate.candidate_ticket_id, db)
    duplicate_root_id = right_root_id if parent_id == left_root_id else left_root_id

    primary = ticket_repo.get_ticket_by_number(parent_id)
    duplicate = ticket_repo.get_ticket_by_number(duplicate_root_id)
    if not primary or not duplicate:
        raise HTTPException(status_code=404, detail="One or both tickets no longer exist")

    if duplicate.ticket_id == primary.ticket_id:
        candidate = _set_candidate_status(candidate, "DISMISSED", reviewer, db)
        return duplicate_to_dict(candidate, db)

    old_parent_id = candidate.candidate_ticket_id
    if candidate.ticket_id != duplicate.ticket_id or candidate.candidate_ticket_id != primary.ticket_id:
        existing = _find_existing_pair(db, duplicate.ticket_id, primary.ticket_id, candidate.duplicate_id)
        if not existing:
            candidate.ticket_id = duplicate.ticket_id
            candidate.candidate_ticket_id = primary.ticket_id
            db.commit()
            db.refresh(candidate)

    _mark_ticket_as_merged_duplicate(
        ticket_repo,
        duplicate,
        primary,
        reviewer,
    )
    ticket_repo.update_ticket_fields(
        primary.ticket_id,
        {
            "notes": _append_unique_note(
                primary.notes,
                f"Duplicate report {duplicate.ticket_id} merged by {reviewer}.",
            ),
        },
    )
    _relink_merged_children(old_parent_id, primary.ticket_id, reviewer, db)
    _relink_merged_children(duplicate.ticket_id, primary.ticket_id, reviewer, db)

    candidate = repo.set_status(duplicate_id, "MERGED", reviewed_by=reviewer)
    _enforce_duplicate_group(
        {candidate.ticket_id, candidate.candidate_ticket_id, primary.ticket_id, duplicate.ticket_id},
        reviewer,
        db,
    )
    return duplicate_to_dict(candidate, db)


@router.post("/repair-chains")
def repair_merged_duplicate_chains(body: ReviewRequest = ReviewRequest(), db: Session = Depends(get_db)):
    """Repair already-merged candidates whose parent was later discovered to be another duplicate."""
    reviewer = body.reviewed_by or "system"
    repaired = []
    processed_groups = set()

    merged_candidates = (
        db.query(DuplicateCandidate)
        .filter(DuplicateCandidate.status == "MERGED")
        .order_by(DuplicateCandidate.updated_at.desc())
        .all()
    )

    for candidate in merged_candidates:
        if candidate.ticket_id == candidate.candidate_ticket_id:
            candidate.status = "DISMISSED"
            candidate.reviewed_by = reviewer
            candidate.reviewed_at = datetime.utcnow()
            candidate.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(candidate)
            continue

        group_ids = _connected_merged_ticket_ids({candidate.ticket_id, candidate.candidate_ticket_id}, db)
        group_key = frozenset(group_ids)
        if group_key not in processed_groups:
            repaired.extend(_enforce_duplicate_group(group_ids, reviewer, db))
            processed_groups.add(group_key)
        continue

    return {
        "total": len(repaired),
        "duplicates": [duplicate_to_dict(candidate, db) for candidate in repaired],
    }
