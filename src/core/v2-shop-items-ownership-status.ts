import type { ShopItemId } from "./v2-types";
import {
  GPU_TIER_DEFINITIONS,
  SHOP_UPGRADE_DEFINITIONS,
  type ShopItemStateView,
  type ShopUpgradeDefinition,
  type ShopUpgradeStateView,
} from "./v2-shop-items-shared";
import { BIKE_TIER_DEFINITIONS } from "./v2-bike-system";

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
  // Bicycle routes are no longer offered by the UI; legacy callers are handled in transactions.
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
