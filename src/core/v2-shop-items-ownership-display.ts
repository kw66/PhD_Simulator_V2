import type { ShopItemId } from "./v2-types";
import { getGpuTierDefinition, getShopItemDefinition, type ShopItemStateView } from "./v2-shop-items-shared";
import { getBikeSanCapLimit, getBikeSellPrice, getBikeTierDefinition } from "./v2-bike-system";
import { isShopItemOwned } from "./v2-shop-items-ownership-status";

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
