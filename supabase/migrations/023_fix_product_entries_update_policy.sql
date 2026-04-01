-- Migration 023: fix product_entries update policy — add WITH CHECK clause
-- Without WITH CHECK, PostgreSQL silently rejects the updated row
drop policy if exists "product_entries_update_admin" on product_entries;
create policy "product_entries_update_admin" on product_entries
  for update to authenticated
  using (get_my_role() in ('admin', 'moderator'))
  with check (get_my_role() in ('admin', 'moderator'));
