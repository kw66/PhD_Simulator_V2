import { describe, expect, it } from "vitest";

import { createDefaultRoleMetaProgress } from "../src/core/v2-lobby";
import {
  awardRoleExperience,
  getNextRoleLevelExperience,
  getRunExperienceGain,
  MAX_ROLE_LEVEL,
  ROLE_LEVEL_EXP_REQUIREMENTS,
} from "../src/core/v2-role-experience";

describe("role experience", () => {
  it("starts at level zero and uses the ten per-level experience requirements", () => {
    expect(createDefaultRoleMetaProgress("normal")).toMatchObject({ level: 0, exp: 0 });
    expect(ROLE_LEVEL_EXP_REQUIREMENTS).toEqual([20, 40, 80, 140, 220, 320, 440, 580, 640, 820]);
    expect(MAX_ROLE_LEVEL).toBe(10);
  });

  it("carries excess experience through multiple levels", () => {
    const result = awardRoleExperience(createDefaultRoleMetaProgress("normal"), 65);

    expect(result.gained).toBe(65);
    expect(result.progress).toMatchObject({ level: 2, exp: 5 });
    expect(getNextRoleLevelExperience(result.progress.level)).toBe(80);
  });

  it("keeps earning experience after reaching the final level", () => {
    const progress = { ...createDefaultRoleMetaProgress("normal"), level: 9, exp: 819 };

    const maxed = awardRoleExperience(progress, 2).progress;
    expect(maxed).toMatchObject({ level: MAX_ROLE_LEVEL, exp: 1 });
    expect(awardRoleExperience(maxed, 9).progress).toMatchObject({ level: MAX_ROLE_LEVEL, exp: 10 });
    expect(awardRoleExperience({ ...maxed, exp: Number.MAX_SAFE_INTEGER - 1 }, 2).progress.exp)
      .toBe(Number.MAX_SAFE_INTEGER);
    expect(getNextRoleLevelExperience(MAX_ROLE_LEVEL)).toBeNull();
    expect(getRunExperienceGain(-5)).toBe(0);
    expect(getRunExperienceGain(Number.NaN)).toBe(0);
  });
});
