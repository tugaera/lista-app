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

  // Get or create active cart
  const { data: existingCart } = await supabase
    .from("shopping_carts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let cartId: string;

  if (existingCart) {
    cartId = existingCart.id;
  } else {
    const { data: newCart } = await supabase
      .from("shopping_carts")
      .insert({ user_id: user.id, total: 0 })
      .select("id")
      .single();

    cartId = newCart!.id;
  }

  // Fetch cart items using the shared action
  const items = await getCartItems(cartId);

  // Fetch stores
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name")
    .order("name");

  return (
    <ShoppingPage
      cartId={cartId}
      initialItems={items}
      stores={stores ?? []}
    />
  );
}
