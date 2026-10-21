import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getCoffeeSanGain } from "../src/core/v2-coffee-system";
import { previewPartTimeWork } from "../src/core/v2-part-time-work";
import { getPartTimeGrowthProgress } from "../src/core/v2-growth-system";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

function playing() {
  const initial = createInitialState();
  return { ...initial, phase: "playing" as const, year: 1, month: 1, totalMonths: 1,
    eventQueue: [], player: { ...initial.player, san: 10, money: 100 } };
}

describe("r15 long-term growth balance", () => {
  it("raises the next work reward only after every fifth work without raising base SAN", () => {
    const state = playing();
    for (const [count, reward] of [[4, 2], [5, 2.5], [9, 2.5], [10, 3], [25, 4.5]]) {
      expect(previewPartTimeWork({ ...state, partTimeWorkCount: count! })).toMatchObject({ moneyReward: reward, sanCost: 5 });
    }
    expect(getPartTimeGrowthProgress(5)).toEqual({ tier: 1, nextAt: 10 });
    const summer = previewPartTimeWork({ ...state, month: 10, partTimeWorkCount: 25 });
    expect(summer.sanCost).toBe(6);
    expect(withGameplayRuleset("20261021-r14", () => previewPartTimeWork({ ...state, partTimeWorkCount: 8 })))
      .toMatchObject({ moneyReward: 3, sanCost: 6 });
  });

  it("keeps previously brewed coffee on upgrade and activates growth after the threshold cup", () => {
    const base = playing();
    base.coffeeState = { ...base.coffeeState, machineOwned: true, machineTrackedCoffeeCount: 7 };
    const upgraded = dispatchAction(base, "upgrade-coffee-machine", { shopUpgradeId: "advanced" });
    const brewed = dispatchAction(upgraded, "buy-coffee");
    expect(brewed.player.san - upgraded.player.san).toBe(3);
    expect(brewed.coffeeState.machineTrackedCoffeeCount).toBe(8);
    expect(getCoffeeSanGain(brewed.coffeeState)).toBe(4);
    expect(withGameplayRuleset("20261021-r14", () => getCoffeeSanGain(brewed.coffeeState))).toBe(3);
    expect(getCoffeeSanGain({ ...brewed.coffeeState, machineTrackedCoffeeCount: 40 })).toBe(8);
    expect(getCoffeeSanGain({ ...brewed.coffeeState, machineTrackedCoffeeCount: 80 })).toBe(8);
  });

  it("adds bike capacity at four spent SAN, preserves the current SAN, and stops at the tier cap", () => {
    const state = playing();
    state.shopState = { ...state.shopState, bikeOwned: true, bikeLevel: 1, bikeSanSpent: 3 };
    const updated = applyMonthlyEffects(state).nextState;
    expect(updated.shopState.bikeSanSpent).toBe(4);
    expect(updated.shopState.bikeSanCapGains).toBe(1);
    expect(updated.sanCap).toBe(state.sanCap + 1);
    const old = withGameplayRuleset("20261021-r14", () => applyMonthlyEffects(state).nextState);
    expect(old.shopState.bikeSanCapGains).toBe(0);
    expect(updated.player.san).toBe(old.player.san);
    const capped = applyMonthlyEffects({ ...state, shopState: { ...state.shopState, bikeSanSpent: 12, bikeSanCapGains: 3 } }).nextState;
    expect(capped.shopState.bikeSanSpent).toBe(12);
    expect(capped.shopState.bikeSanCapGains).toBe(3);
  });
});
