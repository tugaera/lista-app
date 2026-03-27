-- Allow list items without a linked product (free text entries)
ALTER TABLE shopping_list_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS product_name text;

-- Backfill product_name from products table for existing items
UPDATE shopping_list_items sli
SET product_name = p.name
FROM products p
WHERE sli.product_id = p.id AND sli.product_name IS NULL;
