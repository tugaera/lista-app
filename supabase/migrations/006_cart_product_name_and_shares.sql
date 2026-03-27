-- Migration 006: store product name/barcode on cart items + cart sharing

-- Part A: Store product name and barcode directly on cart items
ALTER TABLE shopping_cart_items
  ADD COLUMN IF NOT EXISTS product_name    text,
  ADD COLUMN IF NOT EXISTS product_barcode text;

-- Backfill product_name and product_barcode from products table
UPDATE shopping_cart_items sci
SET product_name    = p.name,
    product_barcode = p.barcode
FROM products p
WHERE p.id = sci.product_id AND sci.product_name IS NULL;

-- Set a fallback for any remaining nulls
UPDATE shopping_cart_items SET product_name = 'Unknown product' WHERE product_name IS NULL;

-- Make product_name NOT NULL
ALTER TABLE shopping_cart_items ALTER COLUMN product_name SET NOT NULL;

-- Make product_id nullable (product lookup deferred to checkout)
ALTER TABLE shopping_cart_items ALTER COLUMN product_id DROP NOT NULL;

-- Part B: Cart shares
CREATE TABLE IF NOT EXISTS cart_shares (
  id                  uuid primary key default gen_random_uuid(),
  cart_id             uuid not null references shopping_carts(id) on delete cascade,
  owner_id            uuid not null references auth.users(id),
  shared_with_email   text not null,
  shared_with_user_id uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  unique(cart_id, shared_with_email)
);

ALTER TABLE cart_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart_shares_select" ON cart_shares FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "cart_shares_insert" ON cart_shares FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_carts WHERE id = cart_id AND user_id = auth.uid())
  );

CREATE POLICY "cart_shares_delete" ON cart_shares FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Update shopping_carts SELECT to allow shared members
DROP POLICY IF EXISTS "shopping_carts_select" ON shopping_carts;
CREATE POLICY "shopping_carts_select" ON shopping_carts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cart_shares WHERE cart_id = id AND shared_with_user_id = auth.uid())
  );

-- Update shopping_cart_items policies for shared members
DROP POLICY IF EXISTS "shopping_cart_items_select"  ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_insert"  ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_update"  ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_delete"  ON shopping_cart_items;

CREATE POLICY "shopping_cart_items_select" ON shopping_cart_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_insert" ON shopping_cart_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_update" ON shopping_cart_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_delete" ON shopping_cart_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));

-- Enable realtime on shopping_cart_items
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_cart_items;
