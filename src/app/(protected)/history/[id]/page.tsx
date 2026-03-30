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

  // Try own cart first
  let { data: cart } = await supabase
    .from("shopping_carts")
    .select("id, total, receipt_image_url, finalized_at, created_at, user_id, store_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  // If not own cart, check if shared with this user
  if (!cart) {
    const { data: share } = await supabase
      .from("cart_shares")
      .select("cart_id")
      .eq("cart_id", id)
      .eq("shared_with_user_id", user.id)
      .maybeSingle();

    if (share) {
      const { data: sharedCart } = await supabase
        .from("shopping_carts")
        .select("id, total, receipt_image_url, finalized_at, created_at, user_id, store_id")
        .eq("id", id)
        .single();
      cart = sharedCart;
    }
  }

  if (!cart) redirect("/history");

  let itemsResult = await supabase
    .from("shopping_cart_items")
    .select("id, product_id, price, original_price, quantity, created_at, products ( name )")
    .eq("cart_id", id)
    .order("created_at", { ascending: true });

  // Fallback if original_price column doesn't exist yet (migration 009)
  if (itemsResult.error?.message?.includes("original_price")) {
    itemsResult = await supabase
      .from("shopping_cart_items")
      .select("id, product_id, price, quantity, created_at, products ( name )")
      .eq("cart_id", id)
      .order("created_at", { ascending: true }) as typeof itemsResult;
  }

  const items = itemsResult.data;

  const { images: receiptImages } = await getCartReceiptImages(id);

  return (
    <CartDetailView
      cart={cart as never}
      items={(items ?? []) as never[]}
      receiptImages={receiptImages}
    />
  );
}
