#!/usr/bin/env python3
"""View database updates"""

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    # Connect to database
    conn = psycopg2.connect(
        host='localhost',
        port=5432,
        database='insight311',
        user='insight311_user',
        password='password1234'
    )
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get all tables
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
    """)
    tables = cur.fetchall()
    
    print("=" * 60)
    print("DATABASE TABLES & RECENT UPDATES")
    print("=" * 60)
    
    for table_row in tables:
        table_name = table_row['table_name']
        
        # Get record count
        cur.execute(f"SELECT COUNT(*) as count FROM {table_name}")
        count = cur.fetchone()['count']
        
        print(f"\n📊 {table_name.upper()} ({count} records)")
        print("-" * 60)
        
        # Get column names
        cur.execute(f"""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """)
        columns = cur.fetchall()
        col_names = [col['column_name'] for col in columns]
        print(f"Columns: {', '.join(col_names)}")
        
        # Get last 3 records
        if count > 0:
            cur.execute(f"SELECT * FROM {table_name} ORDER BY 1 DESC LIMIT 3")
            rows = cur.fetchall()
            print(f"\nLast {min(3, count)} record(s):")
            for row in rows:
                print(f"  {dict(row)}")
    
    print("\n" + "=" * 60)
    conn.close()
    print("✅ Database connection successful!")
    
except psycopg2.OperationalError as e:
    print(f"❌ Connection Error: {e}")
    print("\nTroubleshooting:")
    print("1. Is PostgreSQL running on localhost:5432?")
    print("2. Is the password correct in config/database.yaml?")
    print("3. Does the 'insight311' database exist?")
    print("4. Does the 'insight311_user' user exist?")
except Exception as e:
    print(f"❌ Error: {e}")
