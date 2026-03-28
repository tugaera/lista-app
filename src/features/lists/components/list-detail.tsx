"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import {
  shareList,
  getListShares,
  revokeListShare,
  type ListShareInfo,
} from "@/features/lists/actions-shares";
import { ProductSearch, type ProductResult } from "@/features/shopping/components/product-search";
import { BarcodeScanner } from "@/features/shopping/components/barcode-scanner";
import type { ShoppingList, ShoppingListItem, Product } from "@/types/database";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getUserColor, getUserInitial } from "@/lib/user-colors";

interface ListItemWithProduct extends ShoppingListItem {
  products: Pick<Product, "id" | "name" | "barcode"> | null;
  added_by_email?: string | null;
}

interface ListDetailProps {
  list: ShoppingList;
  items: ListItemWithProduct[];
  isOwner?: boolean;
  initialShares?: ListShareInfo[];
  currentUserId?: string;
  currentUserEmail?: string;
}

export function ListDetail({ list, items: initialItems, isOwner = true, initialShares = [], currentUserId = "", currentUserEmail = "" }: ListDetailProps) {
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
  const scannedBarcodeRef = useRef<string | null>(null);
  const scannedNameRef = useRef<string | null>(null);

  const isShared = !isOwner || initialShares.length > 0;

  // Share panel
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shares, setShares] = useState<ListShareInfo[]>(initialShares);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLoading, startShareTransition] = useTransition();
  const [urlCopied, setUrlCopied] = useState(false);

  // Build userId → email map for realtime events
  const emailMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if ((item as unknown as { added_by?: string }).added_by && item.added_by_email) {
        map.set((item as unknown as { added_by: string }).added_by, item.added_by_email);
      }
    }
    if (currentUserId && currentUserEmail) {
      map.set(currentUserId, currentUserEmail);
    }
    emailMapRef.current = map;
  }, [items, currentUserId, currentUserEmail]);

  // Realtime subscription for list items
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`list-items-${list.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shopping_list_items",
          filter: `list_id=eq.${list.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            list_id: string;
            product_id: string | null;
            product_name: string | null;
            planned_quantity: number;
            created_at: string;
            added_by: string | null;
          };
          const addedByEmail = row.added_by
            ? emailMapRef.current.get(row.added_by) ?? undefined
            : undefined;
          setItems((prev) => {
            if (prev.find((i) => i.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                list_id: row.list_id,
                product_id: row.product_id,
                product_name: row.product_name,
                planned_quantity: row.planned_quantity,
                created_at: row.created_at,
                added_by: row.added_by,
                products: row.product_name
                  ? { id: row.product_id ?? "", name: row.product_name, barcode: null }
                  : null,
                added_by_email: addedByEmail ?? null,
              } as ListItemWithProduct,
            ];
          });
          // If email unknown, resolve via RPC and update item
          if (row.added_by && !addedByEmail) {
            supabase.rpc("get_profile_email_by_id", { user_id: row.added_by }).then(({ data }) => {
              if (data) {
                emailMapRef.current.set(row.added_by!, data);
                setItems((prev) =>
                  prev.map((i) => i.id === row.id ? { ...i, added_by_email: data } : i),
                );
              }
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shopping_list_items",
          filter: `list_id=eq.${list.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            planned_quantity: number;
          };
          setItems((prev) =>
            prev.map((item) =>
              item.id === row.id
                ? { ...item, planned_quantity: row.planned_quantity }
                : item,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "shopping_list_items",
          filter: `list_id=eq.${list.id}`,
        },
        (payload) => {
          const row = payload.old as { id: string };
          setItems((prev) => prev.filter((item) => item.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [list.id]);

  // ── Barcode scan ────────────────────────────────────────────────────────
  async function handleBarcodeScan(barcode: string) {
    setShowScanner(false);
    setBarcodeStatus("Looking up barcode…");
    scannedBarcodeRef.current = barcode;
    scannedNameRef.current = null;

    try {
      const supabase = createBrowserSupabaseClient();

      const { data: product } = await supabase
        .from("products")
        .select("id, name")
        .eq("barcode", barcode)
        .eq("is_active", true)
        .single();

      if (product) {
        scannedNameRef.current = product.name;
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
              scannedNameRef.current = name;
              setProductName(name);
              setBarcodeStatus(`Found: ${name}`);
            } else {
              scannedBarcodeRef.current = null;
              setBarcodeStatus("Product found but no name — type it below");
            }
          } else {
            scannedBarcodeRef.current = null;
            setBarcodeStatus("Product not found — type name below");
          }
        } catch {
          scannedBarcodeRef.current = null;
          setBarcodeStatus("Could not search online — type name below");
        }
      }
    } catch {
      scannedBarcodeRef.current = null;
      setBarcodeStatus("Error looking up barcode");
    }
  }

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    scannedBarcodeRef.current = null;
    scannedNameRef.current = null;
    setBarcodeStatus(null);
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim()) return;
    setError(null);

    const name = productName.trim();
    const qty = Number(quantity) || 1;
    // Only pass barcode if the name still matches what the scan returned (user didn't change it)
    const barcode = scannedBarcodeRef.current && scannedNameRef.current === name
      ? scannedBarcodeRef.current
      : undefined;

    startTransition(async () => {
      const result = await addListItem(list.id, name, qty, barcode ? { barcode } : undefined);

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
      } else if (result && "item" in result && result.item) {
        const newItem = result.item as ListItemWithProduct;
        setItems((prev) => [
          ...prev,
          {
            ...newItem,
            products: newItem.product_id
              ? { id: newItem.product_id, name: result.productName ?? name, barcode: barcode ?? null }
              : null,
          },
        ]);
      }

      setProductName("");
      setQuantity("1");
      scannedBarcodeRef.current = null;
      scannedNameRef.current = null;
      setBarcodeStatus(null);
    });
  }

  function handleRemoveItem() {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setDeleteConfirm(null);
    startTransition(async () => { await removeListItem(itemId, list.id); });
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
    startTransition(async () => { await updateListItemQuantity(itemId, newQty, list.id); });
  }

  const deleteItem = items.find((i) => i.id === deleteConfirm);

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setShareError(null);
    const email = shareEmail.trim();
    if (!email) return;
    startShareTransition(async () => {
      const result = await shareList(list.id, email);
      if (result.error) {
        setShareError(result.error);
      } else {
        setShareEmail("");
        const updatedShares = await getListShares(list.id);
        setShares(updatedShares);
      }
    });
  }

  function handleRevoke(shareId: string) {
    startShareTransition(async () => {
      await revokeListShare(shareId);
      const updatedShares = await getListShares(list.id);
      setShares(updatedShares);
    });
  }

  function handleCopyUrl() {
    const url = `${window.location.origin}/lists/join/${list.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }).catch(() => {
      setUrlCopied(false);
    });
  }

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
          <div className="flex shrink-0 items-center gap-2">
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowSharePanel((v) => !v)}
                title="Share list"
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  showSharePanel
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            )}
            {items.length > 0 && (
              <button
                onClick={() => router.push(`/shopping?list=${list.id}`)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Start Shopping
              </button>
            )}
          </div>
        </div>

        {/* Share panel */}
        {showSharePanel && isOwner && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Share this list</h2>
            <form onSubmit={handleShare} className="mb-3 flex gap-2">
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Enter email address"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={shareLoading || !shareEmail.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {shareLoading ? "..." : "Invite"}
              </button>
            </form>
            {shareError && <p className="mb-2 text-xs text-red-600">{shareError}</p>}

            {/* Shareable link */}
            <div className="mb-3">
              <p className="mb-1 text-xs text-gray-500">Or share a link — anyone who opens it can view this list.</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}/lists/join/${list.id}` : ""}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  title="Copy link"
                  className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-blue-700 hover:bg-blue-100"
                >
                  {urlCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {shares.length > 0 ? (
              <ul className="space-y-1">
                {shares.map((share) => (
                  <li key={share.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm">
                    <span className="text-gray-700">{share.sharedWithEmail}</span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      disabled={shareLoading}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No members yet. Invite someone by email or link.</p>
            )}
          </div>
        )}
      </div>

      {/* Add item form */}
      <Card className="mb-6">
        <form onSubmit={handleAddItem} className="space-y-3">
          {barcodeStatus && (
            <p className="text-xs font-medium text-emerald-600">{barcodeStatus}</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {/* Row 1: scan + product name */}
          <div className="flex gap-2">
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
            <div className="flex-1 min-w-0">
              <ProductSearch
                onSelect={handleProductSelect}
                placeholder="Search or type product name"
                value={productName}
                onValueChange={(v) => {
                  setProductName(v);
                  setBarcodeStatus(null);
                }}
              />
            </div>
          </div>
          {/* Row 2: qty + add */}
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Qty"
              className="w-20 shrink-0 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <Button type="submit" loading={isPending} className="flex-1">Add</Button>
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
                    {item.products?.name ?? item.product_name ?? "Unknown product"}
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
                      className="text-sm text-gray-500 cursor-pointer hover:text-emerald-600"
                      onClick={() => handleStartEdit(item.id, item.planned_quantity)}
                    >
                      Qty: {item.planned_quantity}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isShared && item.added_by_email && (
                    <div className="group relative shrink-0">
                      {(() => {
                        const color = getUserColor(item.added_by_email);
                        return (
                          <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${color.bg} ${color.text} ${color.border}`}>
                            {getUserInitial(item.added_by_email)}
                          </span>
                        );
                      })()}
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {item.added_by_email}
                      </span>
                    </div>
                  )}
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(item.id)}>
                    Remove
                  </Button>
                </div>
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
        message={`Remove "${deleteItem?.products?.name ?? deleteItem?.product_name ?? "this item"}" from the list?`}
        confirmLabel="Remove"
        loading={isPending}
      />
    </div>
  );
}
