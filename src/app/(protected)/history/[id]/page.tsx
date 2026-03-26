import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CartDetailView } from "@/features/history/components/cart-detail-view";

export default async function CartDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id, total, receipt_image_url, finalized_at, created_at, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!cart) redirect("/history");

  const { data: items } = await supabase
    .from("shopping_cart_items")
    .select(
      `
      id,
      quantity,
      product_entries (
        price,
        products ( name ),
        stores ( name )
      )
    `
    )
    .eq("cart_id", id)
    .order("created_at", { ascending: true });

  return (
    <CartDetailView
      cart={cart}
      items={(items ?? []) as never[]}
    />
  );
}
