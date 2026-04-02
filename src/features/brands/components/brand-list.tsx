"use client";

import { useCallback, useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/i18n/i18n-provider";
import { useUser } from "@/features/users/components/user-provider";
import type { Brand } from "@/types/database";
import {
  createBrand,
  updateBrandName,
  toggleBrandActive,
  deleteBrand,
  checkBrandDependencies,
} from "@/features/brands/actions";

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CreateBrandForm() {
  const { t } = useT();
  const [state, action, isPending] = useActionState(createBrand, { error: "" });
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
        placeholder={t("admin.brandName")}
        required
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
        {t("common.add")}
      </button>
    </form>
  );
}

function BrandRow({ brand }: { brand: Brand }) {
  const { t } = useT();
  const { isAdmin } = useUser();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(brand.name);
  const [editError, setEditError] = useState("");
  const [isSaving, startSave] = useTransition();
  const [isToggling, startToggle] = useTransition();
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState("");
  const [productCount, setProductCount] = useState<number | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateBrandName(brand.id, editName);
      if (result.error) setEditError(result.error);
      else { setEditing(false); setEditError(""); }
    });
  }, [brand.id, editName]);

  const handleToggle = useCallback(() => {
    setConfirmToggle(false);
    startToggle(async () => {
      await toggleBrandActive(brand.id, !brand.is_active);
    });
  }, [brand.id, brand.is_active]);

  const handleOpenDelete = useCallback(async () => {
    setConfirmDelete(true);
    setDeleteError("");
    setCheckingDeps(true);
    const result = await checkBrandDependencies(brand.id);
    setProductCount(result.productCount);
    setCheckingDeps(false);
  }, [brand.id]);

  const handleDelete = useCallback(() => {
    startDelete(async () => {
      const result = await deleteBrand(brand.id);
      if (result.error) setDeleteError(result.error);
      else setConfirmDelete(false);
    });
  }, [brand.id]);

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          brand.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
        }`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${brand.is_active ? "bg-emerald-400" : "bg-gray-300"}`} />

        {editing ? (
          <div className="flex flex-1 flex-col gap-1">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditing(false); setEditName(brand.name); setEditError(""); }
              }}
              autoFocus
              className="flex-1 rounded border border-emerald-400 px-2 py-1 text-sm focus:outline-none"
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
          </div>
        ) : (
          <span className={`flex-1 text-sm ${brand.is_active ? "text-gray-900" : "text-gray-400"}`}>
            {brand.name}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={isSaving} className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                {isSaving ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : t("common.save")}
              </button>
              <button type="button" onClick={() => { setEditing(false); setEditName(brand.name); setEditError(""); }} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100">
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} title={t("common.edit")} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button type="button" onClick={() => setConfirmToggle(true)} disabled={isToggling} title={brand.is_active ? t("common.disable") : t("common.enable")} className={`rounded p-1.5 disabled:opacity-50 ${brand.is_active ? "text-gray-400 hover:bg-red-50 hover:text-red-500" : "text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"}`}>
                {isToggling ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : brand.is_active ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                )}
              </button>
              {isAdmin && (
                <button type="button" onClick={handleOpenDelete} title={t("admin.deleteBrand")} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={handleToggle}
        title={brand.is_active ? t("admin.disableBrand") : t("admin.enableBrand")}
        message={brand.is_active ? t("admin.disableBrandMsg") : t("admin.enableBrandMsg")}
        confirmLabel={brand.is_active ? t("common.disable") : t("common.enable")}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); setDeleteError(""); }}
        onConfirm={handleDelete}
        title={t("admin.deleteBrand")}
        message={
          checkingDeps ? t("common.loading") :
          productCount !== null && productCount > 0 ? t("admin.brandHasProducts") :
          t("admin.deleteBrandConfirm")
        }
        confirmLabel={t("common.delete")}
        loading={isDeleting || checkingDeps || (productCount !== null && productCount > 0)}
      />
      {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
    </>
  );
}

export function BrandList({ initialBrands }: { initialBrands: Brand[] }) {
  const { t } = useT();

  const active = initialBrands.filter((b) => b.is_active);
  const inactive = initialBrands.filter((b) => !b.is_active);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.brands")}</h2>
      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.addBrand")}</p>
        <CreateBrandForm />
      </div>

      {initialBrands.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">{t("admin.noBrands")}</p>
      ) : (
        <div className="space-y-1.5">
          {active.map((brand) => <BrandRow key={brand.id} brand={brand} />)}
          {inactive.length > 0 && (
            <>
              {active.length > 0 && <div className="my-2 border-t border-gray-100" />}
              <p className="mb-1 text-xs font-medium text-gray-400">{t("admin.disabled")}</p>
              {inactive.map((brand) => <BrandRow key={brand.id} brand={brand} />)}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
