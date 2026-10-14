import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { recordPersonalSpending } from "../src/core/v2-money";
import { applyGreedAttributeLoss, settleGreedCoinGames, settleGreedReset, settleGreedSpendingConversions } from "../src/core/v2-role-talent-greed";
import { investRoleTalentMoney, settleRoleTalentInvestments } from "../src/core/v2-role-talent-investments";
import { applyMonthlyEffects, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { settleRoleTalentMonthStart } from "../src/core/v2-role-talent-lifecycle";
import type { GameState } from "../src/core/v2-types";

function greed(levels: Record<string, number> = {}): GameState {
  const state = createInitialState();
  return { ...state, phase: "playing", selectedRoleId: "rich-reversed", totalMonths: 2, month: 2,
    conferenceLocationSeed: 1234, roleTalents: { levels: { "money-curse": 1, ...levels } },
    player: { ...state.player, san: 10, research: 6, social: 8, favor: 10, money: 100 } };
}

describe("greed role economy", () => {
  it("resets exactly, awards only actual three-attribute loss, and is idempotent", () => {
    const initial = greed({ "loss-to-money": 1, "coin-game": 1 });
    const reset = settleGreedReset(initial);
    expect(reset.player).toMatchObject({ san: 0, research: 0, social: 0, favor: 0, money: 124 });
    expect(reset.roleTalents?.pendingCoinGames).toBe(24);
    expect(settleGreedReset(reset)).toBe(reset);
    expect(initial.player.research).toBe(6);
  });

  it("uses spending target to top up or reduce exactly, capped per stat", () => {
    let state = greed({ "spend-to-break-curse": 1, "loss-to-money": 1 });
    state = recordPersonalSpending(state, 250.5);
    state.player.research = 1;
    const reset = settleGreedReset(state);
    expect(reset.player).toMatchObject({ san: 2, research: 2, social: 2, favor: 2, money: 114 });
    expect(reset.roleTalents?.greedQualifiedSpending).toBe(250.5);
    const capped = settleGreedReset({ ...state, roleTalents: { ...state.roleTalents!, greedQualifiedSpending: 9999 }, sanCap: 12 });
    expect(capped.player).toMatchObject({ san: 12, research: 20, social: 20, favor: 20 });
  });

  it("accumulates fractional ordinary losses across attributes without rewarding each fraction", () => {
    let state = greed({ "loss-to-money": 1, "coin-game": 1 });
    state.player.research = 18;
    state = applyPlayerAttributeChange(state, "research", -1).state;
    expect(state.player.money).toBe(100);
    expect(state.roleTalents?.greedLossRemainder).toBe(0.4);
    state = applyGreedAttributeLoss(state, 0.6);
    expect(state.player.money).toBe(101);
    expect(state.roleTalents?.pendingCoinGames).toBe(1);
    expect(state.roleTalents?.greedLossRemainder).toBe(0);
  });

  it("keeps fractional spending and independently awards all seven conversion targets", () => {
    let state: GameState = { ...greed({ "post-phd-money-conversion": 1 }), degree: "phd" };
    state = recordPersonalSpending(state, 0.4);
    state = recordPersonalSpending(state, 0.4);
    expect(state.roleTalents?.pendingMoneyConversions).toBe(0);
    state = recordPersonalSpending(state, 6.4);
    expect(state.roleTalents?.pendingMoneyConversions).toBe(7);
    expect(state.roleTalents?.moneyConversionRemainder).toBe(0.2);
    let roll = 0;
    const next = settleGreedSpendingConversions(state, () => (roll++ + 0.1) / 7);
    expect(next.player).toMatchObject({ san: 11, research: 6.8, social: 8.8, favor: 10.8 });
    expect(next.researchCapacityState.otherCapBonus).toBe(state.researchCapacityState.otherCapBonus + 1);
    expect(next.roleTalents?.capBonuses).toMatchObject({ social: 1, favor: 1 });
    expect(next.sanCap).toBe(state.sanCap);
    expect(next.roleTalents?.pendingMoneyConversions).toBe(0);
  });

  it("does not convert master-stage spending retroactively", () => {
    const master = recordPersonalSpending(greed({ "post-phd-money-conversion": 1 }), 5.5);
    expect(master.roleTalents?.pendingMoneyConversions).toBeUndefined();
    const phd = recordPersonalSpending({ ...master, degree: "phd" }, 0.5);
    expect(phd.roleTalents?.pendingMoneyConversions).toBe(0);
  });

  it("freezes game count and rounds each round, including qualified losses", () => {
    const state = greed({ "coin-game": 1, "coin-game-comeback": 5 });
    state.player.money = 1.01;
    state.roleTalents!.pendingCoinGames = 2;
    const rolls = [0, 0.8];
    const next = settleGreedCoinGames(state, () => rolls.shift()!);
    expect(next.player.money).toBe(0.99); // 1.01 × 1.5 = 1.52; 1.52 × .65 = .99
    expect(next.personalSpending).toBe((state.personalSpending ?? 0) + 0.53);
    expect(next.roleTalents?.greedQualifiedSpending).toBe(0.53);
    expect(next.roleTalents?.pendingCoinGames).toBe(0);
  });

  it("converts gambling losses without resetting new attributes or adding more games", () => {
    const state = { ...greed({ "coin-game": 1, "post-phd-money-conversion": 1 }), degree: "phd" as const };
    state.player.money = 10;
    state.player.research = 0;
    state.roleTalents!.pendingCoinGames = 1;
    let first = true;
    const next = settleGreedCoinGames(state, () => first ? (first = false, 0.9) : 1.1 / 7);
    expect(next.player.money).toBe(4);
    expect(next.player.research).toBe(6);
    expect(next.roleTalents?.pendingCoinGames).toBe(0);
    expect(next.roleTalents?.pendingMoneyConversions).toBe(0);
  });

  it("uses stable copied randomness for preview and advances only committed state", () => {
    const state = recordPersonalSpending({ ...greed({ "post-phd-money-conversion": 1 }), degree: "phd" }, 7);
    state.roleTalents!.pendingCoinGames = 2;
    const before = structuredClone(state);
    const first = settleGreedCoinGames(state);
    expect(settleGreedCoinGames(state)).toEqual(first);
    expect(first.roleTalents?.greedRandomState).toBeTypeOf("number");
    expect(state).toEqual(before);
  });

  it("invests without spending rewards and accelerates reversed investments", () => {
    const state = { ...greed({ "finance-master": 3, "investment-acceleration": 6, "post-phd-money-conversion": 1 }), degree: "phd" as const };
    const invested = investRoleTalentMoney(state).state;
    expect(invested.player.money).toBe(95);
    expect(invested.roleTalents?.greedQualifiedSpending).toBeUndefined();
    expect(invested.roleTalents?.pendingMoneyConversions).toBeUndefined();
    expect(settleRoleTalentInvestments({ ...invested, totalMonths: 7 }).count).toBe(0);
    expect(settleRoleTalentInvestments({ ...invested, totalMonths: 8 })).toMatchObject({ count: 1, principal: 5, interest: 3 });
  });

  it("settles monthly base recovery and costs before the frozen games", () => {
    const state = greed({ "money-growth": 2, "coin-game": 1 });
    state.player.san = 0;
    state.roleTalents!.pendingCoinGames = 1;
    const result = applyMonthlyEffects(state);
    const baseline = { ...state, player: { ...state.player, money: 101, san: 2 } };
    const expected = settleGreedCoinGames(recordPersonalSpending(baseline, 1));
    expect(result.nextState.player).toEqual(expected.player);
    expect(result.nextState.personalSpending).toBe(expected.personalSpending);
    const before = structuredClone(state);
    expect(previewNextMonthEffects(state)).toEqual(previewNextMonthEffects(state));
    expect(state).toEqual(before);
  });

  it("records each real purchase rather than netting its later resale", () => {
    let state = greed({ "spend-to-break-curse": 1 });
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    const spent = state.personalSpending ?? 0;
    expect(spent).toBeGreaterThan(0);
    state = dispatchAction(state, "sell-shop-item", { shopItemId: "keyboard" });
    expect(state.personalSpending).toBe(spent);
    expect(state.roleTalents?.greedQualifiedSpending).toBe(spent);
  });

  it("runs reset, recovery and frozen games through real engine month advancement", () => {
    const state = greed({ "money-growth": 2, "loss-to-money": 1, "coin-game": 1 });
    state.totalMonths = 1;
    state.month = 1;
    state.eventQueue = [];
    const expected = applyMonthlyEffects(settleRoleTalentMonthStart({ ...state, totalMonths: 2, month: 2 })).nextState;
    const next = dispatchAction(state, "next-month");
    expect(next.phase).toBe("playing");
    expect(next.player).toEqual(expected.player);
    expect(next.roleTalents?.pendingCoinGames).toBe(0);
    expect(next.roleTalents?.lastGreedResetMonth).toBe(2);
    expect(next.personalSpending).toBe(expected.personalSpending);
  });

  it("commits purchase conversions after the purchase without losing them to player replacement", () => {
    const state = { ...greed({ "post-phd-money-conversion": 1 }), degree: "phd" as const };
    state.player.research = 0;
    state.player.social = 0;
    state.player.favor = 0;
    const next = dispatchAction(state, "buy-coffee");
    const spent = (next.personalSpending ?? 0) - (state.personalSpending ?? 0);
    expect(spent).toBeGreaterThan(0);
    expect(next.roleTalents?.greedQualifiedSpending).toBe(spent);
    expect(next.roleTalents?.pendingMoneyConversions).toBe(0);
    expect(next.roleTalents?.greedRandomState).toBeTypeOf("number");
    const repeated = dispatchAction(state, "buy-coffee");
    expect(repeated.player).toEqual(next.player);
    expect(repeated.roleTalents).toEqual(next.roleTalents);
  });

  it("resolves monthly spending recovery before judging negative SAN", () => {
    let seed = 0;
    for (; seed < 10000; seed += 1) {
      const first = (Math.imul((seed ^ 0x6d2b79f5) >>> 0, 1664525) + 1013904223) >>> 0;
      if (first / 4294967296 < 1 / 7) break;
    }
    const state = { ...greed({ "post-phd-money-conversion": 1 }), degree: "phd" as const, conferenceLocationSeed: seed };
    state.totalMonths = 4;
    state.month = 4;
    state.eventQueue = [];
    state.buffs = [{ id: "late-san", name: "test", source: "test", timing: "monthly", remainingMonths: 1, monthlyStats: { san: -1 } }];
    const next = dispatchAction(state, "next-month");
    expect(next.player.san).toBe(0); // curse→0, base+1, winter-1, buff-1, spending conversion+1
    expect(next.phase).toBe("playing");
    expect(next.roleTalents?.pendingMoneyConversions).toBe(0);
  });
});
