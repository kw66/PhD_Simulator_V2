import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { addOrReplaceBuffs, consumeNextActionBuffs, getActionEffect, getActiveOperationSanCostForState } from "../src/core/v2-buffs";
import { createSlothSanBuff, getActualSanChange, getRoleMonthlySanCost } from "../src/core/v2-sanity-rules";
import { applyRoleTalentRest, getRoleRestSanGain } from "../src/core/v2-role-talent-rest";
import { consumeActiveOperation } from "../src/core/v2-ai-shop";
import { applyReadPaperActions } from "../src/core/v2-reading-system";
import { applyResearchOperation, createResearchPaper } from "../src/core/v2-research-operation";
import { getCareerPreparationSanCost } from "../src/core/v2-graduation-career";
import type { GameState } from "../src/core/v2-types";

function sloth(degree: GameState["degree"] = "master"): GameState {
  const initial = createInitialState();
  const state: GameState = { ...initial, phase: "playing", selectedRoleId: "normal-reversed", degree, month: 1, totalMonths: 1,
    eventQueue: [], roleTalents: { levels: { "sloth-core": 1 } }, player: { ...initial.player, san: 20, research: 1 } };
  return { ...state, buffs: addOrReplaceBuffs(state.buffs, [createSlothSanBuff(state)!]) };
}

describe("sloth SAN and resting talents", () => {
  it.each(["master", "phd"] as const)("applies %s curse before fixed discounts and leaves recovery unchanged", (degree) => {
    const state = sloth(degree);
    const multiplier = degree === "master" ? 2 : 3;
    const buffs = [...state.buffs,
      { id: "illness-work-penalty-flu", name: "ill", source: "test", timing: "monthly" as const, remainingMonths: 1, activeOperationSanMultiplier: 2 },
      { id: "lover-play-discount", name: "date", source: "test", timing: "monthly" as const, remainingMonths: 1, activeOperationSanDelta: -1 }];
    expect(getActiveOperationSanCostForState({ ...state, buffs }, 3, "experiment", -1)).toBe(3 * (multiplier + 1) - 2);
    expect(getActualSanChange(-3, 1, state.eventSupport, buffs)).toBe(-(3 * (multiplier + 1) - 1));
    expect(getActualSanChange(3, 1, state.eventSupport, buffs)).toBe(3);
    expect(getRoleMonthlySanCost(state, 1)).toBe(multiplier);
    expect(getCareerPreparationSanCost(state, "internet")).toBe(4 * multiplier);
  });

  it("reading pays the curse exactly once per paper", () => {
    const state = sloth("phd");
    const result = applyReadPaperActions(state, 2, { consumeMonthlyAction: true, consumeMonthlyActionOnce: true });
    expect(result.totalSanCost).toBe(12);
    expect(result.nextState.player.san).toBe(8);
  });

  it("adds resting recovery and stacks independent next-action score bonuses", () => {
    const state = sloth();
    state.player.san = 0;
    state.roleTalents!.levels = { "restful-idle": 3, "coffee-lifeline": 3 };
    expect(getRoleRestSanGain(state)).toBe(5);
    const twice = applyRoleTalentRest(applyRoleTalentRest(state));
    expect(twice.player.san).toBe(10);
    expect(getActionEffect(twice, "idea").bonus).toBe(6);
    expect(getActionEffect(twice, "experiment").bonus).toBe(6);
    const consumed = consumeNextActionBuffs(twice, "idea");
    expect(getActionEffect(consumed, "idea").bonus).toBe(0);
    expect(getActionEffect(consumed, "experiment").bonus).toBe(6);
    expect(getActionEffect(consumed, "writing").bonus).toBe(6);
  });

  it("year-summary recovery fills SAN without charging an action or adding a second base rest", () => {
    const state = sloth();
    state.player.san = 4;
    state.roleTalents!.levels = { "year-summary-recovery": 1, "coffee-lifeline": 1 };
    const result = applyRoleTalentRest(state, { yearSummary: true });
    expect(result.player.san).toBe(20);
    expect(result.actionState).toEqual(state.actionState);
    expect(getActionEffect(result, "writing").bonus).toBe(1);
    expect(applyRoleTalentRest({ ...state, roleTalents: { levels: {} } }, { yearSummary: true }).player.san).toBe(4);
  });

  it("records real regular actions independently of debug action-point modifications", () => {
    const state = sloth();
    state.actionState.limit = 5;
    const result = consumeActiveOperation(state, "rest");
    expect(result.roleTalents?.regularActionsSpent).toBe(1);
    expect(consumeActiveOperation(result, "rest").roleTalents?.regularActionsSpent).toBe(2);
    expect(state.roleTalents?.regularActionsSpent).toBeUndefined();
  });

  it("snapshots full-SAN effective research before the research operation pays its SAN", () => {
    let state = sloth();
    state.roleTalents!.levels["full-san-research"] = 1;
    state = createResearchPaper(state, 0);
    const result = applyResearchOperation(state, state.papers[0]!.id, "idea", () => 0);
    expect(result.papers[0]!.idea).toBe(3);
    expect(result.player.research).toBe(1);
    expect(result.player.san).toBe(16);
  });
});
