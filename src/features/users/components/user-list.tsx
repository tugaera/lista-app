"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { useUser } from "./user-provider";
import { updateUserRole, type UserWithInviter } from "@/features/users/actions";
import type { UserRole } from "@/types/database";

export function UserList({ users: initialUsers }: { users: UserWithInviter[] }) {
  const { isAdmin, profile: currentUser } = useUser();
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);

  function handleRoleChange(userId: string, newRole: UserRole) {
    setFeedback(null);

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    startTransition(async () => {
      const formData = new FormData();
      formData.set("user_id", userId);
      formData.set("role", newRole);

      const result = await updateUserRole({ error: "", success: false }, formData);

      if (result.error) {
        // Revert
        setUsers(initialUsers);
        setFeedback({ id: userId, message: result.error });
      } else {
        setFeedback({ id: userId, message: "Role updated" });
        setTimeout(() => setFeedback(null), 2000);
      }
    });
  }

  const roleColors: Record<UserRole, string> = {
    admin: "text-purple-700 bg-purple-50",
    moderator: "text-blue-700 bg-blue-50",
    user: "text-gray-600 bg-gray-100",
  };

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Users</h2>
      {users.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No users found.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between py-3 ${isPending ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {user.email}
                  {user.id === currentUser.id && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  Joined {new Date(user.created_at).toLocaleDateString()}
                  {user.inviter_email && (
                    <> &middot; Invited by <span className="font-medium">{user.inviter_email}</span></>
                  )}
                </p>
                {feedback?.id === user.id && (
                  <p className={`text-xs ${feedback.message === "Role updated" ? "text-emerald-600" : "text-red-600"}`}>
                    {feedback.message}
                  </p>
                )}
              </div>

              {isAdmin && user.id !== currentUser.id ? (
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                  disabled={isPending}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[user.role]}`}
                >
                  {user.role}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
