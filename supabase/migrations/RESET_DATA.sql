-- ============================================================
-- Reset all data EXCEPT auth users and profiles
-- Run this in Supabase SQL Editor to start with an empty DB
-- while keeping all registered users intact.
-- ============================================================

-- Disable triggers temporarily to avoid FK issues during truncate
SET session_replication_role = 'replica';

-- Delete shared access first (depends on carts/lists)
TRUNCATE TABLE list_shares CASCADE;
TRUNCATE TABLE cart_shares CASCADE;

-- Delete cart-related data
TRUNCATE TABLE cart_receipt_images CASCADE;
TRUNCATE TABLE shopping_cart_items CASCADE;
TRUNCATE TABLE shopping_carts CASCADE;

-- Delete list-related data
TRUNCATE TABLE shopping_list_items CASCADE;
TRUNCATE TABLE shopping_lists CASCADE;

-- Delete product-related data
TRUNCATE TABLE product_entries CASCADE;
TRUNCATE TABLE products CASCADE;

-- Delete categories and stores
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE stores CASCADE;

-- Delete invites (optional - remove this line if you want to keep invite codes)
TRUNCATE TABLE invites CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verify: profiles and auth.users are untouched
SELECT count(*) AS remaining_profiles FROM profiles;
