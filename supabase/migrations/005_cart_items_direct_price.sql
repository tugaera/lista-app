-- Migration 005: decouple cart items from product_entries
-- Cart items now store product_id + price directly.
-- product_entries are created only at checkout (finalizeCart).

-- 1. Make product_entry_id nullable (new items won't have it)
ALTER TABLE shopping_cart_items
  ALTER COLUMN product_entry_id DROP NOT NULL;

-- 2. Add product_id and price directly on cart items
ALTER TABLE shopping_cart_items
  ADD COLUMN IF NOT EXISTS product_id uuid references products(id),
  ADD COLUMN IF NOT EXISTS price    numeric(10,2);

-- 3. Backfill from existing product_entries
UPDATE shopping_cart_items sci
SET
  product_id = pe.product_id,
  price      = pe.price
FROM product_entries pe
WHERE pe.id = sci.product_entry_id
  AND sci.product_id IS NULL;

-- 4. Make NOT NULL after backfill
--    (any rows without a product_entry are orphaned drafts — delete them first)
DELETE FROM shopping_cart_items WHERE product_id IS NULL;
ALTER TABLE shopping_cart_items
  ALTER COLUMN product_id SET NOT NULL,
  ALTER COLUMN price       SET NOT NULL;
