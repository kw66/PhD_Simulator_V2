import { afterEach, describe, expect, it, vi } from "vitest";
import * as advisorProgress from "../src/core/v2-advisor-progress";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getFellowFinanceAccount } from "../src/core/v2-fellow-finance";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabPayroll, getNextMonthLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

function fixture(): GameState {
  const base = createStartedGameState("teacher-child");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 5, totalMonths: 5,
    roleTalents: { levels: { "resource-tilt": 1 } },
    advisorProgressState: { ...base.advisorProgressState, funding: 100,
      awards: [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }] },
    fellowProgressState: [0, 1, 4].map((academicYear) => createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: 4, academicYear,
      degree: academicYear === 4 ? "phd" : "master", research: 6, affinity: 1,
    })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("teacher-child resource tilt payroll", () => {
  it("moves half a coin from each paid fellow without changing wages or subsidy totals", () => {
    const state = fixture();
    const before = structuredClone(state);
    const baseline = getLabPayroll({ ...state, roleTalents: { levels: {} } });
    const payroll = getLabPayroll(state);
    expect(payroll.player.payment).toBe(2.5);
    expect(payroll.fellows.map(payment => payment.payment)).toEqual([0, 1, 3]);
    expect(payroll.total).toBe(baseline.total);
    expect(payroll.schoolContribution).toBe(baseline.schoolContribution);
    expect(payroll.advisorCost).toBe(baseline.advisorCost);
    expect(payroll.total).toBe(payroll.player.payment + payroll.fellows.reduce((sum, fellow) => sum + fellow.payment, 0));
    expect(state).toEqual(before);
  });

  it("credits the player once through monthly effects and posts reduced fellow salaries", () => {
    const state = fixture();
    const payrollOnly = settleLabPayroll(state);
    expect(payrollOnly.player.money).toBe(state.player.money);
    const paid = applyMonthlyEffects(state).nextState;
    expect(paid.player.money).toBe(state.player.money + 2.5 - 1);
    expect(paid.fellowProgressState.map(profile => profile.monthlySalaryPaid)).toEqual([0, 1, 3]);
    expect(paid.fellowProgressState.map(profile => getFellowFinanceAccount(paid, profile.id).money)).toEqual([0, 0, 2]);
    expect(paid.advisorProgressState.funding).toBe(95.5);
    expect(paid.labFinanceLedger?.amounts["student-wages"]).toBe(-4.5);
  });

  it("uses the transferred wages in forecasts without changing live state", () => {
    const state = { ...fixture(), totalMonths: 4, month: 4 };
    const before = structuredClone(state);
    expect(getLabPayroll(state).player.payment).toBe(1.5);
    const payroll = getNextMonthLabPayroll(state);
    const preview = previewNextMonthEffects(state);
    expect(payroll.player.payment).toBe(2.5);
    expect(preview.items.find(item => item.id === "advisor-salary")?.stats.money).toBe(2.5);
    expect(preview.player.money).toBe(applyMonthlyEffects({ ...state, month: 5, totalMonths: 5 }).nextState.player.money);
    expect(state).toEqual(before);
  });

  it("caps the transfer at actual wages and computes school shares before the transfer", () => {
    vi.spyOn(advisorProgress, "getAdvisorSalaryPayment").mockImplementation((_advisor, degree) => ({ payment: degree === "phd" ? 3 : 0.25 }));
    const state = fixture();
    state.degree = "phd";
    state.fellowProgressState = [state.fellowProgressState[1]!];
    const baseline = getLabPayroll({ ...state, roleTalents: { levels: {} } });
    expect(getLabPayroll(state)).toEqual({ player: { payment: 3.25 },
      fellows: [{ id: state.fellowProgressState[0]!.id, payment: 0 }],
      total: baseline.total, schoolContribution: baseline.schoolContribution, advisorCost: baseline.advisorCost });
    expect(baseline.schoolContribution).toBe(1.5);
  });

  it.each(["no-advisor", "first-month", "newcomer", "pre-enrollment"])("does not create a transfer for unpaid fellows: %s", scenario => {
    const state = fixture();
    if (scenario === "no-advisor") state.selectedAdvisorName = null;
    if (scenario === "first-month") state.totalMonths = state.month = 1;
    if (scenario === "newcomer") state.totalMonths = state.month = 4;
    if (scenario === "pre-enrollment") state.fellowProgressState = [state.fellowProgressState[0]!];
    expect(getLabPayroll(state)).toEqual(getLabPayroll({ ...state, roleTalents: { levels: {} } }));
  });

  it("keeps older recordings and other roles unchanged", () => {
    const state = fixture();
    const baseline = getLabPayroll({ ...state, roleTalents: { levels: {} } });
    expect(withGameplayRuleset("20261023-r37", () => getLabPayroll(state))).toEqual(baseline);
    expect(getLabPayroll({ ...state, selectedRoleId: "social" })).toEqual(baseline);
  });

  it("stops taking a fellow's wage after departure", () => {
    const state = fixture();
    state.fellowProgressState = state.fellowProgressState.slice(0, 2);
    expect(getLabPayroll(state).player.payment).toBe(2);
    expect(getLabPayroll({ ...state, fellowProgressState: [] }).player.payment).toBe(1.5);
  });
});
