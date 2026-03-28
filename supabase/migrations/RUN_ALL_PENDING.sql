-- ============================================================
-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR (one go)
-- It applies all pending migrations safely (idempotent)
-- ============================================================

-- === Migration 009: original_price on shopping_cart_items ===
ALTER TABLE shopping_cart_items ADD COLUMN IF NOT EXISTS original_price numeric(10, 2);

-- === Migration 010 + 011: original_price on product_entries + update view ===
-- Must drop view first because it depends on the table columns
DROP VIEW IF EXISTS latest_product_prices;

ALTER TABLE product_entries ADD COLUMN IF NOT EXISTS original_price numeric(10, 2);

CREATE OR REPLACE VIEW latest_product_prices AS
SELECT DISTINCT ON (pe.product_id, pe.store_id)
  pe.id,
  pe.product_id,
  pe.store_id,
  pe.price,
  pe.original_price,
  pe.quantity,
  pe.created_at,
  p.name AS product_name,
  p.barcode,
  s.name AS store_name
FROM product_entries pe
JOIN products p ON p.id = pe.product_id
JOIN stores s ON s.id = pe.store_id
ORDER BY pe.product_id, pe.store_id, pe.created_at DESC;

-- === Migration 012: free-text list items ===
ALTER TABLE shopping_list_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS product_name text;

-- === Migration 013: delete policy for products ===
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete" ON products
  FOR DELETE TO authenticated
  USING (true);

-- === Migration 014: fix handle_new_user trigger ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === Migration 015: get_profile_id_by_email ===
CREATE OR REPLACE FUNCTION public.get_profile_id_by_email(lookup_email text)
RETURNS uuid AS $$
  SELECT id FROM public.profiles WHERE lower(email) = lower(lookup_email) LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- === Migration 016: get_profile_email_by_id ===
CREATE OR REPLACE FUNCTION public.get_profile_email_by_id(user_id uuid)
RETURNS text AS $$
  SELECT email FROM public.profiles WHERE id = user_id LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- === Migration 017: cart_shares table + ALL updated RLS policies ===

-- Ensure cart_shares table exists
CREATE TABLE IF NOT EXISTS cart_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id             uuid NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  owner_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email   text NOT NULL,
  shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, shared_with_email)
);

ALTER TABLE cart_shares ENABLE ROW LEVEL SECURITY;

-- Ensure list_shares table exists
CREATE TABLE IF NOT EXISTS list_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id             uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  owner_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email   text NOT NULL,
  shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(list_id, shared_with_email)
);

ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

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

-- List shares policies
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

-- Shopping carts: owner + shared members can SELECT
DROP POLICY IF EXISTS "shopping_carts_select" ON shopping_carts;
DROP POLICY IF EXISTS "shopping_carts_select_own" ON shopping_carts;
CREATE POLICY "shopping_carts_select" ON shopping_carts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM cart_shares WHERE cart_id = id AND shared_with_user_id = auth.uid())
  );

-- Shopping cart items: owner + shared members can SELECT/INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "shopping_cart_items_select" ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_select_own" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_select" ON shopping_cart_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_insert" ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_insert_own" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_insert" ON shopping_cart_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_update" ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_update_own" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_update" ON shopping_cart_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "shopping_cart_items_delete" ON shopping_cart_items;
DROP POLICY IF EXISTS "shopping_cart_items_delete_own" ON shopping_cart_items;
CREATE POLICY "shopping_cart_items_delete" ON shopping_cart_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id
      AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid())))
  );

-- Shopping lists: owner + shared members can SELECT
DROP POLICY IF EXISTS "shopping_lists_select" ON shopping_lists;
DROP POLICY IF EXISTS "shopping_lists_select_own" ON shopping_lists;
CREATE POLICY "shopping_lists_select" ON shopping_lists
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM list_shares WHERE list_id = id AND shared_with_user_id = auth.uid())
  );

-- Shopping list items: owner + shared members can SELECT
DROP POLICY IF EXISTS "shopping_list_items_select" ON shopping_list_items;
DROP POLICY IF EXISTS "shopping_list_items_select_own" ON shopping_list_items;
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

-- === Join RPCs (SECURITY DEFINER) ===

CREATE OR REPLACE FUNCTION public.join_cart_by_url(p_cart_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id    uuid;
  v_owner_email text;
  v_user_id     uuid;
  v_user_email  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT user_id INTO v_owner_id
  FROM shopping_carts
  WHERE id = p_cart_id AND finalized_at IS NULL;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cart not found or already finalized');
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN jsonb_build_object('error', 'own_cart');
  END IF;

  SELECT email INTO v_owner_email FROM profiles WHERE id = v_owner_id;
  SELECT email INTO v_user_email  FROM profiles WHERE id = v_user_id;

  INSERT INTO cart_shares (cart_id, owner_id, shared_with_email, shared_with_user_id)
  VALUES (p_cart_id, v_owner_id, v_user_email, v_user_id)
  ON CONFLICT (cart_id, shared_with_email)
  DO UPDATE SET shared_with_user_id = v_user_id;

  RETURN jsonb_build_object('success', true, 'ownerEmail', v_owner_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_cart_by_url(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_list_by_url(p_list_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id    uuid;
  v_owner_email text;
  v_user_id     uuid;
  v_user_email  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT user_id INTO v_owner_id FROM shopping_lists WHERE id = p_list_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'List not found');
  END IF;

  IF v_owner_id = v_user_id THEN
    RETURN jsonb_build_object('error', 'own_list');
  END IF;

  SELECT email INTO v_owner_email FROM profiles WHERE id = v_owner_id;
  SELECT email INTO v_user_email  FROM profiles WHERE id = v_user_id;

  INSERT INTO list_shares (list_id, owner_id, shared_with_email, shared_with_user_id)
  VALUES (p_list_id, v_owner_id, v_user_email, v_user_id)
  ON CONFLICT (list_id, shared_with_email)
  DO UPDATE SET shared_with_user_id = v_user_id;

  RETURN jsonb_build_object('success', true, 'ownerEmail', v_owner_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_list_by_url(uuid) TO authenticated;

-- === Security definer functions for shared data access ===

-- === Migration 018: Drop ALL existing policies and recreate ===

DO $$ DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_carts' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_carts', pol.policyname); END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_cart_items' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_cart_items', pol.policyname); END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_lists' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_lists', pol.policyname); END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'shopping_list_items' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.shopping_list_items', pol.policyname); END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'cart_shares' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.cart_shares', pol.policyname); END LOOP;

  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'list_shares' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.list_shares', pol.policyname); END LOOP;
END $$;

-- cart_shares
CREATE POLICY "cart_shares_select" ON cart_shares FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR shared_with_user_id = auth.uid());
CREATE POLICY "cart_shares_insert" ON cart_shares FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM shopping_carts WHERE id = cart_id AND user_id = auth.uid()));
CREATE POLICY "cart_shares_delete" ON cart_shares FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- list_shares
CREATE POLICY "list_shares_select_owner" ON list_shares FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "list_shares_select_member" ON list_shares FOR SELECT TO authenticated USING (shared_with_user_id = auth.uid());
CREATE POLICY "list_shares_insert" ON list_shares FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid()));
CREATE POLICY "list_shares_delete" ON list_shares FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- shopping_carts
CREATE POLICY "shopping_carts_select" ON shopping_carts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares WHERE cart_id = id AND shared_with_user_id = auth.uid()));
CREATE POLICY "shopping_carts_insert" ON shopping_carts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shopping_carts_update" ON shopping_carts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "shopping_carts_delete" ON shopping_carts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- shopping_cart_items
CREATE POLICY "shopping_cart_items_select" ON shopping_cart_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_insert" ON shopping_cart_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_update" ON shopping_cart_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_cart_items_delete" ON shopping_cart_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_carts sc WHERE sc.id = cart_id AND (sc.user_id = auth.uid() OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = auth.uid()))));

-- shopping_lists
CREATE POLICY "shopping_lists_select" ON shopping_lists FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM list_shares WHERE list_id = id AND shared_with_user_id = auth.uid()));
CREATE POLICY "shopping_lists_insert" ON shopping_lists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "shopping_lists_update" ON shopping_lists FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "shopping_lists_delete" ON shopping_lists FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- shopping_list_items
CREATE POLICY "shopping_list_items_select" ON shopping_list_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_lists sl WHERE sl.id = list_id AND (sl.user_id = auth.uid() OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_list_items_insert" ON shopping_list_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM shopping_lists sl WHERE sl.id = list_id AND (sl.user_id = auth.uid() OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_list_items_update" ON shopping_list_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_lists sl WHERE sl.id = list_id AND (sl.user_id = auth.uid() OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))));
CREATE POLICY "shopping_list_items_delete" ON shopping_list_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM shopping_lists sl WHERE sl.id = list_id AND (sl.user_id = auth.uid() OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))));

-- === Security definer functions for shared data access ===

-- Get a list by id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_list_by_id(p_list_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM shopping_lists sl
    WHERE sl.id = p_list_id
      AND (sl.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RETURN null; END IF;
  RETURN (SELECT row_to_json(t) FROM (SELECT id, user_id, name, created_at FROM shopping_lists WHERE id = p_list_id) t);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get list items (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_list_items(p_list_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM shopping_lists sl
    WHERE sl.id = p_list_id
      AND (sl.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at ASC)
    FROM (
      SELECT sli.id, sli.list_id, sli.product_id, sli.product_name, sli.planned_quantity, sli.created_at,
             CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('id', p.id, 'name', p.name, 'barcode', p.barcode) ELSE null END AS products
      FROM shopping_list_items sli
      LEFT JOIN products p ON p.id = sli.product_id
      WHERE sli.list_id = p_list_id
    ) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Insert cart item (bypasses RLS so shared users can add items)
CREATE OR REPLACE FUNCTION public.insert_cart_item(
  p_cart_id uuid, p_product_id uuid, p_product_name text,
  p_product_barcode text, p_price numeric, p_original_price numeric, p_quantity integer
) RETURNS uuid AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
  v_item_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM shopping_carts sc WHERE sc.id = p_cart_id
    AND (sc.user_id = v_user_id OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RAISE EXCEPTION 'Access denied'; END IF;
  INSERT INTO shopping_cart_items (cart_id, product_id, product_name, product_barcode, price, original_price, quantity)
  VALUES (p_cart_id, p_product_id, p_product_name, p_product_barcode, p_price, p_original_price, p_quantity)
  RETURNING id INTO v_item_id;
  RETURN v_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cart item (bypasses RLS so shared users can edit items)
CREATE OR REPLACE FUNCTION public.update_cart_item(
  p_item_id uuid, p_cart_id uuid, p_updates jsonb
) RETURNS void AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM shopping_carts sc WHERE sc.id = p_cart_id
    AND (sc.user_id = v_user_id OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE shopping_cart_items SET
    quantity = COALESCE((p_updates->>'quantity')::integer, quantity),
    price = COALESCE((p_updates->>'price')::numeric, price),
    original_price = CASE WHEN p_updates ? 'original_price' THEN (p_updates->>'original_price')::numeric ELSE original_price END,
    product_name = COALESCE(p_updates->>'product_name', product_name),
    product_barcode = CASE WHEN p_updates ? 'product_barcode' THEN p_updates->>'product_barcode' ELSE product_barcode END,
    product_id = CASE WHEN p_updates ? 'product_id' THEN (p_updates->>'product_id')::uuid ELSE product_id END
  WHERE id = p_item_id AND cart_id = p_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete cart item (bypasses RLS so shared users can remove items)
CREATE OR REPLACE FUNCTION public.delete_cart_item(p_item_id uuid, p_cart_id uuid)
RETURNS void AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM shopping_carts sc WHERE sc.id = p_cart_id
    AND (sc.user_id = v_user_id OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RAISE EXCEPTION 'Access denied'; END IF;
  DELETE FROM shopping_cart_items WHERE id = p_item_id AND cart_id = p_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate cart total (bypasses RLS so shared users can trigger it)
CREATE OR REPLACE FUNCTION public.recalculate_cart_total(p_cart_id uuid)
RETURNS void AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
  v_total numeric;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM shopping_carts sc
    WHERE sc.id = p_cart_id
      AND (sc.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) INTO v_has_access;
  IF NOT v_has_access THEN RETURN; END IF;
  SELECT COALESCE(SUM(price * quantity), 0) INTO v_total FROM shopping_cart_items WHERE cart_id = p_cart_id;
  UPDATE shopping_carts SET total = v_total WHERE id = p_cart_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get cart store_id (bypasses RLS for shared users)
CREATE OR REPLACE FUNCTION public.get_cart_store_id(p_cart_id uuid)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN (
    SELECT sc.store_id FROM shopping_carts sc
    WHERE sc.id = p_cart_id
      AND (sc.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get cart items (bypasses RLS — checks access via cart_shares or ownership)
CREATE OR REPLACE FUNCTION public.get_cart_items(p_cart_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_access boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM shopping_carts sc
    WHERE sc.id = p_cart_id
      AND (sc.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at ASC)
    FROM (
      SELECT id, product_id, product_name, product_barcode, price, original_price, quantity, created_at
      FROM shopping_cart_items
      WHERE cart_id = p_cart_id
    ) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get lists shared with current user (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_shared_lists_for_user()
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT ls.list_id, sl.name AS list_name, ls.owner_id,
             (SELECT email FROM profiles WHERE id = ls.owner_id) AS owner_email
      FROM list_shares ls
      JOIN shopping_lists sl ON sl.id = ls.list_id
      WHERE ls.shared_with_user_id = v_user_id
    ) t
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- DONE! All migrations applied.
-- ============================================================
