"use client";

import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import type { ShoppingCart } from "@/types/database";

interface CartItem {
  id: string;
  cart_id: string;
  product_entry_id: string;
  quantity: number;
  created_at: string;
  product_entries: {
    id: string;
    price: number;
    quantity: number;
    product_id: string;
    store_id: string;
    products: { name: string } | null;
    stores: { name: string } | null;
  } | null;
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
          {new Date(cart.created_at).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </h1>
      </div>

      {cart.receipt_image_url && (
        <Card className="mb-6">
          <a
            href={cart.receipt_image_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={cart.receipt_image_url}
              alt="Receipt"
              className="max-h-64 w-full rounded-lg object-contain"
            />
            <p className="mt-2 text-center text-sm text-emerald-600">
              Click to view full receipt
            </p>
          </a>
        </Card>
      )}

      {items.length === 0 ? (
        <p className="text-center text-gray-500 py-12">
          No items in this cart.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const entry = item.product_entries;
            const price = entry?.price ?? 0;
            const subtotal = price * item.quantity;

            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {entry?.products?.name ?? "Unknown product"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {entry?.stores?.name ?? "Unknown store"} &middot; $
                      {price.toFixed(2)} x {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    ${subtotal.toFixed(2)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-gray-900">Total</p>
          <p className="text-lg font-bold text-emerald-600">
            ${cart.total.toFixed(2)}
          </p>
        </div>
      </Card>
    </div>
  );
}
