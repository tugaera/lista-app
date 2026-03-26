"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  addListItem,
  removeListItem,
  updateListItemQuantity,
  convertListToCart,
} from "@/features/lists/actions";
import { ProductSearch, type ProductResult } from "@/features/shopping/components/product-search";
import type { ShoppingList, ShoppingListItem, Product } from "@/types/database";

interface ListItemWithProduct extends ShoppingListItem {
  products: Pick<Product, "id" | "name" | "barcode"> | null;
}

interface ListDetailProps {
  list: ShoppingList;
  items: ListItemWithProduct[];
}

export function ListDetail({ list, items: initialItems }: ListDetailProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim()) return;
    setError(null);

    const name = productName.trim();
    const qty = Number(quantity) || 1;

    startTransition(async () => {
      const result = await addListItem(list.id, name, qty);

      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }

      // Optimistic: add to local list or update quantity
      if (result && "merged" in result && result.merged) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === result.item.id
              ? { ...item, planned_quantity: item.planned_quantity + qty }
              : item
          )
        );
      } else {
        // Refresh to get the full item with product data
        router.refresh();
      }

      setProductName("");
      setQuantity("1");
    });
  }

  function handleConfirmDelete(itemId: string) {
    setDeleteConfirm(itemId);
  }

  function handleRemoveItem() {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm;

    // Optimistic remove
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setDeleteConfirm(null);

    startTransition(async () => {
      await removeListItem(itemId);
    });
  }

  function handleStartEdit(itemId: string, currentQuantity: number) {
    setEditingItem(itemId);
    setEditQuantity(String(currentQuantity));
  }

  function handleSaveQuantity(itemId: string) {
    const newQty = Number(editQuantity);
    if (newQty < 1) return;

    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, planned_quantity: newQty } : i
      )
    );
    setEditingItem(null);

    startTransition(async () => {
      await updateListItemQuantity(itemId, newQty);
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

  const deleteItem = items.find((i) => i.id === deleteConfirm);

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
          {items.length > 0 && (
            <Button onClick={handleConvertToCart} loading={isPending}>
              Start Shopping
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <form onSubmit={handleAddItem} className="space-y-3">
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <ProductSearch
                onSelect={handleProductSelect}
                placeholder="Search or type product name"
                value={productName}
                onValueChange={setProductName}
              />
            </div>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-20"
              placeholder="Qty"
            />
            <Button type="submit" loading={isPending}>
              Add
            </Button>
          </div>
        </form>
      </Card>

      {items.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
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
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSaveQuantity(item.id)
                        }
                        className="w-20"
                        autoFocus
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
                      className="cursor-pointer text-sm text-gray-500 hover:text-emerald-600"
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
                  onClick={() => handleConfirmDelete(item.id)}
                >
                  Remove
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
        onConfirm={handleRemoveItem}
        title="Remove item"
        message={`Are you sure you want to remove "${deleteItem?.products?.name ?? "this item"}" from the list?`}
        confirmLabel="Remove"
        loading={isPending}
      />
    </div>
  );
}
