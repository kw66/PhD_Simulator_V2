import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { resolveSummerVacationFixedEvent } from "../src/core/v2-fixed-events-summer";
import { resolveWinterVacationFixedEvent } from "../src/core/v2-fixed-events-winter";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { getSanConsumptionCost } from "../src/core/v2-sanity-rules";
import { getChairMonthlyRecovery } from "../src/core/v2-shop-items-effects";
import { getRecoveredSan } from "../src/core/v2-san-recovery";
import { resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import type { Buff } from "../src/core/v2-types";

const multiplier: Buff = { id: "test-multiplier", name: "test", source: "test", timing: "permanent", remainingMonths: null, activeOperationSanMultiplier: 1.5 };

describe("fractional SAN rules", () => {
  it("normalizes recovery and deduction tails without erasing a genuine small deficit", () => {
    expect(getRecoveredSan(0.7 - 0.6, 20, -0.1)).toBe(0);
    expect(getRecoveredSan(0.1, 20, 0.2)).toBe(0.3);
    expect(getRecoveredSan(0.099, 20, -0.1)).toBe(-0.001);
    expect(getRecoveredSan(30, 20, 0.2)).toBe(30);
    expect(withGameplayRuleset("20261020-r12", () => getRecoveredSan(0.7 - 0.6, 20, -0.1))).toBeLessThan(0);
  });

  it("settles monthly fractional drains to exact zero and retains old replay precision", () => {
    const initial = createInitialState();
    const state = { ...initial, phase: "playing" as const, totalMonths: 6, month: 6,
      player: { ...initial.player, san: 0.3, money: 100 },
      buffs: [-0.1, -0.2].map((san, index) => ({ id: `fractional-drain-${index}`, name: "test", source: "test",
        timing: "monthly" as const, remainingMonths: 1, monthlyStats: { san } })),
    };
    // Winter's -1 offsets base recovery +1, isolating the decimal costs.
    const current = resolveMonthlyEffects(state);
    expect(current.player.san).toBe(0);
    expect(current.totals.san).toBe(-0.3);
    expect(evaluateCoreEndings({ ...state, player: current.player }).ending).not.toBe("burnout");
    const deficit = resolveMonthlyEffects({ ...state, player: { ...state.player, san: 0.299 } });
    expect(deficit.player.san).toBe(-0.001);
    expect(evaluateCoreEndings({ ...state, player: deficit.player }).ending).toBe("burnout");
    expect(withGameplayRuleset("20261020-r12", () => resolveMonthlyEffects(state)).player.san).toBeLessThan(0);
  });

  it("keeps fractional consumption after multipliers and discounts without converting costs into gains", () => {
    expect(getSanConsumptionCost(3, [multiplier])).toBe(4.5);
    expect(getSanConsumptionCost(3, [multiplier], -1)).toBe(3.5);
    expect(getSanConsumptionCost(0.1, [multiplier])).toBe(0.15);
    expect(getSanConsumptionCost(1, [multiplier], -2)).toBe(0);
    expect(getSanConsumptionCost(0, [multiplier])).toBe(0);
    expect(withGameplayRuleset("20261020-r12", () => getSanConsumptionCost(3, [multiplier], -1))).toBe(4);
  });

  it("recovers fractional chair benefits while retaining historical whole-point calculations", () => {
    const state = createInitialState();
    const massage = { ...state.shopState, chairOwned: true, chairUpgrade: "massage" as const };
    const sofa = { ...massage, chairUpgrade: "torture" as const };
    expect(getChairMonthlyRecovery(massage, 19.7, 20)).toBe(0.06);
    expect(getChairMonthlyRecovery(sofa, 0.3, 20)).toBe(0.06);
    expect(getChairMonthlyRecovery(massage, 21, 20)).toBe(0);
    expect(withGameplayRuleset("20261020-r12", () => getChairMonthlyRecovery(massage, 19.7, 20))).toBe(0);
    expect(withGameplayRuleset("20261020-r12", () => getChairMonthlyRecovery(sofa, 19.7, 20))).toBe(3);
  });

  it("preserves fractional vacation effects and historical replay values across every choice", () => {
    const initial = createInitialState();
    const state = { ...initial, player: { ...initial.player, san: initial.sanCap - 1.5 } };
    for (const kind of ["summer-vacation-home", "summer-vacation-travel"] as const) {
      const resolve = () => resolveSummerVacationFixedEvent(state, { kind }, () => 0)!.enqueueEvents![0]!;
      expect(resolve().choices[0]!.effects.san).toBe(0.45);
      expect(resolve().description).toContain("SAN +0.45");
      expect(withGameplayRuleset("20261020-r12", resolve).choices[0]!.effects.san ?? 0).toBe(0);
    }
    for (const branch of [0, 0.4, 0.8]) {
      const resolve = () => resolveWinterVacationFixedEvent(state, { kind: "winter-vacation-rest" }, () => branch)!.enqueueEvents![0]!;
      expect(resolve().choices[0]!.effects.san).toBe(0.3);
      expect(resolve().description).toContain("SAN +0.3");
      expect(withGameplayRuleset("20261020-r12", resolve).choices[0]!.effects.san ?? 0).toBe(0);
    }
  });
});
