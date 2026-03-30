import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShoppingPage } from "@/features/shopping/components/shopping-page";
import { getCartItems } from "@/features/shopping/actions";
import { getListWithItems, getListsPreview } from "@/features/lists/actions";
import { getSharedWithMeCarts, getCartShares } from "@/features/shopping/actions-shares";
import type { TrackingItem } from "@/features/shopping/components/list-tracking-panel";

export default async function ShoppingRoute({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; cart?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { list: listId, cart: cartParam } = await searchParams;

  let cartId: string;
  let cartStoreId: string | null = null;
  let isSharedCart = false;
  let ownerEmail: string | undefined;

  if (cartParam) {
    // Verify user has access to this cart (own or shared)
    const { data: ownCart } = await supabase
      .from("shopping_carts")
      .select("id, store_id")
      .eq("id", cartParam)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownCart) {
      cartId = ownCart.id;
      cartStoreId = ownCart.store_id;
    } else {
      // Check if shared with this user
      const { data: share } = await supabase
        .from("cart_shares")
        .select("cart_id, owner_id")
        .eq("cart_id", cartParam)
        .eq("shared_with_user_id", user.id)
        .maybeSingle();

      if (share) {
        cartId = share.cart_id;
        isSharedCart = true;

        // Get owner email (uses security definer to bypass RLS)
        const { data: ownerEmailResult } = await supabase.rpc("get_profile_email_by_id", {
          user_id: share.owner_id,
        });

        ownerEmail = ownerEmailResult ?? share.owner_id;

        // Get cart store (uses security definer to bypass RLS)
        const { data: storeIdResult } = await supabase.rpc("get_cart_store_id", {
          p_cart_id: cartId,
        });

        cartStoreId = (storeIdResult as string | null) ?? null;
      } else {
        // No access — redirect to own cart
        redirect("/shopping");
      }
    }
  } else {
    // Get or create active cart (include store_id)
    const { data: existingCart } = await supabase
      .from("shopping_carts")
      .select("id, store_id")
      .eq("user_id", user.id)
      .is("finalized_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingCart) {
      cartId = existingCart.id;
      cartStoreId = existingCart.store_id;
    } else {
      const { data: newCart } = await supabase
        .from("shopping_carts")
        .insert({ user_id: user.id, total: 0 })
        .select("id")
        .single();
      cartId = newCart!.id;
    }
  }

  // Parallel fetches
  const [items, storesResult, listsResult, sharedWithMeCarts, initialShares] = await Promise.all([
    getCartItems(cartId),
    supabase.from("stores").select("id, name, is_active, sort_order").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true }),
    getListsPreview(),
    getSharedWithMeCarts(),
    isSharedCart ? Promise.resolve([]) : getCartShares(cartId),
  ]);

  // Load tracking list: from URL param, or from cart's saved tracking_list_id
  let trackingListId = listId ?? null;
  if (!trackingListId) {
    // Check if cart has a saved tracking list
    const { data: savedTrackingId } = await supabase.rpc("get_cart_tracking_list_id", { p_cart_id: cartId });
    if (savedTrackingId) trackingListId = savedTrackingId as string;
  }

  let initialTrackingList: { id: string; name: string; items: TrackingItem[] } | null = null;
  if (trackingListId) {
    const { list, items: listItems } = await getListWithItems(trackingListId);
    if (list) {
      initialTrackingList = {
        id: list.id,
        name: list.name,
        items: listItems.map((i) => ({
          id: i.id,
          productId: i.product_id ?? null,
          name: (i.products as unknown as { name: string } | null)?.name ?? i.product_name ?? "Unknown",
          plannedQty: i.planned_quantity,
        })),
      };
      // If loaded from URL, save to cart for shared users
      if (listId && !isSharedCart) {
        supabase.rpc("update_cart_tracking_list", { p_cart_id: cartId, p_tracking_list_id: list.id });
      }
    }
  }

  // Filter out the current cart from shared invitations
  const filteredSharedCarts = sharedWithMeCarts.filter(
    (c) => c.cartId !== cartId,
  );

  return (
    <ShoppingPage
      cartId={cartId}
      initialStoreId={cartStoreId}
      initialItems={items}
      stores={storesResult.data ?? []}
      lists={listsResult.lists}
      initialTrackingList={initialTrackingList}
      sharedWithMeCarts={filteredSharedCarts}
      isSharedCart={isSharedCart}
      ownerEmail={ownerEmail}
      initialShares={initialShares}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ""}
    />
  );
}
