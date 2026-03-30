import type { Metadata } from "next";

import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

export const metadata: Metadata = {
  title: "Fitness Dashboard",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
  );
}
