-- Migration 027: Add is_verified to brands table
-- Existing brands are pre-verified; new brands created by regular users default to false
ALTER TABLE brands ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT true;
