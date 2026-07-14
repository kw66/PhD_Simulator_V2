import { getSeasonByMonth } from "./v2-sanity-rules";
import type { PaperActionType, ShopState } from "./v2-types";
import type {
  ChairEmergencyRecoveryResult,
  ShopActionModifier,
  ShopMonthlyModifier,
} from "./v2-shop-items-shared";

export function getShopPaperActionModifier(shopState: ShopState, actionType: PaperActionType): ShopActionModifier {
  const modifier: ShopActionModifier = {
    bonus: 0,
    extraActions: 0,
    sanDiscount: 0,
  };

  if (actionType === "experiment") {
    modifier.bonus += shopState.gpuServersBought;
    modifier.extraActions += shopState.gpuServersBought;
  }

  if (actionType === "writing" && shopState.keyboardOwned) {
    modifier.bonus += 1;
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

export function getChairFlatMonthlySanBonus(shopState: ShopState): number {
  if (!shopState.chairOwned) return 0;
  if (shopState.chairUpgrade === null) return 1;
  if (shopState.chairUpgrade === "advanced") return 2;
  return 0;
}

export function applyChairEmergencyRecovery(shopState: ShopState, san: number): ChairEmergencyRecoveryResult {
  if (shopState.chairUpgrade === "spike" && san <= 0) {
    return {
      san: 2,
      triggered: true,
    };
  }

  return {
    san,
    triggered: false,
  };
}

export function applyShopMonthlyModifier(shopState: ShopState, month: number): ShopMonthlyModifier {
  const nextShopState = { ...shopState };
  const logs: string[] = [];
  const sanDelta = 0;
  const sanCapDelta = 0;

  if (!shopState.bikeOwned) {
    return {
      shopState: nextShopState,
      sanDelta,
      sanCapDelta,
      logs,
    };
  }

  if (shopState.bikeUpgrade === "ebike") {
    const season = getSeasonByMonth(month);
    const bikeSeasonSanDelta = season === "spring" || season === "autumn" ? 1 : 0;
    if (bikeSeasonSanDelta > 0) {
      logs.push(`小电驴月结生效，SAN +${bikeSeasonSanDelta}。`);
    }
    return {
      shopState: nextShopState,
      sanDelta: sanDelta + bikeSeasonSanDelta,
      sanCapDelta,
      logs,
    };
  }

  const monthlySanCost = shopState.bikeUpgrade === "road" ? 2 : 1;
  const sanThreshold = shopState.bikeUpgrade === "road" ? 5 : 6;
  const maxSanCapGains = shopState.bikeUpgrade === "road" ? 12 : 6;
  nextShopState.bikeSanSpent += monthlySanCost;
  logs.push(`自行车月结生效，SAN ${monthlySanCost > 0 ? `-${monthlySanCost}` : "+0"}。`);

  const previousThresholdCount = Math.floor(shopState.bikeSanSpent / sanThreshold);
  const currentThresholdCount = Math.floor(nextShopState.bikeSanSpent / sanThreshold);
  const reachedNewThreshold = currentThresholdCount > previousThresholdCount;
  if (!reachedNewThreshold || shopState.bikeSanCapGains >= maxSanCapGains) {
    return {
      shopState: nextShopState,
      sanDelta: sanDelta - monthlySanCost,
      sanCapDelta,
      logs,
    };
  }

  nextShopState.bikeSanCapGains += 1;
  logs.push(`累计骑行消耗达到 ${nextShopState.bikeSanSpent}，SAN 上限 +1（已获得 +${nextShopState.bikeSanCapGains}/${maxSanCapGains}）。`);
  return {
    shopState: nextShopState,
    sanDelta: sanDelta - monthlySanCost,
    sanCapDelta: sanCapDelta + 1,
    logs,
  };
}

export function getChairMonthlyRecovery(shopState: ShopState, currentSan: number, sanCap: number): number {
  if (!shopState.chairOwned) return 0;
  if (shopState.chairUpgrade === "massage") {
    return Math.ceil(Math.max(0, sanCap - currentSan) * 0.1);
  }
  if (shopState.chairUpgrade === "torture") {
    return Math.ceil(Math.max(0, currentSan) * 0.2);
  }
  return 0;
}
