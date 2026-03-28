import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ListDetail } from "@/features/lists/components/list-detail";
import { getListShares } from "@/features/lists/actions-shares";

export default async function ListDetailRoute({
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

  // Use security definer RPC to bypass RLS (works for owner and shared users)
  const { data: listData } = await supabase.rpc("get_list_by_id", { p_list_id: id });

  const list = listData as unknown as { id: string; user_id: string; name: string; created_at: string } | null;

  if (!list) redirect("/lists");

  const isOwner = list.user_id === user.id;

  // Fetch items via security definer RPC
  const { data: itemsData } = await supabase.rpc("get_list_items", { p_list_id: id });

  const items = (itemsData as unknown as Array<{
    id: string;
    list_id: string;
    product_id: string | null;
    product_name: string | null;
    planned_quantity: number;
    created_at: string;
    products: { id: string; name: string; barcode: string | null } | null;
    added_by_email: string | null;
  }>) ?? [];

  const shares = isOwner ? await getListShares(id) : [];

  return (
    <ListDetail
      list={list}
      items={items as never[]}
      isOwner={isOwner}
      initialShares={shares}
    />
  );
}
