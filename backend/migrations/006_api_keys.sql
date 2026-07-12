-- Up Migration

-- Per-user API keys for the machine API (docs/aivo-integration.md §3.1). Only the
-- SHA-256 hash of the high-entropy key is stored; the plaintext is shown exactly
-- once at creation. Keys are revoked (revoked_at) rather than deleted so the
-- last_used_at audit trail survives.

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{read}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

-- Verification is a point lookup by hash equality.
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
