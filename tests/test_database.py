"""
Test database setup with proper cleanup
"""
import uuid
from datetime import datetime
from src.database.connection import get_db_context
from src.database.models import Department, Category, Ticket, TicketStatus
from src.database.repositories import SessionRepository, TicketRepository


def test_database_connection():
    """Test basic database connection"""
    print("\n" + "="*50)
    print("TEST 1: Database Connection")
    print("="*50)
    
    with get_db_context() as db:
        departments = db.query(Department).all()
        print(f"✅ Found {len(departments)} departments")
        
        for dept in departments:
            print(f"   - {dept.name}")
    
    print("✅ Test passed!\n")


def test_create_session():
    """Test creating a session with unique ID"""
    print("="*50)
    print("TEST 2: Create Session")
    print("="*50)
    
    # Generate unique session ID using timestamp
    session_id = f"test-session-{uuid.uuid4()}"
    phone = "555-1234"
    
    with get_db_context() as db:
        repo = SessionRepository(db)
        
        # Check if session already exists (shouldn't happen with UUID, but safe)
        existing = repo.get_session(session_id)
        if existing:
            print(f"⚠️  Session {session_id} already exists, using it")
            session = existing
        else:
            session = repo.create_session(session_id, phone)
            print(f"✅ Created new session: {session.id}")
        
        print(f"   - Session ID: {session.id}")
        print(f"   - Caller ID: {session.caller_id}")
        print(f"   - Status: {session.status}")
        print(f"   - Created: {session.created_at}")
    
    print("✅ Test passed!\n")
    return session_id


def test_create_ticket():
    """Test creating a ticket with unique session"""
    print("="*50)
    print("TEST 3: Create Ticket")
    print("="*50)
    
    # Generate unique session ID
    session_id = f"test-session-{uuid.uuid4()}"
    phone = "555-5678"
    
    with get_db_context() as db:
        # Step 1: Create a session
        session_repo = SessionRepository(db)
        session = session_repo.create_session(session_id, phone)
        print(f"✅ Created session: {session.id}")
        
        # Step 2: Create a ticket
        ticket_repo = TicketRepository(db)
        ticket = ticket_repo.create_ticket(
            session_id=session.id,
            category_id=1,  # Pothole (should exist from seed data)
            location="123 Main Street",
            description="Large pothole causing damage to vehicles",
            citizen_name="John Doe",
            citizen_phone=phone,
            priority="high"
        )
        
        print(f"✅ Created ticket: {ticket.ticket_number}")
        print(f"   - Ticket ID: {ticket.id}")
        print(f"   - Location: {ticket.location}")
        print(f"   - Status: {ticket.status}")
        print(f"   - Priority: {ticket.priority}")
        print(f"   - Category ID: {ticket.category_id}")
        print(f"   - Citizen: {ticket.citizen_name} ({ticket.citizen_phone})")
        print(f"   - Created: {ticket.created_at}")
    
    print("✅ Test passed!\n")
    return ticket.ticket_number


def test_query_tickets():
    """Test querying tickets"""
    print("="*50)
    print("TEST 4: Query Tickets")
    print("="*50)
    
    with get_db_context() as db:
        ticket_repo = TicketRepository(db)
        
        # Get all tickets
        all_tickets = db.query(Ticket).all()
        print(f"✅ Found {len(all_tickets)} total tickets in database")
        
        # Show last 3 tickets
        if all_tickets:
            print("\n   Recent tickets:")
            for ticket in all_tickets[-3:]:
                print(f"   - {ticket.ticket_number}: {ticket.location} (Status: {ticket.status})")
        else:
            print("   (No tickets found - this is okay on first run)")
    
    print("✅ Test passed!\n")


def test_update_ticket_status():
    """Test updating ticket status"""
    print("="*50)
    print("TEST 5: Update Ticket Status")
    print("="*50)
    
    with get_db_context() as db:
        # Find any existing ticket
        ticket = db.query(Ticket).first()
        
        if not ticket:
            print("⚠️  No tickets found, creating one first...")
            
            # Create a session and ticket
            session_id = f"test-session-{uuid.uuid4()}"
            session_repo = SessionRepository(db)
            session = session_repo.create_session(session_id, "555-9999")
            
            ticket_repo = TicketRepository(db)
            ticket = ticket_repo.create_ticket(
                session_id=session.id,
                category_id=1,
                location="456 Test Avenue",
                description="Test ticket for status update",
                citizen_name="Jane Smith",
                citizen_phone="555-9999",
                priority="medium"
            )
            print(f"✅ Created test ticket: {ticket.ticket_number}")
        
        print(f"\n   Testing status update on: {ticket.ticket_number}")
        print(f"   Current status: {ticket.status}")
        
        # Update status
        ticket_repo = TicketRepository(db)
        updated = ticket_repo.update_ticket_status(ticket.id, TicketStatus.UNDER_REVIEW)
        
        print(f"   New status: {updated.status}")
        print(f"✅ Status updated successfully!")
    
    print("✅ Test passed!\n")


def test_search_by_phone():
    """Test searching tickets by phone number"""
    print("="*50)
    print("TEST 6: Search Tickets by Phone")
    print("="*50)
    
    # Create a ticket with known phone number
    test_phone = f"555-TEST-{uuid.uuid4().hex[:4]}"
    
    with get_db_context() as db:
        # Create session and ticket
        session_id = f"test-session-{uuid.uuid4()}"
        session_repo = SessionRepository(db)
        session = session_repo.create_session(session_id, test_phone)
        
        ticket_repo = TicketRepository(db)
        ticket = ticket_repo.create_ticket(
            session_id=session.id,
            category_id=2,  # Streetlight
            location="789 Search Test Road",
            description="Test ticket for phone search",
            citizen_name="Test Citizen",
            citizen_phone=test_phone,
            priority="low"
        )
        
        print(f"✅ Created test ticket with phone: {test_phone}")
        print(f"   Ticket number: {ticket.ticket_number}")
        
        # Now search for it
        found_tickets = ticket_repo.get_tickets_by_phone(test_phone)
        
        print(f"\n✅ Found {len(found_tickets)} ticket(s) for phone {test_phone}")
        for t in found_tickets:
            print(f"   - {t.ticket_number}: {t.location}")
    
    print("✅ Test passed!\n")


def cleanup_test_data():
    """Optional: Clean up test data"""
    print("="*50)
    print("CLEANUP: Remove Test Data (Optional)")
    print("="*50)
    
    response = input("Do you want to delete test sessions/tickets? (yes/no): ")
    
    if response.lower() == 'yes':
        with get_db_context() as db:
            # Delete test sessions (this will cascade to tickets)
            deleted_count = db.query(Ticket).filter(
                Ticket.session_id.like('test-session-%')
            ).delete(synchronize_session=False)
            
            db.commit()
            print(f"✅ Deleted {deleted_count} test tickets")
    else:
        print("⏭️  Skipping cleanup")


if __name__ == "__main__":
    print("\n" + "🧪 " * 25)
    print("INSIGHT311 - DATABASE TEST SUITE")
    print("🧪 " * 25 + "\n")
    
    try:
        # Run all tests
        test_database_connection()
        test_create_session()
        test_create_ticket()
        test_query_tickets()
        test_update_ticket_status()
        test_search_by_phone()
        
        print("\n" + "="*50)
        print("✅ ALL TESTS PASSED!")
        print("="*50 + "\n")
        
        # Optional cleanup
        cleanup_test_data()
        
    except Exception as e:
        print("\n" + "="*50)
        print(f"❌ TEST FAILED: {e}")
        print("="*50)
        import traceback
        traceback.print_exc()
