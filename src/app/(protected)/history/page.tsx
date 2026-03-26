import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HistoryPage } from "@/features/history/components/history-page";

export default async function HistoryRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: carts } = await supabase
    .from("shopping_carts")
    .select(
      `
      id,
      user_id,
      total,
      receipt_image_url,
      created_at,
      shopping_cart_items ( id )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const displayCarts = (carts ?? []).map((cart) => ({
    ...cart,
    total: Number(cart.total),
    item_count: Array.isArray(cart.shopping_cart_items)
      ? cart.shopping_cart_items.length
      : 0,
  }));

  return <HistoryPage carts={displayCarts as never[]} />;
}
