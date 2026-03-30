"""
NLU Processor - Orchestrator Integration Version (Final Refactored)
Outputs EXACT format required by the INSIGHT-311 Orchestrator
"""

import re
import uuid
import os
import time as _time
from typing import Dict, Any, Optional, List
from datetime import datetime

from logging_config import get_logger
from metrics import nlu_classifications_total, nlu_processing_seconds, nlu_confidence_score
from config import REVIEW_THRESHOLD as CONFIG_REVIEW_THRESHOLD, FEATURE_NAMES

# Import internal modules
from nlp_service.model.models.category_classifier_ml import DistilBERTCategoryClassifier as CategoryClassifierML
from nlp_service.model.entity_extractor import EntityExtractor
from nlp_service.model.sentiment_analyzer import SentimentAnalyzer
from nlp_service.model.description_extractor import DescriptionExtractor

logger = get_logger("insight311.nlu")


class NLUProcessor:
    """
    Main NLU Processor - Refactored for Orchestrator Compatibility.
    Flattens objects to strings and converts severity to float.
    """

    def __init__(self, use_ml_classifier: bool = True):
        """Initialize NLU components and load models."""

        # 1. Initialize ML classifier
        self.use_ml = use_ml_classifier
        if use_ml_classifier:
            try:
                self.classifier = CategoryClassifierML(auto_load=False)

                # Setup absolute path for model loading
                # This ensures the model is found regardless of where the script is run from
                current_file_path = os.path.abspath(__file__)
                project_root = os.path.dirname(
                    os.path.dirname(os.path.dirname(current_file_path))
                )
                model_path = os.path.join(
                    project_root, "nlp_service", "ml_models", "saved_models", "category_classifier"
                )

                print(f"Loading ML model from: {model_path}")
                self.classifier.load_model(model_path)
                logger.info("ml_classifier_loaded path=%s", model_path)
            except Exception as e:
                logger.warning("ml_classifier_fallback error=%s", e)
                self.use_ml = False

        # 2. Initialize other core components
        self.entity_extractor = EntityExtractor()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.description_extractor = DescriptionExtractor()

        # 3. Session storage (In-memory)
        self.sessions: Dict[str, Dict[str, Any]] = {}

        # 4. Thresholds
        self.REVIEW_THRESHOLD = CONFIG_REVIEW_THRESHOLD

        # 5. Intent-gated slot filling order (location -> caller_name -> phone_number)
        self.slot_order = ["location", "caller_name", "phone_number"]

        logger.info(
            "nlu_processor_initialized review_threshold=%s feature_names=%s",
            self.REVIEW_THRESHOLD, FEATURE_NAMES,
        )

    def _refine_extractions(self, nlu_result: dict, transcript: str) -> dict:
        """
        Manually corrects NLU output based on specific keywords and
        domain-specific patterns to improve reliability.
        """
        transcript_lower = transcript.lower()

        # 1. Category Correction (Keyword-based Override using PHONETIC_MAP)
        from stt_service.main import PHONETIC_MAP
        for category, synonyms in PHONETIC_MAP.items():
            if any(syn in transcript_lower for syn in synonyms):
                nlu_result["category"] = category
                if "confidence_scores" in nlu_result:
                    nlu_result["confidence_scores"]["category"] = 0.95
                break

        # 2. Pothole keyword correction for misheard "porto"
        # Only override if category is missing or currently "other"
        category = nlu_result.get("category")
        if not category or category.lower() == "other":
            if "porto issue" in transcript_lower or "pothole issue" in transcript_lower:
                nlu_result["category"] = "pothole"
                if "confidence_scores" in nlu_result:
                    nlu_result["confidence_scores"]["category"] = 0.95

        return nlu_result

    def _decide_next_slot(self, session_state: Dict[str, Any]) -> Optional[str]:
        """
        Simple rule-based slot policy (demo).
        Decide which slot to fill next based on current session state.
        """
        category = session_state.get("category")
        if not category or category.lower() == "other":
            # No meaningful category yet -> do not ask for slots
            return None

        # Fill in this order: location -> caller_name -> phone_number
        for slot in self.slot_order:
            if not session_state.get(slot):
                return slot

        return None

    def _map_category_to_confirm_result(self, category_value: Optional[str]) -> Optional[str]:
        """
        Map special confirm intents from the classifier to confirm_result.
        Returns "yes", "no", or None.
        """
        if not category_value:
            return None

        cat = category_value.lower()

        if cat == "confirm_yes":
            return "yes"
        if cat == "confirm_no":
            return "no"

        return None

    def process(self, transcript: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process transcript and return structured output matching Orchestrator expectations.
        """
        _start = _time.perf_counter()
        if not session_id:
            session_id = str(uuid.uuid4())

        # Ensure session state exists
        session_state = self.sessions.get(session_id)
        if session_state is None:
            session_state = {
                "session_id": session_id,
                "category": None,
                "location": None,
                "description": None,
                "severity_score": 0.0,
                "caller_name": None,
                "phone_number": None,
                "confidence_scores": {},
                "confirm_result": None,
                "correction_field": None,
                "correction_value": None,
                "missing_fields": [],
                "current_slot": None,
                "turn_index": 0,
            }
            self.sessions[session_id] = session_state

        # --- Analysis Steps ---

        # Track turn index per session
        session_state["turn_index"] = session_state.get("turn_index", 0) + 1
        is_first_turn = session_state["turn_index"] == 1
        
        # Step 1: Category Prediction
        existing_category = session_state.get("category")
        if existing_category and existing_category.lower() not in ["other", "confirm_yes", "confirm_no"]:
            category_value = existing_category
            category_conf = session_state.get("confidence_scores", {}).get("category", 0.95)
        elif self.use_ml:
            cat_res = self.classifier.predict(transcript)
            category_value = cat_res.get("category")
            category_conf = cat_res.get("confidence", 0.0)
        else:
            category_value = "other"
            category_conf = 0.1

        # Update category in session
        session_state["category"] = category_value

        # Map category to confirm_result (if this is a yes/no confirm intent from classifier)
        confirm_result = self._map_category_to_confirm_result(category_value)
        session_state["confirm_result"] = confirm_result

        # Decide which slot to fill in this turn (Intent-Gated Extraction)
        active_slot = self._decide_next_slot(session_state)
        session_state["current_slot"] = active_slot

        # Step 2: Entities (Location, Name, Phone) - intent-gated call
        entities = self.entity_extractor.extract_all(transcript, active_slot=active_slot)

        # Step 3: Sentiment & Severity
        sentiment = self.sentiment_analyzer.analyze(transcript)
        severity_score = sentiment.get("urgency_score", 0.0)

        # Step 4: Description
        desc_res = self.description_extractor.extract_with_summary(transcript)
        description_text = desc_res.get("full")
        description_conf = desc_res.get("confidence", 0.7)

        # --- Data Flattening ---
        loc_data = entities.get("location", {}) or {}
        name_data = entities.get("caller_name", {}) or {}
        phone_data = entities.get("caller_phone", {}) or {}

        location_value = loc_data.get("value")
        location_conf = loc_data.get("confidence", 0.0)
        caller_name_value = name_data.get("value")
        caller_name_conf = name_data.get("confidence", 0.0)
        phone_value = phone_data.get("value")
        phone_conf = phone_data.get("confidence", 0.0)

        # --- Intent-Gated: update session only for the active slot ---
        if is_first_turn:
            # 🔹 First meaningful turn: allow all entities to be captured
            if location_value:
                session_state["location"] = location_value
                session_state.setdefault("confidence_scores", {})["location"] = round(location_conf, 2)

            if caller_name_value:
                session_state["caller_name"] = caller_name_value
                session_state.setdefault("confidence_scores", {})["caller_name"] = round(caller_name_conf, 2)

            if phone_value:
                session_state["phone_number"] = phone_value
                session_state.setdefault("confidence_scores", {})["phone_number"] = round(phone_conf, 2)
        else:
            # 🔹 From second turn on: strict intent-gated slot filling
            if active_slot == "location" and location_value:
                session_state["location"] = location_value
                session_state.setdefault("confidence_scores", {})["location"] = round(location_conf, 2)

            if active_slot == "caller_name" and caller_name_value:
                session_state["caller_name"] = caller_name_value
                session_state.setdefault("confidence_scores", {})["caller_name"] = round(caller_name_conf, 2)

            if active_slot == "phone_number" and phone_value:
                session_state["phone_number"] = phone_value
                session_state.setdefault("confidence_scores", {})["phone_number"] = round(phone_conf, 2)

        # --- Initial Result Construction (from session_state) ---
        result = {
            "session_id": session_id,
            "category": session_state.get("category"),
            "location": session_state.get("location"),
            "description": description_text,
            "severity_score": round(float(severity_score), 2),
            "caller_name": session_state.get("caller_name"),
            "phone_number": session_state.get("phone_number"),
            "confidence_scores": {
                "category": round(category_conf, 2),
                "location": round(
                    session_state.get("confidence_scores", {}).get("location", location_conf), 2
                ),
                "description": round(description_conf, 2),
                "severity": round(severity_score, 2),
                "caller_name": round(
                    session_state.get("confidence_scores", {}).get("caller_name", caller_name_conf), 2
                ),
                "phone_number": round(
                    session_state.get("confidence_scores", {}).get("phone_number", phone_conf), 2
                ),
            },
            "confirm_result": session_state.get("confirm_result"),
            "correction_field": session_state.get("correction_field"),
            "correction_value": session_state.get("correction_value"),
        }

        # ---------------------------------------------------------
        # ✅ Correction detection - ONLY runs when all slots are filled
        #    (i.e. system would be in CONFIRMATION stage)
        # ---------------------------------------------------------
        all_slots_filled = (
            session_state.get("category") and
            session_state.get("location") and
            session_state.get("caller_name") and
            session_state.get("phone_number")
        )
        is_confirmation_phase = bool(all_slots_filled)

        transcript_lower = transcript.lower()
        from stt_service.main import PHONETIC_MAP


        if is_confirmation_phase:
            correction_updates: Dict[str, Any] = {}
            explicit_trigger = "no" in transcript_lower or "actually" in transcript_lower

            # -- 1) Category --
            for category, synonyms in PHONETIC_MAP.items():
                if any(syn in transcript_lower for syn in synonyms):
                    stored_cat = session_state.get("category")
                    if stored_cat != category:
                        correction_updates["category"] = category
                    break

            # -- 2) Location --
            loc_entities = self.entity_extractor.extract_all(transcript, active_slot="location")
            loc_data_corr = loc_entities.get("location", {}) or {}
            new_loc = loc_data_corr.get("value")

            if not new_loc:
                import re as _re
                _addr_pattern = (
                    r"(?:location\s+is|located\s+at|the\s+address\s+is)?\s*"
                    r"(\d+\s+[\w\s]+?\s+(?:street|avenue|road|boulevard|drive|lane|court|place|way|blvd|ave|rd|st)"
                    r"(?:\s+(?:north|south|east|west|ne|nw|se|sw))?)"
                )
                _m = _re.search(_addr_pattern, transcript_lower, _re.IGNORECASE)
                if _m:
                    from nlp_service.model.utils import normalize_location as _nl
                    new_loc = _nl(_m.group(1).strip())

            stored_loc = session_state.get("location")
            if new_loc:
                location_keywords = ("street", "road", "avenue", "drive", "blvd", "boulevard",
                                     "lane", "place", "court", "way", "location", "address")
                has_loc_keyword = any(kw in transcript_lower for kw in location_keywords)
                if explicit_trigger or (has_loc_keyword and new_loc.lower() != (stored_loc or "").lower()):
                    if new_loc.lower() != (stored_loc or "").lower():
                        correction_updates["location"] = new_loc

            # -- 3) Caller name --
            name_entities = self.entity_extractor.extract_all(transcript, active_slot="caller_name")
            name_data_corr = name_entities.get("caller_name", {}) or {}
            new_name = name_data_corr.get("value")
            stored_name = session_state.get("caller_name")
            if new_name and new_name.lower() not in ("no", "actually"):
                if new_name != stored_name:
                    correction_updates["caller_name"] = new_name

            # -- 4) Phone number --
            phone_entities = self.entity_extractor.extract_all(transcript, active_slot="phone_number")
            phone_data_corr = phone_entities.get("caller_phone", {}) or {}
            new_phone = phone_data_corr.get("value")
            stored_phone = session_state.get("phone_number")
            if new_phone and new_phone != stored_phone:
                correction_updates["phone_number"] = new_phone

            # Apply corrections to result
            if correction_updates:
                first_field = next(iter(correction_updates))
                result["correction_field"]   = first_field
                result["correction_value"]   = correction_updates[first_field]
                result["correction_updates"] = correction_updates
                for field, value in correction_updates.items():
                    session_state[field] = value
                    session_state.setdefault("confidence_scores", {})[field] = 1.0
                    result[field] = value
            else:
                result["correction_field"]   = None
                result["correction_value"]   = None
                result["correction_updates"] = {}
        else:
            # Not in confirmation phase — no corrections possible
            result["correction_field"]   = None
            result["correction_value"]   = None
            result["correction_updates"] = {}

        # 🔹 Fallback confirmation detection based on raw text (yes/no)
        # IMPORTANT: check NO patterns FIRST — negation must always win.
        confirm_result_fallback: Optional[str] = None

        no_patterns = [
            "no ", "nope", "not correct", "that is not correct",
            "not all correct", "that's not", "it's not", "isn't correct",
            "incorrect", "don't think so", "that's wrong", "that is wrong",
        ]
        # Yes: word-boundary "yes/yeah/yep", OR "correct" only when no negator precedes it
        _negators = ("not", "isn't", "don't", "doesn't", "incorrect", "never")

        def _is_yes(text: str) -> bool:
            if any(w in text for w in ["yes", "yeah", "yep", "that's right", "that is right",
                                        "sounds good", "all correct", "that is all correct"]):
                # Make sure it's not "not all correct", "isn't correct" etc.
                for neg in _negators:
                    if neg in text:
                        return False
                return True
            return False

        if any(pat in transcript_lower for pat in no_patterns):
            confirm_result_fallback = "no"
        elif _is_yes(transcript_lower):
            confirm_result_fallback = "yes"

        if confirm_result_fallback:
            result["confirm_result"] = confirm_result_fallback
            session_state["confirm_result"] = confirm_result_fallback

        # --- Final Overall Confidence & Missing Check ---
        final_scores = result["confidence_scores"]
        required_confs = [
            final_scores["category"],
            final_scores["location"],
            final_scores["description"],
        ]
        result["confidence_scores"]["overall"] = round(sum(required_confs) / len(required_confs), 2)

        result["missing_fields"] = self._get_missing(
            result["category"],
            result["location"],
            result["description"],
            result["caller_name"],
            result["phone_number"],
        )

        # Persist: update session_state with result values (do NOT replace entire object)
        # This preserves turn_index, current_slot, and other metadata.
        session_state["category"]      = result.get("category")
        session_state["location"]      = result.get("location")
        session_state["caller_name"]   = result.get("caller_name")
        session_state["phone_number"]  = result.get("phone_number")
        session_state["description"]   = result.get("description")
        session_state["confirm_result"]    = result.get("confirm_result")
        session_state["correction_field"]  = result.get("correction_field")
        session_state["correction_value"]  = result.get("correction_value")
        session_state["confidence_scores"] = result.get("confidence_scores", {})
        session_state["missing_fields"]    = result.get("missing_fields", [])
        # NOTE: do NOT overwrite session_state["turn_index"] or ["current_slot"]

        # --- Metrics & logging ---
        _duration = _time.perf_counter() - _start
        nlu_processing_seconds.observe(_duration)
        overall_conf = result["confidence_scores"].get("overall", 0.0)
        nlu_confidence_score.observe(overall_conf)
        nlu_classifications_total.labels(predicted_category=result.get("category") or "unknown").inc()
        logger.info(
            "nlu_process_complete",
            session_id=session_id,
            category=result.get("category"),
            overall_confidence=overall_conf,
            missing_fields=result.get("missing_fields"),
            duration_s=round(_duration, 3),
        )
        return result

    def _get_missing(self, cat, loc, desc, name, phone) -> List[str]:
        """Identify missing required fields."""
        missing: List[str] = []
        if not cat:
            missing.append("category")
        if not loc:
            missing.append("location")
        if not desc:
            missing.append("description")
        if not name:
            missing.append("caller_name")
        if not phone:
            missing.append("phone_number")
        return missing

    # --- Update methods for Orchestrator callbacks ---

    def update_field(self, session_id: str, field: str, value: Any) -> Optional[Dict]:
        """Update a specific field in the session."""
        if session_id not in self.sessions:
            return None

        self.sessions[session_id][field] = value
        # Manual updates get 100% confidence
        if field in self.sessions[session_id]["confidence_scores"]:
            self.sessions[session_id]["confidence_scores"][field] = 1.0

        # Re-check missing fields
        self.sessions[session_id]["missing_fields"] = self._get_missing(
            self.sessions[session_id]["category"],
            self.sessions[session_id]["location"],
            self.sessions[session_id]["description"],
            self.sessions[session_id]["caller_name"],
            self.sessions[session_id]["phone_number"],
        )
        return self.sessions[session_id]

    def set_confirm(self, session_id: str, status: str):
        """Set the confirm_result (yes/no)."""
        if session_id in self.sessions:
            self.sessions[session_id]["confirm_result"] = status
            return self.sessions[session_id]
        return None
