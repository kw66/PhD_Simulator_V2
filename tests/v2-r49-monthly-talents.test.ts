import { describe, expect, it, vi } from "vitest";
import { consumeActiveOperation, getActiveOperationAllowance } from "../src/core/v2-ai-shop";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { applyPlayerAttributeChange, getPlayerAttributeCap } from "../src/core/v2-player-attributes";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { settleRoleTalentMonthEnd, settleRoleTalentMonthStart } from "../src/core/v2-role-talent-lifecycle";
import { getDesignedTalentNodes } from "../src/core/v2-role-talent-definitions";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, RoleId } from "../src/core/v2-types";

function playing(role: RoleId, levels: Record<string, number> = {}): GameState {
  const state = createInitialState();
  return { ...state, phase: "playing", selectedRoleId: role, totalMonths: 1,
    ...getCalendarForTotalMonths(1), roleTalents: { levels },
    player: { ...state.player, research: 3, social: 3, favor: 3, money: 100, san: 12 } };
}

function atMonth(state: GameState, totalMonths: number): GameState {
  return { ...state, totalMonths, ...getCalendarForTotalMonths(totalMonths, state.degree) };
}

function stagnant(state: GameState, months: number): GameState {
  return { ...state, roleTalents: { ...state.roleTalents!, socialStagnantMonths: months } };
}

describe("r49 日渐圆润 monthly limits", () => {
  it.each([1, 2])("gains %i SAN cap per unused regular action without recovering current SAN", (rank) => {
    const state = playing("normal-reversed", { "san-cap-reserve": rank });
    state.roleTalents = { ...state.roleTalents!, regularActionBudget: 3, regularActionsSpent: 1 };
    const after = settleRoleTalentMonthEnd(state);
    expect(after.sanCap).toBe(state.sanCap + 2 * rank);
    expect(after.roleTalents?.sanCapReserveBonus).toBe(2 * rank);
    expect(after.player.san).toBe(state.player.san);
    expect(settleRoleTalentMonthEnd(after)).toBe(after);
    expect(settleRoleTalentMonthEnd({ ...state, totalMonths: 0 })).toEqual({ ...state, totalMonths: 0 });
  });

  it.each([1, 2])("caps lifetime rank %i gains and does not refill the allowance after SAN cap loss", (rank) => {
    const state = playing("normal-reversed", { "san-cap-reserve": rank });
    state.roleTalents = { ...state.roleTalents!, regularActionBudget: 99, regularActionsSpent: 0 };
    const capped = settleRoleTalentMonthEnd(state);
    expect(capped.sanCap).toBe(state.sanCap + 10 * rank);
    expect(capped.roleTalents?.sanCapReserveBonus).toBe(10 * rank);
    const damaged = atMonth({ ...capped, sanCap: capped.sanCap - 5 }, 2);
    const after = settleRoleTalentMonthEnd(damaged);
    expect(after.sanCap).toBe(damaged.sanCap);
    expect(after.roleTalents?.sanCapReserveBonus).toBe(10 * rank);
  });

  it("clips rank-two gains to the remaining lifetime allowance", () => {
    const state = playing("normal-reversed", { "san-cap-reserve": 2 });
    state.roleTalents = { ...state.roleTalents!, sanCapReserveBonus: 19, regularActionBudget: 2 };
    const after = settleRoleTalentMonthEnd(state);
    expect(after.sanCap).toBe(state.sanCap + 1);
    expect(after.roleTalents?.sanCapReserveBonus).toBe(20);
  });

  it("excludes an unused or consumed AI bonus from regular action accounting", () => {
    const state = playing("normal-reversed", { "san-cap-reserve": 2 });
    state.actionState = { ...state.actionState, limit: 1, used: 0 };
    state.roleTalents = { ...state.roleTalents!, regularActionBudget: 1, regularActionsSpent: 0 };
    for (const [slot, modelId] of [["gpt", "gpt-3.5"], ["gemini", "gemini-1.5"], ["deepseek", "deepseek-v2"]] as const) {
      state.aiShopState.subscriptions[slot] = { ...state.aiShopState.subscriptions[slot], active: true, modelId };
    }
    const regularSpent = consumeActiveOperation(state, "idea");
    expect(regularSpent.roleTalents?.regularActionsSpent).toBe(1);
    expect(getActiveOperationAllowance(regularSpent, "idea").usesAiResearchBonus).toBe(true);
    expect(settleRoleTalentMonthEnd(regularSpent).sanCap).toBe(state.sanCap);
    const bonusSpent = consumeActiveOperation(regularSpent, "idea");
    expect(bonusSpent.actionState.aiResearchBonusUsed).toBe(true);
    expect(bonusSpent.roleTalents?.regularActionsSpent).toBe(1);
    expect(settleRoleTalentMonthEnd(bonusSpent).sanCap).toBe(state.sanCap);
  });

  it("previews the rank-two gain without mutating lifetime accounting", () => {
    const state = playing("normal-reversed", { "san-cap-reserve": 2 });
    const snapshot = structuredClone(state);
    expect(previewNextMonthEffects(state).items.find(item => item.id === "monthly-role-idle-cap")?.label).toBe("SAN上限 +2");
    expect(state).toEqual(snapshot);
  });
});

describe("r62 患得患失 monthly timing", () => {
  it("waits four complete unchanged months and restarts the streak after each curse", () => {
    let state = playing("social-reversed");
    const getRoll = vi.fn(() => { throw new Error("r62 stagnation must not draw randomness"); });
    for (let current = 1; current <= 4; current += 1) {
      state = settleRoleTalentMonthStart(atMonth(state, current), getRoll);
      expect(state.player.research).toBe(3);
      expect(state.player.favor).toBe(3);
      state = settleRoleTalentMonthEnd(state);
      expect(state.roleTalents?.socialStagnantMonths).toBe(current);
      expect(settleRoleTalentMonthEnd(state)).toBe(state);
    }
    state = settleRoleTalentMonthStart(atMonth(state, 5), getRoll);
    expect(state.player.research).toBe(2);
    expect(state.player.social).toBe(2);
    expect(state.player.favor).toBe(3);
    expect(state.roleTalents?.socialChangedMonth).toBe(5);
    expect(state.roleTalents?.lastStagnationCurseMonth).toBe(5);
    expect(settleRoleTalentMonthStart(state, getRoll)).toBe(state);
    state = settleRoleTalentMonthEnd(state);
    expect(state.roleTalents?.socialStagnantMonths).toBe(0);
    for (let current = 6; current <= 9; current += 1) {
      state = settleRoleTalentMonthStart(atMonth(state, current), getRoll);
      expect(state.player.research).toBe(2);
      expect(state.player.social).toBe(2);
      expect(state.player.favor).toBe(3);
      state = settleRoleTalentMonthEnd(state);
      expect(state.roleTalents?.socialStagnantMonths).toBe(current - 5);
    }
    state = settleRoleTalentMonthStart(atMonth(state, 10), getRoll);
    expect(state.player.research).toBe(1);
    expect(state.player.social).toBe(1);
    expect(state.player.favor).toBe(3);
    expect(state.roleTalents?.socialChangedMonth).toBe(10);
    expect(settleRoleTalentMonthEnd(state).roleTalents?.socialStagnantMonths).toBe(0);
    expect(getRoll).not.toHaveBeenCalled();
  });

  it.each([1, -1])("resets the streak after actual social movement of %i", (change) => {
    const state = stagnant(atMonth(playing("social-reversed"), 5), 4);
    const changed = applyPlayerAttributeChange(state, "social", change).state;
    expect(changed.player.social).not.toBe(state.player.social);
    expect(changed.roleTalents?.socialChangedMonth).toBe(5);
    const end = settleRoleTalentMonthEnd(changed);
    expect(end.roleTalents?.socialStagnantMonths).toBe(0);
    const next = settleRoleTalentMonthStart(atMonth(end, 6));
    expect(next.player.research).toBe(state.player.research);
    expect(next.player.favor).toBe(state.player.favor);
  });

  it("does not reset from an attempted capped social gain with zero actual movement", () => {
    const state = stagnant(atMonth(playing("social-reversed"), 4), 3);
    state.player.social = getPlayerAttributeCap(state, "social");
    const changed = applyPlayerAttributeChange(state, "social", 1).state;
    expect(changed.player.social).toBe(state.player.social);
    expect(changed.roleTalents?.socialChangedMonth).not.toBe(4);
    const end = settleRoleTalentMonthEnd(changed);
    expect(end.roleTalents?.socialStagnantMonths).toBe(4);
    const next = settleRoleTalentMonthStart(atMonth(end, 5));
    expect(next.player.research).toBe(state.player.research - 1);
    expect(next.player.social).toBeLessThan(state.player.social);
    expect(next.player.favor).toBe(state.player.favor);
  });

  it("applies ordinary tier resistance separately to research and social and resets from a fractional loss", () => {
    const state = stagnant(atMonth(playing("social-reversed"), 5), 4);
    state.player = { ...state.player, research: 6, social: 18 };
    const after = settleRoleTalentMonthStart(state);
    expect(after.player.research).toBeCloseTo(5.2);
    expect(after.player.social).toBeCloseTo(17.6);
    expect(after.player.favor).toBe(state.player.favor);
    expect(after.roleTalents?.lossTotals?.research).toBeCloseTo(0.8);
    expect(after.roleTalents?.lossTotals?.social).toBeCloseTo(0.4);
    expect(after.roleTalents?.socialChangedMonth).toBe(5);
    expect(settleRoleTalentMonthEnd(after).roleTalents?.socialStagnantMonths).toBe(0);
  });

  it("previews both deterministic losses after month four and preserves the source state", () => {
    const state = stagnant(atMonth(playing("social-reversed"), 4), 3);
    state.player = { ...state.player, research: 6, social: 18 };
    const snapshot = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    const effect = preview.items.find(item => item.id === "monthly-role-stagnation");
    expect(effect).toMatchObject({ name: "患得患失", stats: { research: -0.8, social: -0.4 }, appliedStats: { research: -0.8, social: -0.4 } });
    expect(effect?.label).toBeUndefined();
    expect(preview.totals.research).toBeCloseTo(-0.8);
    expect(preview.totals.social).toBeCloseTo(-0.4);
    expect(preview.player.research).toBeCloseTo(5.2);
    expect(preview.player.social).toBeCloseTo(17.6);
    expect(preview.player.favor).toBe(state.player.favor);
    expect(previewNextMonthEffects(state)).toEqual(preview);
    expect(state).toEqual(snapshot);
    expect(previewNextMonthEffects(stagnant(atMonth(state, 3), 2)).items.some(item => item.id === "monthly-role-stagnation")).toBe(false);
  });

  it("previews actual negative research and social instead of hiding lethal risks", () => {
    const state = stagnant(atMonth(playing("social-reversed"), 4), 3);
    state.player = { ...state.player, research: 0.2, social: 0.5 };
    const preview = previewNextMonthEffects(state);
    expect(preview.player.research).toBeCloseTo(-0.8);
    expect(preview.player.social).toBeCloseTo(-0.5);
    expect(preview.player.favor).toBe(state.player.favor);
    expect(preview.items.find(item => item.id === "monthly-role-stagnation")?.appliedStats).toEqual({ research: -1, social: -1 });
  });

  it("settles social-loss talent rewards once and includes them in the monthly preview", () => {
    const state = stagnant(atMonth(playing("social-reversed", { "social-loss-coins": 2 }), 4), 3);
    const snapshot = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    const next = settleRoleTalentMonthStart(atMonth(settleRoleTalentMonthEnd(state), 5));
    expect(next.player.money).toBe(state.player.money + 2);
    expect(next.roleTalents?.socialLossRemainder).toBe(0);
    expect(settleRoleTalentMonthStart(next)).toBe(next);
    expect(preview.items.find(item => item.id === "monthly-role-stagnation")?.appliedStats).toEqual({ research: -1, social: -1, money: 2 });
    expect(state).toEqual(snapshot);
  });

  it.each(["20261024-r49", "20261105-r61"] as const)("preserves consecutive research/favor penalties and copy for %s replays", (ruleset) => {
    withGameplayRuleset(ruleset, () => {
      const state = stagnant(atMonth(playing("social-reversed"), 4), 3);
      const preview = previewNextMonthEffects(state);
      expect(preview.items.find(item => item.id === "monthly-role-stagnation")?.appliedStats).toEqual({ research: -1, favor: -1 });
      const fifth = settleRoleTalentMonthStart(atMonth(settleRoleTalentMonthEnd(state), 5));
      expect(fifth.player).toMatchObject({ research: 2, social: 3, favor: 2 });
      expect(settleRoleTalentMonthEnd(fifth).roleTalents?.socialStagnantMonths).toBe(5);
      const sixth = settleRoleTalentMonthStart(atMonth(settleRoleTalentMonthEnd(fifth), 6));
      expect(sixth.player).toMatchObject({ research: 1, social: 3, favor: 1 });
      expect(getDesignedTalentNodes("social-reversed")?.find(node => node.id === "social-stagnation")?.effect)
        .toBe("连续4个月社交未变化，下月初科研和导师好感-1");
    });
  });

  it.each([[0, "research", "favor"], [0.9, "favor", "research"]] as const)("preserves the r48 random branch for roll %s", (roll, reduced, unaffected) => {
    withGameplayRuleset("20261024-r48", () => {
      const state = stagnant(atMonth(playing("social-reversed"), 3), 2);
      const getRoll = vi.fn(() => roll);
      const after = settleRoleTalentMonthStart(state, getRoll);
      expect(getRoll).toHaveBeenCalledTimes(1);
      expect(after.player[reduced]).toBe(state.player[reduced] - 1);
      expect(after.player[unaffected]).toBe(state.player[unaffected]);
      const previewRoll = vi.fn(() => { throw new Error("preview must not draw randomness"); });
      settleRoleTalentMonthStart(state, previewRoll, { skipSwaps: true });
      expect(previewRoll).not.toHaveBeenCalled();
      const preview = previewNextMonthEffects(stagnant(atMonth(state, 2), 1));
      expect(preview.items.find(item => item.id === "monthly-role-stagnation")?.label).toBe("科研/好感随机 -1");
    });
  });
});
