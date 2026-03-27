-- Add original_price to product_entries to track discounted prices
ALTER TABLE product_entries ADD COLUMN IF NOT EXISTS original_price numeric(10, 2);
