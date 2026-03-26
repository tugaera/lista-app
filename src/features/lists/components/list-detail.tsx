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
} from "@/features/lists/actions";
import { ProductSearch, type ProductResult } from "@/features/shopping/components/product-search";
import { BarcodeScanner } from "@/features/shopping/components/barcode-scanner";
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
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);

  // ── Barcode scan ────────────────────────────────────────────────────────
  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false);
    setBarcodeStatus("Looking up barcode…");

    try {
      const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabaseClient();

      const { data: product } = await supabase
        .from("products")
        .select("id, name")
        .eq("barcode", barcode)
        .eq("is_active", true)
        .single();

      if (product) {
        setProductName(product.name);
        setBarcodeStatus(`Found: ${product.name}`);
      } else {
        setBarcodeStatus("Searching Open Food Facts…");
        try {
          const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
          const json = await res.json();
          if (json.status === 1 && json.product) {
            const p = json.product;
            const name = p.product_name_pt || p.generic_name_pt || p.product_name || p.generic_name || "";
            if (name) {
              setProductName(name);
              setBarcodeStatus(`Found: ${name}`);
            } else {
              setBarcodeStatus("Product found but no name — type it below");
            }
          } else {
            setBarcodeStatus("Product not found — type name below");
          }
        } catch {
          setBarcodeStatus("Could not search online — type name below");
        }
      }
    } catch {
      setBarcodeStatus("Error looking up barcode");
    }
  }

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    setBarcodeStatus(null);
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

      if (result && "merged" in result && result.merged) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === result.item.id
              ? { ...item, planned_quantity: item.planned_quantity + qty }
              : item,
          ),
        );
      } else {
        router.refresh();
      }

      setProductName("");
      setQuantity("1");
      setBarcodeStatus(null);
    });
  }

  function handleRemoveItem() {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setDeleteConfirm(null);
    startTransition(async () => { await removeListItem(itemId); });
  }

  function handleStartEdit(itemId: string, currentQuantity: number) {
    setEditingItem(itemId);
    setEditQuantity(String(currentQuantity));
  }

  function handleSaveQuantity(itemId: string) {
    const newQty = Number(editQuantity);
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, planned_quantity: newQty } : i)),
    );
    setEditingItem(null);
    startTransition(async () => { await updateListItemQuantity(itemId, newQty); });
  }

  const deleteItem = items.find((i) => i.id === deleteConfirm);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      {/* Back + title */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/lists")}
          className="mb-2 text-sm text-emerald-600 hover:text-emerald-700"
        >
          ← Back to lists
        </button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
          {items.length > 0 && (
            <button
              onClick={() => router.push(`/shopping?list=${list.id}`)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Start Shopping
            </button>
          )}
        </div>
      </div>

      {/* Add item form */}
      <Card className="mb-6">
        <form onSubmit={handleAddItem} className="space-y-3">
          {barcodeStatus && (
            <p className="text-xs font-medium text-emerald-600">{barcodeStatus}</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <div className="flex-1">
              <ProductSearch
                onSelect={handleProductSelect}
                placeholder="Search or type product name"
                value={productName}
                onValueChange={(v) => { setProductName(v); setBarcodeStatus(null); }}
              />
            </div>
            {/* Barcode scanner button */}
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="flex shrink-0 items-center justify-center rounded-lg border border-gray-300 px-3 text-gray-500 hover:border-blue-400 hover:text-blue-600"
              title="Scan barcode"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </button>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-16"
              placeholder="Qty"
            />
            <Button type="submit" loading={isPending}>Add</Button>
          </div>
        </form>
      </Card>

      {/* Item list */}
      {items.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No items yet. Add products to your list.</p>
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
                        onKeyDown={(e) => e.key === "Enter" && handleSaveQuantity(item.id)}
                        className="w-20"
                        autoFocus
                      />
                      <Button size="sm" onClick={() => handleSaveQuantity(item.id)} loading={isPending}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <p
                      className="cursor-pointer text-sm text-gray-500 hover:text-emerald-600"
                      onClick={() => handleStartEdit(item.id, item.planned_quantity)}
                    >
                      Qty: {item.planned_quantity}
                    </p>
                  )}
                </div>
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(item.id)}>
                  Remove
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Barcode scanner modal */}
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleRemoveItem}
        title="Remove item"
        message={`Remove "${deleteItem?.products?.name ?? "this item"}" from the list?`}
        confirmLabel="Remove"
        loading={isPending}
      />
    </div>
  );
}
