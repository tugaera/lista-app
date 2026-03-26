"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createList, deleteList } from "@/features/lists/actions";
import type { ShoppingList } from "@/types/database";

interface ListWithCount extends ShoppingList {
  item_count: number;
}

interface ListsPageProps {
  lists: ListWithCount[];
}

export function ListsPage({ lists: initialLists }: ListsPageProps) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

    // Optimistic remove
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
        <h1 className="text-2xl font-bold text-gray-900">Shopping Lists</h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New List"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <form action={handleCreate} className="flex gap-3">
            <Input
              name="name"
              placeholder="List name"
              required
              className="flex-1"
            />
            <Button type="submit" loading={isPending}>
              Save
            </Button>
          </form>
        </Card>
      )}

      {lists.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No shopping lists yet. Create one to get started.
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
                  <h2 className="font-semibold text-gray-900">{list.name}</h2>
                  <p className="text-sm text-gray-500">
                    {list.item_count} {list.item_count === 1 ? "item" : "items"}{" "}
                    &middot;{" "}
                    {new Date(list.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => handleConfirmDelete(e, list.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete list"
        message={`Are you sure you want to delete "${deleteListData?.name ?? "this list"}" and all its items?`}
        confirmLabel="Delete"
        loading={isPending}
      />
    </div>
  );
}
