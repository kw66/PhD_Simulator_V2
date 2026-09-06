import type { EventSupportState, ShopItemId, ShopState, ShopUpgradeId } from "./v2-types";

export interface ShopItemDefinition {
  id: ShopItemId;
  name: string;
  description: string;
  price: number;
  sellPrice: number;
}

export interface ShopItemStateView {
  shopState: ShopState;
  eventSupport: Pick<EventSupportState, "hasDownJacket">;
}

export interface GpuTierDefinition {
  level: number;
  name: string;
}

export interface ShopActionModifier {
  bonus: number;
  extraActions: number;
  sanDiscount: number;
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

export const GPU_UPGRADE_PRICES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export function getNextGpuPrice(currentLevel: number): number | null {
  return GPU_UPGRADE_PRICES[Math.max(0, Math.floor(currentLevel))] ?? null;
}

export const SHOP_ITEM_DEFINITIONS: ShopItemDefinition[] = [
  { id: "gpu_buy", name: "显卡", description: "做实验：+1次，+1分", price: GPU_UPGRADE_PRICES[0], sellPrice: 3 },
  { id: "chair", name: "办公椅", description: "每月 SAN +1", price: 10, sellPrice: 5 },
  { id: "keyboard", name: "机械键盘", description: "写论文消耗减少：SAN -1", price: 7, sellPrice: 3 },
  { id: "monitor", name: "2K 显示器", description: "看论文消耗减少：SAN -1", price: 8, sellPrice: 4 },
  { id: "bike", name: "自行车", description: "骑行每月 SAN -1；每 -6 SAN，SAN 上限 +1（最多 +3）；达到本档上限后不再扣 SAN", price: 6, sellPrice: 3 },
  { id: "ebike", name: "小电驴", description: "春季、秋季每月 SAN +1", price: 12, sellPrice: 6 },
  { id: "down_jacket", name: "羽绒服", description: "使冬季每月 SAN -1 无效", price: 5, sellPrice: 2 },
];

export const GPU_TIER_DEFINITIONS: readonly GpuTierDefinition[] = [
  { level: 1, name: "GTX 1080 Ti 显卡" },
  { level: 2, name: "RTX 2080 Ti 显卡" },
  { level: 3, name: "RTX 3090 显卡" },
  { level: 4, name: "RTX 4090 显卡" },
  { level: 5, name: "RTX A6000 显卡" },
  { level: 6, name: "A800 显卡" },
  { level: 7, name: "A100 显卡" },
  { level: 8, name: "H20 显卡" },
  { level: 9, name: "H200 显卡" },
  { level: 10, name: "B300 显卡" },
];

export function getGpuTierDefinition(level: number): GpuTierDefinition | null {
  const normalizedLevel = Math.floor(level);
  return GPU_TIER_DEFINITIONS.find((tier) => tier.level === normalizedLevel) ?? null;
}

export function getNextGpuTierDefinition(level: number): GpuTierDefinition | null {
  return getGpuTierDefinition(Math.max(0, Math.floor(level)) + 1);
}

export const SHOP_UPGRADE_DEFINITIONS: ShopUpgradeDefinition[] = [
  { id: "chair-advanced", itemId: "chair", name: "人体工学椅", description: "每月 SAN +2", price: 18 },
  { id: "chair-massage", itemId: "chair", name: "电动按摩椅", description: "每月恢复 20% 已损失 SAN（下取整）", price: 20 },
  { id: "chair-torture", itemId: "chair", name: "沙发", description: "每月恢复当前 SAN 的 20%（下取整）", price: 20 },
  { id: "chair-spike", itemId: "chair", name: "锥刺股椅", description: "SAN 小于等于 0 时恢复到 3", price: 16 },
  { id: "chair-hammock", itemId: "chair", name: "吊床", description: "休息动作从 SAN +2 提升为 SAN +5", price: 15 },
];

export function createShopState(): ShopState {
  return {
    gpuLevel: 0,
    investments: {
      gpu: 0,
    chair: 0,
    keyboard: 0,
    monitor: 0,
    bike: 0,
    },
    entitlements: {
      gpuTransaction: 0,
      keyboardPurchase: 0,
      monitorPurchase: 0,
      chairPurchase: 0,
      chairUpgrade: 0,
      coffeeMachinePurchase: 0,
      coffeeMachineUpgrade: 0,
    },
    chairOwned: false,
    chairUpgrade: null,
    chairSanRecovered: 0,
    keyboardOwned: false,
    monitorOwned: false,
    bikeOwned: false,
    bikeLevel: 0,
    ebikeOwned: false,
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
