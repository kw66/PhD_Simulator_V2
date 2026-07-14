import { describe, expect, it } from "vitest";

import {
  COFFEE_MACHINE_PRICE,
  COFFEE_MACHINE_UPGRADE_DEFINITIONS,
  applyCoffeeMonthlyEffect,
  buyCoffee,
  buyCoffeeMachine,
  canBuyCoffee,
  canUpgradeCoffeeMachine,
  createCoffeeState,
  getCoffeeBuyPrice,
  getCoffeeMachineOwnedText,
  getCoffeeMachineSellPrice,
  getCurrentCoffeeBonus,
  upgradeCoffeeMachine,
} from "../src/core/v2-coffee-system";

describe("v2 coffee system", () => {
  it("exposes the audited coffee machine prices and upgrades", () => {
    expect(COFFEE_MACHINE_PRICE).toBe(5);
    expect(COFFEE_MACHINE_UPGRADE_DEFINITIONS.map((item) => [item.id, item.price])).toEqual([
      ["automatic", 16],
      ["advanced", 20],
      ["unlimited", 18],
    ]);
  });

  it("matches the audited manual coffee buying rules", () => {
    const base = createCoffeeState();
    expect(canBuyCoffee(base)).toBe(true);
    expect(getCoffeeBuyPrice(base)).toBe(2);

    const withMachine = buyCoffeeMachine(base);
    const fifteenthCupReady = { ...withMachine, machineTrackedCoffeeCount: 15, totalCoffeeBought: 15 };
    expect(getCurrentCoffeeBonus(fifteenthCupReady)).toBe(1);

    const drunk = buyCoffee(withMachine);
    expect(drunk.price).toBe(2);
    expect(drunk.sanGain).toBe(3);
    expect(drunk.coffeeState.manualCoffeeBoughtThisMonth).toBe(1);
    expect(drunk.coffeeState.machineTrackedCoffeeCount).toBe(1);
    expect(canBuyCoffee(drunk.coffeeState)).toBe(false);
  });

  it("matches the audited upgrade-specific rules", () => {
    const base = buyCoffeeMachine(createCoffeeState());
    expect(canUpgradeCoffeeMachine(base, "automatic")).toBe(true);

    const advanced = upgradeCoffeeMachine({ ...base, machineTrackedCoffeeCount: 24 }, "advanced");
    expect(getCurrentCoffeeBonus(advanced)).toBe(2);
    expect(getCoffeeMachineOwnedText(advanced)).toContain("高级");
    expect(getCoffeeMachineSellPrice(advanced)).toBe(12);

    const unlimited = upgradeCoffeeMachine(base, "unlimited");
    const afterFirstCup = buyCoffee(unlimited).coffeeState;
    expect(getCoffeeBuyPrice(afterFirstCup)).toBe(3);

    const automatic = upgradeCoffeeMachine(base, "automatic");
    const monthly = applyCoffeeMonthlyEffect(automatic, 10);
    expect(monthly.moneyDelta).toBe(-2);
    expect(monthly.sanDelta).toBe(3);
    expect(monthly.coffeeState.totalCoffeeBought).toBe(1);
    expect(monthly.coffeeState.manualCoffeeBoughtThisMonth).toBe(0);
  });
});
