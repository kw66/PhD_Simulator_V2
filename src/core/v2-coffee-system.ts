import type { CoffeeMachineUpgradeId, CoffeeState } from "./v2-types";

export interface CoffeeMachineUpgradeDefinition {
  id: Exclude<CoffeeMachineUpgradeId, null>;
  name: string;
  description: string;
  price: number;
}

export const COFFEE_MACHINE_PRICE = 5;
export const BASE_COFFEE_PRICE = 2;

export const COFFEE_MACHINE_UPGRADE_DEFINITIONS: CoffeeMachineUpgradeDefinition[] = [
  { id: "manual", name: "手动咖啡机", description: "冰美式价格降低 1 金币", price: 12 },
  { id: "automatic", name: "自动咖啡机", description: "每月初额外生产一杯冰美式，金币 -2，SAN +3", price: 16 },
  { id: "advanced", name: "高级咖啡机", description: "每累计生产 10 杯冰美式，效果提升 1（最多 +5）", price: 18 },
  { id: "unlimited", name: "无限咖啡机", description: "每月可无限生产冰美式，价格按 2/3/4... 递增", price: 16 },
];

export function createCoffeeState(): CoffeeState {
  return {
    machineOwned: false,
    machineUpgrade: null,
    machineInvestment: 0,
    subscriptionEnabled: false,
    subscriptionPaused: false,
    coffeePurchaseCountThisMonth: 0,
    coffeeProducedCountThisMonth: 0,
    machineTrackedCoffeeCount: 0,
  };
}

export function getCurrentCoffeeBonus(coffeeState: CoffeeState): number {
  if (!coffeeState.machineOwned || coffeeState.machineUpgrade !== "advanced") return 0;
  return Math.min(5, Math.floor(coffeeState.machineTrackedCoffeeCount / 10));
}

export function getCoffeeBuyPrice(coffeeState: CoffeeState): number {
  if (coffeeState.machineUpgrade === "unlimited") {
    return BASE_COFFEE_PRICE + coffeeState.coffeePurchaseCountThisMonth;
  }
  if (coffeeState.machineUpgrade === "manual") return BASE_COFFEE_PRICE - 1;
  return BASE_COFFEE_PRICE;
}

export function canSellCoffeeMachine(coffeeState: CoffeeState): boolean {
  return coffeeState.machineOwned === true;
}

export function getCoffeeMachineSellPrice(coffeeState: CoffeeState): number {
  return Math.floor(coffeeState.machineInvestment / 2);
}

export function getCoffeeMachineOwnedText(coffeeState: CoffeeState): string {
  if (!coffeeState.machineOwned) return "未拥有";
  if (coffeeState.machineUpgrade === "manual") return "已拥有（手动）";
  if (coffeeState.machineUpgrade === "automatic") return "已拥有（自动）";
  if (coffeeState.machineUpgrade === "advanced") return `已拥有（高级，累计 ${coffeeState.machineTrackedCoffeeCount} 杯）`;
  if (coffeeState.machineUpgrade === "unlimited") return "已拥有（无限）";
  return "已拥有（基础）";
}

export function getAvailableCoffeeMachineUpgrades(coffeeState: CoffeeState): CoffeeMachineUpgradeDefinition[] {
  if (!coffeeState.machineOwned || coffeeState.machineUpgrade !== null) {
    return [];
  }
  return [...COFFEE_MACHINE_UPGRADE_DEFINITIONS];
}
