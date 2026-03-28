"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinCartByUrl } from "@/features/shopping/actions-shares";

interface JoinCartConfirmProps {
  cartId: string;
}

export function JoinCartConfirm({ cartId }: JoinCartConfirmProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinCartByUrl(cartId);
      if (result.error) {
        if (result.error === "own_cart") {
          router.push(`/shopping?cart=${cartId}`);
          return;
        }
        setError(result.error);
        return;
      }
      setJoined(true);
      router.push(`/shopping?cart=${cartId}`);
    });
  }

  if (joined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-gray-600">Joining cart…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>

        <h1 className="mb-1 text-center text-xl font-bold text-gray-900">Join shared cart?</h1>
        <p className="mb-4 text-center text-sm text-gray-600">
          Someone is sharing their shopping cart with you.
        </p>

        <div className="my-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You will be added as a member of this cart and can view and edit its items in real time.
        </div>

        {error && (
          <p className="mb-3 text-center text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/shopping")}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending}
            className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {isPending ? "Joining…" : "Join Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
