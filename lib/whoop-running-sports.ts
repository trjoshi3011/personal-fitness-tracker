/**
 * WHOOP `sport_name` values (lowercase) treated as running for dashboards.
 * @see https://developer.whoop.com/docs/developing/user-data/workout/
 */
export const WHOOP_RUNNING_SPORT_NAMES = [
  "running",
  "running_msk",
  "treadmill",
  "track & field",
  "track_and_field",
] as const;

export function isWhoopRunningSportName(sportName: string): boolean {
  const n = sportName.trim().toLowerCase();
  if ((WHOOP_RUNNING_SPORT_NAMES as readonly string[]).includes(n)) return true;
  // Future-proof: WHOOP sometimes suffixes MSK variants.
  if (n.startsWith("running")) return true;
  return false;
}
