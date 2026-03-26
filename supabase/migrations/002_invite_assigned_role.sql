-- Add assigned_role to invites so admin/moderator can define
-- what role the invited user will get on signup.
-- Default is 'user'. Only admin can assign 'moderator'.

ALTER TABLE public.invites
  ADD COLUMN assigned_role public.user_role NOT NULL DEFAULT 'user';

-- Update consume_invite to apply the assigned role
CREATE OR REPLACE FUNCTION public.consume_invite(invite_code text, user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_invite_id uuid;
  v_created_by uuid;
  v_assigned_role public.user_role;
BEGIN
  SELECT id, created_by, assigned_role
  INTO v_invite_id, v_created_by, v_assigned_role
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
  SET invited_by = v_created_by, role = v_assigned_role
  WHERE id = user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
