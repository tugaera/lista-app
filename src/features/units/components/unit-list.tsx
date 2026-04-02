"use client";

import { useCallback, useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/i18n/i18n-provider";
import { useUser } from "@/features/users/components/user-provider";
import type { Unit } from "@/types/database";
import {
  createUnit,
  updateUnit,
  deleteUnit,
  checkUnitDependencies,
  setDefaultUnit,
} from "@/features/units/actions";

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CreateUnitForm() {
  const { t } = useT();
  const [state, action, isPending] = useActionState(createUnit, { error: "" });
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");

  return (
    <form
      action={async (fd) => {
        await action(fd);
        if (!state.error) { setName(""); setAbbreviation(""); }
      }}
      className="flex gap-2"
    >
      <input
        name="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("admin.unitName")}
        required
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <input
        name="abbreviation"
        type="text"
        value={abbreviation}
        onChange={(e) => setAbbreviation(e.target.value)}
        placeholder={t("admin.unitAbbreviation")}
        required
        className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !name.trim() || !abbreviation.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
        {t("common.add")}
      </button>
    </form>
  );
}

function UnitRow({ unit, isDefault, onSetDefault }: { unit: Unit; isDefault: boolean; onSetDefault: () => void }) {
  const { t } = useT();
  const { isAdmin } = useUser();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(unit.name);
  const [editAbbr, setEditAbbr] = useState(unit.abbreviation);
  const [editError, setEditError] = useState("");
  const [isSaving, startSave] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState("");
  const [productCount, setProductCount] = useState<number | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateUnit(unit.id, { name: editName, abbreviation: editAbbr });
      if (result.error) setEditError(result.error);
      else { setEditing(false); setEditError(""); }
    });
  }, [unit.id, editName, editAbbr]);

  const handleOpenDelete = useCallback(async () => {
    setConfirmDelete(true);
    setDeleteError("");
    setCheckingDeps(true);
    const result = await checkUnitDependencies(unit.id);
    setProductCount(result.productCount);
    setCheckingDeps(false);
  }, [unit.id]);

  const handleDelete = useCallback(() => {
    startDelete(async () => {
      const result = await deleteUnit(unit.id);
      if (result.error) setDeleteError(result.error);
      else setConfirmDelete(false);
    });
  }, [unit.id]);

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 transition-colors">
        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditing(false); setEditName(unit.name); setEditAbbr(unit.abbreviation); setEditError(""); }
              }}
              autoFocus
              className="flex-1 rounded border border-emerald-400 px-2 py-1 text-sm focus:outline-none"
            />
            <input
              type="text"
              value={editAbbr}
              onChange={(e) => setEditAbbr(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="w-16 rounded border border-emerald-400 px-2 py-1 text-sm focus:outline-none"
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
          </div>
        ) : (
          <span className="flex-1 text-sm text-gray-900">
            {unit.name}{" "}
            <span className="font-mono text-gray-400">({unit.abbreviation})</span>
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          {!editing && (
            <button
              type="button"
              onClick={onSetDefault}
              title={t("admin.setDefaultUnit")}
              className={`rounded p-1.5 transition-colors ${isDefault ? "text-emerald-500" : "text-gray-300 hover:text-emerald-400"}`}
            >
              {isDefault ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              )}
            </button>
          )}
          {editing ? (
            <>
              <button type="button" onClick={handleSave} disabled={isSaving} className="rounded px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">
                {isSaving ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : t("common.save")}
              </button>
              <button type="button" onClick={() => { setEditing(false); setEditName(unit.name); setEditAbbr(unit.abbreviation); setEditError(""); }} className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100">
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
              {isAdmin && (
                <button type="button" onClick={handleOpenDelete} title={t("admin.deleteUnit")} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); setDeleteError(""); }}
        onConfirm={handleDelete}
        title={t("admin.deleteUnit")}
        message={
          checkingDeps ? t("common.loading") :
          productCount !== null && productCount > 0 ? t("admin.unitHasProducts") :
          t("admin.deleteUnitConfirm")
        }
        confirmLabel={t("common.delete")}
        loading={isDeleting || checkingDeps || (productCount !== null && productCount > 0)}
      />
      {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
    </>
  );
}

export function UnitList({ initialUnits }: { initialUnits: Unit[] }) {
  const { t } = useT();
  const [defaultUnitId, setDefaultUnitId] = useState<string>(
    () => initialUnits.find((u) => u.is_default)?.id ?? ""
  );
  const [, startTransition] = useTransition();

  function handleSetDefault(unitId: string) {
    setDefaultUnitId(unitId);
    startTransition(async () => {
      await setDefaultUnit(unitId);
    });
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.units")}</h2>
      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.addUnit")}</p>
        <CreateUnitForm />
      </div>

      {initialUnits.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">{t("admin.noUnits")}</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-400">{t("admin.setDefaultUnit")} <span className="text-emerald-500">★</span></p>
          <div className="space-y-1.5">
            {initialUnits.map((unit) => (
              <UnitRow
                key={unit.id}
                unit={unit}
                isDefault={defaultUnitId === unit.id}
                onSetDefault={() => handleSetDefault(unit.id)}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
