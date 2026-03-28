-- Allow any authenticated user to look up a profile email by user id
-- This bypasses RLS so shared cart/list pages can display owner info
create or replace function public.get_profile_email_by_id(user_id uuid)
returns text as $$
  select email from public.profiles where id = user_id limit 1;
$$ language sql security definer stable;
