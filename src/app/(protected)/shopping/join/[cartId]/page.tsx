import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached";
import { JoinCartConfirm } from "./join-cart-confirm";

export default async function JoinCartPage({
  params,
}: {
  params: Promise<{ cartId: string }>;
}) {
  const { cartId } = await params;
  const user = await getCachedUser();

  if (!user) redirect(`/auth/login?next=/shopping/join/${cartId}`);

  // Don't query the cart directly — RLS blocks it since the user isn't a member yet.
  // The JoinCartConfirm component calls the security definer RPC which handles everything.
  return <JoinCartConfirm cartId={cartId} />;
}
