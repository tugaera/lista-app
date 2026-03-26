"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addListItem,
  removeListItem,
  updateListItemQuantity,
  convertListToCart,
} from "@/features/lists/actions";
import type { ShoppingList, ShoppingListItem, Product } from "@/types/database";

interface ListItemWithProduct extends ShoppingListItem {
  products: Pick<Product, "id" | "name" | "barcode"> | null;
}

interface ListDetailProps {
  list: ShoppingList;
  items: ListItemWithProduct[];
}

export function ListDetail({ list, items }: ListDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [productSearch, setProductSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!productSearch.trim()) return;

    startTransition(async () => {
      // productSearch is treated as a product ID for now
      await addListItem(list.id, productSearch.trim(), Number(quantity) || 1);
      setProductSearch("");
      setQuantity("1");
      router.refresh();
    });
  }

  function handleRemoveItem(itemId: string) {
    startTransition(async () => {
      await removeListItem(itemId);
      router.refresh();
    });
  }

  function handleStartEdit(itemId: string, currentQuantity: number) {
    setEditingItem(itemId);
    setEditQuantity(String(currentQuantity));
  }

  function handleSaveQuantity(itemId: string) {
    const newQty = Number(editQuantity);
    if (newQty < 1) return;

    startTransition(async () => {
      await updateListItemQuantity(itemId, newQty);
      setEditingItem(null);
      router.refresh();
    });
  }

  function handleConvertToCart() {
    startTransition(async () => {
      const result = await convertListToCart(list.id);
      if (result && "cartId" in result) {
        router.push("/shopping");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <button
          onClick={() => router.push("/lists")}
          className="mb-2 text-sm text-emerald-600 hover:text-emerald-700"
        >
          &larr; Back to lists
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
          <Button onClick={handleConvertToCart} loading={isPending}>
            Start Shopping
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <form onSubmit={handleAddItem} className="flex gap-3">
          <Input
            placeholder="Product ID"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="flex-1"
          />
          <Input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-20"
          />
          <Button type="submit" loading={isPending}>
            Add
          </Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <p className="text-center text-gray-500 py-12">
          No items yet. Add products to your list.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {item.products?.name ?? "Unknown product"}
                  </p>
                  {editingItem === item.id ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
                        className="w-20"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveQuantity(item.id)}
                        loading={isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingItem(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <p
                      className="text-sm text-gray-500 cursor-pointer hover:text-emerald-600"
                      onClick={() =>
                        handleStartEdit(item.id, item.planned_quantity)
                      }
                    >
                      Qty: {item.planned_quantity}
                    </p>
                  )}
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleRemoveItem(item.id)}
                  loading={isPending}
                >
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
