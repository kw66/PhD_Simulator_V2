import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { formatMoney, normalizeGameMoney, roundMoney } from "../src/core/v2-money";

describe("money rounding", () => {
  it.each([
    [1.005, 1.01], [10.075, 10.08], [-1.005, -1.01], [-10.075, -10.08],
    [1.004, 1], [-1.004, -1], [0.005, 0.01], [-0.005, -0.01],
    [1e-7, 0], [-1e-7, 0], [0.1 + 0.2, 0.3], [1.25, 1.25],
  ])("rounds %s to %s with ties away from zero", (amount, expected) => {
    expect(roundMoney(amount)).toBe(expected);
    expect(formatMoney(amount)).toBe(String(expected));
  });

  it("normalizes only monetary balances and preserves unaffected references", () => {
    const state = createStartedGameState("normal");
    state.player = { ...state.player, money: 1.005, research: 1.005 };
    state.advisorProgressState = { ...state.advisorProgressState, funding: -10.075, researchAccumulation: 10.075 };
    state.fellowFinanceAccounts = {
      changed: { name: "同学甲", money: 0.1 + 0.2 },
      unchanged: { name: "同学乙", money: 1.25 },
    };
    const snapshot = structuredClone(state);
    const next = normalizeGameMoney(state);
    expect(next.player).toMatchObject({ money: 1.01, research: 1.005 });
    expect(next.advisorProgressState).toMatchObject({ funding: -10.08, researchAccumulation: 10.075 });
    expect(next.fellowFinanceAccounts!.changed!.money).toBe(0.3);
    expect(next.fellowFinanceAccounts!.unchanged).toBe(state.fellowFinanceAccounts.unchanged);
    expect(next.fellowProgressState).toBe(state.fellowProgressState);
    expect(next.loverProgressState).toBe(state.loverProgressState);
    expect(next.log).toBe(state.log);
    expect(state).toEqual(snapshot);
    expect(normalizeGameMoney(next)).toBe(next);
  });

  it("returns the original state when all amounts already have two decimals", () => {
    const state = createStartedGameState("normal");
    expect(normalizeGameMoney(state)).toBe(state);
    expect(state.fellowFinanceAccounts).toEqual({});
    const withoutLedger = { ...state, fellowFinanceAccounts: undefined };
    expect(normalizeGameMoney(withoutLedger)).toBe(withoutLedger);
    const funded = { ...state, fellowFinanceAccounts: { fellow: { name: "同学", money: 1.25 } } };
    expect(normalizeGameMoney(funded)).toBe(funded);
    const walletOnly = { ...funded, fellowFinanceAccounts: { fellow: { name: "同学", money: 1.005 } } };
    const next = normalizeGameMoney(walletOnly);
    expect(next.player).toBe(walletOnly.player);
    expect(next.advisorProgressState).toBe(walletOnly.advisorProgressState);
  });

  it("rounds event transactions individually and preserves negative lab funding", () => {
    const state = createStartedGameState("normal");
    state.player.money = 1.01;
    state.advisorProgressState.funding = 1.01;
    const next = applyChoiceEffectsToState(state, {
      id: "money", label: "结算", outcome: "", effects: { money: -1.005, advisorProgressStateDeltas: { funding: -1.015 } },
    }).nextState;
    expect(next.player.money).toBe(0);
    expect(next.advisorProgressState.funding).toBe(-0.01);
  });
});
