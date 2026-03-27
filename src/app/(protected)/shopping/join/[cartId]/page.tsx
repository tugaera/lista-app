import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { JoinCartConfirm } from "./join-cart-confirm";

export default async function JoinCartPage({
  params,
}: {
  params: Promise<{ cartId: string }>;
}) {
  const { cartId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/login?next=/shopping/join/${cartId}`);

  // Fetch cart + owner info
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id, user_id, finalized_at, stores(name)")
    .eq("id", cartId)
    .is("finalized_at", null)
    .maybeSingle();

  if (!cart) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-gray-600">This cart is no longer available or has already been finalized.</p>
          <a href="/shopping" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Go to My Cart
          </a>
        </div>
      </div>
    );
  }

  // User already owns this cart
  if (cart.user_id === user.id) {
    redirect(`/shopping?cart=${cartId}`);
  }

  // Get owner email
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", cart.user_id)
    .maybeSingle();

  const ownerEmail = ownerProfile?.email ?? "someone";
  const storeName = (cart.stores as unknown as { name: string } | null)?.name ?? null;

  return (
    <JoinCartConfirm
      cartId={cartId}
      ownerEmail={ownerEmail}
      storeName={storeName}
    />
  );
}
