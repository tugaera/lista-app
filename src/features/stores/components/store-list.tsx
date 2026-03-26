"use client";

import { useCallback, useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Store } from "@/features/stores/actions";
import {
  createStore,
  updateStoreName,
  toggleStoreActive,
} from "@/features/stores/actions";

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Create Store Form ─────────────────────────────────────────────────────

function CreateStoreForm() {
  const [state, action, isPending] = useActionState(createStore, { error: "" });
  const [name, setName] = useState("");

  return (
    <form
      action={async (fd) => {
        await action(fd);
        if (!state.error) setName("");
      }}
      className="flex gap-2"
    >
      <input
        name="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Store name"
        required
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
        Add
      </button>
    </form>
  );
}

// ── Store Row ─────────────────────────────────────────────────────────────

function StoreRow({ store }: { store: Store }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(store.name);
  const [editError, setEditError] = useState("");
  const [isSaving, startSave] = useTransition();
  const [isToggling, startToggle] = useTransition();
  const [confirmToggle, setConfirmToggle] = useState(false);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateStoreName(store.id, editName);
      if (result.error) {
        setEditError(result.error);
      } else {
        setEditing(false);
        setEditError("");
      }
    });
  }, [store.id, editName]);

  const handleToggle = useCallback(() => {
    setConfirmToggle(false);
    startToggle(async () => {
      await toggleStoreActive(store.id, !store.is_active);
    });
  }, [store.id, store.is_active]);

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          store.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
        }`}
      >
        {/* Status dot */}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${store.is_active ? "bg-emerald-400" : "bg-gray-300"}`}
        />

        {/* Name (view or edit) */}
        {editing ? (
          <div className="flex flex-1 flex-col gap-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditing(false); setEditName(store.name); setEditError(""); }
              }}
              autoFocus
              className="flex-1 rounded border border-emerald-400 px-2 py-1 text-sm focus:outline-none"
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
          </div>
        ) : (
          <span className={`flex-1 text-sm ${store.is_active ? "text-gray-900" : "text-gray-400"}`}>
            {store.name}
          </span>
        )}

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              >
                {isSaving ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditName(store.name); setEditError(""); }}
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Edit */}
              <button
                type="button"
                onClick={() => setEditing(true)}
                title="Edit name"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>

              {/* Toggle active */}
              <button
                type="button"
                onClick={() => setConfirmToggle(true)}
                disabled={isToggling}
                title={store.is_active ? "Disable store" : "Enable store"}
                className={`rounded p-1.5 disabled:opacity-50 ${
                  store.is_active
                    ? "text-gray-400 hover:bg-red-50 hover:text-red-500"
                    : "text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                }`}
              >
                {isToggling ? (
                  <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                ) : store.is_active ? (
                  /* Disable icon */
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ) : (
                  /* Enable icon */
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={handleToggle}
        title={store.is_active ? "Disable store?" : "Enable store?"}
        message={
          store.is_active
            ? `"${store.name}" will be hidden from the store selection when adding products.`
            : `"${store.name}" will be available again in the store selection.`
        }
        confirmLabel={store.is_active ? "Disable" : "Enable"}
      />
    </>
  );
}

// ── Store List ────────────────────────────────────────────────────────────

interface StoreListProps {
  initialStores: Store[];
}

export function StoreList({ initialStores }: StoreListProps) {
  const active = initialStores.filter((s) => s.is_active);
  const inactive = initialStores.filter((s) => !s.is_active);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Stores</h2>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Add store</p>
        <CreateStoreForm />
      </div>

      {initialStores.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No stores yet.</p>
      ) : (
        <div className="space-y-1.5">
          {active.map((store) => (
            <StoreRow key={store.id} store={store} />
          ))}
          {inactive.length > 0 && (
            <>
              {active.length > 0 && <div className="my-2 border-t border-gray-100" />}
              <p className="mb-1 text-xs font-medium text-gray-400">Disabled</p>
              {inactive.map((store) => (
                <StoreRow key={store.id} store={store} />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
