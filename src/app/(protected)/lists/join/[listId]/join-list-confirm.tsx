"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinListByUrl } from "@/features/lists/actions-shares";

interface JoinListConfirmProps {
  listId: string;
  listName: string;
  ownerEmail: string;
}

export function JoinListConfirm({ listId, listName, ownerEmail }: JoinListConfirmProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinListByUrl(listId);
      if (result.error) {
        setError("Could not join this list. It may no longer be available.");
        return;
      }
      router.push(`/lists/${listId}`);
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>

        <h1 className="mb-1 text-center text-xl font-bold text-gray-900">Join shared list?</h1>
        <p className="mb-1 text-center text-sm text-gray-600">
          <span className="font-medium text-blue-700">{ownerEmail}</span> is sharing their list with you.
        </p>
        <p className="mb-4 text-center text-xs font-medium text-gray-500">&ldquo;{listName}&rdquo;</p>

        <div className="my-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You will be able to view this list and its items.
        </div>

        {error && (
          <p className="mb-3 text-center text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/lists")}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Joining…" : "Join List"}
          </button>
        </div>
      </div>
    </div>
  );
}
