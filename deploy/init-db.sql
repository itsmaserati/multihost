-- Initial database setup for Pterodactyl Control Plane
-- This script runs when the PostgreSQL container starts for the first time

-- Create additional extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Set timezone
SET timezone = 'UTC';

-- Create additional users or configurations here if needed
-- (The main database and user are created by environment variables)

-- Example: Create read-only user for monitoring
-- CREATE USER monitoring WITH PASSWORD 'monitoring_password';
-- GRANT CONNECT ON DATABASE pterodactyl_cp TO monitoring;
-- GRANT USAGE ON SCHEMA public TO monitoring;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO monitoring;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO monitoring;