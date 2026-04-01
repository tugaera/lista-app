"use client";

import { useState } from "react";
import { useUser } from "./user-provider";
import { useT } from "@/i18n/i18n-provider";
import { updateLanguage, changePassword } from "../actions";
import { InviteForm } from "./invite-form";
import { InviteList } from "./invite-list";
import { localeNames, type Locale } from "@/i18n";
import type { Invite } from "@/types/database";

interface ProfilePageProps {
  invites?: Invite[];
  invitedUsers?: { id: string; email: string; created_at: string }[];
}

export function ProfilePage({ invites, invitedUsers = [] }: ProfilePageProps) {
  const { profile, isAdminOrModerator } = useUser();
  const { t, locale, setLocale } = useT();

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Language change
  const [languageLoading, setLanguageLoading] = useState(false);

  async function handleLanguageChange(newLocale: Locale) {
    setLanguageLoading(true);
    setLocale(newLocale);
    await updateLanguage(newLocale);
    setLanguageLoading(false);
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError(t("profile.currentPasswordRequired"));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t("profile.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("profile.passwordMismatch"));
      return;
    }

    setPasswordLoading(true);
    const { error } = await changePassword(currentPassword, newPassword);
    if (error) {
      setPasswordError(error);
    } else {
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordLoading(false);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t("profile.title")}</h1>

      {/* Account Info */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t("profile.account")}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">{t("profile.email")}</label>
            <p className="mt-0.5 text-sm font-medium text-gray-900">{profile.email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">{t("profile.role")}</label>
            <p className="mt-0.5 text-sm font-medium text-gray-900 capitalize">{profile.role}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">{t("profile.memberSince")}</label>
            <p className="mt-0.5 text-sm font-medium text-gray-900">
              {new Date(profile.created_at).toLocaleDateString(locale, {
                year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t("profile.preferences")}
        </h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t("profile.language")}</label>
          <p className="mb-2 text-xs text-gray-500">{t("profile.languageDescription")}</p>
          <div className="flex gap-2">
            {(Object.entries(localeNames) as [Locale, string][]).map(([loc, name]) => (
              <button
                key={loc}
                type="button"
                onClick={() => handleLanguageChange(loc)}
                disabled={languageLoading}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  locale === loc
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                } disabled:opacity-50`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          {t("profile.changePassword")}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("profile.currentPassword")}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSuccess(false); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("profile.newPassword")}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("profile.confirmPassword")}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordSuccess(false); }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-emerald-600">{t("profile.passwordUpdated")}</p>}
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={passwordLoading || !currentPassword || !newPassword}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {passwordLoading ? t("profile.updatingPassword") : t("profile.updatePassword")}
          </button>
        </div>
      </section>

      {/* Invites section — admin/moderator only */}
      {isAdminOrModerator && invites && (
        <>
          <section className="mb-6">
            <InviteForm />
          </section>

          <section className="mb-6">
            <InviteList
              invites={invites}
              usedByEmails={Object.fromEntries(invitedUsers.map((u) => [u.id, u.email]))}
            />
          </section>
        </>
      )}
    </div>
  );
}
