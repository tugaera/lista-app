"use client";

import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import type { ShoppingCart } from "@/types/database";

interface CartItem {
  id: string;
  cart_id?: string;
  product_id: string;
  price: number;
  original_price?: number | null;
  quantity: number;
  created_at?: string;
  products: { name: string } | null;
}

interface CartDetailViewProps {
  cart: ShoppingCart;
  items: CartItem[];
}

export function CartDetailView({ cart, items }: CartDetailViewProps) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={() => router.push("/history")}
        className="mb-2 text-sm text-emerald-600 hover:text-emerald-700"
      >
        &larr; Back to history
      </button>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {new Date(cart.finalized_at ?? cart.created_at).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </h1>
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No items in this cart.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const subtotal = item.price * item.quantity;
            const hasDiscount = item.original_price != null && item.original_price > item.price;
            const discountPct = hasDiscount
              ? Math.round((1 - item.price / item.original_price!) * 100)
              : 0;
            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{item.products?.name ?? "Unknown product"}</p>
                    <div className="flex items-center gap-1.5">
                      {hasDiscount ? (
                        <>
                          <span className="text-sm text-gray-400 line-through">€{item.original_price!.toFixed(2)}</span>
                          <span className="text-sm font-medium text-orange-600">€{item.price.toFixed(2)}</span>
                          <span className="rounded bg-orange-100 px-1 py-0.5 text-xs font-medium text-orange-700">−{discountPct}%</span>
                          <span className="text-sm text-gray-400">x {item.quantity}</span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">€{item.price.toFixed(2)} x {item.quantity}</span>
                      )}
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900">€{subtotal.toFixed(2)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-gray-900">Total</p>
          <p className="text-lg font-bold text-emerald-600">€{cart.total.toFixed(2)}</p>
        </div>
      </Card>
    </div>
  );
}
