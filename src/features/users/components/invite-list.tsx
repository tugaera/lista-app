"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteInvite } from "@/features/users/actions";
import { useT } from "@/i18n/i18n-provider";
import type { TranslationKey } from "@/i18n";
import type { Invite } from "@/types/database";

function getStatus(invite: Invite, t: (key: TranslationKey) => string): { label: string; color: string } {
  if (invite.used_by) {
    return { label: t("admin.used"), color: "text-gray-500 bg-gray-100" };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { label: t("admin.expired"), color: "text-red-600 bg-red-50" };
  }
  return { label: t("admin.available"), color: "text-emerald-600 bg-emerald-50" };
}

function canDelete(invite: Invite): boolean {
  return !invite.used_by;
}

export function InviteList({ invites: initialInvites }: { invites: Invite[] }) {
  const { t } = useT();
  const [invites, setInvites] = useState(initialInvites);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!deleteConfirm) return;
    const inviteId = deleteConfirm;

    setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    setDeleteConfirm(null);

    startTransition(async () => {
      await deleteInvite(inviteId);
    });
  }

  const deleteTarget = invites.find((i) => i.id === deleteConfirm);

  if (invites.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-gray-500 py-4">
          {t("admin.noInvites")}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.myInvites")}</h2>
      <div className="divide-y divide-gray-100">
        {invites.map((invite) => {
          const status = getStatus(invite, t);
          return (
            <div key={invite.id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-gray-800">
                    {invite.code}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                    {invite.assigned_role}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {t("admin.created")} {new Date(invite.created_at).toLocaleDateString()}
                  {invite.used_at && (
                    <> &middot; {t("admin.used")} {new Date(invite.used_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
                >
                  {status.label}
                </span>
                {canDelete(invite) && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(invite.id)}
                    className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    aria-label={t("admin.deleteInvite")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title={t("admin.deleteInvite")}
        message={t("admin.deleteInviteConfirm")}
        confirmLabel={t("common.delete")}
        loading={isPending}
      />
    </Card>
  );
}
