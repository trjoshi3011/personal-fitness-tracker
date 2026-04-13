/** Normalize stored IANA timezone (Settings) for display and calendar math. */
export function normalizeUserTimezone(timezone: string | null | undefined): string {
  const t = timezone?.trim();
  return t && t.length > 0 ? t : "UTC";
}
