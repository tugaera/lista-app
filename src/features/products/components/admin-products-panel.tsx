"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getAdminProducts,
  adminUpdateProduct,
  adminToggleProductActive,
  createProduct,
  type ProductWithLatestPrice,
} from "@/features/products/actions";
import { BarcodeScanner } from "@/features/shopping/components/barcode-scanner";
import { lookupBarcode } from "@/lib/barcode-lookup";
import type { Category } from "@/types/database";

interface AdminProductsPanelProps {
  categories: Category[];
}

type EditState = {
  id: string;
  name: string;
  barcode: string;
  categoryId: string;
};

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      {active ? "Active" : "Disabled"}
    </span>
  );
}

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 9V5a2 2 0 012-2h2M3 15v4a2 2 0 002 2h2M15 3h4a2 2 0 012 2v4M15 21h4a2 2 0 002-2v-4" />
      <line x1="7" y1="8" x2="7" y2="16" />
      <line x1="10" y1="8" x2="10" y2="16" />
      <line x1="13" y1="8" x2="13" y2="16" />
      <line x1="16" y1="8" x2="16" y2="16" />
    </svg>
  );
}

export function AdminProductsPanel({ categories }: AdminProductsPanelProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [products, setProducts] = useState<ProductWithLatestPrice[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editScanning, setEditScanning] = useState(false);

  // Add
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addBarcode, setAddBarcode] = useState("");
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addScanning, setAddScanning] = useState(false);
  const [addLookupStatus, setAddLookupStatus] = useState<string | null>(null);

  // Toggle loading state per product
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const loadProducts = useCallback(async (q: string) => {
    setLoading(true);
    const { data } = await getAdminProducts(q);
    setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts(debouncedQuery);
  }, [debouncedQuery, loadProducts]);

  async function handleToggle(product: ProductWithLatestPrice) {
    setToggling((s) => new Set(s).add(product.id));
    await adminToggleProductActive(product.id, !product.is_active);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p)),
    );
    setToggling((s) => {
      const next = new Set(s);
      next.delete(product.id);
      return next;
    });
  }

  function openEdit(product: ProductWithLatestPrice) {
    setEdit({
      id: product.id,
      name: product.name,
      barcode: product.barcode ?? "",
      categoryId: product.category_id ?? "",
    });
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!edit) return;
    setEditLoading(true);
    setEditError(null);
    const result = await adminUpdateProduct(edit.id, {
      name: edit.name,
      barcode: edit.barcode,
      categoryId: edit.categoryId,
    });
    if (result.error) {
      setEditError(result.error);
      setEditLoading(false);
      return;
    }
    setProducts((prev) =>
      prev.map((p) =>
        p.id === edit.id
          ? {
              ...p,
              name: edit.name,
              barcode: edit.barcode || null,
              category_id: edit.categoryId || null,
              category_name:
                categories.find((c) => c.id === edit.categoryId)?.name ?? null,
            }
          : p,
      ),
    );
    setEdit(null);
    setEditLoading(false);
  }

  async function handleAdd() {
    if (!addName.trim()) {
      setAddError("Name is required");
      return;
    }
    setAddLoading(true);
    setAddError(null);
    const { error } = await createProduct({
      name: addName.trim(),
      barcode: addBarcode.trim() || undefined,
      categoryId: addCategoryId || undefined,
    });
    if (error) {
      setAddError(error);
      setAddLoading(false);
      return;
    }
    setAddLoading(false);
    setShowAdd(false);
    setAddName("");
    setAddBarcode("");
    setAddCategoryId("");
    setAddLookupStatus(null);
    loadProducts(debouncedQuery);
  }

  // ── Barcode scan handlers ─────────────────────────────────────────────────

  async function handleAddBarcodeScan(barcode: string) {
    setAddScanning(false);
    setAddBarcode(barcode);
    setAddLookupStatus("Looking up barcode…");

    const result = await lookupBarcode(barcode);
    if (result.found) {
      setAddName(result.name);
      setAddLookupStatus(`Already in DB: "${result.name}"`);
    } else if (result.name) {
      setAddName(result.name);
      setAddLookupStatus(`Found on Open Food Facts: "${result.name}"`);
    } else {
      setAddLookupStatus("Product not found — enter the name below");
    }
  }

  async function handleEditBarcodeScan(barcode: string) {
    if (!edit) return;
    setEditScanning(false);
    setEdit({ ...edit, barcode });

    const result = await lookupBarcode(barcode);
    if (result.found && !edit.name) {
      setEdit((prev) => prev ? { ...prev, barcode, name: result.name } : prev);
    } else if (!result.found && result.name && !edit.name) {
      setEdit((prev) => prev ? { ...prev, barcode, name: result.name } : prev);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{products.length} products</p>
      </div>

      {/* Search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products…"
        className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />

      {/* List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No products found.</p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {products.map((product) => (
            <div key={product.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${product.is_active ? "text-gray-900" : "text-gray-400"}`}>
                    {product.name}
                  </span>
                  <Badge active={product.is_active} />
                  {product.barcode && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                      {product.barcode}
                    </span>
                  )}
                </div>
                {product.category_name && (
                  <p className="mt-0.5 text-xs text-gray-400">{product.category_name}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(product)}
                  disabled={toggling.has(product.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    product.is_active
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {product.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      {edit && (
        <>
          {editScanning && (
            <BarcodeScanner
              onScan={handleEditBarcodeScan}
              onClose={() => setEditScanning(false)}
            />
          )}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEdit(null); }}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Edit Product</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Barcode</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={edit.barcode}
                      onChange={(e) => setEdit({ ...edit, barcode: e.target.value })}
                      placeholder="Optional"
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditScanning(true)}
                      title="Scan barcode"
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      <BarcodeIcon />
                      Scan
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={edit.categoryId}
                    onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {editError && <p className="text-sm text-red-600">{editError}</p>}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {editLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Add Modal ──────────────────────────────────────────────────────── */}
      {showAdd && (
        <>
          {addScanning && (
            <BarcodeScanner
              onScan={handleAddBarcodeScan}
              onClose={() => setAddScanning(false)}
            />
          )}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}
          >
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Add Product</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Barcode
                    <span className="ml-1 font-normal text-gray-400">(scan first to auto-fill)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={addBarcode}
                      onChange={(e) => setAddBarcode(e.target.value)}
                      placeholder="Optional"
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAddScanning(true)}
                      title="Scan barcode"
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      <BarcodeIcon />
                      Scan
                    </button>
                  </div>
                  {addLookupStatus && (
                    <p className={`mt-1 text-xs ${addLookupStatus.startsWith("Already") ? "text-amber-600" : "text-emerald-600"}`}>
                      {addLookupStatus}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={addCategoryId}
                    onChange={(e) => setAddCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {addError && <p className="text-sm text-red-600">{addError}</p>}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={addLoading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {addLoading ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
