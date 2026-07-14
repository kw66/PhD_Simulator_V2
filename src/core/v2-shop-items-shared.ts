import type { EventSupportState, ShopItemId, ShopState, ShopUpgradeId } from "./v2-types";

export interface ShopItemDefinition {
  id: ShopItemId;
  name: string;
  description: string;
  price: number;
  sellPrice: number;
  repeatable: boolean;
}

export interface ShopItemStateView {
  shopState: ShopState;
  eventSupport: Pick<EventSupportState, "hasDownJacket">;
  totalMonths: number;
}

export interface ShopActionModifier {
  bonus: number;
  extraActions: number;
  sanDiscount: number;
}

export interface ShopMonthlyModifier {
  shopState: ShopState;
  sanDelta: number;
  sanCapDelta: number;
  logs: string[];
}

export interface ChairEmergencyRecoveryResult {
  san: number;
  triggered: boolean;
}

export interface ShopUpgradeDefinition {
  id: ShopUpgradeId;
  itemId: ShopItemId;
  name: string;
  description: string;
  price: number;
}

export interface ShopUpgradeStateView {
  shopState: ShopState;
}

export const SHOP_ITEM_DEFINITIONS: ShopItemDefinition[] = [
  { id: "gpu_buy", name: "显卡", description: "做实验 +1 次，+1 分。库存上限等于当前总月数。", price: 10, sellPrice: 6, repeatable: true },
  { id: "chair", name: "办公椅", description: "每月 SAN +1。", price: 10, sellPrice: 5, repeatable: false },
  { id: "keyboard", name: "机械键盘", description: "写作 SAN -1，写作 +1 分。", price: 8, sellPrice: 4, repeatable: false },
  { id: "monitor", name: "2K 显示器", description: "看论文 SAN -1。", price: 8, sellPrice: 4, repeatable: false },
  { id: "bike", name: "自行车", description: "每月 SAN -1；累计骑行消耗每满 6 点，SAN 上限 +1（最多 +6）。", price: 10, sellPrice: 5, repeatable: false },
  { id: "down_jacket", name: "羽绒服", description: "使冬季每月 SAN -1 无效。", price: 8, sellPrice: 4, repeatable: false },
];

export const SHOP_UPGRADE_DEFINITIONS: ShopUpgradeDefinition[] = [
  { id: "bike-road", itemId: "bike", name: "公路车", description: "每月 SAN -2；累计骑行消耗每满 5 点，SAN 上限 +1（最多 +12）。", price: 20 },
  { id: "bike-ebike", itemId: "bike", name: "小电驴", description: "春季和秋季每月 SAN +1。", price: 12 },
  { id: "monitor-4k", itemId: "monitor", name: "4K 显示器", description: "手动看论文 SAN 变为 0；想 idea 时每 10 次阅读额外 +1。", price: 15 },
  { id: "monitor-smart", itemId: "monitor", name: "智能显示器", description: "手动看论文 SAN 变为 2；持有期间每 10 次阅读使本次阅读给的 idea buff 额外 +1。", price: 15 },
  { id: "monitor-dual", itemId: "monitor", name: "双屏显示器", description: "手动看论文 SAN 变为 2；每月自动阅读一次（SAN -2）。", price: 15 },
  { id: "chair-advanced", itemId: "chair", name: "人体工学椅", description: "每月 SAN +2。", price: 18 },
  { id: "chair-massage", itemId: "chair", name: "电动按摩椅", description: "每月恢复 10% 已损失 SAN（上取整）。", price: 20 },
  { id: "chair-torture", itemId: "chair", name: "沙发", description: "每月恢复当前 SAN 的 20%（上取整）。", price: 20 },
  { id: "chair-spike", itemId: "chair", name: "锥刺股椅", description: "SAN 小于等于 0 时恢复到 2。", price: 18 },
  { id: "chair-hammock", itemId: "chair", name: "吊床", description: "休息动作改为 SAN +5。", price: 16 },
];

export function createShopState(): ShopState {
  return {
    gpuServersBought: 0,
    chairOwned: false,
    chairUpgrade: null,
    keyboardOwned: false,
    monitorOwned: false,
    monitorUpgrade: null,
    bikeOwned: false,
    bikeUpgrade: null,
    bikeSanSpent: 0,
    bikeSanCapGains: 0,
  };
}

export function getShopItemDefinition(itemId: ShopItemId): ShopItemDefinition {
  const item = SHOP_ITEM_DEFINITIONS.find((definition) => definition.id === itemId);
  if (!item) {
    throw new Error(`Unknown shop item: ${itemId}`);
  }
  return item;
}

export function getShopUpgradeDefinition(upgradeId: ShopUpgradeId): ShopUpgradeDefinition {
  const upgrade = SHOP_UPGRADE_DEFINITIONS.find((definition) => definition.id === upgradeId);
  if (!upgrade) {
    throw new Error(`Unknown shop upgrade: ${upgradeId}`);
  }
  return upgrade;
}
