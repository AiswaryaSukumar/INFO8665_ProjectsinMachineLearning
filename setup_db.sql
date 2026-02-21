-- Create database
CREATE DATABASE insight311;

-- Create user
CREATE USER insight311_user WITH PASSWORD 'password1234';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE insight311 TO insight311_user;

-- Connect to the new database to set up schema permissions
-- Note: This part needs to be run separately after connecting to insight311 database

-- Grant schema permissions (run these after connecting to insight311 database):
-- GRANT ALL ON SCHEMA public TO insight311_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO insight311_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO insight311_user;
-- GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO insight311_user;
-- GRANT USAGE ON SCHEMA public TO insight311_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO insight311_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO insight311_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO insight311_user;


