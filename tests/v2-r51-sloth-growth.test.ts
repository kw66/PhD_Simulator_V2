import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { getDesignedTalentNodes, getTalentPointBalance, getTalentUpgradeReason, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { initializeRoleTalents, settleRoleTalentYearEnd } from "../src/core/v2-role-talent-lifecycle";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

const attributes = ["research", "social", "favor"] as const;
const allocation = { "sloth-head-start": 1, "post-phd-growth": 1, "sloth-annual-growth": 1 };
const at = (state: GameState, totalMonths: number): GameState => ({ ...state, totalMonths, ...getCalendarForTotalMonths(totalMonths, state.degree) });
const caps = (state: GameState) => [state.sanCap, ...attributes.map(stat => getPlayerAttributeCap(state, stat))];
function playing(totalMonths = 12, levels: Record<string, number> = { "sloth-annual-growth": 1 }): GameState {
  const state = createInitialState();
  return at({ ...state, phase: "playing", selectedRoleId: "normal-reversed", maxMonths: 70, roleTalents: { levels },
    player: { ...state.player, research: 1, social: 2, favor: 3, san: 12, money: 100 } }, totalMonths);
}

describe("r51 sloth growth branch", () => {
  it("opens the starting talent independently and charges seven points for the annual path", () => {
    expect(getTalentUpgradeReason("normal-reversed", 0, {}, "sloth-head-start")).toBeNull();
    expect(sanitizeRoleTalentAllocation("normal-reversed", 0, allocation)).toEqual(allocation);
    expect(getTalentPointBalance("normal-reversed", 0, allocation)).toBe(3);
    expect(getTalentUpgradeReason("normal-reversed", 0, {}, "sloth-annual-growth")).not.toBeNull();
    expect(getTalentUpgradeReason("normal-reversed", 0, { "sloth-head-start": 1 }, "sloth-annual-growth")).not.toBeNull();
    expect(getTalentUpgradeReason("normal-reversed", 0, { "sloth-head-start": 1, "post-phd-growth": 1 }, "sloth-annual-growth")).toBeNull();
    expect(sanitizeRoleTalentAllocation("normal-reversed", 0, { ...allocation, "sloth-annual-growth": 3 })["sloth-annual-growth"]).toBe(1);
    expect(sanitizeRoleTalentAllocation("normal-reversed", 0, { "post-phd-growth": 1, "sloth-annual-growth": 1 })["sloth-annual-growth"]).toBeUndefined();
  });

  it("places the three growth talents on the middle row and totals 34 points", () => {
    const nodes = getDesignedTalentNodes("normal-reversed")!;
    expect(nodes.find(node => node.id === "sloth-head-start")).toMatchObject({ column: "1", row: "2", tier: 0, cost: 2, maxLevel: 5, prerequisiteIds: [] });
    expect(nodes.find(node => node.id === "post-phd-growth")).toMatchObject({ column: "2", row: "2", tier: 1, cost: 2, maxLevel: 2, prerequisiteIds: ["sloth-head-start"] });
    expect(nodes.find(node => node.id === "sloth-annual-growth")).toMatchObject({ name: "岁岁有成", column: "3", row: "2", tier: 2, cost: 3, maxLevel: 1, prerequisiteIds: ["post-phd-growth"] });
    expect(nodes.filter(node => !node.fixed)).toHaveLength(10);
    expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(34);
    expect(new Set(nodes.map(node => node.column + ":" + node.row)).size).toBe(nodes.length);
  });

  it.each(["master", "phd"] as const)("grows all three attributes once per completed %s academic year", degree => {
    const state = { ...playing(), degree };
    expect(settleRoleTalentYearEnd(at(state, 1))).toEqual(at(state, 1));
    expect(settleRoleTalentYearEnd(at(state, 11))).toEqual(at(state, 11));
    expect(initializeRoleTalents(at(state, 1)).player).toEqual(state.player);
    const first = settleRoleTalentYearEnd(state);
    expect(first.player).toEqual({ ...state.player, research: 2, social: 3, favor: 4 });
    expect(caps(first)).toEqual(caps(state));
    expect(settleRoleTalentYearEnd(first)).toBe(first);
    const second = settleRoleTalentYearEnd(at(first, 24));
    for (const stat of attributes) expect(second.player[stat]).toBeCloseTo(first.player[stat] + previewPlayerAttributeChange(first, stat, 1).effectiveChange);
    expect(caps(second)).toEqual(caps(first));
  });

  it("uses ordinary resistance and caps without raising SAN, money or ceilings", () => {
    const state = playing();
    state.player = { ...state.player, research: 6, social: 20, favor: 19.8 };
    const after = settleRoleTalentYearEnd(state);
    expect(after.player.research).toBeCloseTo(6.8);
    expect(after.player.social).toBe(20);
    expect(after.player.favor).toBeCloseTo(20);
    expect(after.player.san).toBe(state.player.san);
    expect(after.player.money).toBe(state.player.money);
    expect(caps(after)).toEqual(caps(state));
  });

  it("previews the named annual reward without mutating or double-settling it", () => {
    const state = playing();
    const snapshot = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find(item => item.id === "annual-role-growth")).toMatchObject({ name: "岁岁有成", appliedStats: { research: 1, social: 1, favor: 1 } });
    expect(state).toEqual(snapshot);
    expect(previewNextMonthEffects(state)).toEqual(preview);
    const settled = settleRoleTalentYearEnd(state);
    for (const stat of attributes) expect(preview.player[stat]).toBe(settled.player[stat]);
    expect(previewNextMonthEffects(settled).items.some(item => item.id === "annual-role-growth")).toBe(false);
    expect(previewNextMonthEffects(playing(11)).items.some(item => item.id === "annual-role-growth")).toBe(false);
  });

  it("requires the talent and keeps the reward specific to sloth", () => {
    const empty = playing(12, {});
    expect(settleRoleTalentYearEnd(empty).player).toEqual(empty.player);
    const other = { ...playing(), selectedRoleId: "normal" as const };
    expect(settleRoleTalentYearEnd(other).player).toEqual(other.player);
  });

  it.each(["20261024-r49", "20261024-r50"] as const)("preserves old layouts and no annual reward in %s replay", ruleset => {
    withGameplayRuleset(ruleset, () => {
      const nodes = getDesignedTalentNodes("normal-reversed")!;
      expect(nodes.find(node => node.id === "sloth-head-start")).toMatchObject({ column: "2", row: "2", prerequisiteIds: ["monthly-san-recovery"] });
      expect(nodes.find(node => node.id === "post-phd-growth")).toMatchObject({ column: "3", row: "2" });
      expect(nodes.find(node => node.id === "sloth-annual-growth")).toBeUndefined();
      expect(nodes.reduce((sum, node) => sum + node.cost * node.maxLevel, 0)).toBe(31);
      expect(getTalentUpgradeReason("normal-reversed", 0, {}, "sloth-head-start")).not.toBeNull();
      const state = playing();
      expect(settleRoleTalentYearEnd(state).player).toEqual(state.player);
      expect(previewNextMonthEffects(state).items.some(item => item.id === "annual-role-growth")).toBe(false);
    });
  });
});
