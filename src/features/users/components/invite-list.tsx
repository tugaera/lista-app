"use client";

import { Card } from "@/components/ui/card";
import type { Invite } from "@/types/database";

function getStatus(invite: Invite): { label: string; color: string } {
  if (invite.used_by) {
    return { label: "Used", color: "text-gray-500 bg-gray-100" };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { label: "Expired", color: "text-red-600 bg-red-50" };
  }
  return { label: "Available", color: "text-emerald-600 bg-emerald-50" };
}

export function InviteList({ invites }: { invites: Invite[] }) {
  if (invites.length === 0) {
    return (
      <Card>
        <p className="text-center text-sm text-gray-500 py-4">
          No invites created yet.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">My Invites</h2>
      <div className="divide-y divide-gray-100">
        {invites.map((invite) => {
          const status = getStatus(invite);
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
                  Created {new Date(invite.created_at).toLocaleDateString()}
                  {invite.used_at && (
                    <> &middot; Used {new Date(invite.used_at).toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
              >
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
