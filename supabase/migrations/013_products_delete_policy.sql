-- Allow admin/moderator to delete products
CREATE POLICY "products_delete" ON products
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'moderator'));
