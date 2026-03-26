import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HistoryPage } from "@/features/history/components/history-page";
import { getStores } from "@/features/stores/actions";

export default async function HistoryRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [cartsResult, storesResult] = await Promise.all([
    supabase
      .from("shopping_carts")
      .select(
        `id, user_id, total, receipt_image_url, created_at, finalized_at, shopping_cart_items ( id )`
      )
      .eq("user_id", user.id)
      .not("finalized_at", "is", null)
      .order("finalized_at", { ascending: false }),
    getStores(),
  ]);

  const displayCarts = (cartsResult.data ?? []).map((cart) => ({
    ...cart,
    total: Number(cart.total),
    item_count: Array.isArray(cart.shopping_cart_items)
      ? cart.shopping_cart_items.length
      : 0,
  }));

  const activeStores = storesResult.stores.filter((s) => s.is_active);

  return <HistoryPage carts={displayCarts as never[]} stores={activeStores} />;
}
