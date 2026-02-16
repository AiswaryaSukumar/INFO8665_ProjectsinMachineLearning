"""
Seed database with initial data
"""
import sys
sys.path.append('../..')

from src.database.connection import get_db_context
from src.database.models import Department, Category, Agent, TicketPriority
from werkzeug.security import generate_password_hash


def seed_departments():
    """Create departments"""
    departments = [
        {"name": "Public Works", "description": "Roads, infrastructure, streetlights", "email": "publicworks@city.gov"},
        {"name": "Sanitation", "description": "Trash, recycling, waste management", "email": "sanitation@city.gov"},
        {"name": "Parks & Recreation", "description": "Parks, playgrounds, green spaces", "email": "parks@city.gov"},
        {"name": "Police", "description": "Non-emergency police matters", "email": "police@city.gov"},
        {"name": "Bylaw Enforcement", "description": "Noise complaints, parking violations", "email": "bylaw@city.gov"},
    ]
    
    with get_db_context() as db:
        for dept_data in departments:
            dept = Department(**dept_data)
            db.add(dept)
        
        db.commit()
        print("✅ Departments seeded")


def seed_categories():
    """Create issue categories"""
    categories = [
        {"name": "Pothole", "description": "Road damage", "department_id": 1, "default_priority": TicketPriority.HIGH},
        {"name": "Streetlight Out", "description": "Non-functioning streetlight", "department_id": 1, "default_priority": TicketPriority.MEDIUM},
        {"name": "Trash Not Collected", "description": "Missed trash pickup", "department_id": 2, "default_priority": TicketPriority.MEDIUM},
        {"name": "Graffiti", "description": "Graffiti on public property", "department_id": 1, "default_priority": TicketPriority.LOW},
        {"name": "Noise Complaint", "description": "Excessive noise", "department_id": 5, "default_priority": TicketPriority.MEDIUM},
        {"name": "Park Maintenance", "description": "Park equipment or maintenance issues", "department_id": 3, "default_priority": TicketPriority.LOW},
        {"name": "Water Main Break", "description": "Water infrastructure emergency", "department_id": 1, "default_priority": TicketPriority.CRITICAL},
        {"name": "Snow Removal", "description": "Snow/ice on roads", "department_id": 1, "default_priority": TicketPriority.HIGH},
    ]
    
    with get_db_context() as db:
        for cat_data in categories:
            category = Category(**cat_data)
            db.add(category)
        
        db.commit()
        print("✅ Categories seeded")


def seed_agents():
    """Create test agents"""
    agents = [
        {"username": "admin", "full_name": "Admin User", "email": "admin@city.gov", "role": "admin"},
        {"username": "agent1", "full_name": "John Smith", "email": "jsmith@city.gov", "role": "agent"},
        {"username": "agent2", "full_name": "Jane Doe", "email": "jdoe@city.gov", "role": "agent"},
    ]
    
    with get_db_context() as db:
        for agent_data in agents:
            # Hash password (in production, use proper password hashing)
            agent_data["password_hash"] = generate_password_hash("password123")
            agent = Agent(**agent_data)
            db.add(agent)
        
        db.commit()
        print("✅ Agents seeded")


if __name__ == "__main__":
    print("Seeding database...")
    seed_departments()
    seed_categories()
    seed_agents()
    print("\n✅ Database seeded successfully!")
    print("\nTest credentials:")
    print("  Username: admin")
    print("  Password: password123")
