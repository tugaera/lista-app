"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createInvite } from "@/features/users/actions";
import { useUser } from "./user-provider";
import type { Invite } from "@/types/database";

export function InviteForm() {
  const { isAdmin } = useUser();
  const [state, formAction, pending] = useActionState(createInvite, {
    error: "" as string,
    invite: undefined as Invite | undefined,
  });
  const [copied, setCopied] = useState(false);

  const inviteLink = state.invite
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/signup?code=${state.invite.code}`
    : "";

  function handleCopy() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Invite</h2>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Role
            </label>
            <select
              name="assigned_role"
              defaultValue="user"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}
        <div className="w-28">
          <Input
            name="expires_in_days"
            type="number"
            label="Expires (days)"
            defaultValue="7"
            min="1"
            max="90"
          />
        </div>
        <Button type="submit" loading={pending}>
          Generate
        </Button>
      </form>

      {state.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}

      {state.invite && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-medium text-emerald-700">Invite Code</p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {state.invite.assigned_role}
            </span>
          </div>
          <p className="mb-3 font-mono text-lg font-bold text-emerald-800">
            {state.invite.code}
          </p>
          <p className="mb-2 text-xs text-emerald-600">Share this link:</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs text-gray-700"
            />
            <Button size="sm" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-emerald-600">
            Expires: {new Date(state.invite.expires_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </Card>
  );
}
