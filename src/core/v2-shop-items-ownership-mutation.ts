import type { EventSupportState, ShopItemId, ShopState, ShopUpgradeId } from "./v2-types";

export function applyShopItemOwnership(
  shopState: ShopState,
  eventSupport: EventSupportState,
  itemId: ShopItemId,
  owned: boolean,
): { shopState: ShopState; eventSupport: EventSupportState } {
  const nextShopState = { ...shopState };
  const nextEventSupport = { ...eventSupport };

  switch (itemId) {
    case "gpu_buy":
      nextShopState.gpuServersBought = owned
        ? nextShopState.gpuServersBought + 1
        : Math.max(0, nextShopState.gpuServersBought - 1);
      break;
    case "chair":
      nextShopState.chairOwned = owned;
      if (!owned) {
        nextShopState.chairUpgrade = null;
      }
      break;
    case "keyboard":
      nextShopState.keyboardOwned = owned;
      break;
    case "monitor":
      nextShopState.monitorOwned = owned;
      if (!owned) {
        nextShopState.monitorUpgrade = null;
      }
      break;
    case "bike":
      nextShopState.bikeOwned = owned;
      if (!owned) {
        nextShopState.bikeUpgrade = null;
      }
      break;
    case "down_jacket":
      nextEventSupport.hasDownJacket = owned;
      break;
    default:
      break;
  }

  return {
    shopState: nextShopState,
    eventSupport: nextEventSupport,
  };
}

export function applyShopItemUpgrade(shopState: ShopState, upgradeId: ShopUpgradeId): ShopState {
  const nextShopState = { ...shopState };

  switch (upgradeId) {
    case "bike-road":
      nextShopState.bikeUpgrade = "road";
      break;
    case "bike-ebike":
      nextShopState.bikeUpgrade = "ebike";
      break;
    case "monitor-4k":
      nextShopState.monitorUpgrade = "4k";
      break;
    case "monitor-smart":
      nextShopState.monitorUpgrade = "smart";
      break;
    case "monitor-dual":
      nextShopState.monitorUpgrade = "dual";
      break;
    case "chair-advanced":
      nextShopState.chairUpgrade = "advanced";
      break;
    case "chair-massage":
      nextShopState.chairUpgrade = "massage";
      break;
    case "chair-torture":
      nextShopState.chairUpgrade = "torture";
      break;
    case "chair-spike":
      nextShopState.chairUpgrade = "spike";
      break;
    case "chair-hammock":
      nextShopState.chairUpgrade = "hammock";
      break;
    default:
      break;
  }

  return nextShopState;
}
