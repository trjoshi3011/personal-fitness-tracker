import type { Prisma } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { fetchStravaRunsInRange } from "@/lib/merged-runs";
import { utcCalendarWindowBoundsMs } from "@/lib/calendar-range";
import { metersToMiles, paceSecondsPerMile, kgToLb } from "@/lib/units";

const MODEL = "gemini-3-flash-preview";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export type InsightSection = {
  emoji: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
};

export type AiInsightsResult = {
  summary: string;
  sections: InsightSection[];
  generatedAt: string;
};

const monthlySnapshotSelectBase = {
  year: true,
  month: true,
  runCount: true,
  runDistanceMeters: true,
  avgPaceSecPerMi: true,
  avgSteps: true,
  avgSleepMinutes: true,
  avgRestingHr: true,
  avgWeightKg: true,
} as const;

const monthlySnapshotSelectWithWhoop = {
  ...monthlySnapshotSelectBase,
  avgWhoopRecovery: true,
  avgWhoopStrain: true,
  avgWhoopHrvMs: true,
  whoopDaysCount: true,
  avgWhoopWeightKg: true,
} as const;

export type MonthlySnapshotInsightRow =
  Prisma.MonthlyFitnessSnapshotGetPayload<{
    select: typeof monthlySnapshotSelectWithWhoop;
  }>;

/**
 * Stale `node_modules/@prisma/client` (e.g. dev server started before `prisma generate`)
 * rejects WHOOP snapshot fields — fall back to legacy select so insights still load.
 */
async function fetchMonthlySnapshotsForInsights(
  userId: string,
): Promise<MonthlySnapshotInsightRow[]> {
  const args = {
    where: { userId },
    orderBy: [{ year: "desc" as const }, { month: "desc" as const }],
    take: 6,
  };
  try {
    return await prisma().monthlyFitnessSnapshot.findMany({
      ...args,
      select: monthlySnapshotSelectWithWhoop,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("Unknown field") ||
      msg.includes("avgWhoop") ||
      msg.includes("whoopDaysCount") ||
      msg.includes("avgWhoopWeightKg")
    ) {
      const rows = await prisma().monthlyFitnessSnapshot.findMany({
        ...args,
        select: monthlySnapshotSelectBase,
      });
      return rows as MonthlySnapshotInsightRow[];
    }
    throw e;
  }
}

async function gatherUserData(userId: string) {
  const now = new Date();
  const { startMs, endMs } = utcCalendarWindowBoundsMs(30, now);
  const rangeStart = new Date(startMs);
  const rangeEnd = new Date(endMs);
  const start7 = new Date(now.getTime() - 7 * 86_400_000);

  const [runs30, fitbit30, whoop30, fitbit7, whoop7, monthlySnapshots] =
    await Promise.all([
      fetchStravaRunsInRange(userId, rangeStart, rangeEnd),
      prisma().dailyFitbitStat.findMany({
        where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
        select: {
          date: true,
          sleepMinutes: true,
          sleepEfficiency: true,
          restingHeartRateBpm: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma().dailyWhoopStat.findMany({
        where: { userId, date: { gte: rangeStart, lte: rangeEnd } },
        select: {
          date: true,
          recoveryScore: true,
          strain: true,
          restingHeartRateBpm: true,
          hrvRmssdMs: true,
          spo2Percentage: true,
          skinTempCelsius: true,
          sleepMinutes: true,
          sleepPerformancePct: true,
          sleepEfficiencyPct: true,
          sleepConsistencyPct: true,
          weightKg: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma().dailyFitbitStat.findMany({
        where: { userId, date: { gte: start7 } },
        select: {
          date: true,
          sleepMinutes: true,
          restingHeartRateBpm: true,
        },
        orderBy: { date: "asc" },
      }),
      prisma().dailyWhoopStat.findMany({
        where: { userId, date: { gte: start7 } },
        select: {
          date: true,
          recoveryScore: true,
          strain: true,
          hrvRmssdMs: true,
          sleepMinutes: true,
        },
        orderBy: { date: "asc" },
      }),
      fetchMonthlySnapshotsForInsights(userId),
    ]);

  const runsFiltered = runs30.filter(
    (r) => r.startAt.getTime() >= startMs && r.startAt.getTime() <= endMs,
  );

  return {
    runs30: runsFiltered,
    fitbit30,
    whoop30,
    fitbit7,
    whoop7,
    monthlySnapshots: monthlySnapshots.reverse(),
  };
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildDataSummary(data: Awaited<ReturnType<typeof gatherUserData>>) {
  const lines: string[] = [];

  // --- Runs ---
  const { runs30 } = data;
  if (runs30.length > 0) {
    const totalMi = runs30.reduce(
      (a, r) => a + metersToMiles(r.distanceMeters ?? 0),
      0,
    );
    const totalSec = runs30.reduce((a, r) => a + (r.movingTimeSec ?? 0), 0);
    const avgPace = paceSecondsPerMile({
      seconds: totalSec,
      meters: runs30.reduce((a, r) => a + (r.distanceMeters ?? 0), 0),
    });
    lines.push(`## Running (last 30 days)`);
    lines.push(`- ${runs30.length} runs, ${totalMi.toFixed(1)} miles total`);
    if (avgPace) {
      const pMin = Math.floor(avgPace / 60);
      const pSec = Math.round(avgPace % 60);
      lines.push(`- Average pace: ${pMin}:${String(pSec).padStart(2, "0")} /mi`);
    }
    const runDays = new Set(runs30.map((r) => fmt(r.startAt)));
    lines.push(`- ${runDays.size} unique run days out of 30`);
    const weeklyMiles: number[] = [0, 0, 0, 0];
    for (const r of runs30) {
      const daysAgo = Math.floor(
        (Date.now() - r.startAt.getTime()) / 86_400_000,
      );
      const weekIdx = Math.min(3, Math.floor(daysAgo / 7));
      weeklyMiles[weekIdx] += metersToMiles(r.distanceMeters ?? 0);
    }
    lines.push(
      `- Weekly miles (most recent first): ${weeklyMiles.map((m) => m.toFixed(1)).join(", ")}`,
    );
  } else {
    lines.push(`## Running: no runs in the last 30 days.`);
  }

  // --- Fitbit ---
  if (data.fitbit30.length > 0) {
    lines.push(`\n## Fitbit daily stats — HISTORICAL (last 30 days, ${data.fitbit30.length} days with data)`);
    const sleep = data.fitbit30.filter(
      (r) => r.sleepMinutes != null && r.sleepMinutes > 0,
    );
    if (sleep.length > 0) {
      const avgMin = Math.round(
        sleep.reduce((a, r) => a + (r.sleepMinutes ?? 0), 0) / sleep.length,
      );
      const h = Math.floor(avgMin / 60);
      const m = avgMin % 60;
      lines.push(`- Avg sleep: ${h}h ${m}m (${sleep.length} nights)`);
    }
    const eff = data.fitbit30.filter(
      (r) => r.sleepEfficiency != null && r.sleepEfficiency > 0,
    );
    if (eff.length > 0) {
      const avgEff = Math.round(
        eff.reduce((a, r) => a + (r.sleepEfficiency ?? 0), 0) / eff.length,
      );
      lines.push(`- Avg sleep efficiency: ${avgEff}%`);
    }
    const rhr = data.fitbit30.filter(
      (r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0,
    );
    if (rhr.length > 0) {
      const avgRhr = Math.round(
        rhr.reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) / rhr.length,
      );
      const rhrFirst5 =
        rhr.slice(0, 5).reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) /
        Math.min(5, rhr.length);
      const rhrLast5 =
        rhr
          .slice(-5)
          .reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) /
        Math.min(5, rhr.length);
      lines.push(
        `- RHR: avg ${avgRhr} bpm, early window avg ${Math.round(rhrFirst5)}, recent avg ${Math.round(rhrLast5)}`,
      );
    }
    // 7-day micro view
    if (data.fitbit7.length > 0) {
      lines.push(`\n### Fitbit last 7 days (day-by-day)`);
      for (const d of data.fitbit7) {
        const parts = [fmt(d.date)];
        if (d.sleepMinutes != null) parts.push(`sleep ${d.sleepMinutes}m`);
        if (d.restingHeartRateBpm != null) parts.push(`RHR ${d.restingHeartRateBpm}`);
        lines.push(`  ${parts.join(" · ")}`);
      }
    }
  }

  // --- WHOOP ---
  if (data.whoop30.length > 0) {
    lines.push(`\n## WHOOP — PRIMARY WEARABLE (last 30 days, ${data.whoop30.length} days with data)`);
    const rec = data.whoop30.filter((r) => r.recoveryScore != null);
    if (rec.length > 0) {
      const avg = Math.round(
        rec.reduce((a, r) => a + (r.recoveryScore ?? 0), 0) / rec.length,
      );
      const min = Math.min(...rec.map((r) => r.recoveryScore!));
      const max = Math.max(...rec.map((r) => r.recoveryScore!));
      lines.push(`- Recovery: avg ${avg}%, range ${min}–${max}%`);
    }
    const strain = data.whoop30.filter((r) => r.strain != null);
    if (strain.length > 0) {
      const avg =
        strain.reduce((a, r) => a + (r.strain ?? 0), 0) / strain.length;
      lines.push(`- Avg daily strain: ${avg.toFixed(1)}`);
    }
    const hrv = data.whoop30.filter(
      (r) => r.hrvRmssdMs != null && r.hrvRmssdMs > 0,
    );
    if (hrv.length > 0) {
      const avg =
        hrv.reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) / hrv.length;
      const hrvFirst5 =
        hrv.slice(0, 5).reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) /
        Math.min(5, hrv.length);
      const hrvLast5 =
        hrv.slice(-5).reduce((a, r) => a + (r.hrvRmssdMs ?? 0), 0) /
        Math.min(5, hrv.length);
      lines.push(
        `- HRV (RMSSD): avg ${avg.toFixed(1)} ms, early ${hrvFirst5.toFixed(1)} ms, recent ${hrvLast5.toFixed(1)} ms`,
      );
    }
    const sp = data.whoop30.filter((r) => r.sleepPerformancePct != null);
    if (sp.length > 0) {
      const avg =
        sp.reduce((a, r) => a + (r.sleepPerformancePct ?? 0), 0) / sp.length;
      lines.push(`- Avg sleep performance: ${avg.toFixed(0)}%`);
    }
    const se = data.whoop30.filter((r) => r.sleepEfficiencyPct != null);
    if (se.length > 0) {
      const avg =
        se.reduce((a, r) => a + (r.sleepEfficiencyPct ?? 0), 0) / se.length;
      lines.push(`- Avg sleep efficiency: ${avg.toFixed(0)}%`);
    }
    const spo2 = data.whoop30.filter((r) => r.spo2Percentage != null);
    if (spo2.length > 0) {
      const avg =
        spo2.reduce((a, r) => a + (r.spo2Percentage ?? 0), 0) / spo2.length;
      lines.push(`- Avg SpO₂: ${avg.toFixed(1)}%`);
    }
    const wRhr = data.whoop30.filter(
      (r) => r.restingHeartRateBpm != null && r.restingHeartRateBpm > 0,
    );
    if (wRhr.length > 0) {
      const avg = Math.round(
        wRhr.reduce((a, r) => a + (r.restingHeartRateBpm ?? 0), 0) /
          wRhr.length,
      );
      lines.push(`- WHOOP RHR avg: ${avg} bpm`);
    }
    const wWt = data.whoop30.filter((r) => r.weightKg != null && r.weightKg > 0);
    if (wWt.length > 0) {
      const first = kgToLb(wWt[0].weightKg!);
      const last = kgToLb(wWt[wWt.length - 1].weightKg!);
      lines.push(
        `- Body weight (WHOOP API): ${first.toFixed(1)} lb → ${last.toFixed(1)} lb (${wWt.length} daily rows with weight)`,
      );
    }

    if (data.whoop7.length > 0) {
      lines.push(`\n### WHOOP last 7 days (day-by-day)`);
      for (const d of data.whoop7) {
        const parts = [fmt(d.date)];
        if (d.recoveryScore != null) parts.push(`recovery ${d.recoveryScore}%`);
        if (d.strain != null) parts.push(`strain ${d.strain.toFixed(1)}`);
        if (d.hrvRmssdMs != null) parts.push(`HRV ${d.hrvRmssdMs.toFixed(0)}ms`);
        if (d.sleepMinutes != null) parts.push(`sleep ${d.sleepMinutes}m`);
        lines.push(`  ${parts.join(" · ")}`);
      }
    }
  }

  // --- Monthly snapshots ---
  if (data.monthlySnapshots.length > 0) {
    lines.push(`\n## Monthly fitness trends (up to 6 most recent months)`);
    for (const s of data.monthlySnapshots) {
      const parts = [`${s.year}-${String(s.month).padStart(2, "0")}`];
      if (s.runCount != null) parts.push(`${s.runCount} runs`);
      if (s.runDistanceMeters != null)
        parts.push(`${metersToMiles(s.runDistanceMeters).toFixed(0)} mi`);
      if (s.avgPaceSecPerMi != null) {
        const pm = Math.floor(s.avgPaceSecPerMi / 60);
        const ps = Math.round(s.avgPaceSecPerMi % 60);
        parts.push(`pace ${pm}:${String(ps).padStart(2, "0")}`);
      }
      if (s.avgSteps != null)
        parts.push(`Fitbit avg steps ${Math.round(s.avgSteps)} (historical)`);
      if (s.avgSleepMinutes != null) {
        const h = Math.floor(s.avgSleepMinutes / 60);
        const m = Math.round(s.avgSleepMinutes % 60);
        parts.push(`sleep ${h}h${m}m`);
      }
      if (s.avgRestingHr != null)
        parts.push(`RHR ${Math.round(s.avgRestingHr)}`);
      if (s.avgWeightKg != null)
        parts.push(`Fitbit weight (historical) ${kgToLb(s.avgWeightKg).toFixed(1)} lb`);
      if (s.avgWhoopWeightKg != null)
        parts.push(`WHOOP weight avg ${kgToLb(s.avgWhoopWeightKg).toFixed(1)} lb`);
      if (s.avgWhoopRecovery != null)
        parts.push(`WHOOP recovery ${Math.round(s.avgWhoopRecovery)}%`);
      if (s.avgWhoopStrain != null)
        parts.push(`WHOOP strain ${s.avgWhoopStrain.toFixed(1)}`);
      if (s.avgWhoopHrvMs != null)
        parts.push(`WHOOP HRV ${s.avgWhoopHrvMs.toFixed(0)} ms`);
      if (s.whoopDaysCount != null && s.whoopDaysCount > 0)
        parts.push(`WHOOP ${s.whoopDaysCount}d`);
      lines.push(`  ${parts.join(" · ")}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert sports-science coach and wellness analyst integrated into a personal fitness dashboard. The user's primary wearable is WHOOP (recovery, strain, HRV, sleep, RHR, body weight from WHOOP body-measurement API). Runs come from Strava. Historical Fitbit data (sleep, RHR) may supplement older periods. WHOOP does not expose step counts via API — do not infer steps from WHOOP.

Your job is to analyze the data holistically and produce **actionable, specific insights**. Don't just restate numbers — interpret trends, spot correlations, and give concrete recommendations. Prioritize WHOOP data for recovery, sleep, and readiness analysis.

Respond with valid JSON matching this schema (no markdown fences, just raw JSON):

{
  "summary": "2–3 sentence executive summary of the user's current fitness & recovery state",
  "sections": [
    {
      "emoji": "single emoji that fits the topic",
      "title": "Short title (3–6 words)",
      "body": "2–4 sentences with specific insight and recommendation. Reference actual numbers from the data.",
      "priority": "high | medium | low"
    }
  ]
}

Guidelines:
- Produce 5–8 sections covering: recovery status, training load, sleep quality, heart rate trends, body composition, consistency, and any cross-metric correlations you find.
- "high" priority = needs immediate attention or represents a significant finding.
- "medium" = notable trend worth monitoring.
- "low" = positive observation or minor note.
- Use WHOOP HRV, recovery scores, and sleep metrics as the primary recovery signals.
- Fitbit data is historical — use it for long-term trend context but note it's from an older period if relevant. Do not treat steps as a current KPI (WHOOP has no step API).
- If a data source is missing, skip sections that depend on it — don't hallucinate.
- Be encouraging but honest. Flag overtraining or under-recovery signals clearly.
- This is NOT medical advice. Frame it as coaching observation.`;

export async function generateAiInsights(
  userId: string,
): Promise<AiInsightsResult> {
  const data = await gatherUserData(userId);
  const dataSummary = buildDataSummary(data);

  if (dataSummary.trim().length < 50) {
    return {
      summary:
        "Not enough data to generate insights. Connect your devices and sync some data first.",
      sections: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Here is my fitness data. Analyze it and produce insights.\n\n${dataSummary}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text?.trim() ?? "";

  let cleaned = text;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as AiInsightsResult;
    parsed.generatedAt = new Date().toISOString();
    return parsed;
  } catch {
    return {
      summary: text.slice(0, 500),
      sections: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
