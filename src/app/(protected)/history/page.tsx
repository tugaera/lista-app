import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HistoryPage } from "@/features/history/components/history-page";
import { getCartHistory } from "@/features/history/actions";
import { getStores } from "@/features/stores/actions";

export default async function HistoryRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [{ carts }, storesResult] = await Promise.all([
    getCartHistory(),
    getStores(),
  ]);

  const activeStores = storesResult.stores.filter((s) => s.is_active);

  return <HistoryPage carts={carts} stores={activeStores} />;
}
