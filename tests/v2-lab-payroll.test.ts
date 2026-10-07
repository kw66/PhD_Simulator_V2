import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabMonthlySalaryTotal, getLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 4, totalMonths: 4,
    advisorProgressState: { ...base.advisorProgressState, funding: 100,
      awards: [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }] },
    fellowProgressState: [0, 1, 4].map((academicYear) => createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: 4, academicYear,
      degree: academicYear === 4 ? "phd" : "master", research: 6, affinity: 1,
    })),
  };
}

describe("nominal lab monthly salaries", () => {
  it("includes current-month newcomers at their own degree rates and excludes year zero", () => {
    const state = makeState();
    const before = structuredClone(state);
    expect(getLabMonthlySalaryTotal(state)).toBe(6);
    expect(getLabPayroll(state).total).toBe(1);
    expect(state).toEqual(before);
  });

  it("ignores fractional remainders and keeps actual payroll accumulation unchanged", () => {
    const state = makeState();
    state.totalMonths = 5;
    state.month = 5;
    state.advisorProgressState.salaryRemainder = 0.5;
    state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, salaryRemainder: 0.5 }));
    expect(getLabMonthlySalaryTotal(state)).toBe(6);
    expect(getLabPayroll(state).total).toBe(6);
    const paid = settleLabPayroll(state);
    expect(paid.advisorProgressState.funding).toBe(94);
    expect(getLabPayroll(paid).total).toBe(7);
    expect(getLabMonthlySalaryTotal(paid)).toBe(6);
  });

  it("includes a previously pre-enrollment fellow after their academic year advances", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, year: 2, month: 1, totalMonths: 13 })).toBe(7.25);
  });

  it("uses the player's degree and only fellows still present in the lab", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, degree: "phd" })).toBe(8.25);
    expect(getLabMonthlySalaryTotal({ ...state, fellowProgressState: [] })).toBe(1.25);
  });

  it("returns zero without an assigned advisor", () => {
    expect(getLabMonthlySalaryTotal({ ...makeState(), selectedAdvisorName: null })).toBe(0);
  });
});
