import type { CoffeeMachineUpgradeId, CoffeeState } from "./v2-types";

export interface CoffeeMachineUpgradeDefinition {
  id: Exclude<CoffeeMachineUpgradeId, null>;
  name: string;
  description: string;
  price: number;
}

export interface CoffeePurchaseResult {
  coffeeState: CoffeeState;
  price: number;
  sanGain: number;
}

export interface CoffeeMonthlyResult {
  coffeeState: CoffeeState;
  moneyDelta: number;
  sanDelta: number;
  logs: string[];
}

export const COFFEE_MACHINE_PRICE = 5;
export const BASE_COFFEE_PRICE = 2;

export const COFFEE_MACHINE_UPGRADE_DEFINITIONS: CoffeeMachineUpgradeDefinition[] = [
  { id: "automatic", name: "自动咖啡机", description: "每月自动喝一次冰美式（-2 金币，SAN +3）。", price: 16 },
  { id: "advanced", name: "高级咖啡机", description: "每累计 12 杯冰美式，额外 SAN +1（最多 +5）。", price: 20 },
  { id: "unlimited", name: "无限咖啡机", description: "每月可无限购买冰美式，价格按 2/3/4... 递增。", price: 18 },
];

export function createCoffeeState(): CoffeeState {
  return {
    machineOwned: false,
    machineUpgrade: null,
    manualCoffeeBoughtThisMonth: 0,
    totalCoffeeBought: 0,
    machineTrackedCoffeeCount: 0,
  };
}

export function getCoffeeMachineUpgradeDefinition(upgradeId: Exclude<CoffeeMachineUpgradeId, null>): CoffeeMachineUpgradeDefinition {
  const upgrade = COFFEE_MACHINE_UPGRADE_DEFINITIONS.find((definition) => definition.id === upgradeId);
  if (!upgrade) {
    throw new Error(`Unknown coffee machine upgrade: ${upgradeId}`);
  }
  return upgrade;
}

export function getCurrentCoffeeBonus(coffeeState: CoffeeState): number {
  if (!coffeeState.machineOwned) return 0;
  if (coffeeState.machineUpgrade === "advanced") {
    return Math.min(5, Math.floor(coffeeState.machineTrackedCoffeeCount / 12));
  }
  if (coffeeState.machineUpgrade === null) {
    return Math.min(2, Math.floor(coffeeState.machineTrackedCoffeeCount / 15));
  }
  return 0;
}

export function getCoffeeBuyPrice(coffeeState: CoffeeState): number {
  if (coffeeState.machineUpgrade === "unlimited") {
    return BASE_COFFEE_PRICE + coffeeState.manualCoffeeBoughtThisMonth;
  }
  return BASE_COFFEE_PRICE;
}

export function canBuyCoffee(coffeeState: CoffeeState): boolean {
  if (coffeeState.machineUpgrade === "unlimited") {
    return true;
  }
  return coffeeState.manualCoffeeBoughtThisMonth < 1;
}

export function buyCoffee(coffeeState: CoffeeState): CoffeePurchaseResult {
  const price = getCoffeeBuyPrice(coffeeState);
  const sanGain = 3 + getCurrentCoffeeBonus(coffeeState);
  const nextCoffeeState: CoffeeState = {
    ...coffeeState,
    manualCoffeeBoughtThisMonth: coffeeState.manualCoffeeBoughtThisMonth + 1,
    totalCoffeeBought: coffeeState.totalCoffeeBought + 1,
    machineTrackedCoffeeCount: coffeeState.machineOwned
      ? coffeeState.machineTrackedCoffeeCount + 1
      : coffeeState.machineTrackedCoffeeCount,
  };

  return {
    coffeeState: nextCoffeeState,
    price,
    sanGain,
  };
}

export function canBuyCoffeeMachine(coffeeState: CoffeeState): boolean {
  return coffeeState.machineOwned !== true;
}

export function canSellCoffeeMachine(coffeeState: CoffeeState): boolean {
  return coffeeState.machineOwned === true;
}

export function getCoffeeMachineSellPrice(coffeeState: CoffeeState): number {
  if (coffeeState.machineUpgrade === "automatic") return 10;
  if (coffeeState.machineUpgrade === "advanced") return 12;
  if (coffeeState.machineUpgrade === "unlimited") return 11;
  return 2;
}

export function buyCoffeeMachine(coffeeState: CoffeeState): CoffeeState {
  return {
    ...coffeeState,
    machineOwned: true,
    machineUpgrade: null,
  };
}

export function canUpgradeCoffeeMachine(coffeeState: CoffeeState, upgradeId: Exclude<CoffeeMachineUpgradeId, null>): boolean {
  if (!coffeeState.machineOwned || coffeeState.machineUpgrade !== null) {
    return false;
  }
  return COFFEE_MACHINE_UPGRADE_DEFINITIONS.some((upgrade) => upgrade.id === upgradeId);
}

export function upgradeCoffeeMachine(coffeeState: CoffeeState, upgradeId: Exclude<CoffeeMachineUpgradeId, null>): CoffeeState {
  return {
    ...coffeeState,
    machineUpgrade: upgradeId,
  };
}

export function sellCoffeeMachine(coffeeState: CoffeeState): CoffeeState {
  return {
    ...coffeeState,
    machineOwned: false,
    machineUpgrade: null,
  };
}

export function getCoffeeMachineOwnedText(coffeeState: CoffeeState): string {
  if (!coffeeState.machineOwned) return "未拥有";
  if (coffeeState.machineUpgrade === "automatic") return `已拥有（自动，累计 ${coffeeState.machineTrackedCoffeeCount} 杯）`;
  if (coffeeState.machineUpgrade === "advanced") return `已拥有（高级，累计 ${coffeeState.machineTrackedCoffeeCount} 杯）`;
  if (coffeeState.machineUpgrade === "unlimited") return `已拥有（无限，累计 ${coffeeState.machineTrackedCoffeeCount} 杯）`;
  return `已拥有（基础，累计 ${coffeeState.machineTrackedCoffeeCount} 杯）`;
}

export function getAvailableCoffeeMachineUpgrades(coffeeState: CoffeeState): CoffeeMachineUpgradeDefinition[] {
  if (!coffeeState.machineOwned || coffeeState.machineUpgrade !== null) {
    return [];
  }
  return [...COFFEE_MACHINE_UPGRADE_DEFINITIONS];
}

export function startNextCoffeeMonth(coffeeState: CoffeeState): CoffeeState {
  return {
    ...coffeeState,
    manualCoffeeBoughtThisMonth: 0,
  };
}

export function applyCoffeeMonthlyEffect(coffeeState: CoffeeState, currentMoney: number): CoffeeMonthlyResult {
  const nextCoffeeState = startNextCoffeeMonth(coffeeState);
  const logs: string[] = [];
  if (nextCoffeeState.machineUpgrade !== "automatic" || currentMoney < 2) {
    return {
      coffeeState: nextCoffeeState,
      moneyDelta: 0,
      sanDelta: 0,
      logs,
    };
  }

  nextCoffeeState.totalCoffeeBought += 1;
  nextCoffeeState.machineTrackedCoffeeCount += 1;
  logs.push("自动咖啡机生效，金钱 -2，SAN +3。")

  return {
    coffeeState: nextCoffeeState,
    moneyDelta: -2,
    sanDelta: 3,
    logs,
  };
}
