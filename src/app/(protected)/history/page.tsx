import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached";
import { HistoryPage } from "@/features/history/components/history-page";
import { getCartHistory } from "@/features/history/actions";
import { getStores } from "@/features/stores/actions";

export default async function HistoryRoute() {
  const user = await getCachedUser();

  if (!user) redirect("/auth/login");

  const [{ carts }, storesResult] = await Promise.all([
    getCartHistory(),
    getStores(),
  ]);

  const activeStores = storesResult.stores.filter((s) => s.is_active);

  return <HistoryPage carts={carts} stores={activeStores} />;
}
