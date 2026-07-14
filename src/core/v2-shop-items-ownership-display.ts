import type { ShopItemId } from "./v2-types";
import { getShopItemDefinition, type ShopItemStateView } from "./v2-shop-items-shared";
import { isShopItemOwned } from "./v2-shop-items-ownership-status";

function getBikeOwnedText(view: ShopItemStateView): string {
  if (!view.shopState.bikeOwned) return "未拥有";
  if (view.shopState.bikeUpgrade === "road") {
    return `已拥有（公路车，上限 +${view.shopState.bikeSanCapGains}/12）`;
  }
  if (view.shopState.bikeUpgrade === "ebike") {
    return "已拥有（小电驴）";
  }
  return `已拥有（上限 +${view.shopState.bikeSanCapGains}/6）`;
}

function getMonitorOwnedText(view: ShopItemStateView): string {
  if (!view.shopState.monitorOwned) return "未拥有";
  if (view.shopState.monitorUpgrade === "4k") return "已拥有（4K 显示器）";
  if (view.shopState.monitorUpgrade === "smart") return "已拥有（智能显示器）";
  if (view.shopState.monitorUpgrade === "dual") return "已拥有（双屏显示器）";
  return "已拥有";
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
    return `已购 ${view.shopState.gpuServersBought}`;
  }
  if (itemId === "bike") {
    return getBikeOwnedText(view);
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

  if (itemId === "monitor") {
    return view.shopState.monitorUpgrade ? 11 : item.sellPrice;
  }

  if (itemId === "chair") {
    if (view.shopState.chairUpgrade === "advanced") return 14;
    if (view.shopState.chairUpgrade === "massage") return 15;
    if (view.shopState.chairUpgrade === "torture") return 15;
    if (view.shopState.chairUpgrade === "spike") return 14;
    if (view.shopState.chairUpgrade === "hammock") return 13;
    return item.sellPrice;
  }

  if (itemId === "bike") {
    if (view.shopState.bikeUpgrade === "road") return 15;
    if (view.shopState.bikeUpgrade === "ebike") return 11;
  }

  return item.sellPrice;
}
