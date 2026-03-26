import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShoppingPage } from "@/features/shopping/components/shopping-page";
import { getCartItems } from "@/features/shopping/actions";
import { getListWithItems, getListsPreview } from "@/features/lists/actions";
import type { TrackingItem } from "@/features/shopping/components/list-tracking-panel";

export default async function ShoppingRoute({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { list: listId } = await searchParams;

  // Get or create active cart (include store_id)
  const { data: existingCart } = await supabase
    .from("shopping_carts")
    .select("id, store_id")
    .eq("user_id", user.id)
    .is("finalized_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let cartId: string;
  let cartStoreId: string | null = null;

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

  // Parallel fetches
  const [items, storesResult, listsResult] = await Promise.all([
    getCartItems(cartId),
    supabase.from("stores").select("id, name, is_active").eq("is_active", true).order("name"),
    getListsPreview(),
  ]);

  // If a list was requested via URL, fetch its items for tracking
  let initialTrackingList: { id: string; name: string; items: TrackingItem[] } | null = null;
  if (listId) {
    const { list, items: listItems } = await getListWithItems(listId);
    if (list) {
      initialTrackingList = {
        id: list.id,
        name: list.name,
        items: listItems.map((i) => ({
          id: i.id,
          productId: i.product_id ?? null,
          name: (i.products as unknown as { name: string } | null)?.name ?? "Unknown",
          plannedQty: i.planned_quantity,
        })),
      };
    }
  }

  return (
    <ShoppingPage
      cartId={cartId}
      initialStoreId={cartStoreId}
      initialItems={items}
      stores={storesResult.data ?? []}
      lists={listsResult.lists}
      initialTrackingList={initialTrackingList}
    />
  );
}
