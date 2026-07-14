export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getLegacyInternshipExperimentMultiplier(value: Record<string, unknown>): number {
  if (!isObject(value.buffs) || !Array.isArray(value.buffs.permanent)) {
    return 1.25;
  }

  const internshipBuff = value.buffs.permanent.find((buff) =>
    isObject(buff)
    && buff.internshipBuff === true
    && typeof buff.value === "number"
    && Number.isFinite(buff.value)
    && buff.value > 0,
  );
  return internshipBuff && typeof internshipBuff.value === "number" ? internshipBuff.value : 1.25;
}

export function getLegacyJointTrainingCitationBonus(value: Record<string, unknown>): number {
  return typeof value.bigBullCitationBonusApplied === "number" && Number.isFinite(value.bigBullCitationBonusApplied)
    ? Math.max(0, Math.floor(value.bigBullCitationBonusApplied))
    : 0;
}
