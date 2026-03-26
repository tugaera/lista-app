"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ProductResult = {
  id: string;
  name: string;
  lastPrice: number | null;
  storeName: string | null;
};

type ProductSearchProps = {
  onSelect: (product: ProductResult) => void;
  placeholder?: string;
};

export function ProductSearch({
  onSelect,
  placeholder = "Search products...",
}: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      const supabase = createBrowserSupabaseClient();

      const { data } = await supabase
        .from("latest_product_prices")
        .select("product_id, product_name, price, store_name")
        .ilike("product_name", `%${query}%`)
        .limit(8);

      const mapped: ProductResult[] = (data ?? []).map((row) => ({
        id: row.product_id,
        name: row.product_name,
        lastPrice: row.price,
        storeName: row.store_name,
      }));

      setResults(mapped);
      setIsOpen(mapped.length > 0);
      setIsLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(product: ProductResult) {
    onSelect(product);
    setQuery(product.name);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
        </div>
      )}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((product) => (
            <button
              key={`${product.id}-${product.storeName}`}
              type="button"
              onClick={() => handleSelect(product)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="font-medium text-gray-900">
                {product.name}
              </span>
              <span className="ml-2 flex-shrink-0 text-xs text-gray-500">
                {product.lastPrice != null && (
                  <>
                    ${product.lastPrice.toFixed(2)}
                    {product.storeName && (
                      <span className="ml-1 text-gray-400">
                        @ {product.storeName}
                      </span>
                    )}
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type { ProductResult };
