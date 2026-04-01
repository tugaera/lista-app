"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createList, deleteList } from "@/features/lists/actions";
import { useT } from "@/i18n/i18n-provider";

interface ListItem {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  item_count: number;
  isOwner: boolean;
  ownerEmail: string | null;
}

interface ListsPageProps {
  lists: ListItem[];
  userId: string;
}

export function ListsPage({ lists: initialLists, userId }: ListsPageProps) {
  const router = useRouter();
  const { t } = useT();
  const [lists, setLists] = useState(initialLists);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  void userId; // kept for potential future use

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createList(formData);
      if (result && "list" in result) {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleConfirmDelete(e: React.MouseEvent, listId: string) {
    e.stopPropagation();
    setDeleteConfirm(listId);
  }

  function handleDelete() {
    if (!deleteConfirm) return;
    const listId = deleteConfirm;
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setDeleteConfirm(null);
    startTransition(async () => {
      await deleteList(listId);
    });
  }

  const deleteListData = lists.find((l) => l.id === deleteConfirm);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("lists.title")}</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? t("common.cancel") : t("lists.newList")}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <form action={handleCreate} className="flex gap-3">
            <Input
              name="name"
              placeholder={t("lists.listName")}
              required
              className="flex-1"
            />
            <Button type="submit" loading={isPending}>
              {t("common.save")}
            </Button>
          </form>
        </Card>
      )}

      {lists.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          {t("lists.noLists")}
        </p>
      ) : (
        <div className="space-y-3">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer transition hover:shadow-md"
            >
              <div
                className="flex items-center justify-between"
                onClick={() => router.push(`/lists/${list.id}`)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900">{list.name}</h2>
                    {!list.isOwner && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {t("lists.shared")}
                      </span>
                    )}
                  </div>
                  {list.isOwner ? (
                    <p className="text-sm text-gray-500">
                      {list.item_count} {list.item_count === 1 ? t("lists.item") : t("lists.items")}
                      {list.created_at && (
                        <> &middot; {new Date(list.created_at).toLocaleDateString()}</>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      by {list.ownerEmail}
                    </p>
                  )}
                </div>
                {list.isOwner && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => handleConfirmDelete(e, list.id)}
                  >
                    {t("common.delete")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title={t("lists.deleteList")}
        message={t("lists.deleteListConfirm")}
        confirmLabel={t("common.delete")}
        loading={isPending}
      />
    </div>
  );
}
