-- Up Migration

-- Family tenant: shared recipes, meal plans, shopping lists (derived)

CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    default_meal_plan_persons INT NOT NULL DEFAULT 4
);

ALTER TABLE users
    ADD COLUMN family_id UUID REFERENCES families (id);

ALTER TABLE recipes
    ADD COLUMN family_id UUID REFERENCES families (id);

ALTER TABLE meal_plans
    ADD COLUMN family_id UUID REFERENCES families (id);

DO $$
DECLARE
    legacy_id UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM users LIMIT 1)
        OR EXISTS (SELECT 1 FROM recipes LIMIT 1)
        OR EXISTS (SELECT 1 FROM meal_plans LIMIT 1) THEN
        INSERT INTO families (default_meal_plan_persons) VALUES (4) RETURNING id INTO legacy_id;
        UPDATE users SET family_id = legacy_id WHERE family_id IS NULL;
        UPDATE recipes SET family_id = legacy_id WHERE family_id IS NULL;
        UPDATE meal_plans SET family_id = legacy_id WHERE family_id IS NULL;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE meal_plans ALTER COLUMN family_id SET NOT NULL;

DROP INDEX IF EXISTS idx_meal_plans_week;

CREATE UNIQUE INDEX idx_meal_plans_family_week ON meal_plans (family_id, ((doc ->> 'weekIdentifier')));

CREATE TABLE family_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
    inviter_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invitee_email VARCHAR(255) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_family_invitations_token ON family_invitations (token);
CREATE INDEX idx_family_invitations_family_status ON family_invitations (family_id, status);
