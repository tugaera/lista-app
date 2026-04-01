"use client";

import { useMemo, useState } from "react";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { useT } from "@/i18n/i18n-provider";

export type TrackingItem = {
  id: string;
  productId: string | null;
  name: string;
  plannedQty: number;
};

interface ListTrackingPanelProps {
  listName: string;
  items: TrackingItem[];
  cartItems: CartItemDisplay[];
  manuallyChecked: Set<string>;
  pendingConfirmation?: Set<string>;
  suppressedAutoMatch?: Set<string>;
  onManualCheck: (itemId: string) => void;
  onSuppressAutoMatch?: (itemId: string) => void;
  onClose: () => void;
}

function normalise(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isMatchedByCart(item: TrackingItem, cartItems: CartItemDisplay[]): boolean {
  // 1. Product ID match (most reliable)
  if (item.productId) {
    if (cartItems.some((c) => c.productId === item.productId)) return true;
  }
  // 2. Name match: one contains the other (case-insensitive)
  const needle = normalise(item.name);
  return cartItems.some((c) => {
    const hay = normalise(c.productName);
    return hay.includes(needle) || needle.includes(hay);
  });
}

/** Find all tracking items that match a given cart item (by productId or name) */
export function findMatchingTrackingItems(
  cartItem: CartItemDisplay,
  trackingItems: TrackingItem[],
  alreadyChecked: Set<string>,
  existingCartItems: CartItemDisplay[],
): TrackingItem[] {
  return trackingItems.filter((ti) => {
    // Skip already checked or already auto-matched items
    if (alreadyChecked.has(ti.id)) return false;
    if (isMatchedByCart(ti, existingCartItems)) return false;

    // Product ID match
    if (ti.productId && cartItem.productId && ti.productId === cartItem.productId) return true;

    // Name match
    const needle = normalise(ti.name);
    const hay = normalise(cartItem.productName);
    return hay.includes(needle) || needle.includes(hay);
  });
}

export function ListTrackingPanel({
  listName,
  items,
  cartItems,
  manuallyChecked,
  pendingConfirmation,
  suppressedAutoMatch,
  onManualCheck,
  onSuppressAutoMatch,
  onClose,
}: ListTrackingPanelProps) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);

  const { matched, unmatched } = useMemo(() => {
    const matched: TrackingItem[] = [];
    const unmatched: TrackingItem[] = [];
    for (const item of items) {
      // Items pending confirmation in the modal should NOT auto-match
      const isPending = pendingConfirmation?.has(item.id);
      // Items the user explicitly chose NOT to mark
      const isSuppressed = suppressedAutoMatch?.has(item.id);

      if (manuallyChecked.has(item.id)) {
        // Manually checked always wins
        matched.push(item);
      } else if (isPending || isSuppressed) {
        // Don't auto-match these
        unmatched.push(item);
      } else if (isMatchedByCart(item, cartItems)) {
        matched.push(item);
      } else {
        unmatched.push(item);
      }
    }
    return { matched, unmatched };
  }, [items, cartItems, manuallyChecked, pendingConfirmation, suppressedAutoMatch]);

  const doneCount = matched.length;
  const totalCount = items.length;

  return (
    <div className="mx-auto w-full max-w-lg border-b border-emerald-100 bg-emerald-50">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-emerald-600 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm font-semibold text-emerald-800 truncate">{listName}</span>
          <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {doneCount}/{totalCount}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-1 shrink-0 rounded p-0.5 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700"
          aria-label={t("tracking.close")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-emerald-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(doneCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Item list */}
      {!collapsed && (
        <ul className="max-h-48 overflow-y-auto px-4 pb-2">
          {/* Unmatched first */}
          {unmatched.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => onManualCheck(item.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                aria-label={t("tracking.markDone")}
              >
                <span className="h-2 w-2 rounded-full bg-gray-300" />
              </button>
              <span className="text-sm text-gray-700">{item.name}</span>
              {item.plannedQty !== 1 && (
                <span className="ml-auto shrink-0 text-xs text-gray-400">&times;{item.plannedQty}</span>
              )}
            </li>
          ))}
          {/* Matched (done) */}
          {matched.map((item) => {
            const autoMatched = isMatchedByCart(item, cartItems) && !manuallyChecked.has(item.id);
            const isManual = manuallyChecked.has(item.id);
            return (
              <li key={item.id} className="flex items-center gap-2 py-1 opacity-50">
                <button
                  type="button"
                  onClick={() => {
                    if (isManual) {
                      onManualCheck(item.id);
                    } else if (autoMatched && onSuppressAutoMatch) {
                      onSuppressAutoMatch(item.id);
                    }
                  }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full cursor-pointer ${
                    autoMatched
                      ? "bg-emerald-500 hover:bg-emerald-400"
                      : "bg-emerald-400 hover:bg-emerald-300"
                  }`}
                  aria-label={t("tracking.unmark")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <span className="text-sm text-gray-500 line-through">{item.name}</span>
                {item.plannedQty !== 1 && (
                  <span className="ml-auto shrink-0 text-xs text-gray-400">&times;{item.plannedQty}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
