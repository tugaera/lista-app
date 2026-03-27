import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CartDetailView } from "@/features/history/components/cart-detail-view";
import { getCartReceiptImages } from "@/features/history/actions-receipts";

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
    .select("id, total, receipt_image_url, finalized_at, created_at, user_id, store_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!cart) redirect("/history");

  const { data: items } = await supabase
    .from("shopping_cart_items")
    .select("id, product_id, price, quantity, created_at, products ( name )")
    .eq("cart_id", id)
    .order("created_at", { ascending: true });

  const { images: receiptImages } = await getCartReceiptImages(id);

  return (
    <CartDetailView
      cart={cart}
      items={(items ?? []) as never[]}
      receiptImages={receiptImages}
    />
  );
}
