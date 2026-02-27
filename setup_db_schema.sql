-- First, connect to the insight311 database and grant schema permissions
-- This file should be run: psql -U postgres -d insight311 -f setup_db_schema.sql

-- Grant schema permissions on public schema
GRANT ALL ON SCHEMA public TO insight311_user;

-- Grant permissions on all existing objects in the schema
GRANT ALL ON ALL TABLES IN SCHEMA public TO insight311_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO insight311_user;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO insight311_user;

-- Grant permission to create objects in the schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO insight311_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO insight311_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO insight311_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO insight311_user;

-- Grant USAGE permission on schema
ALTER SCHEMA public OWNER TO insight311_user;
