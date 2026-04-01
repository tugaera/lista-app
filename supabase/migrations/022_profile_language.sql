-- Migration 022: add language preference to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt';
