import { describe, expect, it } from "vitest";

import { getJointTrainingCitationCapBonus } from "../src/core/v2-joint-training-system";

describe("v2 joint training system", () => {
  it.each([
    [-1, 1], [0, 1], [299, 1], [300, 2], [599, 2], [600, 3], [899, 3], [900, 4], [1199, 4], [1200, 5], [1600, 5],
  ])("awards the capped research bonus for %s citations", (citations, bonus) => {
    expect(getJointTrainingCitationCapBonus(citations)).toBe(bonus);
  });
});
