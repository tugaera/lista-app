-- Migration 026: Add is_default to units table
ALTER TABLE units ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Ensure only one unit can be default at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_single_default ON units (is_default) WHERE is_default = true;
