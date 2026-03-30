-- Add tracking_check_state column to persist manual check/uncheck state
ALTER TABLE shopping_carts
  ADD COLUMN IF NOT EXISTS tracking_check_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Update update_cart_tracking_list to reset check state when clearing
CREATE OR REPLACE FUNCTION public.update_cart_tracking_list(p_cart_id uuid, p_tracking_list_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shopping_carts sc
    WHERE sc.id = p_cart_id
      AND (sc.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE shopping_carts
  SET tracking_list_id = p_tracking_list_id,
      tracking_check_state = CASE WHEN p_tracking_list_id IS NULL THEN '{}'::jsonb ELSE tracking_check_state END
  WHERE id = p_cart_id;
END;
$$;

-- Get tracking check state
CREATE OR REPLACE FUNCTION public.get_tracking_check_state(p_cart_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  SELECT sc.tracking_check_state INTO v_result
  FROM shopping_carts sc
  WHERE sc.id = p_cart_id
    AND (sc.user_id = v_user_id
      OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id));
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Update tracking check state
CREATE OR REPLACE FUNCTION public.update_tracking_check_state(p_cart_id uuid, p_state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shopping_carts sc
    WHERE sc.id = p_cart_id
      AND (sc.user_id = v_user_id
        OR EXISTS (SELECT 1 FROM cart_shares cs WHERE cs.cart_id = sc.id AND cs.shared_with_user_id = v_user_id))
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE shopping_carts SET tracking_check_state = p_state WHERE id = p_cart_id;
END;
$$;
