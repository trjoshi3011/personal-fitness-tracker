import { Suspense } from "react";

import { AiInsightsLazy } from "@/components/dashboard/ai-insights-dynamic";
import { InsightsBelowFold } from "@/components/dashboard/insights/below-fold";
import { InsightsBelowFoldSkeleton } from "@/components/dashboard/insights/below-fold-skeleton";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { normalizeUserTimezone } from "@/lib/user-timezone";

export const dynamic = "force-dynamic";

function todayInTzIso(tz: string): string {
  // en-CA always formats as YYYY-MM-DD, which is the format <input type="date"> expects.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type InsightsSearch = {
  weight?: string;
  reason?: string;
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: Promise<InsightsSearch>;
}) {
  const sp = (await searchParams) ?? {};
  const userId = await requireUserId();
  /**
   * Only the small lookups that the hero / banner / weight form need are
   * awaited synchronously here. All heavy queries + chart rendering happen
   * inside `<InsightsBelowFold />` and stream in via `<Suspense>` so the
   * page header (and the AI Coach card) paint immediately.
   */
  const [userRow, whoopConnectedRow] = await Promise.all([
    prisma().user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma().connectedAccount.findUnique({
      where: { userId_provider: { userId, provider: "WHOOP" } },
      select: { isActive: true },
    }),
  ]);
  const tz = normalizeUserTimezone(userRow?.timezone);
  const whoopConnected = Boolean(whoopConnectedRow);
  const todayIso = todayInTzIso(tz);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Insights</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          30-day analytics across runs, recovery, sleep, and weight.
        </p>
      </div>

      {sp.weight ? (
        <div className="rounded-xl border border-[color:var(--color-border-default)] bg-card/80 p-3 text-sm text-[color:var(--color-text-secondary)]">
          {sp.weight === "saved" ? <p>Weight entry saved.</p> : null}
          {sp.weight === "deleted" ? <p>Weight entry removed.</p> : null}
          {sp.weight === "error" ? (
            <p className="text-[color:var(--ui-danger)]">
              Could not save weight entry
              {sp.reason ? `: ${decodeURIComponent(sp.reason)}` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      <AiInsightsLazy />

      <Suspense fallback={<InsightsBelowFoldSkeleton />}>
        <InsightsBelowFold
          userId={userId}
          tz={tz}
          whoopConnected={whoopConnected}
          todayIso={todayIso}
        />
      </Suspense>
    </div>
  );
}
