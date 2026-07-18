-- Up Migration

-- Web Push subscriptions (design #104 D5). One row per browser push endpoint;
-- endpoint-unique so re-subscribing from the same browser upserts instead of
-- duplicating. locale is captured at subscribe time (constraint 7: users have
-- no locale column; the frontend knows its i18n language) so notification copy
-- can be composed server-side per subscription. failed_at marks the last
-- delivery failure; 404/410 responses delete the row outright (dead endpoint).

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'nb')),
    user_agent TEXT,
    last_used_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);
-- The phase-5 notification engine fans out per family (constraint 4).
CREATE INDEX idx_push_subscriptions_family ON push_subscriptions (family_id);
