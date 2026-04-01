"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/features/auth/actions";
import { useT } from "@/i18n/i18n-provider";

interface AuthFormProps {
  mode: "login" | "signup";
  initialInviteCode?: string;
}

export function AuthForm({ mode, initialInviteCode }: AuthFormProps) {
  const { t } = useT();
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState(action, {
    error: "" as string,
  });

  return (
    <div className="w-full max-w-md px-4">
      <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
        </h1>

        <form action={formAction} className="space-y-4">
          <Input
            id="email"
            name="email"
            type="email"
            label={t("auth.email")}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <Input
            id="password"
            name="password"
            type="password"
            label={t("auth.password")}
            placeholder="••••••••"
            required
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
          />

          {mode === "signup" && (
            <Input
              id="invite_code"
              name="invite_code"
              type="text"
              label={t("auth.inviteCode")}
              placeholder="Enter your invite code"
              required
              defaultValue={initialInviteCode}
              autoComplete="off"
            />
          )}

          {state.error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            loading={pending}
            className="w-full"
          >
            {pending
              ? mode === "login"
                ? t("auth.signingIn")
                : t("auth.signingUp")
              : mode === "login"
                ? t("auth.signIn")
                : t("auth.signUp")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {mode === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <Link
                href="/auth/signup"
                className="font-medium text-emerald-600 hover:text-emerald-700"
              >
                {t("auth.signUp")}
              </Link>
            </>
          ) : (
            <>
              {t("auth.haveAccount")}{" "}
              <Link
                href="/auth/login"
                className="font-medium text-emerald-600 hover:text-emerald-700"
              >
                {t("auth.signIn")}
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
