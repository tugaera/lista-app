"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  removeCartItem,
  updateCartItemQuantity,
} from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type PriceEntry = {
  store: string;
  price: number;
  date: string;
};

type CartItemListProps = {
  items: CartItemDisplay[];
  cartId: string;
  onItemRemoved: (itemId: string) => void;
  onItemUpdated: (itemId: string, newQuantity: number) => void;
};

export function CartItemList({ items, cartId, onItemRemoved, onItemUpdated }: CartItemListProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const deleteItem = items.find((i) => i.id === deleteConfirm);

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm;
    onItemRemoved(itemId);
    setDeleteConfirm(null);
    startDeleteTransition(async () => {
      await removeCartItem(cartId, itemId);
    });
  }

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3 h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Cart is empty</p>
          <p className="mt-1 text-xs text-gray-400">Add items using the form below</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                cartId={cartId}
                onDelete={() => setDeleteConfirm(item.id)}
                onItemUpdated={onItemUpdated}
              />
            ))}
          </ul>
          <div className="sticky bottom-24 border-t border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Total</span>
              <span className="text-lg font-bold text-gray-900">€{total.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Remove item"
        message={`Are you sure you want to remove "${deleteItem?.productName ?? "this item"}" from the cart?`}
        confirmLabel="Remove"
        loading={isDeleting}
      />
    </div>
  );
}

// ── Price history popover ─────────────────────────────────────────────────────

function PriceHistoryPopover({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<PriceEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createBrowserSupabaseClient();
      // Get the latest price per store (most recent entry for each store)
      const { data } = await supabase
        .from("product_entries")
        .select("price, created_at, stores(name)")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (data) {
        // Deduplicate: keep only the most recent entry per store
        const seen = new Set<string>();
        const deduped: PriceEntry[] = [];
        for (const row of data) {
          const storeName = (row.stores as unknown as { name: string } | null)?.name ?? "Unknown";
          if (!seen.has(storeName)) {
            seen.add(storeName);
            deduped.push({ store: storeName, price: row.price, date: row.created_at });
          }
        }
        // Sort by price ascending
        deduped.sort((a, b) => a.price - b.price);
        setEntries(deduped);
      } else {
        setEntries([]);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [productId]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-gray-200 bg-white" />

      <div className="px-3 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Prices by store
          </p>
          <button type="button" onClick={onClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-emerald-500" />
          </div>
        ) : entries && entries.length > 0 ? (
          <ul className="space-y-1.5">
            {entries.map((e, i) => (
              <li
                key={e.store}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                  i === 0 ? "bg-emerald-50" : "bg-gray-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${i === 0 ? "text-emerald-800" : "text-gray-700"}`}>
                    {e.store}
                    {i === 0 && (
                      <span className="ml-1 text-xs font-normal text-emerald-600">lowest</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(e.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span className={`ml-2 shrink-0 text-sm font-bold ${i === 0 ? "text-emerald-700" : "text-gray-700"}`}>
                  €{e.price.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-xs text-gray-400">No price history found.</p>
        )}
      </div>
    </div>
  );
}

// ── Cart item row ─────────────────────────────────────────────────────────────

function CartItemRow({
  item,
  cartId,
  onDelete,
  onItemUpdated,
}: {
  item: CartItemDisplay;
  cartId: string;
  onDelete: () => void;
  onItemUpdated: (itemId: string, newQuantity: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(String(item.quantity));
  const [isPending, startTransition] = useTransition();
  const [showPrices, setShowPrices] = useState(false);

  function handleQuantitySubmit() {
    const newQty = parseFloat(editQuantity);
    if (isNaN(newQty) || newQty <= 0) {
      setEditQuantity(String(item.quantity));
      setIsEditing(false);
      return;
    }
    if (newQty === item.quantity) {
      setIsEditing(false);
      return;
    }
    onItemUpdated(item.id, newQty);
    setIsEditing(false);
    startTransition(async () => {
      await updateCartItemQuantity(cartId, item.id, newQty);
    });
  }

  return (
    <li className={`relative flex items-center gap-3 px-4 py-3 ${isPending ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{item.productName}</p>
        <p className="text-xs text-gray-500">
          &euro;{item.price.toFixed(2)} each
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Price history icon — only shown when product_id is known */}
        {item.productId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPrices((v) => !v)}
              className={`rounded-md p-1 transition-colors ${
                showPrices
                  ? "bg-emerald-100 text-emerald-600"
                  : "text-gray-300 hover:bg-emerald-50 hover:text-emerald-500"
              }`}
              title="View prices across stores"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>

            {showPrices && (
              <PriceHistoryPopover
                productId={item.productId}
                productName={item.productName}
                onClose={() => setShowPrices(false)}
              />
            )}
          </div>
        )}

        {/* Quantity */}
        {isEditing ? (
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            onBlur={handleQuantitySubmit}
            onKeyDown={(e) => e.key === "Enter" && handleQuantitySubmit()}
            autoFocus
            className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md bg-gray-100 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            ×{item.quantity}
          </button>
        )}

        {/* Subtotal */}
        <span className="w-16 text-right text-sm font-semibold text-gray-900">
          €{item.subtotal.toFixed(2)}
        </span>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="ml-0.5 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${item.productName}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </li>
  );
}
