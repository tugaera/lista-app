-- Migration 025: Categories enhancement (subcategories, is_active), Brands, Units, Product fields
-- ============================================================

-- ── 1. Alter categories: add parent_id (self-ref for subcategories), is_active, sort_order ──

ALTER TABLE categories ADD COLUMN parent_id uuid REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE categories ADD COLUMN sort_order integer;

CREATE INDEX idx_categories_parent ON categories(parent_id);

-- Allow same name under different parents
ALTER TABLE categories DROP CONSTRAINT categories_name_key;
CREATE UNIQUE INDEX idx_categories_name_parent
  ON categories(name, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'));

-- ── 2. Create brands table ──

CREATE TABLE brands (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL UNIQUE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- Everyone can read brands
CREATE POLICY "brands_select" ON brands
  FOR SELECT TO authenticated USING (true);

-- Admin/moderator can insert/update
CREATE POLICY "brands_insert" ON brands
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "brands_update" ON brands
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

-- Only admin can delete
CREATE POLICY "brands_delete" ON brands
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ── 3. Create units table ──

CREATE TABLE units (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,        -- e.g. "Millilitre"
  abbreviation text NOT NULL UNIQUE, -- e.g. "ml"
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "units_select" ON units
  FOR SELECT TO authenticated USING (true);

-- Admin/moderator can insert/update
CREATE POLICY "units_insert" ON units
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "units_update" ON units
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

-- Only admin can delete
CREATE POLICY "units_delete" ON units
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ── 4. Alter products: add subcategory_id, brand_id, tags, measurement_quantity, unit_id ──

ALTER TABLE products ADD COLUMN subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN tags text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN measurement_quantity numeric(10, 3);
ALTER TABLE products ADD COLUMN unit_id uuid REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX idx_products_subcategory ON products(subcategory_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_tags ON products USING gin(tags);
CREATE INDEX idx_products_unit ON products(unit_id);

-- ── 5. Categories RLS: add INSERT/UPDATE/DELETE policies ──

CREATE POLICY "categories_insert" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "categories_update" ON categories
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));

CREATE POLICY "categories_delete" ON categories
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- ── 6. Seed default units ──

INSERT INTO units (name, abbreviation) VALUES
  ('Unit', 'un'),
  ('Gram', 'g'),
  ('Kilogram', 'kg'),
  ('Millilitre', 'ml'),
  ('Litre', 'l'),
  ('Dose', 'dose');
