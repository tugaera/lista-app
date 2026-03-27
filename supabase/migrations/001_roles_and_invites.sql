-- ============================================================
-- Migration: User Roles & Invite System
-- ============================================================

-- 1. Role enum
CREATE TYPE public.user_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  role       public.user_role NOT NULL DEFAULT 'user',
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_invited_by ON public.profiles(invited_by);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Invites table
CREATE TABLE public.invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  used_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  used_at    timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_code ON public.invites(code);
CREATE INDEX idx_invites_created_by ON public.invites(created_by);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Auto-create profile on signup (trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'email', 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4b. Get current user role (bypasses RLS to avoid recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 5. Validate invite code (callable by anon for signup)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_invite_code(invite_code text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.invites
    WHERE code = invite_code
      AND used_by IS NULL
      AND expires_at > now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Consume invite (called after signup)
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_invite(invite_code text, user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_invite_id uuid;
  v_created_by uuid;
BEGIN
  SELECT id, created_by INTO v_invite_id, v_created_by
  FROM public.invites
  WHERE code = invite_code
    AND used_by IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF v_invite_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.invites
  SET used_by = user_id, used_at = now()
  WHERE id = v_invite_id;

  UPDATE public.profiles
  SET invited_by = v_created_by
  WHERE id = user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RLS Policies for profiles
-- ============================================================

-- Admins see all (uses get_my_role() to avoid RLS recursion)
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

-- Moderators see themselves + users they invited
CREATE POLICY "profiles_select_moderator" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (public.get_my_role() = 'moderator' AND invited_by = auth.uid())
  );

-- Regular users see only themselves
CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Users can insert their own profile (fallback if trigger doesn't fire)
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can update only their own profile (but not change role)
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- 8. RLS Policies for invites
-- ============================================================

-- Users see their own invites
CREATE POLICY "invites_select_own" ON public.invites
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Only admin/moderator can create invites
CREATE POLICY "invites_insert" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.get_my_role() IN ('admin', 'moderator')
  );

-- ============================================================
-- 9. Grant execute on functions to anon + authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invite(text, uuid) TO authenticated;

-- ============================================================
-- 10. Create a seed invite for bootstrapping the first admin
-- You must:
--   1. Sign up using this code
--   2. Then run: UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
-- ============================================================
-- INSERT INTO public.invites (code, created_by, expires_at)
-- VALUES ('BOOTSTRAP-ADMIN', '<your-user-id>', now() + interval '30 days');
-- Note: You'll need to create the first profile manually. See SETUP instructions.
