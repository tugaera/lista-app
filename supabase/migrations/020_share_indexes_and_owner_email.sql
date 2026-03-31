-- Migration 020: indexes on shared_with_user_id + owner_email in get_shared_carts_for_user

-- P1: Indexes on cart_shares and list_shares for shared_with_user_id
-- (queried by every RPC and RLS policy that checks shared membership)
create index if not exists idx_cart_shares_shared_with on cart_shares (shared_with_user_id);
create index if not exists idx_list_shares_shared_with on list_shares (shared_with_user_id);

-- P2: Update get_shared_carts_for_user to return owner_email inline
-- (eliminates N+1 get_profile_email_by_id calls in application code)
create or replace function public.get_shared_carts_for_user()
returns jsonb
language plpgsql
security definer stable
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return coalesce((
    select jsonb_agg(row_to_json(t))
    from (
      select
        sc.id as cart_id,
        cs.owner_id,
        (select email from profiles where id = cs.owner_id) as owner_email,
        sc.total,
        sc.store_id,
        s.name as store_name
      from cart_shares cs
      join shopping_carts sc on sc.id = cs.cart_id
      left join stores s on s.id = sc.store_id
      where cs.shared_with_user_id = v_user_id
        and sc.finalized_at is null
    ) t
  ), '[]'::jsonb);
end;
$$;
