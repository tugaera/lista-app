"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ImportReceiptModal } from "./import-receipt-modal";
import type { CartHistoryEntry } from "@/features/history/actions";
import type { Store } from "@/features/stores/actions";

interface HistoryPageProps {
  carts: CartHistoryEntry[];
  stores: Store[];
}

export function HistoryPage({ carts, stores }: HistoryPageProps) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shopping History</h1>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Import Receipt
        </button>
      </div>

      {carts.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No shopping history yet.</p>
      ) : (
        <div className="space-y-3">
          {carts.map((cart) => (
            <Card key={cart.id} className="cursor-pointer transition hover:shadow-md">
              <div
                className="flex items-center justify-between"
                onClick={() => router.push(`/history/${cart.id}`)}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-gray-900">
                      {new Date(cart.finalized_at ?? cart.created_at).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </h2>
                    {cart.store_name && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {cart.store_name}
                      </span>
                    )}
                    {cart.is_shared && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        Shared
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {cart.item_count} {cart.item_count === 1 ? "item" : "items"}
                    {cart.is_shared && cart.owner_email && (
                      <span className="ml-1 text-purple-600">
                        &middot; by {cart.owner_email}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-lg font-bold text-emerald-600">
                  &euro;{cart.total.toFixed(2)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showImport && <ImportReceiptModal stores={stores} onClose={() => setShowImport(false)} />}
    </div>
  );
}
