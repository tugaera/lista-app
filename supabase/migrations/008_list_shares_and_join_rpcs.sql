-- Migration 008: list_shares table + URL-join RPCs for carts and lists

-- ── List Shares ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS list_shares (
  id                  uuid primary key default gen_random_uuid(),
  list_id             uuid not null references shopping_lists(id) on delete cascade,
  owner_id            uuid not null references auth.users(id) on delete cascade,
  shared_with_email   text not null,
  shared_with_user_id uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique(list_id, shared_with_email)
);

ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

-- Owner sees all shares for their lists
CREATE POLICY "list_shares_select_owner" ON list_shares FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- Shared member sees their own share record
CREATE POLICY "list_shares_select_member" ON list_shares FOR SELECT TO authenticated
  USING (shared_with_user_id = auth.uid());

-- Owner can create shares (email invite)
CREATE POLICY "list_shares_insert" ON list_shares FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM shopping_lists WHERE id = list_id AND user_id = auth.uid())
  );

-- Owner can remove shares
CREATE POLICY "list_shares_delete" ON list_shares FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Allow shared members to read lists shared with them
DROP POLICY IF EXISTS "shopping_lists_select" ON shopping_lists;
CREATE POLICY "shopping_lists_select" ON shopping_lists FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM list_shares WHERE list_id = id AND shared_with_user_id = auth.uid())
  );

-- Allow shared members to read list items for shared lists
DROP POLICY IF EXISTS "shopping_list_items_select" ON shopping_list_items;
CREATE POLICY "shopping_list_items_select" ON shopping_list_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shopping_lists sl
      WHERE sl.id = list_id
        AND (sl.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.shared_with_user_id = auth.uid()))
    )
  );

-- ── RPC: Join cart by URL ──────────────────────────────────────────────────
-- Allows a user to join a cart they were not explicitly invited to by email.
-- Uses SECURITY DEFINER to bypass the owner-only insert policy on cart_shares.

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

  -- Get cart owner (only non-finalized carts can be joined)
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

-- ── RPC: Join list by URL ──────────────────────────────────────────────────

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
