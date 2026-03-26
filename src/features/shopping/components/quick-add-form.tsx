"use client";

import { useRef, useState, useTransition } from "react";
import { addCartItem } from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ProductSearch, type ProductResult } from "./product-search";

type QuickAddFormProps = {
  cartId: string;
  stores: { id: string; name: string }[];
  onItemAdded: (item: CartItemDisplay) => void;
};

export function QuickAddForm({
  cartId,
  stores,
  onItemAdded,
}: QuickAddFormProps) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [barcode, setBarcode] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    if (product.lastPrice != null) {
      setPrice(product.lastPrice.toFixed(2));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantity, 10);

    if (!productName.trim()) {
      setError("Product name is required");
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a valid price");
      return;
    }
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (!storeId) {
      setError("Select a store");
      return;
    }

    startTransition(async () => {
      try {
        const item = await addCartItem(cartId, {
          productName: productName.trim(),
          price: parsedPrice,
          quantity: parsedQuantity,
          storeId,
          barcode,
        });
        onItemAdded(item);
        setProductName("");
        setPrice("");
        setQuantity("1");
        setBarcode(undefined);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to add item",
        );
      }
    });
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white pb-safe">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="mx-auto max-w-lg px-4 py-3"
      >
        {error && (
          <p className="mb-2 text-xs text-red-600">{error}</p>
        )}
        <div className="mb-2">
          <ProductSearch
            onSelect={handleProductSelect}
            placeholder="Product name"
          />
        </div>
        {/* Hidden input to track selected product name (in case user types manually) */}
        <input
          type="hidden"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
        {/* Override product name if user types directly instead of selecting */}
        <div className="mb-2">
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Or type product name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty"
            className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
