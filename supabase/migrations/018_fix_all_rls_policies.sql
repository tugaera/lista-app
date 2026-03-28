-- ============================================================
-- Drop ALL existing policies on affected tables (by querying pg_policies)
-- then recreate the correct ones. This fixes name mismatch issues.
-- ============================================================

-- Helper: drop all policies on a given table
DO $$ DECLARE
  pol RECORD;
BEGIN
  -- shopping_carts
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_carts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_carts', pol.policyname);
  END LOOP;

  -- shopping_cart_items
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_cart_items' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_cart_items', pol.policyname);
  END LOOP;

  -- shopping_lists
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_lists' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_lists', pol.policyname);
  END LOOP;

  -- shopping_list_items
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_list_items' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_list_items', pol.policyname);
  END LOOP;

  -- cart_shares
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'cart_shares' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cart_shares', pol.policyname);
  END LOOP;

  -- list_shares
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'list_shares' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.list_shares', pol.policyname);
  END LOOP;
END $$;

-- ============================================================
-- Recreate all policies
-- ============================================================

-- ── cart_shares ──────────────────────────────────────────────
CREATE POLICY "cart_shares_select" ON cart_shares
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());

CREATE POLICY "cart_shares_insert" ON cart_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_carts WHERE id = cart_id AND user_id = auth.uid())
  );

CREATE POLICY "cart_shares_delete" ON cart_shares
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ── list_shares ──────────────────────────────────────────────
CREATE POLICY "list_shares_select_owner" ON list_shares
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "list_shares_select_member" ON list_shares
  FOR SELECT TO authenticated USING (shared_with_user_id = auth.uid());

CREATE POLICY "list_shares_insert" ON list_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "list_shares_delete" ON list_shares
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ── shopping_carts ───────────────────────────────────────────
CREATE POLICY "shopping_carts_select" ON shopping_carts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cart_shares WHERE cart_id = id AND shared_with_user_id = auth.uid())
  );

CREATE POLICY "shopping_carts_insert" ON shopping_carts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopping_carts_update" ON shopping_carts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "shopping_carts_delete" ON shopping_carts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── shopping_cart_items ──────────────────────────────────────
CREATE POLICY "shopping_cart_items_select" ON shopping_cart_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

CREATE POLICY "shopping_cart_items_insert" ON shopping_cart_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

CREATE POLICY "shopping_cart_items_update" ON shopping_cart_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

CREATE POLICY "shopping_cart_items_delete" ON shopping_cart_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

-- ── shopping_lists ───────────────────────────────────────────
CREATE POLICY "shopping_lists_select" ON shopping_lists
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM list_shares WHERE list_id = id AND shared_with_user_id = auth.uid())
  );

CREATE POLICY "shopping_lists_insert" ON shopping_lists
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "shopping_lists_update" ON shopping_lists
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "shopping_lists_delete" ON shopping_lists
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── shopping_list_items ──────────────────────────────────────
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

CREATE POLICY "shopping_list_items_insert" ON shopping_list_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "shopping_list_items_update" ON shopping_list_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "shopping_list_items_delete" ON shopping_list_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );
