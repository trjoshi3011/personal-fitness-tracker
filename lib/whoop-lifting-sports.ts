/**
 * WHOOP `sport_name` values (lowercase) treated as strength / lifting for the lifting tab.
 * @see https://developer.whoop.com/docs/developing/user-data/workout/
 */
export const WHOOP_LIFTING_SPORT_NAMES = [
  "weightlifting",
  "powerlifting",
  "strength trainer",
  "functional fitness",
] as const;

export function isWhoopLiftingSportName(sportName: string): boolean {
  const n = sportName.trim().toLowerCase();
  return (WHOOP_LIFTING_SPORT_NAMES as readonly string[]).includes(n);
}
