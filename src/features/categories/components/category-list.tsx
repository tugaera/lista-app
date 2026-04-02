"use client";

import { useCallback, useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/i18n/i18n-provider";
import { useUser } from "@/features/users/components/user-provider";
import type { Category } from "@/types/database";
import {
  createCategory,
  updateCategoryName,
  toggleCategoryActive,
  deleteCategory,
  checkCategoryDependencies,
  type CategoryDependencies,
} from "@/features/categories/actions";

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Create Category Form ─────────────────────────────────────────────────

function CreateCategoryForm({ parentCategories }: { parentCategories: Category[] }) {
  const { t } = useT();
  const [state, action, isPending] = useActionState(createCategory, { error: "" });
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  return (
    <form
      action={async (fd) => {
        await action(fd);
        if (!state.error) { setName(""); setParentId(""); }
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("admin.categoryName")}
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
      </div>
      <select
        name="parent_id"
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 focus:border-emerald-500 focus:outline-none"
      >
        <option value="">{t("admin.noParent")}</option>
        {parentCategories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  );
}

// ── Category Row ─────────────────────────────────────────────────────────

function CategoryRow({
  category,
  isExpanded,
  onToggleExpand,
  subcategories,
  isSubcategory = false,
}: {
  category: Category;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  subcategories?: Category[];
  isSubcategory?: boolean;
}) {
  const { t } = useT();
  const { isAdmin } = useUser();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editError, setEditError] = useState("");
  const [isSaving, startSave] = useTransition();
  const [isToggling, startToggle] = useTransition();
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deps, setDeps] = useState<CategoryDependencies | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateCategoryName(category.id, editName);
      if (result.error) {
        setEditError(result.error);
      } else {
        setEditing(false);
        setEditError("");
      }
    });
  }, [category.id, editName]);

  const handleToggle = useCallback(() => {
    setConfirmToggle(false);
    startToggle(async () => {
      await toggleCategoryActive(category.id, !category.is_active);
    });
  }, [category.id, category.is_active]);

  const handleOpenDelete = useCallback(async () => {
    setConfirmDelete(true);
    setDeleteError("");
    setCheckingDeps(true);
    const result = await checkCategoryDependencies(category.id);
    setDeps(result.deps);
    setCheckingDeps(false);
  }, [category.id]);

  const handleDelete = useCallback(() => {
    startDelete(async () => {
      const result = await deleteCategory(category.id);
      if (result.error) {
        setDeleteError(result.error);
      } else {
        setConfirmDelete(false);
      }
    });
  }, [category.id]);

  const hasSubcats = subcategories && subcategories.length > 0;

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          isSubcategory ? "ml-6 border-gray-100 bg-gray-50/50" : ""
        } ${
          category.is_active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50"
        }`}
      >
        {/* Expand chevron (parent only) */}
        {!isSubcategory && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Status dot */}
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${category.is_active ? "bg-emerald-400" : "bg-gray-300"}`}
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
                if (e.key === "Escape") { setEditing(false); setEditName(category.name); setEditError(""); }
              }}
              autoFocus
              className="flex-1 rounded border border-emerald-400 px-2 py-1 text-sm focus:outline-none"
            />
            {editError && <p className="text-xs text-red-500">{editError}</p>}
          </div>
        ) : (
          <span className={`flex-1 text-sm ${category.is_active ? "text-gray-900" : "text-gray-400"}`}>
            {category.name}
            {hasSubcats && (
              <span className="ml-1.5 text-xs text-gray-400">
                ({subcategories!.length})
              </span>
            )}
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
                {isSaving ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditName(category.name); setEditError(""); }}
                className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              {/* Edit */}
              <button
                type="button"
                onClick={() => setEditing(true)}
                title={t("common.edit")}
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
                title={category.is_active ? t("common.disable") : t("common.enable")}
                className={`rounded p-1.5 disabled:opacity-50 ${
                  category.is_active
                    ? "text-gray-400 hover:bg-red-50 hover:text-red-500"
                    : "text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                }`}
              >
                {isToggling ? (
                  <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                ) : category.is_active ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </button>

              {/* Delete (admin only) */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleOpenDelete}
                  title={t("admin.deleteCategory")}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toggle confirm */}
      <ConfirmDialog
        open={confirmToggle}
        onClose={() => setConfirmToggle(false)}
        onConfirm={handleToggle}
        title={category.is_active ? t("admin.disableCategory") : t("admin.enableCategory")}
        message={
          category.is_active
            ? t("admin.disableCategoryMsg")
            : t("admin.enableCategoryMsg")
        }
        confirmLabel={category.is_active ? t("common.disable") : t("common.enable")}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => { setConfirmDelete(false); setDeleteError(""); }}
        onConfirm={handleDelete}
        title={t("admin.deleteCategory")}
        message={
          checkingDeps
            ? t("common.loading")
            : deps && (deps.productCount > 0 || deps.subcategoryCount > 0)
            ? deps.subcategoryCount > 0
              ? t("admin.categoryHasSubcategories")
              : t("admin.categoryHasProducts")
            : t("admin.deleteCategoryConfirm")
        }
        confirmLabel={t("common.delete")}
        loading={isDeleting || checkingDeps || (deps !== null && (deps.productCount > 0 || deps.subcategoryCount > 0))}
      />
      {deleteError && (
        <p className="ml-6 text-xs text-red-500">{deleteError}</p>
      )}

      {/* Expanded subcategories */}
      {isExpanded && subcategories && subcategories.length > 0 && (
        <div className="space-y-1.5">
          {subcategories.map((sub) => (
            <CategoryRow key={sub.id} category={sub} isSubcategory />
          ))}
        </div>
      )}
    </>
  );
}

// ── Category List ────────────────────────────────────────────────────────

interface CategoryListProps {
  initialCategories: Category[];
}

export function CategoryList({ initialCategories }: CategoryListProps) {
  const { t } = useT();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group by parent
  const parentCategories = initialCategories.filter((c) => c.parent_id === null);
  const childrenMap = new Map<string, Category[]>();
  for (const cat of initialCategories) {
    if (cat.parent_id) {
      const existing = childrenMap.get(cat.parent_id) ?? [];
      existing.push(cat);
      childrenMap.set(cat.parent_id, existing);
    }
  }

  const activeParents = parentCategories.filter((c) => c.is_active);
  const inactiveParents = parentCategories.filter((c) => !c.is_active);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.categories")}</h2>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">{t("admin.addCategory")}</p>
        <CreateCategoryForm parentCategories={parentCategories} />
      </div>

      {parentCategories.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">{t("admin.noCategories")}</p>
      ) : (
        <div className="space-y-1.5">
          {activeParents.map((cat) => (
            <CategoryRow
              key={cat.id}
              category={cat}
              isExpanded={expandedId === cat.id}
              onToggleExpand={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
              subcategories={childrenMap.get(cat.id)}
            />
          ))}
          {inactiveParents.length > 0 && (
            <>
              {activeParents.length > 0 && <div className="my-2 border-t border-gray-100" />}
              <p className="mb-1 text-xs font-medium text-gray-400">{t("admin.disabled")}</p>
              {inactiveParents.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  isExpanded={expandedId === cat.id}
                  onToggleExpand={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
                  subcategories={childrenMap.get(cat.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
