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
  it.each([59.99, 60, 60.01])("uses one funding snapshot at %s for every salary, independent of roster order", (funding) => {
    for (const degree of ["master", "phd"] as const) {
      const state = { ...makeState(), degree, totalMonths: 5, month: 5 };
      state.advisorProgressState.funding = funding;
      const masterPayment = funding >= 60 ? 1.5 : 1;
      const phdPayment = funding >= 60 ? 3.5 : 2.5;
      const playerPayment = degree === "master" ? masterPayment : phdPayment;
      const total = playerPayment + masterPayment + phdPayment;
      const before = structuredClone(state);
      const payroll = getLabPayroll(state);
      expect(payroll).toEqual({ player: { payment: playerPayment },
        fellows: state.fellowProgressState.map((profile, index) => ({ id: profile.id,
          payment: [0, masterPayment, phdPayment][index] })), total });
      const paid = applyMonthlyEffects(state).nextState;
      const reversed = applyMonthlyEffects({ ...state, fellowProgressState: [...state.fellowProgressState].reverse() }).nextState;
      expect(paid.advisorProgressState.funding).toBe(Number((funding - total).toFixed(2)));
      expect(paid.player.money).toBe(state.player.money + playerPayment - 1);
      expect(paid.fellowProgressState.map((profile) => getFellowFinanceAccount(paid, profile.id).money))
        .toEqual([0, masterPayment - 1, phdPayment - 1]);
      expect(reversed.fellowFinanceAccounts).toEqual(paid.fellowFinanceAccounts);
      expect(reversed.player).toEqual(paid.player);
      expect(reversed.advisorProgressState.funding).toBe(paid.advisorProgressState.funding);
      expect(state).toEqual(before);
    }
  });

  it("recomputes next-month bonuses live without changing the already paid month", () => {
    const state = makeState();
    state.advisorProgressState.funding = 60;
    const preview = getNextMonthLabPayroll(state);
    expect(preview.total).toBe(6.5);
    const paid = applyMonthlyEffects({ ...state, month: 5, totalMonths: 5 }).nextState;
    expect(paid.advisorProgressState.funding).toBe(53.5);
    expect(paid.fellowProgressState.map((profile) => profile.monthlySalaryPaid)).toEqual([0, 1.5, 3.5]);
    const before = structuredClone(paid);
    expect(getNextMonthLabPayroll(paid).total).toBe(4.5);
    expect(previewNextMonthEffects(paid).items.find((item) => item.id === "advisor-salary")?.stats.money).toBe(1);
    expect(getNextMonthLabPayroll({ ...paid, advisorProgressState: { ...paid.advisorProgressState, funding: 60 } }).total).toBe(6.5);
    expect(paid).toEqual(before);
  });

  it("updates bonus-inclusive previews for transfer, departure and September enrollment", () => {
    const state = makeState();
    state.advisorProgressState.funding = 60;
    const fellow = { ...state.fellowProgressState[1]!, academicYear: 3, initialResearchScore: 3 };
    state.fellowProgressState = [fellow];
    state.totalMonths = 10;
    state.month = 10;
    const before = structuredClone(state);
    expect(getNextMonthLabPayroll(state)).toEqual({ player: { payment: 1.5 },
      fellows: [{ id: fellow.id, payment: 3.5 }], total: 5 });
    expect(getNextMonthLabPayroll({ ...state, fellowProgressState: [{ ...fellow, initialResearchScore: 1 }] }))
      .toEqual({ player: { payment: 1.5 }, fellows: [], total: 1.5 });
    const waiting = { ...state, month: 12, totalMonths: 12,
      fellowProgressState: [{ ...fellow, academicYear: 0 }] };
    expect(getLabPayroll(waiting).total).toBe(1.5);
    expect(getNextMonthLabPayroll(waiting)).toEqual({ player: { payment: 1.5 },
      fellows: [{ id: fellow.id, payment: 1.5 }], total: 3 });
    expect(state).toEqual(before);
  });

  it.each([59.99, 60])("does not apply student salary or bonuses to year-zero family support at funding %s", (funding) => {
    const state = { ...makeState(), month: 5, totalMonths: 5 };
    state.advisorProgressState.funding = funding;
    const fellow = state.fellowProgressState[0]!;
    state.fellowProgressState = [fellow];
    const paid = applyMonthlyEffects(state).nextState;
    expect(getFellowFinanceAccount(paid, fellow.id).money).toBe(0);
    expect(paid.fellowProgressState[0]!.monthlySalaryPaid).toBe(0);
    expect(paid.advisorProgressState.funding).toBe(Number((funding - (funding >= 60 ? 1.5 : 1)).toFixed(2)));
    expect(paid.player.money).toBe(state.player.money + (funding >= 60 ? 0.5 : 0));
  });

  it("includes current-month newcomers at their own degree rates and excludes year zero", () => {
    const state = makeState();
    const before = structuredClone(state);
    expect(getLabMonthlySalaryTotal(state)).toBe(1.5 + 1.5 + 3.5);
    expect(getLabPayroll(state).total).toBe(1.5);
    expect(getNextMonthLabPayroll(state).total).toBe(6.5);
    expect(getNextMonthLabPayroll({ ...state, fellowProgressState: [] }).total).toBe(1.5);
    expect(state).toEqual(before);
  });

  it("pays base wages plus funding bonuses and living costs into each enrolled fellow's wallet every month", () => {
    const state = makeState();
    state.totalMonths = 5;
    state.month = 5;
    expect(getLabMonthlySalaryTotal(state)).toBe(6.5);
    expect(getLabPayroll(state).total).toBe(6.5);
    const paid = settleLabPayroll(state);
    expect(paid.advisorProgressState.funding).toBe(100 - 6.5);
    expect(getLabPayroll(paid).total).toBe(6.5);
    expect(getLabMonthlySalaryTotal(paid)).toBe(6.5);
    expect(paid.fellowProgressState.map((profile) => getFellowFinanceAccount(paid, profile.id).money)).toEqual([0, 0.5, 2.5]);
    expect(paid.fellowProgressState.map((profile) => profile.monthlySalaryPaid)).toEqual([0, 1.5, 3.5]);
    const next = settleLabPayroll({ ...paid, totalMonths: 6, month: 6 });
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 1, 5]);
    expect(next.advisorProgressState.funding).toBe(100 - 2 * 6.5);
    expect(state.fellowFinanceAccounts).toEqual({});
  });

  it("includes a previously pre-enrollment fellow after their academic year advances", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, year: 2, month: 1, totalMonths: 13 })).toBe(8);
    expect(getNextMonthLabPayroll({ ...state, year: 1, month: 12, totalMonths: 12 }).total).toBe(8);
  });

  it("uses the player's degree and only fellows still present in the lab", () => {
    const state = makeState();
    expect(getLabMonthlySalaryTotal({ ...state, degree: "phd" })).toBe(3.5 + 1.5 + 3.5);
    expect(getLabMonthlySalaryTotal({ ...state, fellowProgressState: [] })).toBe(1.5);
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
    expect(next.advisorProgressState.funding).toBe(0.1 - 1 - 1 - 2.5);
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 0, 1.5]);
    expect(next.player.money).toBe(state.player.money);
  });

  it("previews and posts player and fellow wages using the same exact total", () => {
    const state = makeState();
    state.player.money = 0.1;
    const snapshot = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "advisor-salary"))
      .toMatchObject({ stats: { money: 1.5 }, appliedStats: { money: 1.5 } });
    const paid = applyMonthlyEffects({ ...state, month: 5, totalMonths: 5 }).nextState;
    expect(paid.player.money).toBe(0.6);
    expect(paid.player.money).toBe(preview.player.money);
    expect(paid.advisorProgressState.funding).toBe(93.5);
    expect(paid.fellowProgressState.map((profile) => getFellowFinanceAccount(paid, profile.id).money)).toEqual([0, 0.5, 2.5]);
    expect(state).toEqual(snapshot);
  });

  it("does not deduct living costs in a fellow's joining month or from departed accounts", () => {
    const state = makeState();
    state.fellowFinanceAccounts = { departed: { name: "离校同学", money: 3 } };
    const paid = settleLabPayroll(state);
    expect(paid.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
    expect(paid.fellowProgressState.map((profile) => profile.monthlySalaryPaid)).toEqual([0, 0, 0]);
    expect(paid.advisorProgressState.funding).toBe(98.5);
  });

  it("preserves genuine fellow debt without clamping or transferring extra lab funding", () => {
    const state = { ...makeState(), totalMonths: 5, month: 5 };
    const fellow = state.fellowProgressState[1]!;
    state.fellowFinanceAccounts = { [fellow.id]: { name: "同学", money: -1 } };
    const paid = settleLabPayroll(state);
    expect(getFellowFinanceAccount(paid, fellow.id).money).toBe(-0.5);
    expect(paid.advisorProgressState.funding).toBe(93.5);
    const noAdvisor = settleLabPayroll({ ...state, selectedAdvisorName: null });
    expect(getFellowFinanceAccount(noAdvisor, fellow.id).money).toBe(-2);
    expect(noAdvisor.advisorProgressState.funding).toBe(100);
  });

  it("settles year-zero family support against living costs, then replaces it with enrolled salary", () => {
    const state = { ...makeState(), totalMonths: 5, month: 5 };
    const fellow = state.fellowProgressState[0]!;
    state.fellowProgressState = [fellow];
    state.fellowFinanceAccounts = { [fellow.id]: { name: "研0", money: -0.25 } };
    const supported = settleLabPayroll(state);
    expect(getFellowFinanceAccount(supported, fellow.id).money).toBe(-0.25);
    expect(supported.fellowProgressState[0]!.monthlySalaryPaid).toBe(0);
    expect(supported.advisorProgressState.funding).toBe(98.5);
    const enrolled = settleLabPayroll({ ...supported, year: 2, month: 1, totalMonths: 13 });
    expect(enrolled.fellowProgressState[0]!.monthlySalaryPaid).toBe(1.5);
    expect(getFellowFinanceAccount(enrolled, fellow.id).money).toBe(0.25);
    expect(enrolled.advisorProgressState.funding).toBe(98.5 - 3);
  });
});
