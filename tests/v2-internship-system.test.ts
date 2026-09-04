import { describe, expect, it } from "vitest";

import {
  activateInternship,
  getInternshipMonthlyIncome,
  increaseInternshipExperimentMultiplier,
} from "../src/core/v2-internship-system";

describe("v2 internship system", () => {
  it("activates internship with the audited base multiplier", () => {
    const state = activateInternship();

    expect(state).toEqual({
      active: true,
      remainingMonths: 6,
      experimentMultiplier: 1.25,
    });
  });

  it("grows active internship multiplier by 0.05 per enterprise follow-up", () => {
    const nextState = increaseInternshipExperimentMultiplier(activateInternship());

    expect(nextState.experimentMultiplier).toBe(1.3);
  });

  it("uses the audited monthly income formula", () => {
    expect(getInternshipMonthlyIncome(2, 1200)).toBe(3);
  });
});
