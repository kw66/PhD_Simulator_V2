import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { allocateGreedSpending, growGreedAttribute } from "../src/core/v2-greed-transaction";
import { recordPersonalSpending, roundMoney } from "../src/core/v2-money";
import { applyTierResist } from "../src/core/v2-sanity-rules";
import { settleGreedCoinGames, settleGreedSpendingConversions } from "../src/core/v2-role-talent-greed";
import { getDesignedTalentNodes } from "../src/core/v2-role-talent-definitions";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState } from "../src/core/v2-types";

function fixture(): GameState {
  const state = createInitialState();
  return { ...state, selectedRoleId: "rich-reversed", phase: "playing", degree: "phd", totalMonths: 2, month: 2,
    randomState: { seed: 1234, cursor: 0 },
    player: { san: 0, research: 0, social: 0, favor: 0, money: 100 },
    roleTalents: { levels: { "post-phd-money-conversion": 1 } } };
}

describe("greed rewards per transaction", () => {
  it("settles the full wallet product once, rounding only the final balance", () => {
    const state = fixture();
    state.player.money = 1.01;
    state.roleTalents!.levels["coin-game-comeback"] = 5;
    state.roleTalents!.pendingCoinGames = 2;
    let calls = 0;
    const next = settleGreedCoinGames(state, () => calls++ === 0 ? 0 : 0.9);
    expect(next.player.money).toBe(0.98);
    expect(next.personalSpending).toBe(0.03);
    expect(next.roleTalents?.greedQualifiedSpending).toBe(0.03);
    expect(next.roleTalents?.pendingCoinGames).toBe(0);
    expect(next.roleTalents?.pendingMoneyConversionTransactions).toEqual([]);
    expect(calls).toBe(9);
    expect(settleGreedCoinGames(next)).toBe(next);
    expect(state.player.money).toBe(1.01);
  });

  it("counts only net income, never intermediate losses, with no stake limit", () => {
    const state = fixture();
    state.roleTalents!.pendingCoinGames = 4;
    let calls = 0;
    const next = settleGreedCoinGames(state, () => calls++ === 0 ? 0.9 : 0);
    expect(next.player.money).toBe(135);
    expect(next.personalSpending ?? 0).toBe(0);
    expect(next.roleTalents?.greedQualifiedSpending ?? 0).toBe(0);
    expect(next.achievementProgress?.counters["income:2"]).toBe(35);
    expect(calls).toBe(4);
    const old = withGameplayRuleset("20261023-r45", () => settleGreedCoinGames(state, () => 0));
    expect(old.player.money).toBe(110);
  });

  it("survives overflowing intermediate products and preserves deterministic serialized playback", () => {
    const state = fixture();
    state.player.money = 1e300;
    state.roleTalents!.pendingCoinGames = 2000;
    state.roleTalents!.levels["coin-game-comeback"] = 5;
    let calls = 0;
    const next = settleGreedCoinGames(state, () => calls++ < 1000 ? 0 : 0.9);
    expect(next.player.money).toBeCloseTo(Math.exp(Math.log(1e300) + 1000 * Math.log(1.5) + 1000 * Math.log(0.65)), -280);
    expect(Object.values(next.player).every(Number.isFinite)).toBe(true);
    expect(roundMoney(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
    expect(settleGreedCoinGames(state)).toEqual(settleGreedCoinGames(JSON.parse(JSON.stringify(state))));
  });

  it("skips exact full private RNG periods without changing subsequent reward draws", () => {
    const state = fixture();
    state.roleTalents!.pendingCoinGames = 4294967296;
    state.roleTalents!.greedRandomState = 1234;
    const next = settleGreedCoinGames(state);
    const expected = settleGreedSpendingConversions(recordPersonalSpending({ ...state,
      player: { ...state.player, money: 0 }, roleTalents: { ...state.roleTalents!, pendingCoinGames: 0 } }, 100));
    expect(next.player).toEqual(expected.player);
    expect(next.roleTalents).toEqual(expected.roleTalents);
  });

  it("keeps wins and maximum-sized spending finite at the numeric storage boundary", () => {
    const state = fixture();
    state.player.money = Number.MAX_VALUE;
    state.roleTalents!.pendingCoinGames = 1;
    expect(settleGreedCoinGames(state, () => 0).player.money).toBe(Number.MAX_VALUE);
    const rewarded = settleGreedSpendingConversions(recordPersonalSpending(state, Number.MAX_VALUE), () => 0.5);
    expect(Object.values(rewarded.player).every(Number.isFinite)).toBe(true);
    expect(Object.values(rewarded.roleTalents!.capBonuses!).every(Number.isFinite)).toBe(true);
    expect(allocateGreedSpending(Number.MAX_VALUE, () => 0.5).every(value => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it("preserves purchase boundaries including fractions, with seven draws each", () => {
    const before = fixture();
    const queued = recordPersonalSpending(recordPersonalSpending(before, 0.4), 6.8);
    expect(queued.roleTalents?.pendingMoneyConversionTransactions).toEqual([0.4, 6.8]);
    let calls = 0;
    const next = settleGreedSpendingConversions(queued, () => { calls++; return 1; });
    expect(calls).toBe(14);
    expect(next.roleTalents?.pendingMoneyConversionTransactions).toEqual([]);
    expect(next.roleTalents?.moneyConversionRemainder).toBeUndefined();
    expect(next.player.research).toBeCloseTo(7.2 / 7);
    expect(settleGreedSpendingConversions(next)).toBe(next);
    expect(before.roleTalents?.pendingMoneyConversionTransactions).toBeUndefined();
    calls = 0;
    settleGreedSpendingConversions(recordPersonalSpending(before, 7.2), () => { calls++; return 1; });
    expect(calls).toBe(7);
  });

  it("normalizes weights without losing total rewards and handles zero weights", () => {
    let index = 0;
    const rewards = allocateGreedSpending(28, () => ++index / 7);
    expect(rewards).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(allocateGreedSpending(7, () => 0)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(allocateGreedSpending(0.5, () => 0.5).reduce((a, b) => a + b, 0)).toBeCloseTo(0.5, 10);
  });

  it("awards all seven targets, applying caps before this transaction's growth", () => {
    const state = fixture();
    state.player.research = 20;
    state.player.social = 20;
    state.player.favor = 20;
    const next = settleGreedSpendingConversions(recordPersonalSpending(state, 7), () => 1);
    expect(next.player).toMatchObject({ san: 1, research: 20.4, social: 20.4, favor: 20.4 });
    expect(next.sanCap).toBe(state.sanCap);
    expect(next.roleTalents?.capBonuses).toMatchObject({ social: 1, favor: 1 });
    expect(next.roleTalents?.growthTotals).toMatchObject({ research: 0.4, social: 0.4, favor: 0.4 });
    expect(next.researchCapacityState.otherCapBonus).toBe(state.researchCapacityState.otherCapBonus + 1);
    expect(next.achievementProgress?.peaks["research"]).toBe(20.4);
  });

  it("matches scalar tier resistance across thresholds, fractions, and caps", () => {
    for (const value of [-10, 0, 5.9, 6, 11.7, 12, 17.9, 18, 25]) {
      for (const amount of [0, 0.5, 1, 3.4, 7, 25, 1000]) {
        for (const cap of [0, 6, 20, 100]) {
          const expected = Number((value + applyTierResist(amount, value, undefined, cap).effectiveChange).toFixed(10));
          expect(growGreedAttribute(value, amount, cap)).toBeCloseTo(expected, 8);
        }
      }
    }
  });

  it("settles a trillion coins in seven draws with finite values and a JSON-safe snapshot", () => {
    const state = recordPersonalSpending(fixture(), 1e12);
    const before = structuredClone(state);
    let calls = 0;
    const next = settleGreedSpendingConversions(state, () => { calls++; return 0.5; });
    expect(calls).toBe(7);
    expect(next.player.research).toBeGreaterThan(1e10);
    expect(Object.values(next.player).every(Number.isFinite)).toBe(true);
    expect(JSON.parse(JSON.stringify(next)).player).toEqual(next.player);
    expect(state).toEqual(before);
  });

  it("uses copied seeded RNG and preserves a queued transaction after serialization", () => {
    const state = recordPersonalSpending(fixture(), 30);
    const before = structuredClone(state);
    const first = settleGreedSpendingConversions(state);
    expect(settleGreedSpendingConversions(state)).toEqual(first);
    expect(settleGreedSpendingConversions(JSON.parse(JSON.stringify(state)))).toEqual(first);
    expect(state).toEqual(before);
  });

  it("does not retroactively convert master spending or queue zero/negative costs", () => {
    const master = recordPersonalSpending({ ...fixture(), degree: "master" }, 20);
    expect(master.roleTalents?.pendingMoneyConversionTransactions).toBeUndefined();
    expect(recordPersonalSpending(master, 0)).toBe(master);
    expect(recordPersonalSpending(master, -1)).toBe(master);
    const next = recordPersonalSpending({ ...master, degree: "phd" }, 0.5);
    expect(next.roleTalents?.pendingMoneyConversionTransactions).toEqual([0.5]);
  });

  it("settles real coffee purchases after the caller commits the cost", () => {
    const state = fixture();
    state.player.san = 10;
    const next = dispatchAction(state, "buy-coffee");
    expect(next.roleTalents?.pendingMoneyConversionTransactions).toEqual([]);
    expect(next.roleTalents?.greedRandomState).toBeTypeOf("number");
    expect(next.roleTalents?.greedQualifiedSpending).toBeGreaterThan(0);
    expect(dispatchAction(state, "buy-coffee")).toEqual(next);
  });

  it("connects investments to starting income and three branches to curse relief", () => {
    const nodes = getDesignedTalentNodes("rich-reversed")!;
    expect(nodes.find(n => n.id === "finance-master")?.prerequisiteIds).toEqual(["money-growth"]);
    expect(nodes.find(n => n.id === "investment-acceleration")?.prerequisiteIds).toEqual(["finance-master"]);
    expect(nodes.find(n => n.id === "money-growth")?.cost).toBe(1);
    expect(nodes.find(n => n.id === "spend-to-break-curse")).toMatchObject({
      cost: 3, tier: 3, column: "4", row: "2",
      prerequisiteIds: ["investment-acceleration", "coin-game-comeback", "post-phd-money-conversion"],
      effect: "累计每消耗50金币，金钱诅咒重置值+1",
    });
    expect(withGameplayRuleset("20261024-r53", () => getDesignedTalentNodes("rich-reversed"))?.find(n => n.id === "spend-to-break-curse"))
      .toMatchObject({ tier: 2, column: "3", row: "2", prerequisiteIds: ["finance-master", "coin-game", "post-phd-money-conversion"] });
    expect(withGameplayRuleset("20261023-r44", () => getDesignedTalentNodes("rich-reversed"))?.find(n => n.id === "finance-master")?.prerequisiteIds).toEqual(["post-phd-money-conversion"]);
  });
});
