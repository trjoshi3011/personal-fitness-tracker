import { Suspense } from "react";

import { BackfillUploadLazy } from "@/components/dashboard/nutrition/backfill-upload-lazy";
import { NutritionAiInsightsLazy } from "@/components/dashboard/nutrition/ai-insights-dynamic";
import { NutritionBelowFold } from "@/components/dashboard/nutrition/below-fold";
import { NutritionBelowFoldSkeleton } from "@/components/dashboard/nutrition/below-fold-skeleton";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { normalizeUserTimezone } from "@/lib/user-timezone";

export const dynamic = "force-dynamic";

function todayInTzIso(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type NutritionSearch = {
  nutrition?: string;
  reason?: string;
};

export default async function NutritionPage({
  searchParams,
}: {
  searchParams?: Promise<NutritionSearch>;
}) {
  const sp = (await searchParams) ?? {};
  const userId = await requireUserId();
  const userRow = await prisma().user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = normalizeUserTimezone(userRow?.timezone);
  const todayIso = todayInTzIso(tz);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-widest text-stone-500 uppercase">Fuel</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Nutrition</h1>
        <p className="mt-2 text-base leading-relaxed text-stone-600">
          Calorie + macro tracking. Backfill from Apple Health or log days
          yourself — manual entries win when both exist for the same day.
        </p>
      </div>

      {sp.nutrition ? (
        <div className="rounded-xl border border-[color:var(--color-border-default)] bg-card/80 p-3 text-sm text-[color:var(--color-text-secondary)]">
          {sp.nutrition === "saved" ? <p>Day saved.</p> : null}
          {sp.nutrition === "deleted" ? <p>Manual entry removed.</p> : null}
          {sp.nutrition === "profile_saved" ? <p>BMR profile updated.</p> : null}
          {sp.nutrition === "error" ? (
            <p className="text-[color:var(--ui-danger)]">
              Could not save entry
              {sp.reason ? `: ${decodeURIComponent(sp.reason).replace(/_/g, " ")}` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      <BackfillUploadLazy />

      <NutritionAiInsightsLazy />

      <Suspense fallback={<NutritionBelowFoldSkeleton />}>
        <NutritionBelowFold userId={userId} tz={tz} todayIso={todayIso} />
      </Suspense>
    </div>
  );
}
