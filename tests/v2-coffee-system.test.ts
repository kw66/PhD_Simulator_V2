import { describe, expect, it } from "vitest";

import {
  COFFEE_MACHINE_PRICE,
  COFFEE_MACHINE_UPGRADE_DEFINITIONS,
  canSellCoffeeMachine,
  createCoffeeState,
  getAvailableCoffeeMachineUpgrades,
  getCoffeeBuyPrice,
  getCoffeeMachineOwnedText,
  getCoffeeMachineSellPrice,
  getCurrentCoffeeBonus,
} from "../src/core/v2-coffee-system";

describe("v2 coffee system", () => {
  it("exposes the audited coffee machine prices and upgrades", () => {
    expect(COFFEE_MACHINE_PRICE).toBe(5);
    expect(COFFEE_MACHINE_UPGRADE_DEFINITIONS.map((item) => [item.id, item.price])).toEqual([
      ["manual", 12],
      ["automatic", 16],
      ["advanced", 18],
      ["unlimited", 16],
    ]);
    expect(COFFEE_MACHINE_UPGRADE_DEFINITIONS.map((item) => item.description)).toEqual([
      "冰美式价格降低 1 金币",
      "每月初额外生产一杯冰美式，金币 -2，SAN +3",
      "每累计生产 10 杯冰美式，效果提升 1（最多 +5）",
      "每月可无限生产冰美式，价格按 2/3/4... 递增",
    ]);
  });

  it("exposes current coffee availability and display queries", () => {
    const base = createCoffeeState();
    expect(canSellCoffeeMachine(base)).toBe(false);
    expect(getCoffeeBuyPrice(base)).toBe(2);
    expect(getAvailableCoffeeMachineUpgrades(base)).toEqual([]);

    const baseMachine = {
      ...base,
      machineOwned: true,
      machineInvestment: 5,
      machineTrackedCoffeeCount: 30,
    };
    expect(getCurrentCoffeeBonus(baseMachine)).toBe(0);
    expect(canSellCoffeeMachine(baseMachine)).toBe(true);
    expect(getAvailableCoffeeMachineUpgrades(baseMachine)).toHaveLength(4);

    const manual = { ...baseMachine, machineUpgrade: "manual" as const };
    expect(getCoffeeBuyPrice(manual)).toBe(1);

    const advanced = { ...baseMachine, machineUpgrade: "advanced" as const, machineInvestment: 23, machineTrackedCoffeeCount: 24 };
    expect(getCurrentCoffeeBonus(advanced)).toBe(2);
    expect(getCoffeeMachineOwnedText(advanced)).toContain("高级");
    expect(getCoffeeMachineSellPrice(advanced)).toBe(11);
  });
});
