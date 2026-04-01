"use client";

import { useActionState, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createInvite } from "@/features/users/actions";
import { useUser } from "./user-provider";
import { useT } from "@/i18n/i18n-provider";
import type { Invite } from "@/types/database";

export function InviteForm() {
  const { t } = useT();
  const { isAdmin } = useUser();
  const [state, formAction, pending] = useActionState(createInvite, {
    error: "" as string,
    invite: undefined as Invite | undefined,
    emailSent: false,
  });
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const inviteLink = state.invite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/signup?code=${state.invite.code}`
    : "";

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubmit(action: "generate" | "send") {
    if (!formRef.current) return;
    // Set a hidden field to indicate which action was chosen
    const hidden = formRef.current.querySelector<HTMLInputElement>('input[name="action"]');
    if (hidden) hidden.value = action;
    formRef.current.requestSubmit();
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.createInvite")}</h2>

      <form ref={formRef} action={formAction} className="space-y-3">
        <input type="hidden" name="action" value="generate" />

        <div className="flex flex-wrap items-end gap-3">
          {isAdmin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("admin.role")}
              </label>
              <select
                name="assigned_role"
                defaultValue="user"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="user">{t("admin.user")}</option>
                <option value="moderator">{t("admin.moderator")}</option>
                <option value="admin">{t("admin.admin")}</option>
              </select>
            </div>
          )}
          <div className="w-28">
            <Input
              name="expires_in_days"
              type="number"
              label={t("admin.expiresDays")}
              defaultValue="7"
              min="1"
              max="90"
            />
          </div>
        </div>

        <div>
          <Input
            name="email"
            type="email"
            label={t("admin.emailOptional")}
            placeholder={t("admin.emailPlaceholder")}
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => handleSubmit("generate")}
            loading={pending}
            variant="secondary"
          >
            {t("admin.generateCode")}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit("send")}
            loading={pending}
          >
            {t("admin.sendInvite")}
          </Button>
        </div>
      </form>

      {state.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}

      {state.invite && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium text-emerald-700">{t("admin.inviteCode")}</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {state.invite.assigned_role}
            </span>
            {state.emailSent && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {t("admin.emailSent")}
              </span>
            )}
          </div>
          <p className="mb-3 font-mono text-lg font-bold text-emerald-800">
            {state.invite.code}
          </p>
          <p className="mb-2 text-xs text-emerald-600">{t("admin.shareLink")}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs text-gray-700"
            />
            <Button size="sm" onClick={handleCopy}>
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-emerald-600">
            {t("admin.expires")} {new Date(state.invite.expires_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </Card>
  );
}
