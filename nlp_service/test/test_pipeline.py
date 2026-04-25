"""
Pipeline integration test — NLU + Orchestrator, no real DB required.

Run:
    cd insight311
    python test_pipeline.py

Each test case simulates a full conversation turn-by-turn and asserts
that the right slots are filled and the session reaches SUBMITTED.
"""

import sys
import os
import uuid
import traceback

# ── Path setup ───────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

# ── In-memory DB mocks ───────────────────────────────────────────────────────
from db_service.main import ConversationState


class _FakeSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.channel = "test"
        self.current_state = ConversationState.INITIALIZING.value
        self.context_data = {}
        self.ticket_id = None
        self.session_status = "active"


class FakeSessionRepo:
    def __init__(self):
        self._store = {}

    def create_session(self, session_id, channel, language="en", caller_number=None):
        s = _FakeSession(session_id)
        self._store[session_id] = s
        return s

    def get_session(self, session_id):
        return self._store.get(session_id)

    def load_context(self, session_id):
        s = self._store.get(session_id)
        return (s.context_data or {}) if s else {}

    def save_context(self, session_id, context_data, current_state=None):
        s = self._store.get(session_id)
        if not s:
            s = _FakeSession(session_id)
            self._store[session_id] = s
        s.context_data = context_data
        if current_state:
            s.current_state = (
                current_state.value
                if isinstance(current_state, ConversationState) else current_state
            )

    def update_state(self, session_id, new_state, ticket_id=None):
        s = self._store.get(session_id)
        if s:
            s.current_state = (
                new_state.value if isinstance(new_state, ConversationState) else new_state
            )
            if ticket_id:
                s.ticket_id = ticket_id


class FakeTicketRepo:
    def __init__(self):
        self._tickets = {}

    def create_ticket(self, ticket_id, session_id=None, channel="voice"):
        self._tickets[ticket_id] = {
            "ticket_id": ticket_id, "session_id": session_id, "channel": channel,
        }
        return self._tickets[ticket_id]

    def update_ticket_fields(self, ticket_id, fields):
        if ticket_id in self._tickets:
            self._tickets[ticket_id].update(fields)
        return self._tickets.get(ticket_id)

    @property
    def db(self):
        return _FakeDB()


class _FakeDB:
    """Minimal DB shim for generate_ticket_id()."""
    _counter = 0

    def query(self, *a, **kw):
        return self

    def filter(self, *a, **kw):
        return self

    def scalar(self):
        _FakeDB._counter += 1
        return _FakeDB._counter

    def like(self, *a, **kw):
        return self


# ── Orchestrator factory (no real DB) ────────────────────────────────────────
from orchestrator.main import ContextManager, RuleEngine, Orchestrator


def make_orchestrator():
    session_repo = FakeSessionRepo()
    ticket_repo = FakeTicketRepo()
    ctx_mgr = ContextManager(session_repo)
    return Orchestrator(ctx_mgr, RuleEngine(), ticket_repo), session_repo


# ── NLU Processor (shared, loaded once) ──────────────────────────────────────
print("Loading NLU processor…")
from nlp_service.model.nlu_processor import NLUProcessor
NLU = NLUProcessor(use_ml_classifier=True)
print("NLU ready.\n")


# ── Conversation runner ───────────────────────────────────────────────────────
def run_conversation(name: str, turns: list[str], expected: dict) -> bool:
    """
    Simulate a full conversation.

    Args:
        name:     Test case label.
        turns:    List of user utterances (in order).
        expected: Dict of fields + values to assert at the end.
                  Special key "state" checks final ConversationState.
    Returns:
        True if all assertions pass.
    """
    print(f"\n{'='*60}")
    print(f"TEST: {name}")
    print(f"{'='*60}")

    orch, session_repo = make_orchestrator()
    session_id = str(uuid.uuid4())
    session_repo.create_session(session_id, "test")

    # Initialize
    context, action = orch.initialize_session(session_id, "test")
    print(f"  [BOT] {action.text}\n")

    final_context = context

    for i, utterance in enumerate(turns, 1):
        print(f"  [USER turn {i}] {utterance}")
        nlu_out = NLU.process(utterance, session_id)
        context, action = orch.process_turn(session_id, utterance, nlu_out)
        final_context = context

        slot_summary = {
            "category": context.extracted_entities.get("category"),
            "location":  context.extracted_entities.get("location"),
            "caller_name": context.extracted_entities.get("caller_name"),
            "phone_number": context.extracted_entities.get("phone_number"),
            "state": str(context.current_state),
        }
        print(f"  [BOT] {action.text}")
        print(f"  [SLOTS] {slot_summary}\n")

        if context.current_state in [ConversationState.SUBMITTED, ConversationState.ESCALATED]:
            break

    # ── Assertions ────────────────────────────────────────────────────────────
    entities = final_context.extracted_entities
    passed = True

    for key, exp_val in expected.items():
        if key == "state":
            actual = str(final_context.current_state)
        else:
            actual = entities.get(key)

        # Flexible string match: check if expected is a substring of actual
        if exp_val is None:
            ok = actual is None
        elif isinstance(exp_val, str) and actual is not None:
            ok = exp_val.lower() in str(actual).lower()
        else:
            ok = actual == exp_val

        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"  {status}  {key}: expected='{exp_val}'  actual='{actual}'")
        if not ok:
            passed = False

    return passed


# ════════════════════════════════════════════════════════════════════════════
# TEST CASES
# ════════════════════════════════════════════════════════════════════════════

results = []

# ── TEST 1: Provided script ──────────────────────────────────────────────────
results.append(run_conversation(
    name="Provided script — pothole + location correction + confirm",
    turns=[
        "There's a massive pothole on King Street North and nobody is fixing it! I've called three times already.",
        "My name is James Caldwell.",
        "226-401-1234",
        "The issue is located at 333 King St. South.",
        "Yes",
    ],
    expected={
        "category":     "pothole",
        "caller_name":  "James Caldwell",
        "phone_number": "226-401-1234",
        "location":     "333 King Street South",
        "state":        "SUBMITTED",
    },
))

# ── TEST 2: Graffiti, numbered address, no correction needed ─────────────────
results.append(run_conversation(
    name="Graffiti report — numbered address, direct confirm",
    turns=[
        "There is graffiti spray-painted all over the wall at 88 Main Street East.",
        "My name is Sarah Kim.",
        "416-555-9900",
        "Yes that's all correct.",
    ],
    expected={
        "category":    "graffiti",
        "caller_name": "Sarah Kim",
        "phone_number": "416-555-9900",
        "location":    "88 Main Street",
        "state":       "SUBMITTED",
    },
))

# ── TEST 3: Sidewalk hazard, phone first then name, confirm no + correction ──
results.append(run_conversation(
    name="Sidewalk hazard — slots provided out of expected order, then correction",
    turns=[
        "The sidewalk is completely cracked and dangerous on Oak Avenue near the library.",
        "My name is Robert Chen.",
        "905-321-7777",
        "No, my phone number is actually 905-321-7778.",
        "Yes confirmed.",
    ],
    expected={
        "category":    "sidewalk_hazard",
        "caller_name": "Robert Chen",
        "phone_number": "905-321-7778",
        "location":    "Oak Avenue",
        "state":       "SUBMITTED",
    },
))

# ── TEST 4: Emily Jackson — "letter" STT error + landmark + road no-number address ─
# "Victoria Park on King St. E": GPE(Victoria Park) + road name = specific enough.
# MLP [0,0,1,1,0] floor 0.65 → no clarification → confirmation in one shot.
results.append(run_conversation(
    name="Litter report — STT 'letter' misrecognition + landmark+road no-number address",
    turns=[
        "Hi my name is Emily Jackson and I want to report a letter problem at Victoria Park on King St. E. My number is 519-334-2233.",
        "Yes that is all correct.",
    ],
    expected={
        "category":    "litter",
        "caller_name": "Emily Jackson",
        "phone_number": "519-334-2233",
        "location":    "King Street",   # King Street E extracted
        "state":       "SUBMITTED",
    },
))

# ════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("RESULTS")
print(f"{'='*60}")
passed_count = sum(results)
total = len(results)
for i, ok in enumerate(results, 1):
    print(f"  Test {i}: {'✅ PASS' if ok else '❌ FAIL'}")

print(f"\n{passed_count}/{total} tests passed.")
if passed_count < total:
    sys.exit(1)
