import { describe, expect, it } from "vitest";

import { getActionEffect, getActiveOperationSanCost, getActiveOperationSanMultiplier } from "../src/core/v2-buffs";
import { createInitialState } from "../src/core/v2-engine";
import {
  applyReadPaperActions,
  applyReadingCountProgress,
  createReadingState,
  getPendingReadingIdeaBonus,
  getReadPaperSanCost,
} from "../src/core/v2-reading-system";

describe("v2 reading system", () => {
  it("creates the reading counters", () => {
    expect(createReadingState()).toEqual({
      readCount: 0,
    });
  });

  it("applies the illness multiplier before monitor and seasonal discounts", () => {
    const initial = createInitialState();
    const illnessBuff = {
      id: "flu",
      name: "主动操作 SAN ×2",
      source: "流感来袭",
      timing: "monthly" as const,
      remainingMonths: null,
      activeOperationSanMultiplier: 2,
    };
    const spring = {
      ...initial,
      phase: "playing" as const,
      month: 8,
      shopState: { ...initial.shopState, monitorOwned: true },
      buffs: [illnessBuff],
    };

    expect(getReadPaperSanCost(spring)).toEqual({ baseSanCost: 2, illnessMultiplier: 2, sanCost: 2 });
    const neutral = { ...spring, month: 1 };
    expect(getReadPaperSanCost(neutral).sanCost).toBe(3);
  });

  it("performs event reading twice without consuming monthly actions", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      month: 1,
      totalMonths: 13,
      actionState: { used: 1, limit: 1, aiResearchBonusUsed: false },
      player: { ...initial.player, san: 10 },
    };
    const resolved = applyReadPaperActions(state, 2, {
      consumeMonthlyAction: false,
      allowSanOverdraw: true,
      writeLog: false,
      source: "帮忙审稿",
    });

    expect(resolved.appliedCount).toBe(2);
    expect(resolved.monthlyActionsUsed).toBe(0);
    expect(resolved.nextState.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: false });
    expect(resolved.nextState.readingState.readCount).toBe(2);
    expect(resolved.nextState.player.san).toBe(6);
    expect(resolved.totalIdeaBonus).toBe(2);
    expect(getActionEffect(resolved.nextState, "idea").bonus).toBe(2);
    expect(getPendingReadingIdeaBonus(resolved.nextState)).toBe(2);
  });

  it("adds research on the 10th reading and can advance only the shared reading counter", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      readingState: { ...initial.readingState, readCount: 9 },
      player: { ...initial.player, research: 1, san: 10 },
    };
    const counterOnly = applyReadingCountProgress(state, 1);

    expect(counterOnly.nextState.readingState.readCount).toBe(10);
    expect(counterOnly.nextState.player.research).toBe(2);
    expect(counterOnly.nextState.player.san).toBe(10);
    expect(counterOnly.nextState.buffs).toEqual(state.buffs);

    const normalRead = applyReadPaperActions(state, 1, {
      consumeMonthlyAction: false,
      allowSanOverdraw: true,
      writeLog: false,
    });
    expect(normalRead.nextState.readingState.readCount).toBe(10);
    expect(normalRead.researchGain).toBe(1);
  });

  it("settles multiple manual reads as one monthly action", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      month: 1,
      actionState: { used: 0, limit: 1, aiResearchBonusUsed: false },
      player: { ...initial.player, san: 10 },
      buffs: [{
        id: "ai-kimi",
        name: "Kimi k1.5",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        readingEffect: { sanDelta: -1, manualExtraReads: 1 },
      }],
    };
    const resolved = applyReadPaperActions(state, 2, {
      consumeMonthlyAction: true,
      consumeMonthlyActionOnce: true,
      allowSanOverdraw: false,
      writeLog: false,
    });

    expect(resolved).toMatchObject({ appliedCount: 2, monthlyActionsUsed: 1, totalSanCost: 2 });
    expect(resolved.nextState.actionState).toEqual({ used: 1, limit: 1, aiResearchBonusUsed: false });
    expect(resolved.nextState.readingState.readCount).toBe(2);
    expect(resolved.nextState.player.san).toBe(8);
  });

  it("blocks an atomic manual reading group when SAN cannot cover every read", () => {
    const initial = createInitialState();
    const state = {
      ...initial,
      phase: "playing" as const,
      month: 1,
      actionState: { used: 0, limit: 1, aiResearchBonusUsed: false },
      player: { ...initial.player, san: 1 },
      buffs: [{
        id: "ai-kimi",
        name: "Kimi k1.5",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        readingEffect: { sanDelta: -1, manualExtraReads: 1 },
      }],
    };
    const resolved = applyReadPaperActions(state, 2, {
      consumeMonthlyAction: true,
      consumeMonthlyActionOnce: true,
      allowSanOverdraw: false,
      writeLog: false,
    });

    expect(resolved).toMatchObject({ appliedCount: 0, monthlyActionsUsed: 0, blockedReason: "insufficient-san" });
    expect(resolved.nextState).toBe(state);
  });

  it("defines the illness multiplier for every requested active operation", () => {
    const buffs = [{
      id: "fever",
      name: "主动操作 SAN ×2.5",
      source: "高烧不退",
      timing: "monthly" as const,
      remainingMonths: null,
      activeOperationSanMultiplier: 2.5,
    }];
    for (const operation of ["read", "idea", "experiment", "writing", "relationship-task", "relationship-chat"] as const) {
      expect(getActiveOperationSanMultiplier(buffs, operation)).toBe(2.5);
      expect(getActiveOperationSanCost(1, buffs, operation)).toBe(3);
    }
  });

  it("combines simultaneous illness multipliers by percentage offsets", () => {
    const createIllnessBuff = (id: string, multiplier: number) => ({
      id,
      name: id,
      source: "测试",
      timing: "monthly" as const,
      remainingMonths: null,
      activeOperationSanMultiplier: multiplier,
    });

    expect(getActiveOperationSanMultiplier([
      createIllnessBuff("first", 1.5),
      createIllnessBuff("second", 1.5),
    ], "read")).toBe(2);
    expect(getActiveOperationSanMultiplier([
      createIllnessBuff("first", 0.5),
      createIllnessBuff("second", 0.5),
    ], "read")).toBe(0);
  });
});
