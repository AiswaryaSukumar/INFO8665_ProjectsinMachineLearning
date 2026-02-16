"""
Initialize database - create all tables
"""
from .connection import engine
from .models import Base
import sys


def init_database():
    """
    Create all database tables
    """
    print("Creating database tables...")
    
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating database tables: {e}")
        return False


def drop_all_tables():
    """
    Drop all tables (WARNING: Use with caution!)
    """
    confirm = input("⚠️  This will delete ALL data. Type 'DELETE ALL' to confirm: ")
    
    if confirm == "DELETE ALL":
        print("Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        print("✅ All tables dropped")
    else:
        print("Cancelled")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--drop":
        drop_all_tables()
    else:
        init_database()
