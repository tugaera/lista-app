-- Migration 005: products.is_active + shopping_carts.store_id
-- Run in Supabase SQL Editor

-- Add is_active to products
alter table public.products
  add column if not exists is_active boolean not null default true;

-- Add store_id to shopping_carts (optional reference)
alter table public.shopping_carts
  add column if not exists store_id uuid references public.stores(id);

-- Allow admin/moderator to update products
create policy "products_update" on products
  for update to authenticated
  using (get_my_role() in ('admin', 'moderator'))
  with check (get_my_role() in ('admin', 'moderator'));

-- Allow authenticated users to insert stores (needed for shopping flow)
create policy "stores_insert_authenticated" on stores
  for insert to authenticated
  with check (get_my_role() in ('admin', 'moderator'));

-- Allow admin/moderator to update stores
create policy "stores_update" on stores
  for update to authenticated
  using (get_my_role() in ('admin', 'moderator'));
