import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { applyPlayerAttributeChange, getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import type { GameState } from "../src/core/v2-types";

function player(role: GameState["selectedRoleId"], levels: Record<string, number>): GameState {
  return { ...createInitialState(), selectedRoleId: role, roleTalents: { levels }, phase: "playing" };
}

describe("shared player attribute settlement", () => {
  it("subtracts percentage points only in the intended direction and never below zero", () => {
    const state = player("chosen", { "lasting-fortune": 3 });
    state.player.research = 18;
    expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(1);
    expect(previewPlayerAttributeChange(state, "research", -1).effectiveChange).toBe(-0.4);
    state.player.research = 1;
    expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(1);
  });

  it("rereads tiers during equalization and leaves ordinary reward counters untouched", () => {
    for (const [level, expected] of [[1, 18.4], [2, 19.6], [3, 20]]) {
      const state = player("chosen", { "lasting-fortune": level! });
      state.player.social = 6;
      const next = applyPlayerAttributeChange(state, "social", 14, "equalize").state;
      expect(next.player.social).toBe(expected);
      expect(next.roleTalents?.growthTotals).toBeUndefined();
    }
  });

  it("raises each cap once per reward, retains overflow within the new cap and has no lifetime limit", () => {
    let state = player("normal", { breakthrough: 1 });
    state.player = { ...state.player, research: 20, social: 20, favor: 20 };
    for (const stat of ["research", "social", "favor"] as const) {
      state = applyPlayerAttributeChange(state, stat, 100).state;
      expect(state.player[stat]).toBe(21);
      expect(getPlayerAttributeCap(state, stat)).toBe(21);
      for (let i = 0; i < 11; i++) state = applyPlayerAttributeChange(state, stat, 100).state;
      expect(state.player[stat]).toBe(32);
      expect(getPlayerAttributeCap(state, stat)).toBe(32);
      expect(state.roleTalents?.breakthroughCounts?.[stat]).toBe(12);
    }
  });

  it("keeps fractional breakthrough overflow, with preview matching settlement", () => {
    const state = player("normal", { breakthrough: 1 });
    state.player.research = 20;
    const preview = previewPlayerAttributeChange(state, "research", 1);
    expect(preview).toMatchObject({ effectiveChange: 0.4, capIncrease: 1, cappedCount: 0 });
    const settled = applyPlayerAttributeChange(state, "research", 1);
    expect(settled.result).toEqual(preview);
    expect(settled.state.player.research).toBe(20.4);
    expect(getPlayerAttributeCap(settled.state, "research")).toBe(21);
    expect(previewPlayerAttributeChange(state, "research", 1, "equalize").capIncrease).toBe(0);
    expect(previewPlayerAttributeChange(state, "research", -1).capIncrease).toBe(0);
  });

  it("mentor expectations reduce only favor growth resistance at each rank", () => {
    for (const rank of [1, 2, 3]) {
      const state = player("teacher-child", { "mentor-expectations": rank });
      state.player.favor = state.player.research = 18;
      expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBeCloseTo(0.4 + rank * 0.1);
      expect(previewPlayerAttributeChange(state, "favor", -1).effectiveChange).toBe(-0.4);
      expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(0.4);
      state.player.favor = 1;
      expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBe(1);
    }
  });

  it("converts actual resisted loss, checks the balance every time and counts no replaced loss", () => {
    let state = player("rich", { "gold-power-beta": 1 });
    state.player.favor = 18;
    state.player.money = 50;
    state = applyPlayerAttributeChange(state, "favor", -1).state;
    expect(state.player.favor).toBe(18);
    expect(state.player.money).toBe(49.2);
    expect(state.personalSpending).toBe(0.8);
    expect(state.roleTalents?.lossTotals?.favor).toBe(0);
    state = applyPlayerAttributeChange(state, "favor", -1).state;
    expect(state.player.favor).toBe(17.6);
    expect(state.player.money).toBe(49.2);
  });

  it("preserves permitted swap overflow through later ordinary changes and exempts resets", () => {
    let state = player("chosen-reversed", { "reverse-meter-alpha": 3, "swap-breaks-cap": 1 });
    state.player.research = 18;
    state = applyPlayerAttributeChange(state, "research", 40, "swap").state;
    expect(state.player.research).toBe(46);
    expect(getPlayerAttributeCap(state, "research")).toBe(20);
    state = applyPlayerAttributeChange(state, "research", 1).state;
    expect(state.player.research).toBe(46);
    state = applyPlayerAttributeChange(state, "research", -1).state;
    expect(state.player.research).toBe(45.3);
    state = applyPlayerAttributeChange(state, "research", -45.3, "reset").state;
    expect(state.player.research).toBe(0);
  });
});
