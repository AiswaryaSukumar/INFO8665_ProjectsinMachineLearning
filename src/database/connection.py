"""
Database connection and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://insight311_user:password1234@localhost:5432/insight311")

# Create engine
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("ENVIRONMENT") == "development",  # Log SQL in development
    pool_size=5,
    max_overflow=10
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """
    Get database session
    Use this in FastAPI dependencies
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """
    Get database session with context manager
    Use this in regular Python code
    
    Example:
        with get_db_context() as db:
            ticket = db.query(Ticket).first()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
