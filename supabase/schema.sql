-- ============================================================
-- Lista App - Database Schema
-- PostgreSQL via Supabase
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- TABLES
-- ============================================================

-- Categories
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Stores
create table stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Products
create table products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  barcode text unique,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_products_name on products using gin (name gin_trgm_ops);
create index idx_products_barcode on products (barcode) where barcode is not null;
create index idx_products_category on products (category_id);

-- Product Entries (Price History) - APPEND ONLY
create table product_entries (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  quantity numeric(10, 3) not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index idx_product_entries_product on product_entries (product_id);
create index idx_product_entries_store on product_entries (store_id);
create index idx_product_entries_product_store_date on product_entries (product_id, store_id, created_at desc);

-- Shopping Lists
create table shopping_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index idx_shopping_lists_user on shopping_lists (user_id);

-- Shopping List Items
create table shopping_list_items (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references shopping_lists(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  planned_quantity numeric(10, 3) not null default 1 check (planned_quantity > 0),
  created_at timestamptz not null default now()
);

create index idx_shopping_list_items_list on shopping_list_items (list_id);

-- Shopping Carts
create table shopping_carts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total numeric(10, 2) not null default 0,
  receipt_image_url text,
  created_at timestamptz not null default now()
);

create index idx_shopping_carts_user on shopping_carts (user_id, created_at desc);

-- Shopping Cart Items
create table shopping_cart_items (
  id uuid primary key default uuid_generate_v4(),
  cart_id uuid not null references shopping_carts(id) on delete cascade,
  product_entry_id uuid not null references product_entries(id) on delete cascade,
  quantity numeric(10, 3) not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create index idx_shopping_cart_items_cart on shopping_cart_items (cart_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- Latest price per product per store
create or replace view latest_product_prices as
select distinct on (pe.product_id, pe.store_id)
  pe.id,
  pe.product_id,
  pe.store_id,
  pe.price,
  pe.quantity,
  pe.created_at,
  p.name as product_name,
  p.barcode,
  s.name as store_name
from product_entries pe
join products p on p.id = pe.product_id
join stores s on s.id = pe.store_id
order by pe.product_id, pe.store_id, pe.created_at desc;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table categories enable row level security;
alter table stores enable row level security;
alter table products enable row level security;
alter table product_entries enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table shopping_carts enable row level security;
alter table shopping_cart_items enable row level security;

-- Categories: readable by all authenticated users
create policy "categories_select" on categories
  for select to authenticated using (true);

-- Stores: readable by all authenticated users
create policy "stores_select" on stores
  for select to authenticated using (true);

-- Products: readable by all authenticated users, insertable by authenticated
create policy "products_select" on products
  for select to authenticated using (true);

create policy "products_insert" on products
  for insert to authenticated with check (true);

-- Product entries: readable by all authenticated, insertable by authenticated
create policy "product_entries_select" on product_entries
  for select to authenticated using (true);

create policy "product_entries_insert" on product_entries
  for insert to authenticated with check (true);

-- Shopping lists: user-scoped CRUD
create policy "shopping_lists_select" on shopping_lists
  for select to authenticated using (auth.uid() = user_id);

create policy "shopping_lists_insert" on shopping_lists
  for insert to authenticated with check (auth.uid() = user_id);

create policy "shopping_lists_update" on shopping_lists
  for update to authenticated using (auth.uid() = user_id);

create policy "shopping_lists_delete" on shopping_lists
  for delete to authenticated using (auth.uid() = user_id);

-- Shopping list items: accessible via list ownership
create policy "shopping_list_items_select" on shopping_list_items
  for select to authenticated using (
    exists (select 1 from shopping_lists where id = list_id and user_id = auth.uid())
  );

create policy "shopping_list_items_insert" on shopping_list_items
  for insert to authenticated with check (
    exists (select 1 from shopping_lists where id = list_id and user_id = auth.uid())
  );

create policy "shopping_list_items_update" on shopping_list_items
  for update to authenticated using (
    exists (select 1 from shopping_lists where id = list_id and user_id = auth.uid())
  );

create policy "shopping_list_items_delete" on shopping_list_items
  for delete to authenticated using (
    exists (select 1 from shopping_lists where id = list_id and user_id = auth.uid())
  );

-- Shopping carts: user-scoped CRUD
create policy "shopping_carts_select" on shopping_carts
  for select to authenticated using (auth.uid() = user_id);

create policy "shopping_carts_insert" on shopping_carts
  for insert to authenticated with check (auth.uid() = user_id);

create policy "shopping_carts_update" on shopping_carts
  for update to authenticated using (auth.uid() = user_id);

create policy "shopping_carts_delete" on shopping_carts
  for delete to authenticated using (auth.uid() = user_id);

-- Shopping cart items: accessible via cart ownership
create policy "shopping_cart_items_select" on shopping_cart_items
  for select to authenticated using (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

create policy "shopping_cart_items_insert" on shopping_cart_items
  for insert to authenticated with check (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

create policy "shopping_cart_items_update" on shopping_cart_items
  for update to authenticated using (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

create policy "shopping_cart_items_delete" on shopping_cart_items
  for delete to authenticated using (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

-- ============================================================
-- SEED DATA
-- ============================================================

insert into categories (name) values
  ('Fruits & Vegetables'),
  ('Dairy'),
  ('Meat & Poultry'),
  ('Bakery'),
  ('Beverages'),
  ('Snacks'),
  ('Frozen'),
  ('Household'),
  ('Personal Care'),
  ('Other');

insert into stores (name) values
  ('Supermarket A'),
  ('Supermarket B'),
  ('Local Market');

-- ============================================================
-- STORAGE
-- ============================================================
-- Create a 'receipts' bucket in Supabase Storage dashboard
-- and set it to private (authenticated users only).
