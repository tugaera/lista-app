"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/useDebounce";
import { BarcodeScanner } from "@/features/shopping/components/barcode-scanner";
import { lookupBarcode } from "@/lib/barcode-lookup";
import {
  searchProducts,
  createProduct,
  getProductWithHistory,
  type ProductWithLatestPrice,
  type ProductWithHistory,
} from "@/features/products/actions";
import type { Category } from "@/types/database";

interface ProductsPageProps {
  categories: Category[];
}

export function ProductsPage({ categories }: ProductsPageProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [products, setProducts] = useState<ProductWithLatestPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductWithHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addScanning, setAddScanning] = useState(false);
  const [addLookupStatus, setAddLookupStatus] = useState<string | null>(null);

  // Add product form state
  const [newName, setNewName] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  const doSearch = useCallback(async (searchQuery: string) => {
    setLoading(true);
    const { data } = await searchProducts(searchQuery);
    setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      doSearch(debouncedQuery);
    } else if (debouncedQuery.length === 0) {
      doSearch("");
    }
  }, [debouncedQuery, doSearch]);

  async function handleProductClick(productId: string) {
    setDetailLoading(true);
    setDetailOpen(true);
    const { data } = await getProductWithHistory(productId);
    setSelectedProduct(data);
    setDetailLoading(false);
  }

  async function handleAddProduct() {
    if (!newName.trim()) {
      setAddError("Product name is required");
      return;
    }

    setAddLoading(true);
    setAddError(null);

    const { error } = await createProduct({
      name: newName.trim(),
      barcode: newBarcode.trim() || undefined,
      categoryId: newCategoryId || undefined,
    });

    if (error) {
      setAddError(error);
      setAddLoading(false);
      return;
    }

    setAddOpen(false);
    setNewName("");
    setNewBarcode("");
    setNewCategoryId("");
    setAddLookupStatus(null);
    setAddLoading(false);

    // Refresh search results
    if (debouncedQuery.length >= 2 || debouncedQuery.length === 0) {
      doSearch(debouncedQuery);
    }
  }

  async function handleBarcodeScan(barcode: string) {
    setAddScanning(false);
    setNewBarcode(barcode);
    setAddLookupStatus("Looking up barcode…");
    const result = await lookupBarcode(barcode);
    if (result.found) {
      setNewName(result.name);
      setAddLookupStatus(`Already in DB: "${result.name}"`);
    } else if (result.name) {
      setNewName(result.name);
      setAddLookupStatus(`Found on Open Food Facts: "${result.name}"`);
    } else {
      setAddLookupStatus("Product not found — enter the name below");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <Button onClick={() => setAddOpen(true)}>Add Product</Button>
      </div>

      <div className="mb-6">
        <Input
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          }
          title="No products found"
          description={
            query
              ? "Try a different search term or add a new product."
              : "Start by adding your first product."
          }
          action={
            <Button onClick={() => setAddOpen(true)}>Add Product</Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card
              key={product.id}
              className="cursor-pointer transition hover:shadow-md"
            >
              <button
                className="w-full text-left"
                onClick={() => handleProductClick(product.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900">
                      {product.name}
                    </h3>
                    {product.category_name && (
                      <p className="mt-0.5 text-sm text-gray-500">
                        {product.category_name}
                      </p>
                    )}
                  </div>
                  {product.barcode && (
                    <span className="ml-2 flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      <svg
                        className="inline-block h-3 w-3 mr-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"
                        />
                      </svg>
                      Barcode
                    </span>
                  )}
                </div>
                {product.latest_price !== null && (
                  <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                    <span className="text-lg font-semibold text-emerald-600">
                      ${product.latest_price.toFixed(2)}
                    </span>
                    {product.latest_store_name && (
                      <span className="text-xs text-gray-400">
                        at {product.latest_store_name}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* Product Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedProduct(null);
        }}
        title={selectedProduct?.name ?? "Product Details"}
      >
        {detailLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : selectedProduct ? (
          <div>
            <div className="mb-4 space-y-2">
              {selectedProduct.category_name && (
                <p className="text-sm text-gray-500">
                  Category:{" "}
                  <span className="font-medium text-gray-700">
                    {selectedProduct.category_name}
                  </span>
                </p>
              )}
              {selectedProduct.barcode && (
                <p className="text-sm text-gray-500">
                  Barcode:{" "}
                  <span className="font-mono font-medium text-gray-700">
                    {selectedProduct.barcode}
                  </span>
                </p>
              )}
            </div>

            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              Price History
            </h3>
            {selectedProduct.entries.length === 0 ? (
              <p className="text-sm text-gray-400">No price entries yet.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {selectedProduct.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        ${entry.price.toFixed(2)}
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        x{entry.quantity}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {entry.store_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Add Product Modal */}
      {addScanning && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setAddScanning(false)}
        />
      )}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddError(null);
          setAddLookupStatus(null);
        }}
        title="Add Product"
      >
        <div className="space-y-4">
          {/* Barcode first so scanning auto-fills name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Barcode{" "}
              <span className="font-normal text-gray-400">(scan to auto-fill name)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Optional"
                className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-2 font-mono text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => setAddScanning(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 9V5a2 2 0 012-2h2M3 15v4a2 2 0 002 2h2M15 3h4a2 2 0 012 2v4M15 21h4a2 2 0 002-2v-4" />
                  <line x1="7" y1="8" x2="7" y2="16" />
                  <line x1="10" y1="8" x2="10" y2="16" />
                  <line x1="13" y1="8" x2="13" y2="16" />
                  <line x1="16" y1="8" x2="16" y2="16" />
                </svg>
                Scan
              </button>
            </div>
            {addLookupStatus && (
              <p className={`text-xs ${addLookupStatus.startsWith("Already") ? "text-amber-600" : "text-emerald-600"}`}>
                {addLookupStatus}
              </p>
            )}
          </div>
          <Input
            label="Name"
            placeholder="Product name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            error={addError ?? undefined}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Category (optional)
            </label>
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2 text-gray-900 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                setAddError(null);
                setAddLookupStatus(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddProduct} loading={addLoading}>
              Add Product
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
