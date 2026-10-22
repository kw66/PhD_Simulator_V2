import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { consumeActiveOperation, getActiveOperationAllowance, getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { paySanCost, quoteSanPayment } from "../src/core/v2-role-talent-costs";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { applyReadPaperActions, previewReadPaperAction } from "../src/core/v2-reading-system";
import { applyResearchOperation, createResearchPaper } from "../src/core/v2-research-operation";
import type { GameState } from "../src/core/v2-types";

function stateWith(levels: Record<string, number>): GameState {
  const initial = createInitialState();
  return { ...initial, phase: "playing", degree: "phd", totalMonths: 40, month: 1,
    roleTalents: { levels }, actionState: { used: 1, limit: 1, aiResearchBonusUsed: false },
    player: { ...initial.player, san: 0, money: 0 }, buffs: [], eventQueue: [] };
}

describe("role talent action costs", () => {
  it("combines alpha and beta for one real research action and cannot reuse either in the month", () => {
    const initial = createResearchPaper(stateWith({ "burning-life-alpha": 1, "burning-life-beta": 1 }), 0);
    const result = applyResearchOperation(initial, initial.papers[0]!.id, "idea", () => 0.5);
    expect(result.papers[0]!.idea).toBeGreaterThan(0);
    expect(result.player.san).toBe(0);
    expect(result.sanCap).toBe(initial.sanCap - 2);
    expect(result.roleTalents).toMatchObject({ alphaUsedMonth: 40, betaUsedMonth: 40 });
    expect(getActiveOperationAllowance(result, "idea").allowed).toBe(false);
    expect(quoteSanPayment(result, 2).allowed).toBe(false);
  });

  it("prefers regular actions and AI collaboration before alpha", () => {
    const state = stateWith({ "burning-life-alpha": 1 });
    state.player.san = 20;
    for (const slot of ["gpt", "deepseek", "doubao"] as const) {
      state.aiShopState.subscriptions[slot] = { ...state.aiShopState.subscriptions[slot], active: true,
        modelId: getAiModelForTotalMonths(state.totalMonths, slot).id };
    }
    const regular = consumeActiveOperation({ ...state, actionState: { ...state.actionState, used: 0 } }, "idea");
    expect(regular.actionState).toMatchObject({ used: 1, aiResearchBonusUsed: false });
    const ai = consumeActiveOperation(regular, "idea");
    expect(ai.actionState.aiResearchBonusUsed).toBe(true);
    expect(ai.roleTalents?.alphaUsedMonth).toBeUndefined();
    const talent = consumeActiveOperation(ai, "idea");
    expect(talent.roleTalents?.alphaUsedMonth).toBe(40);
    expect(talent.sanCap).toBe(ai.sanCap - 1);
  });

  it("requires the switch, accepts less than fifty coins and never overdraws coins", () => {
    const state = stateWith({ "gold-power-alpha": 1 });
    state.player.money = 4;
    expect(quoteSanPayment(state, 4).allowed).toBe(false);
    expect(paySanCost(state, 4)).toBe(state);
    state.roleTalents!.goldPowerEnabled = true;
    const paid = paySanCost(state, 4);
    expect(paid.player).toMatchObject({ money: 0, san: 0 });
    expect(paid.personalSpending).toBe(4);
    expect(quoteSanPayment(state, 4.01).allowed).toBe(false);
    expect(paySanCost(state, 4.01)).toBe(state);
    expect(state.player.money).toBe(4);
  });

  it("falls back to the full SAN payment when disabled or short of coins", () => {
    const state = stateWith({ "gold-power-alpha": 1 });
    state.player = { ...state.player, money: 2, san: 6 };
    state.roleTalents!.goldPowerEnabled = true;
    expect(paySanCost(state, 3).player).toMatchObject({ money: 2, san: 3 });
    expect(paySanCost({ ...state, roleTalents: { ...state.roleTalents!, goldPowerEnabled: false } }, 2).player)
      .toMatchObject({ money: 2, san: 4 });
    expect(paySanCost({ ...state, roleTalents: { levels: {}, goldPowerEnabled: true } }, 2).player)
      .toMatchObject({ money: 2, san: 4 });
  });

  it("retains automatic fifty-coin gold payments for r24 recordings", () => {
    const state = stateWith({ "gold-power-alpha": 1 });
    state.player.money = 50;
    withGameplayRuleset("20261022-r24", () => {
      expect(paySanCost(state, 4).player).toMatchObject({ money: 46, san: 0 });
      expect(quoteSanPayment({ ...state, player: { ...state.player, money: 49.99 } }, 4).allowed).toBe(false);
      expect(quoteSanPayment(state, 51).allowed).toBe(false);
    });
  });

  it("pays beta once for the whole manual multiple-paper action", () => {
    const state = stateWith({ "burning-life-alpha": 1, "burning-life-beta": 1 });
    state.buffs = [{ id: "extra-read", name: "extra", source: "test", timing: "permanent", remainingMonths: null,
      readingEffect: { manualExtraReads: 2 } }];
    expect(previewReadPaperAction(state).canRead).toBe(true);
    const result = applyReadPaperActions(state, 3, { consumeMonthlyAction: true, consumeMonthlyActionOnce: true });
    expect(result.appliedCount).toBe(3);
    expect(result.nextState.sanCap).toBe(state.sanCap - 2);
    expect(result.totalSanCost).toBe(0);
    expect(result.monthlyActionsUsed).toBe(1);
  });

  it("also groups event reading while month-start drains cannot consume beta", () => {
    const state = stateWith({ "burning-life-beta": 1 });
    const result = applyReadPaperActions(state, 3, { consumeMonthlyAction: false, allowSanOverdraw: true });
    expect(result.appliedCount).toBe(3);
    expect(result.nextState.player.san).toBe(0);
    expect(result.nextState.sanCap).toBe(state.sanCap - 1);
    const drained = paySanCost(state, 3, { allowOverdraw: true, allowBeta: false });
    expect(drained.player.san).toBe(-3);
    expect(drained.roleTalents?.betaUsedMonth).toBeUndefined();
  });

  it("does not consume alpha when the complete operation cannot afford its SAN", () => {
    const state = stateWith({ "burning-life-alpha": 1 });
    const result = applyReadPaperActions(state, 2, { consumeMonthlyAction: true, consumeMonthlyActionOnce: true });
    expect(result.appliedCount).toBe(0);
    expect(result.nextState).toBe(state);
  });

  it("preserves over-cap SAN on ordinary payment and never offers beta before the doctorate", () => {
    const state = stateWith({ "burning-life-beta": 1 });
    expect(paySanCost({ ...state, player: { ...state.player, san: 30 } }, 2).player.san).toBe(28);
    expect(quoteSanPayment({ ...state, degree: "master" }, 2).allowed).toBe(false);
  });
});
describe("fractional SAN payments", () => {
  it("quotes replacement money at the same cent precision that is actually charged", () => {
    const state = stateWith({ "gold-power-alpha": 1 });
    state.roleTalents!.goldPowerEnabled = true;
    state.player.money = 50;
    expect(quoteSanPayment(state, 1.235).moneyCost).toBe(1.24);
    expect(paySanCost(state, 1.235).player.money).toBe(48.76);
    expect(quoteSanPayment(state, 50.004)).toMatchObject({ moneyCost: 50, sanCost: 0, allowed: true });
    expect(quoteSanPayment(state, 50.006).allowed).toBe(false);
  });

  it("accepts exact decimal balances without allowing a genuine deficit", () => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, san: 0.7 - 0.6 } };
    expect(quoteSanPayment(state, 0.1).allowed).toBe(true);
    expect(paySanCost(state, 0.1).player.san).toBe(0);
    const deficit = { ...state, player: { ...state.player, san: 0.099 } };
    expect(quoteSanPayment(deficit, 0.1).allowed).toBe(false);
    expect(paySanCost(deficit, 0.1, { allowOverdraw: true }).player.san).toBe(-0.001);
    expect(withGameplayRuleset("20261020-r12", () => quoteSanPayment(state, 0.1)).allowed).toBe(false);
  });
});
