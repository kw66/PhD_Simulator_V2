import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyEventPlayerEffects } from "../src/core/v2-event-player-effects";
import { observeAchievements } from "../src/core/v2-achievement-runtime";
import { recordPersonalIncome } from "../src/core/v2-money";
import { settleRoleTalentInvestments } from "../src/core/v2-role-talent-investments";
import { settleGreedCoinGames } from "../src/core/v2-role-talent-greed";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import type { GameState } from "../src/core/v2-types";

function start(): GameState {
  const s = createStartedGameState("normal");
  return { ...s, totalMonths: 1, month: 1, player: { ...s.player, money: 10 } };
}

describe("actual monthly income evidence", () => {
  it("keeps gross earnings despite intervening spending without double counting observation", () => {
    const before = start();
    let next = applyEventPlayerEffects(before, { money: 60 });
    next = applyEventPlayerEffects(next, { money: -55 });
    next = applyEventPlayerEffects(next, { money: 40 });
    next = observeAchievements(before, next);
    expect(next.player.money).toBe(55);
    expect(next.achievementProgress!.counters["income:1"]).toBe(100);
    expect(next.achievementProgress!.satisfied).toContain("global:windfall");
    next = observeAchievements(next, next);
    expect(next.achievementProgress!.counters["income:1"]).toBe(100);
  });

  it("excludes balance resets and never combines different months", () => {
    const before = start();
    let next = applyEventPlayerEffects(before, { money: 60 });
    next = observeAchievements(next, { ...next, player: { ...next.player, money: 1000 } });
    expect(next.achievementProgress!.counters["income:1"]).toBe(60);
    next = { ...next, totalMonths: 2, month: 2 };
    next = applyEventPlayerEffects(next, { money: 40 });
    expect(next.achievementProgress!.satisfied).not.toContain("global:windfall");
    expect(next.achievementProgress!.counters["income:2"]).toBe(40);
  });

  it("counts investment interest only, excluding returned principal", () => {
    const s = start(); s.selectedRoleId = "rich";
    s.roleTalents = { levels: {}, investments: [{ id: 1, investedAt: -11, dueAt: 1, principal: 200, interest: 2 }] };
    const next = settleRoleTalentInvestments(s).state;
    expect(next.player.money).toBe(212);
    expect(next.achievementProgress!.counters["income:1"]).toBe(2);
    expect(next.achievementProgress!.satisfied).not.toContain("global:windfall");
  });

  it("counts only the final coin-game net result as income or spending", () => {
    const s = start(); s.selectedRoleId = "rich-reversed"; s.player.money = 200;
    s.roleTalents = { levels: { "coin-game": 1 }, pendingCoinGames: 2 };
    const rolls = [0, 1];
    const next = settleGreedCoinGames(s, () => rolls.shift() ?? 1);
    expect(next.player.money).toBe(120);
    expect(next.achievementProgress?.counters["income:1"] ?? 0).toBe(0);
    expect(next.personalSpending).toBe(80);
    expect(next.roleTalents?.greedQualifiedSpending).toBe(80);
    expect(next.achievementProgress?.satisfied ?? []).not.toContain("global:windfall");
  });

  it("retains individual bounded-stake wins in r45 recordings", () => {
    const s = start(); s.selectedRoleId = "rich-reversed"; s.player.money = 200;
    s.roleTalents = { levels: { "coin-game": 1 }, pendingCoinGames: 2 };
    const rolls = [0, 1];
    const next = withGameplayRuleset("20261023-r45", () => settleGreedCoinGames(s, () => rolls.shift() ?? 1));
    expect(next.player.money).toBe(199.5);
    expect(next.achievementProgress!.counters["income:1"]).toBe(2.5);
    expect(next.achievementProgress!.satisfied).not.toContain("global:windfall");
  });

  it("retains whole-wallet win income in r19 recordings", () => {
    const s = start(); s.selectedRoleId = "rich-reversed"; s.player.money = 200;
    s.roleTalents = { levels: { "coin-game": 1 }, pendingCoinGames: 2 };
    const rolls = [0, 1];
    const next = withGameplayRuleset("20261022-r19", () => settleGreedCoinGames(s, () => rolls.shift() ?? 1));
    expect(next.player.money).toBe(120);
    expect(next.achievementProgress!.counters["income:1"]).toBe(100);
    expect(next.achievementProgress!.satisfied).toContain("global:windfall");
  });

  it("keeps positive monthly source income separate from negative monthly costs", () => {
    const s = start(); s.player.money = 500;
    s.buffs = [
      { id: "earn", name: "Earn", source: "test", timing: "monthly", remainingMonths: 1, monthlyStats: { money: 100 } },
      { id: "cost", name: "Cost", source: "test", timing: "monthly", remainingMonths: 1, monthlyStats: { money: -150 } },
    ];
    const next = resolveMonthlyEffects(s).settledState!;
    expect(next.achievementProgress!.counters["income:1"]).toBeGreaterThanOrEqual(100);
    expect(next.achievementProgress!.satisfied).toContain("global:windfall");
  });

  it("ignores nonpositive/nonfinite amounts and initialization does not use setup zero attributes", () => {
    const s = createStartedGameState("genius", { "innate-insight": 1 });
    expect(s.achievementProgress!.minima.research).toBe(1);
    expect(s.achievementProgress!.minima.san).toBe(20);
    expect(recordPersonalIncome(s, NaN)).toBe(s);
    expect(recordPersonalIncome(s, -1)).toBe(s);
    expect(recordPersonalIncome(s, Infinity)).toBe(s);
  });
});
