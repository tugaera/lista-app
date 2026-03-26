-- ============================================================
-- Lista App - Full Database Schema
-- PostgreSQL via Supabase
-- Run this on a fresh Supabase project for a clean install.
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================

create type public.user_role as enum ('admin', 'moderator', 'user');

-- ============================================================
-- TABLES
-- ============================================================

-- Profiles (linked to Supabase Auth users)
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       public.user_role not null default 'user',
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_profiles_role on profiles(role);
create index idx_profiles_invited_by on profiles(invited_by);

-- Invites
create table invites (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  created_by uuid not null references profiles(id) on delete cascade,
  used_by    uuid references profiles(id) on delete set null,
  used_at    timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_invites_code on invites(code);
create index idx_invites_created_by on invites(created_by);

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
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (NEW.id, NEW.raw_user_meta_data->>'email', 'user')
  on conflict (id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Validate invite code (callable by anon for signup)
create or replace function public.validate_invite_code(invite_code text)
returns boolean as $$
begin
  return exists (
    select 1 from public.invites
    where code = invite_code
      and used_by is null
      and expires_at > now()
  );
end;
$$ language plpgsql security definer;

-- Consume invite (called after signup)
create or replace function public.consume_invite(invite_code text, user_id uuid)
returns boolean as $$
declare
  v_invite_id uuid;
  v_created_by uuid;
begin
  select id, created_by into v_invite_id, v_created_by
  from public.invites
  where code = invite_code
    and used_by is null
    and expires_at > now()
  for update;

  if v_invite_id is null then
    return false;
  end if;

  update public.invites
  set used_by = user_id, used_at = now()
  where id = v_invite_id;

  update public.profiles
  set invited_by = v_created_by
  where id = user_id;

  return true;
end;
$$ language plpgsql security definer;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table invites enable row level security;
alter table categories enable row level security;
alter table stores enable row level security;
alter table products enable row level security;
alter table product_entries enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table shopping_carts enable row level security;
alter table shopping_cart_items enable row level security;

-- Profiles: role-based access
create policy "profiles_select_admin" on profiles
  for select to authenticated
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "profiles_select_moderator" on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (
      exists (select 1 from profiles where id = auth.uid() and role = 'moderator')
      and invited_by = auth.uid()
    )
  );

create policy "profiles_select_self" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_self" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Invites: creator-scoped
create policy "invites_select_own" on invites
  for select to authenticated
  using (created_by = auth.uid());

create policy "invites_insert" on invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin', 'moderator')
    )
  );

-- Categories: readable by all authenticated users
create policy "categories_select" on categories
  for select to authenticated using (true);

-- Stores: readable by all authenticated users
create policy "stores_select" on stores
  for select to authenticated using (true);

-- Products: readable/insertable by all authenticated
create policy "products_select" on products
  for select to authenticated using (true);

create policy "products_insert" on products
  for insert to authenticated with check (true);

-- Product entries: readable/insertable by all authenticated
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
-- GRANTS (for RPC functions)
-- ============================================================

grant execute on function public.validate_invite_code(text) to anon;
grant execute on function public.validate_invite_code(text) to authenticated;
grant execute on function public.consume_invite(text, uuid) to authenticated;

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
-- Then add storage policies:
--
-- create policy "Users can upload receipts"
-- on storage.objects for insert to authenticated
-- with check (
--   bucket_id = 'receipts'
--   and (storage.foldername(name))[1] = auth.uid()::text
-- );
--
-- create policy "Users can view own receipts"
-- on storage.objects for select to authenticated
-- using (
--   bucket_id = 'receipts'
--   and (storage.foldername(name))[1] = auth.uid()::text
-- );

-- ============================================================
-- BOOTSTRAP FIRST ADMIN
-- ============================================================
-- After running this schema:
-- 1. Sign up your first user (you'll need a temporary workaround
--    since no invites exist yet). Either:
--    a) Temporarily comment out invite validation in the app, OR
--    b) Insert a profile + invite manually:
--
-- INSERT INTO profiles (id, email, role)
-- VALUES ('<your-auth-user-id>', 'your@email.com', 'admin');
--
-- INSERT INTO invites (code, created_by, expires_at)
-- VALUES ('FIRST-INVITE', '<your-auth-user-id>', now() + interval '30 days');
--
-- Then use 'FIRST-INVITE' to register other users.
