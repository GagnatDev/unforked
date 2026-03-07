-- Recipes: document store with JSONB
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    doc JSONB NOT NULL
);

CREATE INDEX idx_recipes_doc_name ON recipes USING gin ((doc -> 'name'));
CREATE INDEX idx_recipes_doc_tags ON recipes USING gin ((doc -> 'tags'));

-- Meal plans: one document per week
CREATE TABLE meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    doc JSONB NOT NULL
);

CREATE UNIQUE INDEX idx_meal_plans_week ON meal_plans ((doc -> 'weekIdentifier'));
