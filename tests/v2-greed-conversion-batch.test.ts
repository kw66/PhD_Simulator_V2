import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { applyPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { applyGreedConversionBatch } from "../src/core/v2-greed-conversion-batch";
import { roundGreedConversion } from "../src/core/v2-greed-rounding";
import { settleGreedCoinGames } from "../src/core/v2-role-talent-greed";
import type { GameState } from "../src/core/v2-types";

const stats = ["research", "social", "favor"] as const;

// The original scalar path is the equivalence oracle, including its achievement
// samples, rounding, cap ordering, and the generic role reaction pipeline.
function scalar(state: GameState, count: number, roll: () => number): GameState {
  let next: GameState = { ...state, roleTalents: { ...state.roleTalents!, pendingMoneyConversions: 0 } };
  for (let i = 0; i < count; i++) {
    const target = Math.max(0, Math.min(6, Math.floor(roll() * 7)));
    if (target === 0) next = { ...next, player: { ...next.player,
      san: Math.max(next.player.san, Math.min(next.sanCap, next.player.san + 1)) } };
    else if (target <= 3) next = applyPlayerAttributeChange(next, stats[target - 1]!, 1).state;
    else {
      const stat = stats[target - 4]!;
      next = stat === "research" ? { ...next, researchCapacityState: { ...next.researchCapacityState,
        otherCapBonus: next.researchCapacityState.otherCapBonus + 1 } }
        : { ...next, roleTalents: { ...next.roleTalents!, capBonuses: { ...next.roleTalents?.capBonuses,
          [stat]: (next.roleTalents?.capBonuses?.[stat] ?? 0) + 1 } } };
    }
  }
  return next;
}

function fixture(): GameState {
  const state = createInitialState();
  return { ...state, phase: "playing", degree: "phd", selectedRoleId: "rich-reversed",
    player: { san: 4.3, research: 5.9, social: 11.9, favor: 17.9, money: 123.45 },
    roleTalents: { levels: { "post-phd-money-conversion": 1 }, pendingMoneyConversions: 100,
      growthTotals: { research: 1.2345678901 }, lossTotals: { social: 2.3456789012 } } };
}

function seeded(seed: number) {
  let calls = 0;
  return { roll: () => { calls++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; },
    inspect: () => ({ calls, seed }) };
}

function compare(state: GameState, draws: number[]) {
  let oldIndex = 0, newIndex = 0;
  const before = structuredClone(state);
  const expected = scalar(state, draws.length, () => draws[oldIndex++]!);
  const actual = applyGreedConversionBatch(state, draws.length, () => draws[newIndex++]!);
  expect(actual).toEqual(expected);
  expect(newIndex).toBe(oldIndex);
  expect(state).toEqual(before);
  return actual;
}

describe("greed spending batch preserves scalar gameplay", () => {
  it("matches every target, cap-before-gain order, and tier crossings", () => {
    const state = fixture();
    const draws = [1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 0, 4, 1, 5, 2, 6, 3].map(n => (n + 0.1) / 7);
    compare(state, draws);
  });

  it("records intermediate spread even when the final attributes are equal", () => {
    const state = fixture();
    state.player = { ...state.player, research: 20, social: 20, favor: 20 };
    const actual = compare(state, [4, 1, 5, 2, 6, 3].map(n => (n + 0.1) / 7));
    expect(actual.achievementProgress?.peaks["attribute-spread"]).toBeCloseTo(0.4);
    expect(actual.achievementProgress?.minima["attribute-spread"]).toBe(0);
  });

  it("does not add achievement samples for trailing SAN/cap draws", () => {
    const state = fixture();
    const actual = compare(state, [1, 0, 4, 4, 5, 6].map(n => (n + 0.1) / 7));
    expect(actual.achievementProgress?.peaks["san"]).toBe(4.3);
    expect(actual.achievementProgress?.peaks["research-cap"]).toBe(20);
    const onlyCaps = compare(state, [0, 4, 5, 6].map(n => (n + 0.1) / 7));
    expect(onlyCaps.achievementProgress).toBe(state.achievementProgress);
  });

  it("preserves capped/overflow attributes, fractional totals, master peaks, and money rounding", () => {
    const state = fixture();
    state.degree = "master";
    state.player = { san: 25, research: 20.00000000001, social: 99.4, favor: -0.12345678901, money: 1.005 };
    state.roleTalents!.capBonuses = { social: 79.5, favor: -20 };
    compare(state, [1, 2, 3, 0, 6, 3, 5, 2, 4, 1].map(n => (n + 0.1) / 7));
  });

  it("matches diverse seeded streams including missing achievement/totals objects", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = fixture();
      if (seed % 2 === 0) state.degree = "master";
      if (seed % 3 === 0) { delete state.achievementProgress; delete state.roleTalents!.growthTotals; delete state.roleTalents!.lossTotals; }
      state.player.research = seed * 0.7;
      state.player.social = seed * 1.1;
      state.player.favor = seed * 0.3;
      state.roleTalents!.capBonuses = { social: seed, favor: seed - 15 };
      const oldRandom = seeded(seed), newRandom = seeded(seed);
      const before = structuredClone(state);
      expect(applyGreedConversionBatch(state, 600, newRandom.roll)).toEqual(scalar(state, 600, oldRandom.roll));
      expect(newRandom.inspect()).toEqual(oldRandom.inspect());
      expect(state).toEqual(before);
    }
  });

  it("preserves the old decimal rounding drift at the floating-point precision boundary", () => {
    const state = fixture();
    state.player.research = 524288.8;
    state.researchCapacityState.otherCapBonus = 1000000;
    state.roleTalents!.growthTotals = { research: 524288.8 };
    const actual = compare(state, [1.1 / 7]);
    // Integer tenths would silently change both the value and replay digest.
    expect(actual.player.research).toBe(524289.2000000001);
    expect(actual.player.research).not.toBe(524289.2);
    expect(actual.roleTalents!.growthTotals!.research).toBe(524289.2000000001);
  });

  it("matches high-value capped and uncapped streams without regrouping random draws", () => {
    for (const value of [262143.9, 524287.8, 1048575.9, 10000000.123456789]) {
      const state = fixture();
      state.player = { ...state.player, research: value, social: value + 0.1, favor: value + 0.2 };
      state.researchCapacityState.otherCapBonus = value - 20;
      state.roleTalents!.capBonuses = { social: value - 19.9, favor: value - 19.8 };
      state.roleTalents!.growthTotals = { research: value, social: value + 0.1, favor: value + 0.2 };
      const oldRandom = seeded(3707), newRandom = seeded(3707);
      expect(applyGreedConversionBatch(state, 3000, newRandom.roll)).toEqual(scalar(state, 3000, oldRandom.roll));
      expect(newRandom.inspect()).toEqual(oldRandom.inspect());
    }
  });

  it("inlines the private LCG without calling an injected callback or changing its cursor", () => {
    const state = fixture(), random = seeded(0), cursor = { value: 0 };
    const expected = scalar(state, 10000, random.roll);
    let calls = 0;
    const actual = applyGreedConversionBatch(state, 10000, () => { calls++; return 0; }, cursor);
    expect(actual).toEqual(expected);
    expect(cursor.value).toBe(random.inspect().seed);
    expect(calls).toBe(0);
  });

  it("shares one private cursor across coin rolls and interleaved spending rewards", () => {
    const state = fixture();
    state.player.money = 123;
    state.roleTalents!.levels = { "post-phd-money-conversion": 1, "coin-game-comeback": 3 };
    state.roleTalents!.pendingCoinGames = 12;
    state.roleTalents!.greedRandomState = 3707;
    const random = seeded(3707);
    const expected = settleGreedCoinGames(state, random.roll);
    const actual = settleGreedCoinGames(state);
    expected.roleTalents!.greedRandomState = random.inspect().seed;
    expect(actual).toEqual(expected);
  });
});

describe("exact fast decimal rounding for greed conversions", () => {
  const original = (value: number) => Number(value.toFixed(10));

  it("matches boundary values, decimal ties, negative and nonfinite fallbacks", () => {
    for (const value of [0, -0, Number.MIN_VALUE, Infinity, -Infinity, NaN, -0.12345678905,
      0.12345678905, 262144.2 + .4, 524288.8 + .4, 524288 - 2 ** -34,
      524288, 524288 + 2 ** -33, 1e21, Number.MAX_VALUE]) {
      expect(Object.is(roundGreedConversion(value), original(value))).toBe(true);
    }
  });

  it("matches diverse scaled values and near-half decimal grid values", () => {
    const random = seeded(3707);
    for (let index = 0; index < 100000; index++) {
      const value = random.roll() * 524288;
      expect(roundGreedConversion(value)).toBe(original(value));
      const nearHalf = (Math.floor(random.roll() * 524288) * 1e10 + Math.floor(random.roll() * 1e10) + .5) / 1e10;
      expect(roundGreedConversion(nearHalf)).toBe(original(nearHalf));
    }
  });

  it("preserves every floating-point step across exponent boundaries", () => {
    for (const start of [0, 262143.8, 262144.123456789, 524287.8, 524288.8, 10000000.123456789]) {
      let expected = start, actual = start;
      for (let index = 0; index < 50000; index++) {
        expected = original(expected + .4); actual = roundGreedConversion(actual + .4);
        expect(actual).toBe(expected);
      }
    }
  });
});
