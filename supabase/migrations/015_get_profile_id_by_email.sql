-- Allow any authenticated user to look up a profile id by email
-- This bypasses RLS so sharing works for all roles (not just admin)
create or replace function public.get_profile_id_by_email(lookup_email text)
returns uuid as $$
  select id from public.profiles where lower(email) = lower(lookup_email) limit 1;
$$ language sql security definer stable;
