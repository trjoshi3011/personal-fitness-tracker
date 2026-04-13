import type { Metadata } from "next";

import { UserTimezoneProvider } from "@/components/providers/user-timezone-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeUserTimezone } from "@/lib/user-timezone";

export const metadata: Metadata = {
  title: "Fitness Dashboard",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getCurrentUserId();
  let timeZone = "UTC";
  if (userId) {
    const user = await prisma().user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    timeZone = normalizeUserTimezone(user?.timezone);
  }

  return (
    <UserTimezoneProvider value={timeZone}>
      <div className="dashboard-bg min-h-dvh w-full">
        <div className="relative flex min-h-dvh w-full">
          <div
            className="dashboard-grid pointer-events-none absolute inset-0"
            aria-hidden="true"
          />
          <Sidebar />
          <div className="relative flex min-w-0 flex-1 flex-col">
            <TopNav />
            <main className="flex-1 px-4 py-8 md:px-8 md:pl-6">{children}</main>
          </div>
        </div>
      </div>
    </UserTimezoneProvider>
  );
}
