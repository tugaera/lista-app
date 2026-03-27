-- ============================================================
-- Migration 004: Multiple receipt images per cart
-- ============================================================

-- New table for multiple receipt images per cart
create table cart_receipt_images (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references shopping_carts(id) on delete cascade,
  image_url  text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_cart_receipt_images_cart on cart_receipt_images(cart_id);

-- Enable RLS
alter table cart_receipt_images enable row level security;

-- Policies: accessible via cart ownership
create policy "cart_receipt_images_select" on cart_receipt_images
  for select to authenticated using (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

create policy "cart_receipt_images_insert" on cart_receipt_images
  for insert to authenticated with check (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

create policy "cart_receipt_images_delete" on cart_receipt_images
  for delete to authenticated using (
    exists (select 1 from shopping_carts where id = cart_id and user_id = auth.uid())
  );

-- Migrate existing receipt_image_url data (if any)
insert into cart_receipt_images (cart_id, image_url, sort_order)
select id, receipt_image_url, 0
from shopping_carts
where receipt_image_url is not null;
