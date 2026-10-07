import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabMonthlySalaryTotal, getLabPayroll, getNextMonthLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { getFellowFinanceAccount } from "../src/core/v2-fellow-finance";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
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
    expect(getLabPayroll(state).total).toBe(1.25);
    expect(getNextMonthLabPayroll(state).total).toBe(6);
    expect(getNextMonthLabPayroll({ ...state, fellowProgressState: [] }).total).toBe(1.25);
    expect(state).toEqual(before);
  });

  it("pays exact fractional wages into each enrolled fellow's wallet every month", () => {
    const state = makeState();
    state.totalMonths = 5;
    state.month = 5;
    expect(getLabMonthlySalaryTotal(state)).toBe(6);
    expect(getLabPayroll(state).total).toBe(6);
    const paid = settleLabPayroll(state);
    expect(paid.advisorProgressState.funding).toBe(94);
    expect(getLabPayroll(paid).total).toBe(6);
    expect(getLabMonthlySalaryTotal(paid)).toBe(6);
    expect(paid.fellowProgressState.map((profile) => getFellowFinanceAccount(paid, profile.id).money)).toEqual([0, 1.25, 3.5]);
    expect(paid.fellowProgressState.map((profile) => profile.monthlySalaryPaid)).toEqual([0, 1.25, 3.5]);
    const next = settleLabPayroll({ ...paid, totalMonths: 6, month: 6 });
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 2.5, 7]);
    expect(next.advisorProgressState.funding).toBe(88);
    expect(state.fellowFinanceAccounts).toEqual({});
  });

  it("includes a previously pre-enrollment fellow after their academic year advances", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, year: 2, month: 1, totalMonths: 13 })).toBe(7.25);
    expect(getNextMonthLabPayroll({ ...state, year: 1, month: 12, totalMonths: 12 }).total).toBe(7.25);
  });

  it("uses the player's degree and only fellows still present in the lab", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, degree: "phd" })).toBe(8.25);
    expect(getLabMonthlySalaryTotal({ ...state, fellowProgressState: [] })).toBe(1.25);
  });

  it("returns zero without an assigned advisor", () => {
    expect(getLabMonthlySalaryTotal({ ...makeState(), selectedAdvisorName: null })).toBe(0);
  });

  it.each([0, 1])("does not issue wages at enrollment month %s", (totalMonths) => {
    const state = { ...makeState(), totalMonths, month: totalMonths };
    expect(getLabPayroll(state).total).toBe(0);
    expect(settleLabPayroll(state)).toBe(state);
  });

  it("does not clamp lab debt or divert any wages when funds are insufficient", () => {
    const state = { ...makeState(), totalMonths: 5, month: 5 };
    state.advisorProgressState.funding = 0.1;
    const next = settleLabPayroll(state);
    expect(next.advisorProgressState.funding).toBe(-5.9);
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 1.25, 3.5]);
    expect(next.player.money).toBe(state.player.money);
  });

  it("previews and posts player and fellow wages using the same exact total", () => {
    const state = makeState();
    state.player.money = 0.1;
    const snapshot = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "advisor-salary"))
      .toMatchObject({ stats: { money: 1.25 }, appliedStats: { money: 1.25 }, note: "学生工资：科研经费 -6" });
    const paid = applyMonthlyEffects({ ...state, month: 5, totalMonths: 5 }).nextState;
    expect(paid.player.money).toBe(1.35);
    expect(paid.player.money).toBe(preview.player.money);
    expect(paid.advisorProgressState.funding).toBe(94);
    expect(paid.fellowProgressState.map((profile) => getFellowFinanceAccount(paid, profile.id).money)).toEqual([0, 1.25, 3.5]);
    expect(state).toEqual(snapshot);
  });
});
