"""
Repository for Ticket operations
"""
from sqlalchemy.orm import Session
from ..models import Ticket, TicketStatus, TicketPriority
from datetime import datetime, date
from typing import List, Optional


class TicketRepository:
    """
    Handles all database operations for Tickets
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def generate_ticket_number(self) -> str:
        """
        Generate unique ticket number in format YYYYMMDD-####
        """
        today = date.today().strftime("%Y%m%d")
        
        # Get count of tickets created today
        count = self.db.query(Ticket).filter(
            Ticket.ticket_number.like(f"{today}-%")
        ).count()
        
        # Increment and format
        next_number = count + 1
        ticket_number = f"{today}-{next_number:04d}"
        
        return ticket_number
    
    def create_ticket(
        self,
        session_id: str,
        category_id: Optional[int],
        location: str,
        description: str,
        citizen_name: str,
        citizen_phone: str,
        priority: TicketPriority = TicketPriority.MEDIUM,
        source: str = "AI_VOICE"
    ) -> Ticket:
        """
        Create a new ticket
        """
        ticket_number = self.generate_ticket_number()
        
        ticket = Ticket(
            ticket_number=ticket_number,
            session_id=session_id,
            category_id=category_id,
            location=location,
            description=description,
            citizen_name=citizen_name,
            citizen_phone=citizen_phone,
            priority=priority,
            status=TicketStatus.RECEIVED,
            source=source,
            is_manual=(source == "MANUAL")
        )
        
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)
        
        return ticket
    
    def get_ticket_by_id(self, ticket_id: int) -> Optional[Ticket]:
        """
        Get ticket by ID
        """
        return self.db.query(Ticket).filter(Ticket.id == ticket_id).first()
    
    def get_ticket_by_number(self, ticket_number: str) -> Optional[Ticket]:
        """
        Get ticket by ticket number
        """
        return self.db.query(Ticket).filter(Ticket.ticket_number == ticket_number).first()
    
    def get_tickets_by_phone(self, phone: str) -> List[Ticket]:
        """
        Get all tickets for a citizen by phone number
        """
        return self.db.query(Ticket).filter(Ticket.citizen_phone == phone).all()
    
    def update_ticket_status(self, ticket_id: int, new_status: TicketStatus) -> Ticket:
        """
        Update ticket status
        """
        ticket = self.get_ticket_by_id(ticket_id)
        
        if ticket:
            ticket.status = new_status
            ticket.updated_at = datetime.utcnow()
            
            if new_status == TicketStatus.COMPLETED:
                ticket.resolved_at = datetime.utcnow()
            
            self.db.commit()
            self.db.refresh(ticket)
        
        return ticket
    
    def search_tickets(
        self,
        status: Optional[TicketStatus] = None,
        priority: Optional[TicketPriority] = None,
        category_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Ticket]:
        """
        Search tickets with filters
        """
        query = self.db.query(Ticket)
        
        if status:
            query = query.filter(Ticket.status == status)
        
        if priority:
            query = query.filter(Ticket.priority == priority)
        
        if category_id:
            query = query.filter(Ticket.category_id == category_id)
        
        if start_date:
            query = query.filter(Ticket.created_at >= start_date)
        
        if end_date:
            query = query.filter(Ticket.created_at <= end_date)
        
        return query.order_by(Ticket.created_at.desc()).all()
