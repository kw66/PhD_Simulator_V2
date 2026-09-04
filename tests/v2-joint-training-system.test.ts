import { describe, expect, it } from "vitest";

import { getJointTrainingCitationCapBonus } from "../src/core/v2-joint-training-system";

describe("v2 joint training system", () => {
  it("exposes the citation-cap thresholds without applying monthly mutation", () => {
    expect(getJointTrainingCitationCapBonus(0)).toBe(0);
    expect(getJointTrainingCitationCapBonus(1600)).toBe(6);
  });
});
