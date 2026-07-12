-- Up Migration

-- Persisted shopping lists: one JSONB doc per family per week (mirrors meal_plans).

CREATE TABLE shopping_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
    doc JSONB NOT NULL
);

CREATE UNIQUE INDEX idx_shopping_lists_family_week
    ON shopping_lists (family_id, ((doc ->> 'weekIdentifier')));

-- Per-family ingredient -> store-category overrides. Cross-week data, so a
-- relational table (with atomic ON CONFLICT upserts) rather than the week doc.

CREATE TABLE ingredient_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    category TEXT NOT NULL,
    UNIQUE (family_id, ingredient_name)
);
