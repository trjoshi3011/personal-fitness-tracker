import type { Prisma } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";

import { prisma } from "@/lib/db";
import { normalizeUserTimezone } from "@/lib/user-timezone";
import { zonedDayKeyFromDate } from "@/lib/format-zoned";
import { canonicalZonedDayStart, nextZonedCalendarDayStartMs } from "@/lib/zoned-calendar";
import {
  ageYearsAt,
  buildPerDayWeightKg,
  mifflinStJeorBmrKcal,
  type BiologicalSex,
} from "@/lib/nutrition-burn";
import { assertGeminiTextOk } from "@/lib/gemini-output-guard";

const MODEL = "gemini-2.5-flash";
const WINDOW_DAYS = 60;
const MIN_TRUSTED_CONSUMED_KCAL = 900;
const JSON_MIME = "application/json";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export type NutritionInsightSection = {
  emoji: string;
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
};

export type NutritionAiInsightsResult = {
  summary: string;
  sections: NutritionInsightSection[];
  generatedAt: string;
};

function getGeminiResponseText(response: unknown): string {
  const r = response as any;
  // SDK versions differ: sometimes `text` is a function, sometimes a string.
  try {
    if (r?.text && typeof r.text === "function") {
      const t = r.text();
      return typeof t === "string" ? t : "";
    }
  } catch {
    // ignore
  }
  if (typeof r?.text === "string") return r.text;

  // Fallback: candidates[0].content.parts[].text
  const parts = r?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts
      .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
      .join("");
    if (joined.trim()) return joined;
  }

  return "";
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = text.slice(start, end + 1).trim();
  return candidate.startsWith("{") && candidate.endsWith("}") ? candidate : null;
}

/**
 * Gemini occasionally emits JSON-like output with raw newlines inside quoted
 * strings. That is invalid JSON (strings cannot contain literal newlines).
 * This attempts a minimal repair: escape control characters *only* while
 * inside a string literal.
 */
function repairLikelyJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === "\"") inString = true;
      out += ch;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === "\"") {
      out += ch;
      inString = false;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }

    out += ch;
  }
  return out;
}

/** Validate JSON loaded from `User.aiNutritionInsightsJson`. */
export function parseCachedAiNutritionInsightsJson(
  json: unknown,
): NutritionAiInsightsResult | null {
  if (json == null || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.summary !== "string" || !Array.isArray(o.sections)) return null;
  const sections: NutritionInsightSection[] = [];
  for (const raw of o.sections) {
    if (raw == null || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    const priority = s.priority;
    if (
      typeof s.emoji !== "string" ||
      typeof s.title !== "string" ||
      typeof s.body !== "string" ||
      (priority !== "high" && priority !== "medium" && priority !== "low")
    ) {
      return null;
    }
    sections.push({
      emoji: s.emoji,
      title: s.title,
      body: s.body,
      priority,
    });
  }
  const generatedAt =
    typeof o.generatedAt === "string"
      ? o.generatedAt
      : new Date().toISOString();
  return { summary: o.summary, sections, generatedAt };
}

type NutritionRow = {
  date: Date;
  source: "BACKFILL" | "MANUAL";
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  activeEnergyKcal: number | null;
};

type DayRow = NutritionRow & { dayKey: string };

function hasTrustedIntake(d: DayRow): boolean {
  const c = d.caloriesKcal;
  return c != null && Number.isFinite(c) && c > MIN_TRUSTED_CONSUMED_KCAL;
}

function avg<T extends keyof NutritionRow>(
  rows: DayRow[],
  key: T,
): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = r[key] as number | null;
    if (v != null && Number.isFinite(v) && v > 0) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function gatherNutritionData(userId: string) {
  const user = await prisma().user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      heightCm: true,
      dateOfBirth: true,
      biologicalSex: true,
    },
  });
  const tz = normalizeUserTimezone(user?.timezone);
  const now = new Date();
  const windowStart = new Date(now.getTime() - (WINDOW_DAYS - 1) * 86_400_000);

  const [rows, weightWhoop, weightManual] = await Promise.all([
    prisma().dailyNutritionLog.findMany({
      where: { userId, date: { gte: windowStart } },
      select: {
        date: true,
        source: true,
        caloriesKcal: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        fiberG: true,
        sugarG: true,
        sodiumMg: true,
        saturatedFatG: true,
        activeEnergyKcal: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma().dailyWhoopStat.findMany({
      where: { userId, weightKg: { not: null } },
      select: { date: true, weightKg: true },
      orderBy: { date: "asc" },
    }),
    prisma().manualWeightLog.findMany({
      where: { userId },
      select: { date: true, weightKg: true },
      orderBy: { date: "asc" },
    }),
  ]);

  // MANUAL wins for intake/macros per calendar day.
  const winnerByDay = new Map<string, DayRow>();
  for (const r of rows as NutritionRow[]) {
    const dayKey = zonedDayKeyFromDate(r.date, tz);
    const existing = winnerByDay.get(dayKey);
    if (!existing) {
      winnerByDay.set(dayKey, { ...r, dayKey });
    } else if (r.source === "MANUAL") {
      winnerByDay.set(dayKey, { ...r, dayKey });
    } else if (existing.source !== "MANUAL") {
      winnerByDay.set(dayKey, { ...r, dayKey });
    }
  }
  const merged = [...winnerByDay.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Active energy is only on BACKFILL rows — read independently.
  const activeByDay = new Map<string, number>();
  for (const r of rows as NutritionRow[]) {
    if (r.activeEnergyKcal != null && r.activeEnergyKcal > 0) {
      activeByDay.set(zonedDayKeyFromDate(r.date, tz), r.activeEnergyKcal);
    }
  }

  const mergedTrusted = merged.filter(hasTrustedIntake);

  const sex: BiologicalSex | null =
    user?.biologicalSex === "MALE" ||
    user?.biologicalSex === "FEMALE" ||
    user?.biologicalSex === "OTHER"
      ? (user.biologicalSex as BiologicalSex)
      : null;
  const heightCm = user?.heightCm ?? null;
  const dob = user?.dateOfBirth ?? null;
  const burnReady = heightCm != null && dob != null && sex != null;

  const weightHistory: { date: Date; weightKg: number }[] = [];
  for (const w of weightWhoop) {
    if (w.weightKg != null) weightHistory.push({ date: w.date, weightKg: w.weightKg });
  }
  for (const w of weightManual) {
    weightHistory.push({ date: w.date, weightKg: w.weightKg });
  }
  weightHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

  const dayStartMs = (d: Date) => canonicalZonedDayStart(d, tz).getTime();
  const endDayMs = dayStartMs(now);
  const startDayMs = dayStartMs(windowStart);

  const weightByDayMs = buildPerDayWeightKg({
    history: weightHistory,
    startDayMs,
    endDayMs,
    dayStartMs: (d) => canonicalZonedDayStart(d, tz).getTime(),
    advanceCalendarDayMs: (ms) => nextZonedCalendarDayStartMs(ms, tz),
  });

  const dayByDay: Array<{
    day: string;
    caloriesKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    activeEnergyKcal: number | null;
    totalBurnKcal: number | null;
    deficitKcal: number | null;
  }> = [];

  for (const d of mergedTrusted) {
    const dayKey = d.dayKey;
    const active = activeByDay.get(dayKey) ?? null;
    const weight = weightByDayMs.get(dayStartMs(d.date)) ?? null;
    const ageY = dob ? ageYearsAt(dob, d.date) : null;
    const bmr =
      burnReady && weight != null && ageY != null
        ? mifflinStJeorBmrKcal({
            weightKg: weight,
            heightCm: heightCm!,
            ageYears: ageY,
            sex: sex!,
          })
        : null;
    const totalBurn =
      bmr != null ? bmr + (active ?? 0) : active != null ? active : null;
    const deficit =
      d.caloriesKcal != null && totalBurn != null ? d.caloriesKcal - totalBurn : null;

    dayByDay.push({
      day: fmt(canonicalZonedDayStart(d.date, tz)),
      caloriesKcal: d.caloriesKcal,
      proteinG: d.proteinG,
      carbsG: d.carbsG,
      fatG: d.fatG,
      activeEnergyKcal: active,
      totalBurnKcal: totalBurn,
      deficitKcal: deficit,
    });
  }

  return {
    tz,
    burnReady,
    mergedTrusted,
    dayByDay,
    averages: {
      caloriesKcal: avg(mergedTrusted, "caloriesKcal"),
      proteinG: avg(mergedTrusted, "proteinG"),
      carbsG: avg(mergedTrusted, "carbsG"),
      fatG: avg(mergedTrusted, "fatG"),
      fiberG: avg(mergedTrusted, "fiberG"),
    },
  };
}

function buildNutritionDataSummary(data: Awaited<ReturnType<typeof gatherNutritionData>>) {
  const lines: string[] = [];
  lines.push(`## Nutrition (last ${WINDOW_DAYS} days)`);
  lines.push(
    `- Trusted intake days: ${data.mergedTrusted.length} (consumed > ${MIN_TRUSTED_CONSUMED_KCAL} kcal)`,
  );

  const a = data.averages;
  if (a.caloriesKcal != null) lines.push(`- Avg calories: ${Math.round(a.caloriesKcal)} kcal/day`);
  if (a.proteinG != null) lines.push(`- Avg protein: ${Math.round(a.proteinG)} g/day`);
  if (a.carbsG != null) lines.push(`- Avg carbs: ${Math.round(a.carbsG)} g/day`);
  if (a.fatG != null) lines.push(`- Avg fat: ${Math.round(a.fatG)} g/day`);
  if (a.fiberG != null) lines.push(`- Avg fiber: ${Math.round(a.fiberG)} g/day`);

  const last7 = data.dayByDay.slice(-7);
  if (last7.length > 0) {
    lines.push(`\n### Last 7 trusted days (day-by-day)`);
    for (const d of last7) {
      const parts = [d.day];
      if (d.caloriesKcal != null) parts.push(`cal ${Math.round(d.caloriesKcal)}`);
      if (d.proteinG != null) parts.push(`P ${Math.round(d.proteinG)}g`);
      if (d.carbsG != null) parts.push(`C ${Math.round(d.carbsG)}g`);
      if (d.fatG != null) parts.push(`F ${Math.round(d.fatG)}g`);
      if (d.activeEnergyKcal != null) parts.push(`active ${Math.round(d.activeEnergyKcal)}kcal`);
      if (d.totalBurnKcal != null) parts.push(`burn ${Math.round(d.totalBurnKcal)}kcal`);
      if (d.deficitKcal != null) parts.push(`def ${Math.round(d.deficitKcal)}kcal`);
      lines.push(`  ${parts.join(" · ")}`);
    }
  }

  if (!data.burnReady) {
    lines.push(
      `\nNote: Total burn/deficit requires height + DOB + biological sex + weight history. If missing, only intake/macro insights should be generated.`,
    );
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert nutrition coach integrated into a personal fitness dashboard.

Your job: analyze the user's recent calorie + macro patterns and produce actionable, specific insights. Don't just restate numbers — interpret trends and give concrete recommendations.

Important constraints:
- The data includes ONLY "trusted intake days": days where consumed calories > 900 kcal. This filter removes partial-sync / mistracked low totals.
- If burn/deficit is missing, do not hallucinate it.
- This is NOT medical advice.

Respond with valid JSON matching this schema (no markdown fences, just raw JSON):

{
  "summary": "2–3 sentence executive summary of nutrition patterns",
  "sections": [
    {
      "emoji": "single emoji that fits the topic",
      "title": "Short title (3–6 words)",
      "body": "2–4 sentences with specific insight and recommendation. Reference actual numbers from the data.",
      "priority": "high | medium | low"
    }
  ],
  "generatedAt": "ISO timestamp (filled in by the app)"
}

Guidelines:
- Produce 4–5 sections total (keep output compact).
- Keep each section body under 260 characters.
- Keep the summary under 320 characters.
- "high" priority = likely to meaningfully impact results or suggests a clear fix.
- Be practical: suggest a target range, a small habit change, and a way to track it.
`;

export async function generateAiNutritionInsights(
  userId: string,
): Promise<NutritionAiInsightsResult> {
  const data = await gatherNutritionData(userId);
  const dataSummary = buildNutritionDataSummary(data);

  if (dataSummary.trim().length < 50) {
    return {
      summary:
        "Not enough trusted nutrition data to generate insights yet. Upload Apple Health or log a few days manually first.",
      sections: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Here is my nutrition data. Analyze it and produce insights.\n\n${dataSummary}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.4,
      maxOutputTokens: 4096,
      // Prefer strict JSON responses when supported by the SDK/model.
      responseMimeType: JSON_MIME as unknown as never,
    },
  });

  const text = getGeminiResponseText(response).trim();
  assertGeminiTextOk(text);

  let cleaned = text;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as NutritionAiInsightsResult;
    parsed.generatedAt = new Date().toISOString();
    return parsed;
  } catch {
    const extracted = extractFirstJsonObject(cleaned) ?? extractFirstJsonObject(text);
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted) as NutritionAiInsightsResult;
        parsed.generatedAt = new Date().toISOString();
        return parsed;
      } catch {
        // Try minimal repair (escape raw control chars inside strings).
        try {
          const repaired = repairLikelyJson(extracted);
          const parsed = JSON.parse(repaired) as NutritionAiInsightsResult;
          parsed.generatedAt = new Date().toISOString();
          return parsed;
        } catch {
          // fall through
        }
      }
    }
    // Surface a short, sanitized snippet to help debug model formatting.
    const snippet = text
      .replace(/\s+/g, " ")
      .slice(0, 240);
    const hasClosingBrace = text.includes("}");
    assertGeminiTextOk(text);
    throw new Error(
      `Could not parse AI nutrition insights response. Please try again. (len=${text.length}, hasClosingBrace=${hasClosingBrace}, snippet: "${snippet}")`,
    );
  }
}

