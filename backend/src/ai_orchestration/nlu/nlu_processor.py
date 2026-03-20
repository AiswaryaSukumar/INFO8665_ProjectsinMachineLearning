"""
NLU Processor - Orchestrator Integration Version (Final Refactored)
Outputs EXACT format required by the INSIGHT-311 Orchestrator
"""

import re
import uuid
import os
from typing import Dict, Any, Optional, List
from datetime import datetime

from .models.category_classifier_ml import DistilBERTCategoryClassifier as CategoryClassifierML
from .entity_extractor import EntityExtractor
from .sentiment_analyzer import SentimentAnalyzer
from .description_extractor import DescriptionExtractor


class NLUProcessor:
    """
    Main NLU Processor - Refactored for Orchestrator Compatibility.
    Flattens objects to strings and converts severity to float.
    """

    def __init__(self, use_ml_classifier: bool = True):
        """Initialize NLU components and load models."""

        self.use_ml = use_ml_classifier
        if use_ml_classifier:
            try:
                self.classifier = CategoryClassifierML(auto_load=False)

                current_file_path = os.path.abspath(__file__)
                project_root = os.path.dirname(
                    os.path.dirname(
                        os.path.dirname(
                            os.path.dirname(current_file_path)
                        )
                    )
                )
                model_path = os.path.join(
                    project_root, "ml_models", "saved_models", "category_classifier"
                )

                print(f"Loading ML model from: {model_path}")
                self.classifier.load_model(model_path)
                print("✓ ML classifier loaded successfully")
            except Exception as e:
                print(f"⚠️  ML classifier failed to load: {e}. Falling back to rule-based logic.")
                self.use_ml = False

        self.entity_extractor = EntityExtractor()
        self.sentiment_analyzer = SentimentAnalyzer()
        self.description_extractor = DescriptionExtractor()

        self.sessions: Dict[str, Dict[str, Any]] = {}

        self.REVIEW_THRESHOLD = 0.60
        self.slot_order = ["location", "caller_name", "phone_number"]

        print("✓ NLU Processor initialized (Orchestrator Integration Mode)")

    def _refine_extractions(self, nlu_result: dict, transcript: str) -> dict:
        """
        Manually corrects NLU output based on specific keywords and
        domain-specific patterns to improve reliability.
        """
        transcript_lower = transcript.lower()

        from src.voice_conversion.speech_to_text.stt_service import PHONETIC_MAP
        for category, synonyms in PHONETIC_MAP.items():
            if any(syn in transcript_lower for syn in synonyms):
                nlu_result["category"] = category
                if "confidence_scores" in nlu_result:
                    nlu_result["confidence_scores"]["category"] = 0.95
                break

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
            return None

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

    def _extract_name_fallback(self, transcript: str) -> Optional[str]:
        """
        Fallback extraction for caller name when NER misses short/simple names.
        Examples:
        - my name is Sabrina
        - I am Sabrina
        - I'm Sabrina
        """
        text = transcript.strip()

        patterns = [
            r"\bmy name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b",
            r"\bi am\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b",
            r"\bi'm\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                if name:
                    return " ".join(part.capitalize() for part in name.split())

        return None

    def _extract_phone_fallback(self, transcript: str) -> Optional[str]:
        """
        Fallback extraction for phone number.
        Accepts formats like:
        - 6471123568
        - 647-112-3568
        - (647) 112-3568
        """
        digits = re.sub(r"\D", "", transcript)
        if len(digits) == 10:
            return digits
        if len(digits) == 11 and digits.startswith("1"):
            return digits[1:]
        return None

    def process(self, transcript: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Process transcript and return structured output matching Orchestrator expectations.
        """
        if not session_id:
            session_id = str(uuid.uuid4())

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

        session_state["turn_index"] = session_state.get("turn_index", 0) + 1
        is_first_turn = session_state["turn_index"] == 1

        # Step 1: Category Prediction
        existing_category = session_state.get("category")
        existing_category_conf = session_state.get("confidence_scores", {}).get("category", 0.0)

        predicted_category = None
        predicted_conf = 0.0

        if self.use_ml:
            cat_res = self.classifier.predict(transcript)
            predicted_category = cat_res.get("category")
            predicted_conf = cat_res.get("confidence", 0.0)
        else:
            predicted_category = "other"
            predicted_conf = 0.1

        if not existing_category or existing_category.lower() in ["other", "confirm_yes", "confirm_no"]:
            category_value = predicted_category
            category_conf = predicted_conf
        elif predicted_conf > existing_category_conf:
            category_value = predicted_category
            category_conf = predicted_conf
        else:
            category_value = existing_category
            category_conf = existing_category_conf

        session_state["category"] = category_value
        session_state.setdefault("confidence_scores", {})["category"] = round(category_conf, 2)

        confirm_result = self._map_category_to_confirm_result(category_value)
        session_state["confirm_result"] = confirm_result

        active_slot = self._decide_next_slot(session_state)
        session_state["current_slot"] = active_slot

        # Step 2: Entities
        entities = self.entity_extractor.extract_all(transcript, active_slot=active_slot)

        # Step 3: Sentiment & Severity
        sentiment = self.sentiment_analyzer.analyze(transcript)
        severity_score = sentiment.get("urgency_score", 0.0)

        # Step 4: Description
        desc_res = self.description_extractor.extract_with_summary(transcript)
        description_text = desc_res.get("full")
        description_conf = desc_res.get("confidence", 0.7)

        loc_data = entities.get("location", {}) or {}
        name_data = entities.get("caller_name", {}) or {}
        phone_data = entities.get("caller_phone", {}) or {}

        location_value = loc_data.get("value")
        location_conf = loc_data.get("confidence", 0.0)

        caller_name_value = name_data.get("value")
        caller_name_conf = name_data.get("confidence", 0.0)

        phone_value = phone_data.get("value")
        phone_conf = phone_data.get("confidence", 0.0)

        # Fallbacks for weak/missed extraction
        if active_slot == "caller_name" and not caller_name_value:
            fallback_name = self._extract_name_fallback(transcript)
            if fallback_name:
                caller_name_value = fallback_name
                caller_name_conf = 0.95

        if active_slot == "phone_number" and not phone_value:
            fallback_phone = self._extract_phone_fallback(transcript)
            if fallback_phone:
                phone_value = fallback_phone
                phone_conf = 0.95

        print(f"[NLU DEBUG] active_slot={active_slot}")
        print(f"[NLU DEBUG] caller_name_value={caller_name_value}")
        print(f"[NLU DEBUG] phone_value={phone_value}")

        # Intent-gated update of session state
        if is_first_turn:
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
            if active_slot == "location" and location_value:
                session_state["location"] = location_value
                session_state.setdefault("confidence_scores", {})["location"] = round(location_conf, 2)

            if active_slot == "caller_name" and caller_name_value:
                session_state["caller_name"] = caller_name_value
                session_state.setdefault("confidence_scores", {})["caller_name"] = round(caller_name_conf, 2)

            if active_slot == "phone_number" and phone_value:
                session_state["phone_number"] = phone_value
                session_state.setdefault("confidence_scores", {})["phone_number"] = round(phone_conf, 2)

        # Keep description updated
        if description_text:
            session_state["description"] = description_text
            session_state.setdefault("confidence_scores", {})["description"] = round(description_conf, 2)

        session_state["severity_score"] = round(float(severity_score), 2)
        session_state.setdefault("confidence_scores", {})["severity"] = round(severity_score, 2)

        result = {
            "session_id": session_id,
            "category": session_state.get("category"),
            "location": session_state.get("location"),
            "description": session_state.get("description"),
            "severity_score": session_state.get("severity_score"),
            "caller_name": session_state.get("caller_name"),
            "phone_number": session_state.get("phone_number"),
            "confidence_scores": {
                "category": round(session_state.get("confidence_scores", {}).get("category", category_conf), 2),
                "location": round(
                    session_state.get("confidence_scores", {}).get("location", location_conf), 2
                ),
                "description": round(
                    session_state.get("confidence_scores", {}).get("description", description_conf), 2
                ),
                "severity": round(
                    session_state.get("confidence_scores", {}).get("severity", severity_score), 2
                ),
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

        result = self._refine_extractions(result, transcript)

        # Sync refinement back to session state
        session_state["category"] = result.get("category")
        if "confidence_scores" in result and "category" in result["confidence_scores"]:
            session_state.setdefault("confidence_scores", {})["category"] = result["confidence_scores"]["category"]

        transcript_lower = transcript.lower()

        correction_field = result.get("correction_field")
        correction_value = result.get("correction_value")

        if "no" in transcript_lower or "actually" in transcript_lower:
            from src.voice_conversion.speech_to_text.stt_service import PHONETIC_MAP

            if correction_field is None:
                for category, synonyms in PHONETIC_MAP.items():
                    if any(syn in transcript_lower for syn in synonyms):
                        correction_field = "category"
                        correction_value = category
                        break

            if correction_field is None:
                loc_entities = self.entity_extractor.extract_all(
                    transcript,
                    active_slot="location",
                )
                loc_data_corr = loc_entities.get("location", {}) or {}
                if loc_data_corr.get("value") and (
                    "at " in transcript_lower
                    or "street" in transcript_lower
                    or "road" in transcript_lower
                    or "avenue" in transcript_lower
                    or "location" in transcript_lower
                ):
                    correction_field = "location"
                    correction_value = loc_data_corr["value"]

            if correction_field is None:
                name_entities = self.entity_extractor.extract_all(
                    transcript,
                    active_slot="caller_name",
                )
                name_data_corr = name_entities.get("caller_name", {}) or {}
                if name_data_corr.get("value") and name_data_corr.get("value").lower() != "no":
                    correction_field = "caller_name"
                    correction_value = name_data_corr["value"]

            if correction_field is None:
                phone_entities = self.entity_extractor.extract_all(
                    transcript,
                    active_slot="phone_number",
                )
                phone_data_corr = phone_entities.get("caller_phone", {}) or {}
                if phone_data_corr.get("value"):
                    correction_field = "phone_number"
                    correction_value = phone_data_corr["value"]

        result["correction_field"] = correction_field
        result["correction_value"] = correction_value
        session_state["correction_field"] = correction_field
        session_state["correction_value"] = correction_value

        confirm_result_fallback: Optional[str] = None

        yes_patterns = ["yes", "yeah", "yep", "correct", "that is all correct"]
        no_patterns = ["no", "nope", "not correct", "that is not correct"]

        if any(pat in transcript_lower for pat in yes_patterns):
            confirm_result_fallback = "yes"
        elif any(pat in transcript_lower for pat in no_patterns):
            confirm_result_fallback = "no"

        if confirm_result_fallback:
            result["confirm_result"] = confirm_result_fallback
            session_state["confirm_result"] = confirm_result_fallback
        else:
            result["confirm_result"] = session_state.get("confirm_result")

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
        session_state["missing_fields"] = result["missing_fields"]

        # Preserve richer session state
        session_state["category"] = result["category"]
        session_state["location"] = result["location"]
        session_state["description"] = result["description"]
        session_state["severity_score"] = result["severity_score"]
        session_state["caller_name"] = result["caller_name"]
        session_state["phone_number"] = result["phone_number"]
        session_state["confidence_scores"] = result["confidence_scores"]
        session_state["confirm_result"] = result["confirm_result"]
        session_state["correction_field"] = result["correction_field"]
        session_state["correction_value"] = result["correction_value"]
        session_state["missing_fields"] = result["missing_fields"]

        self.sessions[session_id] = session_state
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

    def update_field(self, session_id: str, field: str, value: Any) -> Optional[Dict]:
        """Update a specific field in the session."""
        if session_id not in self.sessions:
            return None

        self.sessions[session_id][field] = value
        if field in self.sessions[session_id]["confidence_scores"]:
            self.sessions[session_id]["confidence_scores"][field] = 1.0

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