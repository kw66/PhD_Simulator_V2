import type { ShopItemId, ShopUpgradeId } from "./v2-types";
import {
  SHOP_UPGRADE_DEFINITIONS,
  getShopUpgradeDefinition,
  type ShopItemStateView,
  type ShopUpgradeDefinition,
  type ShopUpgradeStateView,
} from "./v2-shop-items-shared";

export function isShopItemOwned(view: ShopItemStateView, itemId: ShopItemId): boolean {
  switch (itemId) {
    case "gpu_buy":
      return view.shopState.gpuServersBought > 0;
    case "chair":
      return view.shopState.chairOwned === true;
    case "keyboard":
      return view.shopState.keyboardOwned === true;
    case "monitor":
      return view.shopState.monitorOwned === true;
    case "bike":
      return view.shopState.bikeOwned === true;
    case "down_jacket":
      return view.eventSupport.hasDownJacket === true;
    default:
      return false;
  }
}

export function canBuyShopItem(view: ShopItemStateView, itemId: ShopItemId): boolean {
  switch (itemId) {
    case "gpu_buy":
      return view.shopState.gpuServersBought < Math.max(1, view.totalMonths);
    case "chair":
      return view.shopState.chairOwned !== true;
    case "keyboard":
      return view.shopState.keyboardOwned !== true;
    case "monitor":
      return view.shopState.monitorOwned !== true;
    case "bike":
      return view.shopState.bikeOwned !== true;
    case "down_jacket":
      return view.eventSupport.hasDownJacket !== true;
    default:
      return false;
  }
}

export function canSellShopItem(view: ShopItemStateView, itemId: ShopItemId): boolean {
  return isShopItemOwned(view, itemId);
}

function getUpgradeableItemId(upgradeId: ShopUpgradeId): ShopItemId {
  return getShopUpgradeDefinition(upgradeId).itemId;
}

function canUpgradeOwnedItem(view: ShopUpgradeStateView, itemId: ShopItemId): boolean {
  switch (itemId) {
    case "monitor":
      return view.shopState.monitorOwned && view.shopState.monitorUpgrade === null;
    case "bike":
      return view.shopState.bikeOwned && view.shopState.bikeUpgrade === null;
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

export function canUpgradeShopItem(view: ShopUpgradeStateView, upgradeId: ShopUpgradeId): boolean {
  return canUpgradeOwnedItem(view, getUpgradeableItemId(upgradeId));
}
