import type { ShopItemId } from "./v2-types";
import {
  getGpuTierDefinition,
  getShopItemDefinition,
  GPU_TIER_DEFINITIONS,
  SHOP_UPGRADE_DEFINITIONS,
  type ShopItemStateView,
  type ShopUpgradeDefinition,
  type ShopUpgradeStateView,
} from "./v2-shop-items-shared";
import { BIKE_TIER_DEFINITIONS, getBikeSanCapLimit, getBikeSellPrice, getBikeTierDefinition } from "./v2-bike-system";

export function isShopItemOwned(view: ShopItemStateView, itemId: ShopItemId): boolean {
  switch (itemId) {
    case "gpu_buy":
      return view.shopState.gpuLevel > 0;
    case "chair":
      return view.shopState.chairOwned === true;
    case "keyboard":
      return view.shopState.keyboardOwned === true;
    case "monitor":
      return view.shopState.monitorOwned === true;
    case "bike":
      return view.shopState.bikeOwned === true;
    case "ebike":
      return view.shopState.ebikeOwned === true;
    case "down_jacket":
      return view.eventSupport.hasDownJacket === true;
    default:
      return false;
  }
}

export function canBuyShopItem(view: ShopItemStateView, itemId: ShopItemId): boolean {
  switch (itemId) {
    case "gpu_buy":
      return view.shopState.gpuLevel < GPU_TIER_DEFINITIONS.length;
    case "chair":
      return view.shopState.chairOwned !== true;
    case "keyboard":
      return view.shopState.keyboardOwned !== true;
    case "monitor":
      return view.shopState.monitorOwned !== true;
    case "bike":
      return view.shopState.bikeOwned !== true || view.shopState.bikeLevel < BIKE_TIER_DEFINITIONS.length;
    case "ebike":
      return view.shopState.ebikeOwned !== true;
    case "down_jacket":
      return view.eventSupport.hasDownJacket !== true;
    default:
      return false;
  }
}

export function canSellShopItem(view: ShopItemStateView, itemId: ShopItemId): boolean {
  return isShopItemOwned(view, itemId);
}

function canUpgradeOwnedItem(view: ShopUpgradeStateView, itemId: ShopItemId): boolean {
  // Only the chair has upgrade routes; the bike levels up through buy-shop-item.
  switch (itemId) {
    case "chair":
      return view.shopState.chairOwned && view.shopState.chairUpgrade === null;
    default:
      return false;
  }
}

export function getAvailableShopUpgrades(view: ShopUpgradeStateView, itemId: ShopItemId): ShopUpgradeDefinition[] {
  if (!canUpgradeOwnedItem(view, itemId)) {
    return [];
  }
  return SHOP_UPGRADE_DEFINITIONS.filter((upgrade) => upgrade.itemId === itemId);
}

function getBikeOwnedText(view: ShopItemStateView): string {
  if (!view.shopState.bikeOwned) return "未拥有";
  const tier = getBikeTierDefinition(view.shopState.bikeLevel);
  const limit = getBikeSanCapLimit(view.shopState);
  return `已拥有（${tier?.name ?? "自行车"}，SAN 上限 +${view.shopState.bikeSanCapGains}/${limit}）`;
}

function getMonitorOwnedText(view: ShopItemStateView): string {
  return view.shopState.monitorOwned ? "已拥有" : "未拥有";
}

function getChairOwnedText(view: ShopItemStateView): string {
  if (!view.shopState.chairOwned) return "未拥有";
  if (view.shopState.chairUpgrade === "advanced") return "已拥有（人体工学椅）";
  if (view.shopState.chairUpgrade === "massage") return "已拥有（电动按摩椅）";
  if (view.shopState.chairUpgrade === "torture") return "已拥有（沙发）";
  if (view.shopState.chairUpgrade === "spike") return "已拥有（锥刺股椅）";
  if (view.shopState.chairUpgrade === "hammock") return "已拥有（吊床）";
  return "已拥有";
}

export function getShopItemOwnedText(view: ShopItemStateView, itemId: ShopItemId): string {
  if (itemId === "gpu_buy") {
    return getGpuTierDefinition(view.shopState.gpuLevel)?.name ?? "未拥有";
  }
  if (itemId === "bike") {
    return getBikeOwnedText(view);
  }
  if (itemId === "ebike") {
    return view.shopState.ebikeOwned ? "已拥有" : "未拥有";
  }
  if (itemId === "monitor") {
    return getMonitorOwnedText(view);
  }
  if (itemId === "chair") {
    return getChairOwnedText(view);
  }
  return isShopItemOwned(view, itemId) ? "已拥有" : "未拥有";
}

export function getShopItemSellPrice(view: ShopItemStateView, itemId: ShopItemId): number {
  const item = getShopItemDefinition(itemId);

  if (itemId === "gpu_buy") {
    return Math.floor(view.shopState.investments.gpu / 2);
  }

  if (itemId === "chair") {
    return Math.floor(view.shopState.investments.chair / 2);
  }

  if (itemId === "keyboard") {
    return Math.floor(view.shopState.investments.keyboard / 2);
  }

  if (itemId === "monitor") {
    return Math.floor(view.shopState.investments.monitor / 2);
  }

  if (itemId === "bike") {
    return getBikeSellPrice(view.shopState);
  }

  return item.sellPrice;
}
