-- Ensure cart_shares table exists (may have been added to schema.sql but never migrated)
CREATE TABLE IF NOT EXISTS cart_shares (
  id                  uuid primary key default gen_random_uuid(),
  cart_id             uuid not null references shopping_carts(id) on delete cascade,
  owner_id            uuid not null references auth.users(id) on delete cascade,
  shared_with_email   text not null,
  shared_with_user_id uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique(cart_id, shared_with_email)
);

ALTER TABLE cart_shares ENABLE ROW LEVEL SECURITY;

-- Cart shares policies
DROP POLICY IF EXISTS "cart_shares_select" ON cart_shares;
CREATE POLICY "cart_shares_select" ON cart_shares
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

DROP POLICY IF EXISTS "cart_shares_insert" ON cart_shares;
CREATE POLICY "cart_shares_insert" ON cart_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_carts WHERE id = cart_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "cart_shares_delete" ON cart_shares;
CREATE POLICY "cart_shares_delete" ON cart_shares
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Update shopping_carts SELECT to include shared members
DROP POLICY IF EXISTS "shopping_carts_select" ON shopping_carts;
CREATE POLICY "shopping_carts_select" ON shopping_carts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cart_shares WHERE cart_id = id AND shared_with_user_id = auth.uid())
  );

-- Update shopping_cart_items policies to include shared members
DROP POLICY IF EXISTS "shopping_cart_items_select" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_select" ON shopping_cart_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_insert" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_insert" ON shopping_cart_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_update" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_update" ON shopping_cart_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_delete" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_delete" ON shopping_cart_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

-- Ensure list_shares policies also exist
ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "list_shares_select_owner" ON list_shares;
CREATE POLICY "list_shares_select_owner" ON list_shares
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "list_shares_select_member" ON list_shares;
CREATE POLICY "list_shares_select_member" ON list_shares
  FOR SELECT TO authenticated USING (shared_with_user_id = auth.uid());

DROP POLICY IF EXISTS "list_shares_insert" ON list_shares;
CREATE POLICY "list_shares_insert" ON list_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "list_shares_delete" ON list_shares;
CREATE POLICY "list_shares_delete" ON list_shares
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Update shopping_lists SELECT to include shared members
DROP POLICY IF EXISTS "shopping_lists_select" ON shopping_lists;
CREATE POLICY "shopping_lists_select" ON shopping_lists
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM list_shares WHERE list_id = id AND shared_with_user_id = auth.uid())
  );

-- Update shopping_list_items SELECT to include shared members
DROP POLICY IF EXISTS "shopping_list_items_select" ON shopping_list_items;
CREATE POLICY "shopping_list_items_select" ON shopping_list_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shopping_lists sl
      WHERE sl.id = list_id
        AND (sl.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))
    )
  );
