import sax from "sax";

/**
 * Aggregated daily nutrition + active-energy totals for a single day from an
 * Apple Health export. Keys are summed over all matching `<Record>` entries
 * that fell on the same calendar date in the source's local timezone.
 *
 * `dayKey` is the YYYY-MM-DD label of the **source's local date** (Apple Health
 * stores `startDate` in local time + offset, so the first 10 chars are
 * unambiguous). The caller converts that to a stored UTC instant using the
 * user's IANA timezone preference so dashboards render the right calendar day.
 */
export type AppleHealthDietaryDay = {
  dayKey: string;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  saturatedFatG: number;
  /** Apple's "Active Energy Burned" — workout / movement kcal (excludes BMR). */
  activeEnergyKcal: number;
  /** Number of <Record> entries that contributed to this day. */
  recordCount: number;
};

/**
 * Body / personal characteristics extracted opportunistically while we walk
 * the export. Used to seed the user's profile (height / DOB / sex) so BMR can
 * be computed without a separate questionnaire.
 */
export type AppleHealthProfileGuess = {
  /** From <Me HKCharacteristicTypeIdentifierDateOfBirth="YYYY-MM-DD">. */
  dateOfBirth: string | null;
  /** "MALE" / "FEMALE" / "OTHER" / null (HKBiologicalSexNotSet). */
  biologicalSex: "MALE" | "FEMALE" | "OTHER" | null;
  /** Most-recent (by `endDate`) `HKQuantityTypeIdentifierHeight` record, in cm. */
  heightCm: number | null;
};

export type AppleHealthImportResult = {
  /** Per-day dietary + active-energy totals, keyed by YYYY-MM-DD local. */
  days: Map<string, AppleHealthDietaryDay>;
  /** Body profile fields detected in the export (any field may be null). */
  profile: AppleHealthProfileGuess;
};

type DayAccumulator = Omit<AppleHealthDietaryDay, "dayKey">;

const ZERO_DAY = (): DayAccumulator => ({
  caloriesKcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
  sugarG: 0,
  sodiumMg: 0,
  saturatedFatG: 0,
  activeEnergyKcal: 0,
  recordCount: 0,
});

/**
 * Map of HealthKit identifier → which accumulator field to add to. Active
 * energy lives alongside dietary fields so we only walk the document once.
 *
 * Calories are stored in `Cal` (kcal) by Apple Health.
 * Protein/carbs/fat are grams. Sodium can be `mg` or `g` (we normalize to mg).
 */
const FIELD_BY_HK_TYPE: Record<string, keyof DayAccumulator> = {
  HKQuantityTypeIdentifierDietaryEnergyConsumed: "caloriesKcal",
  HKQuantityTypeIdentifierDietaryProtein: "proteinG",
  HKQuantityTypeIdentifierDietaryCarbohydrates: "carbsG",
  HKQuantityTypeIdentifierDietaryFatTotal: "fatG",
  HKQuantityTypeIdentifierDietaryFiber: "fiberG",
  HKQuantityTypeIdentifierDietarySugar: "sugarG",
  HKQuantityTypeIdentifierDietarySodium: "sodiumMg",
  HKQuantityTypeIdentifierDietaryFatSaturated: "saturatedFatG",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergyKcal",
};

/**
 * Best-effort unit normalization. Apple Health emits the same identifier with
 * either of two units in some exports (e.g. sodium in `g` vs `mg`). We coerce
 * everything into the unit baked into the field name so downstream code never
 * needs to read `unit` on each record.
 */
function normalizeValue(
  field: keyof DayAccumulator,
  rawValue: number,
  unit: string | undefined,
): number {
  if (!Number.isFinite(rawValue)) return 0;
  const u = (unit ?? "").trim();
  if (field === "sodiumMg") {
    if (u === "g") return rawValue * 1000;
    return rawValue; // assume mg
  }
  // Calories + active energy: Apple writes "Cal" (kcal). "kcal" is also OK.
  // "kJ" → kcal via 1 kcal = 4.184 kJ.
  if (field === "caloriesKcal" || field === "activeEnergyKcal") {
    if (u === "kJ") return rawValue / 4.184;
    return rawValue;
  }
  return rawValue;
}

/**
 * Convert an Apple Health height value to centimetres. Defaults to cm if the
 * unit is missing or unrecognized — matches Apple's "preferred units" output.
 */
function heightToCm(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const u = (unit ?? "").trim();
  if (u === "cm" || u === "") return value;
  if (u === "m") return value * 100;
  if (u === "in") return value * 2.54;
  if (u === "ft") return value * 30.48;
  return null;
}

function parseSex(raw: string | undefined): "MALE" | "FEMALE" | "OTHER" | null {
  if (!raw) return null;
  if (raw === "HKBiologicalSexMale") return "MALE";
  if (raw === "HKBiologicalSexFemale") return "FEMALE";
  if (raw === "HKBiologicalSexOther") return "OTHER";
  return null;
}

/**
 * Stream-parse an Apple Health export XML and emit per-day dietary +
 * active-energy totals plus a best-effort body profile (height/DOB/sex).
 *
 * The export contains one giant XML document with potentially tens of millions
 * of `<Record>` elements. We use SAX so we never hold the full document in
 * memory — only the per-day rolling accumulator, capped at the number of
 * distinct days with any tracked record.
 *
 * @param stream Web `ReadableStream<Uint8Array>` of the XML bytes (e.g.
 *   `(formData.get("file") as File).stream()`).
 */
export async function parseAppleHealthDietary(
  stream: ReadableStream<Uint8Array>,
): Promise<AppleHealthImportResult> {
  // sax: strict=true, options.lowercase=false to keep the HK type names exact.
  const parser = sax.parser(true, { lowercase: false });
  const days = new Map<string, DayAccumulator>();

  const profile: AppleHealthProfileGuess = {
    dateOfBirth: null,
    biologicalSex: null,
    heightCm: null,
  };
  /** End-date ms of the most recent <Record type="…Height"> we've accepted. */
  let mostRecentHeightEndMs = -Infinity;

  let parseError: Error | null = null;
  parser.onerror = (err: Error) => {
    parseError = err;
    (parser as unknown as { error: Error | null }).error = null;
    parser.resume();
  };

  parser.onopentag = (node: sax.Tag) => {
    if (node.name === "Me") {
      const dob = node.attributes.HKCharacteristicTypeIdentifierDateOfBirth;
      const sex = node.attributes.HKCharacteristicTypeIdentifierBiologicalSex;
      if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        profile.dateOfBirth = dob;
      }
      const parsedSex = parseSex(typeof sex === "string" ? sex : undefined);
      if (parsedSex) profile.biologicalSex = parsedSex;
      return;
    }

    if (node.name !== "Record") return;
    const type = node.attributes.type;
    if (typeof type !== "string") return;

    if (type === "HKQuantityTypeIdentifierHeight") {
      const valueRaw = node.attributes.value;
      const unit = node.attributes.unit;
      const endDate = node.attributes.endDate;
      if (typeof valueRaw !== "string" || typeof endDate !== "string") return;
      const cm = heightToCm(
        Number(valueRaw),
        typeof unit === "string" ? unit : undefined,
      );
      if (cm == null) return;
      // "Most recent" by end date — Apple's exports aren't strictly ordered.
      const endMs = Date.parse(endDate.replace(" ", "T"));
      if (Number.isFinite(endMs) && endMs > mostRecentHeightEndMs) {
        profile.heightCm = cm;
        mostRecentHeightEndMs = endMs;
      }
      return;
    }

    const field = FIELD_BY_HK_TYPE[type];
    if (!field) return;

    const startDate = node.attributes.startDate;
    const valueRaw = node.attributes.value;
    if (typeof startDate !== "string" || typeof valueRaw !== "string") return;

    // First 10 chars of `startDate` = source-local calendar day.
    const dayKey = startDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;

    const value = Number(valueRaw);
    if (!Number.isFinite(value)) return;

    const unit =
      typeof node.attributes.unit === "string" ? node.attributes.unit : undefined;
    const normalized = normalizeValue(field, value, unit);

    let day = days.get(dayKey);
    if (!day) {
      day = ZERO_DAY();
      days.set(dayKey, day);
    }
    day[field] = (day[field] as number) + normalized;
    day.recordCount += 1;
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.length > 0) parser.write(chunk);
    }
    const tail = decoder.decode();
    if (tail.length > 0) parser.write(tail);
    parser.close();
  } finally {
    reader.releaseLock();
  }

  if (parseError) {
    console.warn("[apple-health-import] non-fatal parse error:", parseError);
  }

  const out = new Map<string, AppleHealthDietaryDay>();
  for (const [dayKey, agg] of days) {
    out.set(dayKey, { dayKey, ...agg });
  }
  return { days: out, profile };
}
