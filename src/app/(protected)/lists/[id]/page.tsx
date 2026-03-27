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

  // Try fetching as owner first
  const { data: ownList } = await supabase
    .from("shopping_lists")
    .select("id, user_id, name, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  // If not owner, check if shared with this user (RLS updated by migration 008)
  const { data: list } = ownList
    ? { data: ownList }
    : await supabase
        .from("shopping_lists")
        .select("id, user_id, name, created_at")
        .eq("id", id)
        .maybeSingle();

  if (!list) redirect("/lists");

  const isOwner = list.user_id === user.id;

  const [itemsResult, shares] = await Promise.all([
    supabase
      .from("shopping_list_items")
      .select(
        `
        id,
        list_id,
        product_id,
        planned_quantity,
        created_at,
        products ( id, name, barcode )
      `
      )
      .eq("list_id", id)
      .order("created_at", { ascending: true }),
    isOwner ? getListShares(id) : Promise.resolve([]),
  ]);

  return (
    <ListDetail
      list={list}
      items={(itemsResult.data ?? []) as never[]}
      isOwner={isOwner}
      initialShares={shares}
    />
  );
}
