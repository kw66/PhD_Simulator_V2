import { describe, expect, it } from "vitest";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { applyPlayerAttributeChange, getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import type { GameState } from "../src/core/v2-types";

function player(role: GameState["selectedRoleId"], levels: Record<string, number>): GameState {
  return { ...createInitialState(), selectedRoleId: role, roleTalents: { levels }, phase: "playing" };
}

describe("shared player attribute settlement", () => {
  it("reverse meters ease growth and resist loss independently for all attributes", () => {
    for (const [stat, id] of [["research", "reverse-meter-alpha"], ["social", "reverse-meter-beta"], ["favor", "reverse-meter-gamma"]] as const) {
      for (const rank of [0, 1, 2, 3]) for (const [value, resistance] of [[1, 0], [6, 0.2], [12, 0.4], [18, 0.6]]) {
        const state = player("chosen-reversed", { [id]: rank });
        state.player[stat] = value!;
        expect(previewPlayerAttributeChange(state, stat, 1).effectiveChange).toBeCloseTo(1 - Math.max(0, resistance! - rank * 0.1));
        expect(previewPlayerAttributeChange(state, stat, -1).effectiveChange).toBeCloseTo(-(1 - resistance! - rank * 0.1));
        expect(previewPlayerAttributeChange(state, stat, 1, "swap").effectiveChange).toBe(1);
        expect(previewPlayerAttributeChange(state, stat, -1, "swap").effectiveChange).toBe(-1);
        expect(previewPlayerAttributeChange(state, stat, -1, "reset").effectiveChange).toBe(-1);
        const legacy = withGameplayRuleset("20261023-r42", () => previewPlayerAttributeChange(state, stat, -1).effectiveChange);
        expect(legacy).toBeCloseTo(-(1 - Math.max(0, resistance! - rank * 0.1)));
      }
    }
  });
  it.each([1, 2, 3])("reduces only reversed genius research growth resistance by ten points per rank: %s", rank => {
    const state = player("genius-reversed", { "research-resilience": rank, "work-life-balance": 1 });
    state.player = { ...state.player, research: 18, social: 18, favor: 18, san: 3 };
    const grown = applyPlayerAttributeChange(state, "research", 1).state;
    expect(grown.player.research).toBeCloseTo(18.4 + rank * 0.1);
    expect(grown.player.san).toBe(3);
    expect(grown.sanCap).toBe(state.sanCap);
    expect(previewPlayerAttributeChange(state, "research", -1).effectiveChange).toBe(-0.4);
    expect(previewPlayerAttributeChange(state, "social", 1).effectiveChange).toBe(0.4);
    expect(previewPlayerAttributeChange(state, "favor", 1).effectiveChange).toBe(0.4);
    expect(previewPlayerAttributeChange({ ...state, player: { ...state.player, research: 1 } }, "research", 1).effectiveChange).toBe(1);
    expect(previewPlayerAttributeChange({ ...state, player: { ...state.player, research: 19.9 } }, "research", 1).effectiveChange).toBe(0.1);
    expect(withGameplayRuleset("20261023-r39", () => previewPlayerAttributeChange(state, "research", 1).effectiveChange)).toBe(0.4);
  });

  it("does not spend gold to protect favor or social in the current rules", () => {
    const state = player("rich", { "gold-power-alpha": 1, "gold-power-beta": 1, "gold-power-gamma": 1 });
    state.roleTalents!.goldPowerEnabled = true;
    state.player = { ...state.player, favor: 18, social: 18, money: 100 };
    for (const stat of ["favor", "social"] as const) {
      const next = applyPlayerAttributeChange(state, stat, -1).state;
      expect(next.player[stat]).toBe(17.6);
      expect(next.player.money).toBe(100);
      expect(next.personalSpending).toBe(state.personalSpending);
    }
  });
  it("subtracts percentage points only in the intended direction and never below zero", () => {
    const state = player("chosen", { "lasting-fortune": 3 });
    state.player.research = 18;
    expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(0.7);
    expect(previewPlayerAttributeChange(state, "research", -1).effectiveChange).toBe(-0.4);
    state.player.research = 1;
    expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(1);
  });

  it("rereads tiers during equalization and leaves ordinary reward counters untouched", () => {
    for (const [level, expected] of [[1, 17.2], [2, 18.4], [3, 19]]) {
      const state = player("chosen", { "lasting-fortune": level! });
      state.player.social = 6;
      const next = applyPlayerAttributeChange(state, "social", 14, "equalize").state;
      expect(next.player.social).toBe(expected);
      expect(next.roleTalents?.growthTotals).toBeUndefined();
    }
  });

  it("applies each fortune rank to all three growth attributes without changing losses or bypassing caps", () => {
    for (const rank of [0, 1, 2, 3]) {
      const state = player("chosen", { "lasting-fortune": rank });
      for (const [current, base] of [[1, 1], [6, 0.8], [12, 0.6], [18, 0.4]]) {
        for (const stat of ["research", "social", "favor"] as const) {
          state.player[stat] = current!;
          expect(previewPlayerAttributeChange(state, stat, 1).effectiveChange).toBeCloseTo(Math.min(1, base! + rank * 0.1));
          expect(previewPlayerAttributeChange(state, stat, -1).effectiveChange).toBeCloseTo(-base!);
          state.player[stat] = 19.9;
          expect(previewPlayerAttributeChange(state, stat, 1).effectiveChange).toBeCloseTo(0.1);
          state.player[stat] = 20;
          expect(previewPlayerAttributeChange(state, stat, 1).effectiveChange).toBe(0);
        }
      }
    }
  });

  it("preserves twenty-point fortune reduction and equalization for r30 recordings", () => withGameplayRuleset("20261023-r30", () => {
    for (const [rank, expected] of [[1, 18.4], [2, 19.6], [3, 20]]) {
      const state = player("chosen", { "lasting-fortune": rank! });
      state.player.social = 6;
      expect(applyPlayerAttributeChange(state, "social", 14, "equalize").state.player.social).toBe(expected);
      state.player.research = 18;
      expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBeCloseTo(0.4 + rank! * 0.2);
    }
  }));

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

  it("preserves legacy gold conversion of resisted favor loss in r24 recordings", () => withGameplayRuleset("20261022-r24", () => {
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
  }));

  it("preserves permitted swap overflow through later ordinary changes and exempts resets", () => {
    let state = player("chosen-reversed", { "reverse-meter-alpha": 3, "swap-breaks-cap": 1 });
    state.player.research = 18;
    state = applyPlayerAttributeChange(state, "research", 40, "swap").state;
    expect(state.player.research).toBe(58);
    expect(getPlayerAttributeCap(state, "research")).toBe(20);
    state = applyPlayerAttributeChange(state, "research", 1).state;
    expect(state.player.research).toBe(58);
    state = applyPlayerAttributeChange(state, "research", -1).state;
    expect(state.player.research).toBe(57.9);
    state = applyPlayerAttributeChange(state, "research", -57.9, "reset").state;
    expect(state.player.research).toBe(0);
  });
});
