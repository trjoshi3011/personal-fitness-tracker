"use client";

import * as React from "react";

import { normalizeUserTimezone } from "@/lib/user-timezone";

const UserTimezoneContext = React.createContext<string>("UTC");

export function UserTimezoneProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <UserTimezoneContext.Provider value={normalizeUserTimezone(value)}>
      {children}
    </UserTimezoneContext.Provider>
  );
}

export function useUserTimezone(): string {
  return React.useContext(UserTimezoneContext);
}
