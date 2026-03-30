"use client";

import { useMemo, useState } from "react";
import type { CartItemDisplay } from "@/features/shopping/actions";

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
  onClose: () => void;
}

function normalise(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function isMatched(item: TrackingItem, cartItems: CartItemDisplay[]): boolean {
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

export function ListTrackingPanel({
  listName,
  items,
  cartItems,
  onClose,
}: ListTrackingPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Manually checked items (toggled by user, in addition to auto-matched)
  const [manuallyChecked, setManuallyChecked] = useState<Set<string>>(new Set());

  const { matched, unmatched } = useMemo(() => {
    const matched: TrackingItem[] = [];
    const unmatched: TrackingItem[] = [];
    for (const item of items) {
      if (isMatched(item, cartItems) || manuallyChecked.has(item.id)) {
        matched.push(item);
      } else {
        unmatched.push(item);
      }
    }
    return { matched, unmatched };
  }, [items, cartItems, manuallyChecked]);

  function toggleManualCheck(itemId: string) {
    setManuallyChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

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
          aria-label="Close tracking"
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
                onClick={() => toggleManualCheck(item.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                aria-label={`Mark ${item.name} as done`}
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
            const autoMatched = isMatched(item, cartItems);
            const isManual = manuallyChecked.has(item.id);
            return (
              <li key={item.id} className="flex items-center gap-2 py-1 opacity-50">
                <button
                  type="button"
                  onClick={() => !autoMatched ? toggleManualCheck(item.id) : undefined}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    autoMatched
                      ? "bg-emerald-500 cursor-default"
                      : "bg-emerald-400 hover:bg-emerald-300 cursor-pointer"
                  }`}
                  aria-label={isManual ? `Unmark ${item.name}` : `${item.name} done`}
                  disabled={autoMatched}
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
