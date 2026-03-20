import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DB1_URL = os.getenv("DATABASE_URL")
DB2_URL = os.getenv("DATABASE_RECORDINGS_URL")

engine_db1 = create_engine(DB1_URL)
engine_db2 = create_engine(DB2_URL)

SessionLocalDB1 = sessionmaker(autocommit=False, autoflush=False, bind=engine_db1)
SessionLocalDB2 = sessionmaker(autocommit=False, autoflush=False, bind=engine_db2)

def get_db():
    db = SessionLocalDB1()
    try:
        yield db
    finally:
        db.close()

def get_db2():
    db = SessionLocalDB2()
    try:
        yield db
    finally:
        db.close()