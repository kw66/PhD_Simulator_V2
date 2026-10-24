import { afterEach, describe, expect, it, vi } from "vitest";
import * as gameRandomSource from "../src/core/v2-game-random";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { getPlayerAttributeCap } from "../src/core/v2-player-attributes";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

function playing(totalMonths: number, levels: Record<string, number> = {}): GameState {
  const state = createInitialState();
  return { ...state, phase: "playing", selectedRoleId: "chosen-reversed", totalMonths,
    ...getCalendarForTotalMonths(totalMonths), maxMonths: 70, roleTalents: { levels },
    player: { ...state.player, research: 3, social: 3, favor: 3, money: 100, san: 12 } };
}

const capItem = (state: GameState) => previewNextMonthEffects(state).items.find(item => item.id === "monthly-role-curse-cap");
const attributes = ["research", "social", "favor"] as const;
const caps = (state: GameState) => attributes.map(stat => getPlayerAttributeCap(state, stat));
afterEach(() => vi.restoreAllMocks());

describe("r50 fantasy monthly cap previews", () => {
  it.each([[1, "SAN上限"], [5, "科研上限"], [6, "社交上限"], [7, "导师好感上限"]] as const)(
    "shows the cap loss after month %i without attributing it to player stats", (month, name) => {
      const state = playing(month);
      const preview = previewNextMonthEffects(state);
      const item = preview.items.find(entry => entry.id === "monthly-role-curse-cap");
      expect(item).toMatchObject({ name: "命运反噬", label: name + " -1", stats: {}, appliedStats: {} });
      expect(item?.note).toBe("下月初" + name + "：20→19");
      expect(preview.totals.research).toBe(0);
      expect(preview.totals.social).toBe(0);
      expect(preview.totals.favor).toBe(0);
      expect(preview.player.research).toBe(state.player.research);
      expect(preview.player.social).toBe(state.player.social);
      expect(preview.player.favor).toBe(state.player.favor);
    });

  it.each([[2, "research"], [3, "social"], [4, "favor"]] as const)(
    "keeps month %i current-attribute loss in its own resisted total", (month, stat) => {
      const state = playing(month, { "reverse-meter-alpha": 2, "reverse-meter-beta": 2, "reverse-meter-gamma": 2 });
      const preview = previewNextMonthEffects(state);
      expect(preview.items.some(item => item.id === "monthly-role-curse-cap")).toBe(false);
      expect(preview.items.find(item => item.id === "monthly-role-growth")?.appliedStats).toEqual({ [stat]: -0.8 });
      expect(preview.totals[stat]).toBeCloseTo(-0.8);
    });

  it.each([[1, "SAN上限"], [5, "科研上限"], [6, "社交上限"], [7, "导师好感上限"]] as const)(
    "shows a zero floor without promising another loss after month %i", (month, name) => {
      const state = playing(month);
      state.sanCap = 0;
      state.researchCapacityState = { ...state.researchCapacityState, otherCapBonus: -20 };
      state.roleTalents = { ...state.roleTalents!, capBonuses: { social: -20, favor: -20 } };
      expect(capItem(state)).toMatchObject({ label: name + "不变（已达下限）", note: "下月初" + name + "：0→0", stats: {}, appliedStats: {} });
    });

  it("shows a fractional remainder exactly instead of claiming a full point loss", () => {
    const state = playing(1);
    state.sanCap = 0.4;
    expect(capItem(state)).toMatchObject({ label: "SAN上限 -0.4", note: "下月初SAN上限：0.4→0" });
  });

  it("preserves current attributes above reduced caps in the predicted state", () => {
    const state = playing(5);
    state.player.research = 30;
    const preview = previewNextMonthEffects(state);
    expect(getPlayerAttributeCap(preview.settledState!, "research")).toBe(19);
    expect(preview.player.research).toBe(30);
    expect(preview.totals.research).toBe(0);
  });

  it("shows resisted highest-attribute growth before next month's cap loss", () => {
    const state = playing(12, { "annual-highest-growth": 3 });
    state.player.research = 6;
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find(item => item.id === "annual-role-growth")).toMatchObject({
      name: "渐入佳境", stats: { research: 2.4 }, appliedStats: { research: 2.4 },
    });
    expect(preview.items.some(item => item.id === "annual-role-cap-growth")).toBe(false);
    expect(preview.items.find(item => item.id === "monthly-role-curse-cap")).toMatchObject({
      label: "科研上限 -1", note: "下月初科研上限：20→19",
    });
    expect(caps(preview.settledState!)).toEqual([19, 20, 20]);
    expect(preview.totals.research).toBeCloseTo(2.4);
    expect([preview.totals.social, preview.totals.favor]).toEqual([0, 0]);
    expect(attributes.map(stat => preview.player[stat])).toEqual([8.4, 3, 3]);
  });

  it("includes every tied highest attribute and applies their ordinary resistance", () => {
    const state = playing(12, { "annual-highest-growth": 2 });
    state.player.research = 6;
    state.player.social = 6;
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find(item => item.id === "annual-role-growth")).toMatchObject({
      name: "渐入佳境", appliedStats: { research: 1.6, social: 1.6 },
    });
    expect(preview.totals.research).toBeCloseTo(1.6);
    expect(preview.totals.social).toBeCloseTo(1.6);
    expect(preview.totals.favor).toBe(0);
    expect(attributes.map(stat => preview.player[stat])).toEqual([7.6, 7.6, 3]);
    expect(caps(preview.settledState!)).toEqual([19, 20, 20]);
  });

  it("does not promise growth when the highest current attribute is already capped", () => {
    const state = playing(12, { "annual-highest-growth": 3 });
    state.player.research = 20;
    const preview = previewNextMonthEffects(state);
    expect(preview.items.some(item => item.id === "annual-role-growth")).toBe(false);
    expect(preview.totals.research).toBe(0);
    expect(preview.player.research).toBe(20);
    expect(caps(preview.settledState!)).toEqual([19, 20, 20]);
  });

  it("does not show annual growth before year end or after an already settled year", () => {
    const state = playing(11, { "annual-highest-growth": 3 });
    expect(previewNextMonthEffects(state).items.some(item => item.id === "annual-role-growth")).toBe(false);
    const settled = playing(12, { "annual-highest-growth": 3 });
    settled.roleTalents!.lastAnnualSettlement = settled.year;
    expect(previewNextMonthEffects(settled).items.some(item => item.id === "annual-role-growth")).toBe(false);
  });

  it("keeps swap uncertainty visible without drawing randomness or changing state", () => {
    const state = playing(12, { "attribute-swap": 1, "san-money-swap": 1, "annual-highest-growth": 2 });
    const snapshot = structuredClone(state);
    const random = vi.spyOn(gameRandomSource, "gameRandom").mockImplementation(() => { throw new Error("preview sampled a swap"); });
    const first = previewNextMonthEffects(state);
    expect(first.items.find(item => item.id === "monthly-role-random-swap")).toMatchObject({ label: "随机交换" });
    expect(first.items.find(item => item.id === "monthly-role-curse-cap")?.note).toContain("未计入随机交换影响");
    expect(first.items.find(item => item.id === "annual-role-growth")?.note).toContain("未计入随机交换影响");
    expect(previewNextMonthEffects(state)).toEqual(first);
    expect(random).not.toHaveBeenCalled();
    expect(state).toEqual(snapshot);
  });

  it("retains the r49 five-target curse and omits the new annual talent", () => {
    withGameplayRuleset("20261024-r49", () => {
      const first = previewNextMonthEffects(playing(1, { "annual-highest-growth": 3 }));
      expect(first.items.find(item => item.id === "monthly-role-growth")?.appliedStats).toEqual({ san: -1 });
      expect(first.items.some(item => item.id === "monthly-role-curse-cap")).toBe(false);
      const annual = previewNextMonthEffects(playing(12, { "annual-highest-growth": 3 }));
      expect(annual.items.some(item => item.id === "annual-role-growth")).toBe(false);
      expect(caps(annual.settledState!)).toEqual([20, 20, 20]);
    });
  });
});

