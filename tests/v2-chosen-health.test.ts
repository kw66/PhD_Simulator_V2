import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getDesignedTalentNodes, getTalentPointBalance, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { initializeRoleTalents, applyRoleTalentPhdTransfer, settleRoleTalentDiseaseMilestones, settleRoleTalentMonthStart } from "../src/core/v2-role-talent-lifecycle";
import { normalizeRoleTalentIllnessProbability, yearlyResetRandomEventState } from "../src/core/v2-random-event-rules";
import { applyPlayerAttributeChange, getPlayerAttributeCap } from "../src/core/v2-player-attributes";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

function chosen(levels: Record<string, number>): GameState {
  return { ...createStartedGameState("chosen"), roleTalents: { levels }, illnessProbability: 0 };
}

describe("chosen rank-three start and resistance-free equalization", () => {
  it("permits a legal nine-point rank-three start and applies each rank", () => {
    const allocation = { "favored-by-fate": 3 };
    expect(sanitizeRoleTalentAllocation("chosen", 0, allocation)).toEqual(allocation);
    expect(sanitizeRoleTalentAllocation("chosen", 0, { "favored-by-fate": 4 })).toEqual(allocation);
    expect(getTalentPointBalance("chosen", 0, allocation)).toBe(1);
    const before = chosen(allocation);
    const after = initializeRoleTalents(before);
    for (const stat of ["research", "social", "favor", "money"] as const) {
      expect(after.player[stat] - before.player[stat]).toBe(3);
    }
  });

  it("equalizes fractional attributes without resistance while retaining attribute caps and ordinary resistance", () => {
    const before = chosen({ "complete-potential": 1 });
    before.player = { ...before.player, research: 3.5, social: 18.7, favor: 6.2 };
    const after = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(after.player).toMatchObject({ research: 18.7, social: 18.7, favor: 18.7 });
    expect(after.roleTalents?.growthTotals).toBeUndefined();
    expect(applyRoleTalentPhdTransfer(after, after)).toBe(after);
    expect(applyPlayerAttributeChange(before, "favor", 1).state.player.favor).toBeCloseTo(7);
    const capped = { ...before, roleTalents: { ...before.roleTalents!, capBonuses: { favor: -10 } } };
    expect(applyRoleTalentPhdTransfer(capped, { ...capped, degree: "phd" }).player.favor).toBe(getPlayerAttributeCap(capped, "favor"));
    expect(before.player.favor).toBe(6.2);
  });
});

describe("healthy mind negative illness milestones", () => {
  it.each([1, 2, 3])("grants SAN capacity only on new fifty-point milestones, rank %s", rank => {
    const before = chosen({ "healthy-mind": rank });
    const original = structuredClone(before);
    expect(settleRoleTalentDiseaseMilestones({ ...before, illnessProbability: -49.9 }).sanCap).toBe(before.sanCap);
    let after = settleRoleTalentDiseaseMilestones({ ...before, illnessProbability: -50 });
    expect(after.sanCap).toBe(before.sanCap + rank);
    expect(after.player).toEqual(before.player);
    expect(after.achievementProgress?.counters["san-cap-gain"]).toBe(rank);
    after = settleRoleTalentDiseaseMilestones({ ...after, illnessProbability: -205 });
    expect(after.sanCap).toBe(before.sanCap + 4 * rank);
    expect(after.roleTalents?.negativeDiseaseSanMilestone).toBe(4);
    expect(after.achievementProgress?.counters["san-cap-gain"]).toBe(4 * rank);
    expect(after.illnessProbability).toBe(-205);
    const saved = JSON.parse(JSON.stringify(after)) as GameState;
    expect(settleRoleTalentDiseaseMilestones(saved)).toBe(saved);
    const recovered = settleRoleTalentDiseaseMilestones({ ...saved, illnessProbability: 10 });
    expect(settleRoleTalentDiseaseMilestones({ ...recovered, illnessProbability: -200 }).sanCap).toBe(after.sanCap);
    expect(before).toEqual(original);
  });

  it("allows negative illness independently of the attribute talent in month starts and random events", () => {
    const before = { ...chosen({ "healthy-mind": 2, "fortunate-health": 5 }), totalMonths: 2, month: 2, illnessProbability: -45 };
    expect(normalizeRoleTalentIllnessProbability(before, -100.5)).toBe(-100.5);
    const after = settleRoleTalentMonthStart(before);
    expect(after.illnessProbability).toBe(-50);
    expect(after.sanCap).toBe(before.sanCap + 2);
    expect(after.player).toEqual(before.player);
    expect(yearlyResetRandomEventState(after).illnessProbability).toBe(-50);
    expect(settleRoleTalentMonthStart(after)).toBe(after);
    expect(normalizeRoleTalentIllnessProbability({ ...before, selectedRoleId: "normal" }, -50)).toBe(0);
  });

  it("settles the two talents independently and permits either fourth-column branch", () => {
    const health = { "athletic-prodigy": 1, "rare-color-fate": 1, "fortunate-health": 5, "healthy-mind": 3 };
    expect(sanitizeRoleTalentAllocation("chosen", 0, health)).toEqual(health);
    let state = chosen({ "misfortune-to-fortune": 1, "healthy-mind": 2 });
    state.player = { ...state.player, research: 0, social: 0, favor: 0 };
    state.illnessProbability = -100;
    state = settleRoleTalentDiseaseMilestones(state);
    expect(state.player).toMatchObject({ research: 2, social: 2, favor: 2 });
    expect(state.sanCap).toBe(24);
    expect(state.roleTalents?.negativeDiseaseMilestone).toBe(2);
    expect(state.roleTalents?.negativeDiseaseSanMilestone).toBe(2);
    const old = chosen({ "misfortune-to-fortune": 1, "healthy-mind": 2 });
    old.illnessProbability = -100;
    old.roleTalents!.negativeDiseaseMilestone = 2;
    const next = settleRoleTalentDiseaseMilestones(old);
    expect(next.player).toEqual(old.player);
    expect(next.sanCap).toBe(old.sanCap + 4);
  });

  it("preserves r38 talent definitions and excludes the new effect from old recordings", () => withGameplayRuleset("20261023-r38", () => {
    const nodes = getDesignedTalentNodes("chosen")!;
    expect(nodes).toHaveLength(10);
    expect(nodes.find(node => node.id === "favored-by-fate")?.maxLevel).toBe(2);
    expect(nodes.find(node => node.id === "complete-potential")?.effect).toContain("受抵抗影响");
    expect(nodes.find(node => node.id === "misfortune-to-fortune")?.row).toBe("2 / 4");
    expect(nodes.some(node => node.id === "healthy-mind")).toBe(false);
    const before = chosen({ "healthy-mind": 3 });
    before.illnessProbability = -100;
    expect(settleRoleTalentDiseaseMilestones(before)).toBe(before);
    expect(normalizeRoleTalentIllnessProbability(before, -100)).toBe(0);
  }));
});
