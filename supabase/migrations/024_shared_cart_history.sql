-- Migration 024: RPCs for shared users to view finalized cart history

-- Get finalized carts shared with current user (for history page)
create or replace function public.get_shared_finalized_carts()
returns jsonb language plpgsql security definer stable as $$
declare
  v_user_id uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(row_to_json(t) order by t.finalized_at desc)
    from (
      select
        sc.id,
        sc.user_id,
        sc.total,
        sc.receipt_image_url,
        sc.created_at,
        sc.finalized_at,
        sc.store_id,
        s.name as store_name,
        pr.email as owner_email,
        (select count(*) from shopping_cart_items sci where sci.cart_id = sc.id) as item_count
      from cart_shares cs
      join shopping_carts sc on sc.id = cs.cart_id
      left join stores s on s.id = sc.store_id
      left join profiles pr on pr.id = sc.user_id
      where cs.shared_with_user_id = v_user_id
        and sc.finalized_at is not null
    ) t
  ), '[]'::jsonb);
end; $$;

-- Get a single cart's metadata if user is owner or shared member
create or replace function public.get_cart_by_id(p_cart_id uuid)
returns jsonb language plpgsql security definer stable as $$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean;
begin
  select exists(
    select 1 from shopping_carts sc
    where sc.id = p_cart_id
      and (sc.user_id = v_user_id
        or exists (select 1 from cart_shares cs where cs.cart_id = sc.id and cs.shared_with_user_id = v_user_id))
  ) into v_has_access;

  if not v_has_access then return null; end if;

  return (
    select row_to_json(t)
    from (
      select sc.id, sc.user_id, sc.total, sc.receipt_image_url, sc.created_at, sc.finalized_at, sc.store_id,
             s.name as store_name
      from shopping_carts sc
      left join stores s on s.id = sc.store_id
      where sc.id = p_cart_id
    ) t
  );
end; $$;
