import { describe, expect, it } from "vitest";

import {
  getLabTalentActionBonus,
  getLabTalentTeamSize,
  isLabTalentActive,
} from "../src/core/v2-lab-talent";

describe("v2 lab talent", () => {
  it("activates only when advisor, senior and junior are all present", () => {
    const inactiveState = {
      unlockedSlots: 4,
      occupiedSlots: 3,
      advisorCount: 1,
      seniorCount: 1,
      juniorCount: 0,
      peerCount: 1,
      loverCount: 0,
      mentorshipStacks: 0,
    };
    const activeState = {
      ...inactiveState,
      juniorCount: 1,
    };

    expect(isLabTalentActive(inactiveState)).toBe(false);
    expect(isLabTalentActive(activeState)).toBe(true);
    expect(getLabTalentTeamSize(activeState)).toBe(3);
    expect(getLabTalentActionBonus(activeState)).toBe(3);
  });
});
