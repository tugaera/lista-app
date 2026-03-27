"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/types/database";

interface UserContextValue {
  profile: Profile;
  isAdmin: boolean;
  isModerator: boolean;
  isAdminOrModerator: boolean;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: ReactNode;
}) {
  const value: UserContextValue = {
    profile,
    isAdmin: profile.role === "admin",
    isModerator: profile.role === "moderator",
    isAdminOrModerator: profile.role === "admin" || profile.role === "moderator",
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return ctx;
}
