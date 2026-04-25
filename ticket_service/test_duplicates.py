import unittest
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from db_service.main import Base, DuplicateCandidate, Ticket
from ticket_service.duplicates import (
    _choose_group_parent_id,
    _enforce_duplicate_group,
)
from ticket_service.duplicate_detection import find_and_store_duplicates


class DuplicateChainTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def add_ticket(self, ticket_id, created_offset=0, status="SUBMITTED", routing="PENDING_APPROVAL", stage="PENDING_APPROVAL"):
        ticket = Ticket(
            ticket_id=ticket_id,
            channel="web",
            category="Graffiti",
            location="120 Wellington Street West",
            description=f"Graffiti reported for {ticket_id}",
            ticket_status=status,
            routing_status=routing,
            workflow_stage=stage,
            created_at=datetime(2026, 4, 25, 12, 0, 0) + timedelta(minutes=created_offset),
        )
        self.db.add(ticket)
        self.db.commit()
        return ticket

    def add_duplicate(self, duplicate_id, child_id, parent_id, status="MERGED"):
        candidate = DuplicateCandidate(
            duplicate_id=duplicate_id,
            ticket_id=child_id,
            candidate_ticket_id=parent_id,
            match_score=95,
            category_score=100,
            location_score=100,
            text_score=90,
            time_score=100,
            reason_codes=["test"],
            status=status,
            reviewed_by="tester",
            reviewed_at=datetime.utcnow(),
        )
        self.db.add(candidate)
        self.db.commit()
        return candidate

    def test_existing_chain_parent_wins_over_older_new_ticket(self):
        self.add_ticket("311-2026-000097", created_offset=0)
        self.add_ticket("311-2026-000101", created_offset=10, status="NEEDS_REVIEW")
        self.add_ticket("311-2026-000102", created_offset=11, status="RESOLVED", routing="MERGED", stage="MERGED_DUPLICATE")
        self.add_duplicate("DUP-102-101", "311-2026-000102", "311-2026-000101")

        parent_id = _choose_group_parent_id("311-2026-000097", "311-2026-000102", self.db)

        self.assertEqual(parent_id, "311-2026-000101")

    def test_group_enforcement_closes_children_and_dismisses_self_links(self):
        self.add_ticket("311-2026-000083", created_offset=0, status="APPROVED", routing="APPROVED", stage="APPROVED_BY_SUPERVISOR")
        for offset, ticket_id in enumerate(["311-2026-000084", "311-2026-000085", "311-2026-000091", "311-2026-000098"], start=1):
            self.add_ticket(ticket_id, created_offset=offset)
        self.add_ticket("311-2026-000103", created_offset=10, status="RESOLVED", routing="MERGED", stage="MERGED_DUPLICATE")
        self.add_ticket("311-2026-000104", created_offset=11, status="RESOLVED", routing="MERGED", stage="MERGED_DUPLICATE")

        self.add_duplicate("DUP-84-83", "311-2026-000084", "311-2026-000083")
        self.add_duplicate("DUP-85-83", "311-2026-000085", "311-2026-000083")
        self.add_duplicate("DUP-91-83", "311-2026-000091", "311-2026-000083")
        self.add_duplicate("DUP-98-83", "311-2026-000098", "311-2026-000083")
        self.add_duplicate("DUP-103-84", "311-2026-000103", "311-2026-000084")
        self.add_duplicate("DUP-104-84", "311-2026-000104", "311-2026-000084")
        self.add_duplicate("DUP-104-103", "311-2026-000104", "311-2026-000103")
        self.add_duplicate("DUP-84-84", "311-2026-000084", "311-2026-000084")

        _enforce_duplicate_group({"311-2026-000083", "311-2026-000084"}, "tester", self.db)

        parent = self.db.get(Ticket, "311-2026-000083")
        self.assertEqual(parent.ticket_status, "APPROVED")

        for ticket_id in ["311-2026-000084", "311-2026-000085", "311-2026-000091", "311-2026-000098", "311-2026-000103", "311-2026-000104"]:
            ticket = self.db.get(Ticket, ticket_id)
            self.assertEqual(ticket.ticket_status, "RESOLVED")
            self.assertEqual(ticket.routing_status, "MERGED")
            self.assertEqual(ticket.workflow_stage, "MERGED_DUPLICATE")

        self_links = (
            self.db.query(DuplicateCandidate)
            .filter(DuplicateCandidate.ticket_id == DuplicateCandidate.candidate_ticket_id)
            .all()
        )
        self.assertTrue(all(row.status == "DISMISSED" for row in self_links))

        merged_self_links = (
            self.db.query(DuplicateCandidate)
            .filter(
                DuplicateCandidate.ticket_id == DuplicateCandidate.candidate_ticket_id,
                DuplicateCandidate.status == "MERGED",
            )
            .count()
        )
        self.assertEqual(merged_self_links, 0)

        merged_edges = (
            self.db.query(DuplicateCandidate)
            .filter(DuplicateCandidate.status == "MERGED")
            .all()
        )
        self.assertTrue(
            all(
                row.candidate_ticket_id == "311-2026-000083"
                and row.ticket_id != "311-2026-000083"
                for row in merged_edges
            )
        )

    def test_detection_ignores_already_merged_child_tickets(self):
        self.add_ticket("311-2026-000083", created_offset=0, status="APPROVED", routing="APPROVED", stage="APPROVED_BY_SUPERVISOR")
        self.add_ticket("311-2026-000084", created_offset=1, status="RESOLVED", routing="MERGED", stage="MERGED_DUPLICATE")
        self.add_ticket("311-2026-000105", created_offset=2, status="SUBMITTED", routing="PENDING_APPROVAL", stage="PENDING_APPROVAL")
        self.add_duplicate("DUP-84-83", "311-2026-000084", "311-2026-000083")

        candidates = find_and_store_duplicates(self.db, "311-2026-000105", threshold=70)

        self.assertTrue(candidates)
        self.assertNotIn("311-2026-000084", {candidate.candidate_ticket_id for candidate in candidates})


if __name__ == "__main__":
    unittest.main()
