import { describe, expect, it } from "vitest";

import {
  SHOP_ITEM_DEFINITIONS,
  SHOP_UPGRADE_DEFINITIONS,
  GPU_TIER_DEFINITIONS,
  GPU_UPGRADE_PRICES,
  canBuyShopItem,
  canSellShopItem,
  createShopState,
  getAvailableShopUpgrades,
  getChairMonthlyRecovery,
  getGpuTierDefinition,
  getNextGpuTierDefinition,
  getNextGpuPrice,
  getShopItemDefinition,
  getShopItemOwnedText,
  getShopItemSellPrice,
  getShopPaperActionModifier,
  getShopEmergencySan,
  getShopReadSanDiscount,
  getShopRestSanGain,
  isShopItemOwned,
} from "../src/core/v2-shop-items";
import { BIKE_TIER_DEFINITIONS, getBikeMonthlySanCost, getBikeSanCapLimit, getBikeTierDefinition } from "../src/core/v2-bike-system";

const baseSupport = { hasDownJacket: false };

describe("v2 shop items", () => {
  it("exposes the preview catalog from one source", () => {
    expect(SHOP_ITEM_DEFINITIONS.map((item) => item.id)).toEqual([
      "gpu_buy",
      "chair",
      "keyboard",
      "monitor",
      "bike",
      "ebike",
      "down_jacket",
    ]);
    expect(SHOP_UPGRADE_DEFINITIONS).toHaveLength(5);
    expect(getShopItemDefinition("monitor").price).toBe(8);
    expect(getShopItemDefinition("monitor").description).toBe("看论文消耗减少：SAN -1");
    expect(getShopItemDefinition("keyboard")).toMatchObject({ price: 7, description: "写论文消耗减少：SAN -1" });
    expect(SHOP_ITEM_DEFINITIONS.find((item) => item.id === "bike")).toMatchObject({ price: 6 });
    expect(SHOP_ITEM_DEFINITIONS.find((item) => item.id === "ebike")).toMatchObject({ price: 12 });
    expect(BIKE_TIER_DEFINITIONS.map((tier) => [tier.name, tier.monthlySanCost, tier.sanCapLimit, tier.price])).toEqual([
      ["通勤自行车", 1, 3, 6],
      ["入门公路车", 1, 6, 6],
      ["轻量公路车", 2, 9, 6],
      ["竞赛级公路车", 2, 12, 6],
    ]);
    expect(GPU_UPGRADE_PRICES).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(getNextGpuPrice(0)).toBe(6);
    expect(getNextGpuPrice(9)).toBe(15);
    expect(getNextGpuPrice(10)).toBeNull();
    expect(GPU_TIER_DEFINITIONS.map((tier) => tier.name)).toEqual([
      "GTX 1080 Ti 显卡",
      "RTX 2080 Ti 显卡",
      "RTX 3090 显卡",
      "RTX 4090 显卡",
      "RTX A6000 显卡",
      "A800 显卡",
      "A100 显卡",
      "H20 显卡",
      "H200 显卡",
      "B300 显卡",
    ]);
    expect(getGpuTierDefinition(1)?.name).toBe("GTX 1080 Ti 显卡");
    expect(getNextGpuTierDefinition(9)?.name).toBe("B300 显卡");
    expect(getNextGpuTierDefinition(10)).toBeNull();
  });

  it("uses the active bicycle tier for SAN cost and cap growth", () => {
    const base = createShopState();
    expect(getBikeTierDefinition(3)?.name).toBe("轻量公路车");
    expect(getBikeSanCapLimit({ ...base, bikeLevel: 4 })).toBe(12);
    expect(getBikeMonthlySanCost({ ...base, bikeOwned: true, bikeLevel: 3, bikeSanCapGains: 2 })).toBe(2);
    expect(getBikeMonthlySanCost({ ...base, bikeOwned: true, bikeLevel: 3, bikeSanCapGains: 9 })).toBe(0);
  });

  it("derives ownership, availability, display text and sell prices", () => {
    const base = { shopState: createShopState(), eventSupport: baseSupport };
    expect(canBuyShopItem(base, "chair")).toBe(true);
    expect(canSellShopItem(base, "chair")).toBe(false);
    expect(getShopItemOwnedText(base, "chair")).toBe("未拥有");

    const owned = {
      ...base,
      shopState: {
        ...base.shopState,
        chairOwned: true,
        chairUpgrade: "advanced" as const,
        investments: { ...base.shopState.investments, chair: 28 },
      },
    };
    expect(isShopItemOwned(owned, "chair")).toBe(true);
    expect(canBuyShopItem(owned, "chair")).toBe(false);
    expect(canSellShopItem(owned, "chair")).toBe(true);
    expect(getShopItemOwnedText(owned, "chair")).toContain("人体工学椅");
    expect(getShopItemSellPrice(owned, "chair")).toBe(14);

    const roadBike = {
      ...base,
      shopState: { ...base.shopState, bikeOwned: true, bikeLevel: 3 },
    };
    const electricBike = {
      ...base,
      shopState: { ...base.shopState, ebikeOwned: true },
    };
    expect(getShopItemSellPrice(roadBike, "bike")).toBe(9);
    expect(getShopItemSellPrice(electricBike, "ebike")).toBe(6);
    expect(getShopItemOwnedText({
      ...base,
      shopState: {
        ...base.shopState,
        ebikeOwned: true,
      },
    }, "ebike")).toBe("已拥有");

    const gpu = {
      ...base,
      shopState: {
        ...base.shopState,
        gpuLevel: 4,
        investments: { ...base.shopState.investments, gpu: 30 },
      },
    };
    expect(getShopItemOwnedText(gpu, "gpu_buy")).toBe("RTX 4090 显卡");
    expect(getShopItemSellPrice(gpu, "gpu_buy")).toBe(15);
    expect(canBuyShopItem(gpu, "gpu_buy")).toBe(true);
    expect(canBuyShopItem({ ...gpu, shopState: { ...gpu.shopState, gpuLevel: 10 } }, "gpu_buy")).toBe(false);
  });

  it("lists upgrades only for owned base items", () => {
    const shopState = { ...createShopState(), monitorOwned: true };
    expect(getAvailableShopUpgrades({ shopState }, "monitor")).toEqual([]);
    expect(getAvailableShopUpgrades({ shopState: createShopState() }, "monitor")).toEqual([]);
  });

  it("keeps preview effect queries deterministic", () => {
    const equipped = {
      ...createShopState(),
      gpuLevel: 2,
      keyboardOwned: true,
      monitorOwned: true,
      chairOwned: true,
      chairUpgrade: "massage" as const,
    };
    expect(getShopPaperActionModifier(equipped, "experiment")).toEqual({ bonus: 2, extraActions: 2, sanDiscount: 0 });
    expect(getShopPaperActionModifier(equipped, "writing")).toEqual({ bonus: 0, extraActions: 0, sanDiscount: 1 });
    expect(getShopReadSanDiscount(equipped)).toBe(1);
    expect(getShopRestSanGain({ ...equipped, chairUpgrade: "hammock" })).toBe(5);
    expect(getShopRestSanGain(equipped)).toBe(2);
    expect(getShopEmergencySan({ ...equipped, chairUpgrade: "spike" }, -4)).toBe(3);
    expect(getShopEmergencySan(equipped, -4)).toBe(-4);
    expect(getChairMonthlyRecovery(equipped, 10, 20)).toBe(2);
    expect(getChairMonthlyRecovery(equipped, 19, 20)).toBe(0);
    expect(getChairMonthlyRecovery({ ...equipped, chairUpgrade: "torture" }, 19, 20)).toBe(3);
  });
});
