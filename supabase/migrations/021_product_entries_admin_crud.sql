-- Migration 021: admin/moderator can update and delete product_entries
create policy if not exists "product_entries_update_admin" on product_entries
  for update to authenticated
  using (get_my_role() in ('admin', 'moderator'));

create policy if not exists "product_entries_delete_admin" on product_entries
  for delete to authenticated
  using (get_my_role() in ('admin', 'moderator'));
