import type { RoleMetaProgress } from "./v2-types";

export const ROLE_LEVEL_EXP_REQUIREMENTS = [20, 40, 80, 140, 220, 320, 440, 580, 640, 820] as const;
export const MAX_ROLE_LEVEL = ROLE_LEVEL_EXP_REQUIREMENTS.length;
export const ROLE_INITIAL_TALENT_POINTS = 10;
export const ROLE_TALENT_POINTS_PER_LEVEL = 1;
export const DEFAULT_ROLE_EXP_GAIN_MULTIPLIER = 1;

export function getNextRoleLevelExperience(level: number): number | null {
  return ROLE_LEVEL_EXP_REQUIREMENTS[level] ?? null;
}

export function getRunExperienceGain(researchScore: number, multiplier = DEFAULT_ROLE_EXP_GAIN_MULTIPLIER): number {
  if (!Number.isFinite(researchScore) || researchScore <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(researchScore * Math.max(1, multiplier)));
}

export function awardRoleExperience(
  progress: RoleMetaProgress,
  researchScore: number,
  multiplier = DEFAULT_ROLE_EXP_GAIN_MULTIPLIER,
): { progress: RoleMetaProgress; gained: number } {
  const gained = getRunExperienceGain(researchScore, multiplier);
  let level = progress.level;
  let exp = Math.min(Number.MAX_SAFE_INTEGER, progress.exp + gained);

  while (level < MAX_ROLE_LEVEL && exp >= ROLE_LEVEL_EXP_REQUIREMENTS[level]!) {
    exp -= ROLE_LEVEL_EXP_REQUIREMENTS[level]!;
    level += 1;
  }

  return {
    progress: { ...progress, level, exp },
    gained,
  };
}
