"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createList, deleteList } from "@/features/lists/actions";
import type { ShoppingList } from "@/types/database";

interface ListWithCount extends ShoppingList {
  item_count: number;
}

interface ListsPageProps {
  lists: ListWithCount[];
}

export function ListsPage({ lists }: ListsPageProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createList(formData);
      if (result && "list" in result) {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleDelete(e: React.MouseEvent, listId: string) {
    e.stopPropagation();
    startTransition(async () => {
      await deleteList(listId);
      router.refresh();
    });
  }

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
        <p className="text-center text-gray-500 py-12">
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
                  onClick={(e) => handleDelete(e, list.id)}
                  loading={isPending}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
