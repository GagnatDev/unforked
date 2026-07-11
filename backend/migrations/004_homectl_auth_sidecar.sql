-- Up Migration

-- homectl-auth sidecar migration: authentication moves to the homectl-auth
-- service (fronted by the auth-proxy sidecar). Users provisioned on first
-- sighting of the sidecar identity headers have no local password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- One-time auth-migration bookkeeping: a row with a given id means that step
-- has completed (e.g. the homectl-auth user import ran exactly once).
CREATE TABLE auth_migration (
    id TEXT PRIMARY KEY,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary JSONB
);
