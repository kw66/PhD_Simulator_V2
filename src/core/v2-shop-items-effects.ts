import type { PaperActionType, ShopState } from "./v2-types";
import type { ShopActionModifier } from "./v2-shop-items-shared";

export function getShopPaperActionModifier(shopState: ShopState, actionType: PaperActionType): ShopActionModifier {
  const modifier: ShopActionModifier = {
    bonus: 0,
    extraActions: 0,
    sanDiscount: 0,
  };

  if (actionType === "experiment") {
    modifier.bonus += shopState.gpuLevel;
    modifier.extraActions += shopState.gpuLevel;
  }

  if (actionType === "writing" && shopState.keyboardOwned) {
    modifier.sanDiscount += 1;
  }

  return modifier;
}

export function getShopReadSanDiscount(shopState: ShopState): number {
  return shopState.monitorOwned ? 1 : 0;
}

export function getShopRestSanGain(shopState: ShopState): number {
  return shopState.chairUpgrade === "hammock" ? 5 : 2;
}

export function getShopEmergencySan(shopState: ShopState, currentSan: number): number {
  return shopState.chairUpgrade === "spike" && currentSan <= 0 ? 3 : currentSan;
}

export function getChairMonthlyRecovery(shopState: ShopState, currentSan: number, sanCap: number): number {
  if (!shopState.chairOwned) return 0;
  if (shopState.chairUpgrade === "massage") {
    return Math.floor(Math.max(0, sanCap - currentSan) * 0.2);
  }
  if (shopState.chairUpgrade === "torture") {
    return Math.floor(Math.max(0, currentSan) * 0.2);
  }
  return 0;
}
