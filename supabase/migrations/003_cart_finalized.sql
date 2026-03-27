-- Add finalized_at to shopping_carts to distinguish active from completed carts
ALTER TABLE public.shopping_carts
  ADD COLUMN finalized_at timestamptz;

CREATE INDEX idx_shopping_carts_finalized ON shopping_carts (user_id, finalized_at)
  WHERE finalized_at IS NULL;
