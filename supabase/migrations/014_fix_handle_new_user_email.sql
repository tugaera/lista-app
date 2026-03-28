-- Fix: use NEW.email (always set by Supabase Auth) instead of raw_user_meta_data
-- which may be NULL, causing "Database error saving new user"
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (NEW.id, coalesce(NEW.email, NEW.raw_user_meta_data->>'email'), 'user')
  on conflict (id) do nothing;
  return NEW;
end;
$$ language plpgsql security definer;
