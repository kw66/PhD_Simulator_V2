import type { ChairUpgradeId, CoffeeMachineUpgradeId } from "./v2-types";

export interface ShopState {
  /** 0 means no GPU; positive values are one-based indices into the GPU upgrade chain. */
  gpuLevel: number;
  investments: ShopInvestmentState;
  entitlements: ShopEntitlementState;
  chairOwned: boolean;
  chairUpgrade: ChairUpgradeId;
  /** Total SAN actually restored by chair effects during this run. */
  chairSanRecovered: number;
  keyboardOwned: boolean;
  monitorOwned: boolean;
  bikeOwned: boolean;
  /** One-based level in the continuous bicycle upgrade chain. */
  bikeLevel: number;
  ebikeOwned: boolean;
  bikeSanSpent: number;
  bikeSanCapGains: number;
}

export interface ShopInvestmentState {
  gpu: number;
  chair: number;
  keyboard: number;
  monitor: number;
  bike: number;
}

export interface ShopEntitlementState {
  gpuTransaction: number;
  keyboardPurchase: number;
  monitorPurchase: number;
  chairPurchase: number;
  chairUpgrade: number;
  coffeeMachinePurchase: number;
  coffeeMachineUpgrade: number;
}

/** AI providers shown in the shop. Each provider has one model active at a time. */
export type AiSlotId = "gpt" | "claude" | "gemini" | "deepseek" | "doubao" | "kimi";

export interface AiSubscriptionState {
  enabled: boolean;
  active: boolean;
  paused: boolean;
  modelId: string | null;
  lastRenewalTotalMonths: number | null;
}

export interface AiShopState {
  subscriptions: Record<AiSlotId, AiSubscriptionState>;
}

export interface ReadingState {
  readCount: number;
}

export interface MonthlyActionState {
  used: number;
  limit: number;
  aiResearchBonusUsed: boolean;
}

export interface CoffeeState {
  machineOwned: boolean;
  machineUpgrade: CoffeeMachineUpgradeId;
  machineInvestment: number;
  subscriptionEnabled: boolean;
  subscriptionPaused: boolean;
  /** Cups paid for this month; used by the one-cup limit and progressive pricing. */
  coffeePurchaseCountThisMonth: number;
  /** All cups produced this month, including automatic-machine output. */
  coffeeProducedCountThisMonth: number;
  machineTrackedCoffeeCount: number;
}
