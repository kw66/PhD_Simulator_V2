/** Removed from the live catalogue; historical records are retained. */
export const RETIRED_ACHIEVEMENT_IDS = [
  "global:no-first-conference-graduation",
  "global:help-collector",
  "global:balanced-company",
  "global:travel-kit",
] as const;

const retired = new Set<string>(RETIRED_ACHIEVEMENT_IDS);
export function isRetiredAchievementId(id: string): boolean {
  return retired.has(id);
}
