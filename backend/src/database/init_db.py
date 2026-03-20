from src.database.connection import engine_db1, engine_db2
from src.database.models.models import Base as BaseDB1
from src.database.models.recordings_models import Base as BaseDB2

def init_database():
    print("Initialize DB1 (insight311) tables...")
    # Drop all existing tables and start fresh
    BaseDB1.metadata.drop_all(bind=engine_db1)
    BaseDB1.metadata.create_all(bind=engine_db1)
    print("DB1 Initialization complete!")

    print("Initialize DB2 (insight311_recordings) tables...")
    # Drop all existing tables and start fresh
    BaseDB2.metadata.drop_all(bind=engine_db2)
    BaseDB2.metadata.create_all(bind=engine_db2)
    print("DB2 Initialization complete!")

if __name__ == "__main__":
    init_database()
