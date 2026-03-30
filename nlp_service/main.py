"""
NLP Service Entrypoint

Exposes the core NLUProcessor for usage by external services like Orchestrator.
"""

from nlp_service.model.nlu_processor import NLUProcessor

# Optional singleton pattern or direct class exposure
__all__ = ["NLUProcessor"]
