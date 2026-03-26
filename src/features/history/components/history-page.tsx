"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import type { ShoppingCart } from "@/types/database";

interface CartWithCount extends ShoppingCart {
  item_count: number;
}

interface HistoryPageProps {
  carts: CartWithCount[];
}

export function HistoryPage({ carts }: HistoryPageProps) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Shopping History
      </h1>

      {carts.length === 0 ? (
        <p className="text-center text-gray-500 py-12">
          No shopping history yet.
        </p>
      ) : (
        <div className="space-y-3">
          {carts.map((cart) => (
            <Card
              key={cart.id}
              className="cursor-pointer transition hover:shadow-md"
            >
              <div
                className="flex items-center justify-between"
                onClick={() => router.push(`/history/${cart.id}`)}
              >
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {new Date(cart.created_at).toLocaleDateString(undefined, {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {cart.item_count}{" "}
                    {cart.item_count === 1 ? "item" : "items"}
                  </p>
                </div>
                <p className="text-lg font-bold text-emerald-600">
                  ${cart.total.toFixed(2)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
