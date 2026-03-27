-- Migration 007: add sort_order to stores
-- NULL = no priority (falls back to alphabetical after prioritised stores)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS sort_order integer;
