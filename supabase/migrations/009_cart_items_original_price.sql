-- Migration 009: original price for discounts on cart items
ALTER TABLE shopping_cart_items
  ADD COLUMN IF NOT EXISTS original_price numeric(10, 2);
