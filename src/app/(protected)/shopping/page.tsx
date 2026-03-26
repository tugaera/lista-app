import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShoppingPage } from "@/features/shopping/components/shopping-page";
import { getCartItems } from "@/features/shopping/actions";

export default async function ShoppingRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

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

  const [items, storesResult] = await Promise.all([
    getCartItems(cartId),
    supabase
      .from("stores")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <ShoppingPage
      cartId={cartId}
      initialStoreId={cartStoreId}
      initialItems={items}
      stores={storesResult.data ?? []}
    />
  );
}
