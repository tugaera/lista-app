-- Add is_active to stores for enable/disable functionality
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Allow admins and moderators to update stores
CREATE POLICY "stores_update_admin" ON public.stores
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'moderator'))
  WITH CHECK (get_my_role() IN ('admin', 'moderator'));
