-- Up Migration

-- Optimistic-concurrency version columns (offline-first spec A5 / resolved
-- decision 1). A monotonic integer bumped on every accepted write; stale
-- clients that send an out-of-date baseVersion are rejected with 409 instead
-- of silently clobbering. Defaulting to 0 backfills existing rows so current
-- single-client writes (which send no baseVersion) keep working unchanged.

ALTER TABLE recipes ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meal_plans ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shopping_lists ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
