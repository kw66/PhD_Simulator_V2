import { describe, expect, it } from "vitest";

import {
  SHOP_ITEM_DEFINITIONS,
  SHOP_UPGRADE_DEFINITIONS,
  applyChairEmergencyRecovery,
  applyShopItemOwnership,
  applyShopItemUpgrade,
  applyShopMonthlyModifier,
  canBuyShopItem,
  canSellShopItem,
  canUpgradeShopItem,
  createShopState,
  getChairFlatMonthlySanBonus,
  getChairMonthlyRecovery,
  getAvailableShopUpgrades,
  getShopItemDefinition,
  getShopItemOwnedText,
  getShopPaperActionModifier,
  getShopReadSanDiscount,
  getShopRestSanGain,
  getShopItemSellPrice,
} from "../src/core/v2-shop-items";

describe("v2 shop items", () => {
  it("exposes the audited shop item definitions", () => {
    expect(SHOP_ITEM_DEFINITIONS.map((item) => [item.id, item.price, item.sellPrice])).toEqual([
      ["gpu_buy", 10, 6],
      ["chair", 10, 5],
      ["keyboard", 8, 4],
      ["monitor", 8, 4],
      ["bike", 10, 5],
      ["down_jacket", 8, 4],
    ]);
    expect(getShopItemDefinition("chair").name).toBe("办公椅");
    expect(getShopItemDefinition("monitor").name).toBe("2K 显示器");
    expect(SHOP_UPGRADE_DEFINITIONS.map((item) => [item.id, item.price])).toEqual([
      ["bike-road", 20],
      ["bike-ebike", 12],
      ["monitor-4k", 15],
      ["monitor-smart", 15],
      ["monitor-dual", 15],
      ["chair-advanced", 18],
      ["chair-massage", 20],
      ["chair-torture", 20],
      ["chair-spike", 18],
      ["chair-hammock", 16],
    ]);
  });

  it("matches the confirmed legacy buy and sell limits", () => {
    const initialShopState = createShopState();
    const initial = {
      shopState: initialShopState,
      eventSupport: { hasDownJacket: false },
      totalMonths: 1,
    };

    expect(canBuyShopItem(initial, "gpu_buy")).toBe(true);
    expect(canBuyShopItem({ ...initial, shopState: { ...initialShopState, gpuServersBought: 1 } }, "gpu_buy")).toBe(false);
    expect(canSellShopItem({ ...initial, shopState: { ...initialShopState, gpuServersBought: 1 } }, "gpu_buy")).toBe(true);

    expect(canBuyShopItem(initial, "chair")).toBe(true);
    expect(canBuyShopItem({ ...initial, shopState: { ...initialShopState, chairOwned: true } }, "chair")).toBe(false);
    expect(canSellShopItem({ ...initial, shopState: { ...initialShopState, chairOwned: true } }, "chair")).toBe(true);

    expect(canBuyShopItem(initial, "keyboard")).toBe(true);
    expect(canBuyShopItem({ ...initial, shopState: { ...initialShopState, keyboardOwned: true } }, "keyboard")).toBe(false);
    expect(canSellShopItem({ ...initial, shopState: { ...initialShopState, keyboardOwned: true } }, "keyboard")).toBe(true);

    expect(canBuyShopItem(initial, "monitor")).toBe(true);
    expect(canBuyShopItem({ ...initial, shopState: { ...initialShopState, monitorOwned: true } }, "monitor")).toBe(false);
    expect(canSellShopItem({ ...initial, shopState: { ...initialShopState, monitorOwned: true } }, "monitor")).toBe(true);

    expect(canBuyShopItem(initial, "bike")).toBe(true);
    expect(canBuyShopItem({ ...initial, shopState: { ...initialShopState, bikeOwned: true } }, "bike")).toBe(false);
    expect(canSellShopItem({ ...initial, shopState: { ...initialShopState, bikeOwned: true } }, "bike")).toBe(true);

    expect(canBuyShopItem(initial, "down_jacket")).toBe(true);
    expect(canBuyShopItem({ ...initial, eventSupport: { hasDownJacket: true } }, "down_jacket")).toBe(false);
    expect(canSellShopItem({ ...initial, eventSupport: { hasDownJacket: true } }, "down_jacket")).toBe(true);
  });

  it("keeps ownership and action modifiers low-coupled", () => {
    const baseShopState = createShopState();
    const baseEventSupport = {
      hasGameController: false,
      hasParasol: false,
      hasDownJacket: false,
      hasBadmintonRacket: false,
      hasStrongBodyTalent: false,
      hasFinanceTalent: false,
    };

    const boughtKeyboard = applyShopItemOwnership(baseShopState, baseEventSupport, "keyboard", true);
    const boughtMonitor = applyShopItemOwnership(boughtKeyboard.shopState, boughtKeyboard.eventSupport, "monitor", true);
    const boughtDownJacket = applyShopItemOwnership(boughtMonitor.shopState, boughtMonitor.eventSupport, "down_jacket", true);

    expect(getShopItemOwnedText({ shopState: boughtDownJacket.shopState, eventSupport: boughtDownJacket.eventSupport, totalMonths: 3 }, "keyboard")).toBe("已拥有");
    expect(getShopPaperActionModifier(boughtDownJacket.shopState, "writing")).toEqual({ bonus: 1, extraActions: 0, sanDiscount: 1 });
    expect(getShopReadSanDiscount(boughtDownJacket.shopState)).toBe(1);
    expect(boughtDownJacket.eventSupport.hasDownJacket).toBe(true);
  });

  it("applies the audited base bike monthly penalty and san cap growth", () => {
    const base = {
      ...createShopState(),
      bikeOwned: true,
      bikeSanSpent: 5,
      bikeSanCapGains: 0,
    };

    const monthly = applyShopMonthlyModifier(base, 10);
    expect(monthly.sanDelta).toBe(-1);
    expect(monthly.sanCapDelta).toBe(1);
    expect(monthly.shopState.bikeSanSpent).toBe(6);
    expect(monthly.shopState.bikeSanCapGains).toBe(1);
    expect(getShopItemOwnedText({ shopState: monthly.shopState, eventSupport: { hasDownJacket: false }, totalMonths: 6 }, "bike")).toBe("已拥有（上限 +1/6）");
  });

  it("exposes the audited bike upgrades and upgraded sell prices", () => {
    const upgraded = applyShopItemUpgrade({
      ...createShopState(),
      bikeOwned: true,
      bikeSanCapGains: 3,
    }, "bike-road");

    expect(canUpgradeShopItem({ shopState: { ...createShopState(), bikeOwned: true } }, "bike-road")).toBe(true);
    expect(getAvailableShopUpgrades({ shopState: { ...createShopState(), bikeOwned: true } }, "bike").map((item) => item.id)).toEqual(["bike-road", "bike-ebike"]);
    expect(getShopItemOwnedText({ shopState: upgraded, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "bike")).toBe("已拥有（公路车，上限 +3/12）");
    expect(getShopItemSellPrice({ shopState: upgraded, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "bike")).toBe(15);

    const ebikeMonthly = applyShopMonthlyModifier({ ...createShopState(), bikeOwned: true, bikeUpgrade: "ebike" }, 8);
    expect(ebikeMonthly.sanDelta).toBe(1);
    expect(ebikeMonthly.sanCapDelta).toBe(0);
  });

  it("exposes the audited chair upgrades and emergency recovery hooks", () => {
    const upgradedChair = applyShopItemUpgrade({
      ...createShopState(),
      chairOwned: true,
    }, "chair-advanced");

    expect(canUpgradeShopItem({ shopState: { ...createShopState(), chairOwned: true } }, "chair-advanced")).toBe(true);
    expect(getAvailableShopUpgrades({ shopState: { ...createShopState(), chairOwned: true } }, "chair").map((item) => item.id)).toEqual([
      "chair-advanced",
      "chair-massage",
      "chair-torture",
      "chair-spike",
      "chair-hammock",
    ]);
    expect(getShopItemOwnedText({ shopState: upgradedChair, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "chair")).toBe("已拥有（人体工学椅）");
    expect(getShopItemSellPrice({ shopState: upgradedChair, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "chair")).toBe(14);
    expect(getChairFlatMonthlySanBonus(upgradedChair)).toBe(2);
    expect(getChairMonthlyRecovery({ ...createShopState(), chairOwned: true, chairUpgrade: "massage" }, 10, 20)).toBe(1);
    expect(getChairMonthlyRecovery({ ...createShopState(), chairOwned: true, chairUpgrade: "torture" }, 11, 20)).toBe(3);
    expect(getShopRestSanGain({ ...createShopState(), chairOwned: true, chairUpgrade: "hammock" })).toBe(5);
    expect(applyChairEmergencyRecovery({ ...createShopState(), chairOwned: true, chairUpgrade: "spike" }, 0)).toEqual({ san: 2, triggered: true });
  });

  it("exposes the audited monitor upgrades and upgraded sell price", () => {
    const upgradedMonitor = applyShopItemUpgrade({
      ...createShopState(),
      monitorOwned: true,
    }, "monitor-4k");

    expect(canUpgradeShopItem({ shopState: { ...createShopState(), monitorOwned: true } }, "monitor-4k")).toBe(true);
    expect(getAvailableShopUpgrades({ shopState: { ...createShopState(), monitorOwned: true } }, "monitor").map((item) => item.id)).toEqual([
      "monitor-4k",
      "monitor-smart",
      "monitor-dual",
    ]);
    expect(getShopItemOwnedText({ shopState: upgradedMonitor, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "monitor")).toBe("已拥有（4K 显示器）");
    expect(getShopItemSellPrice({ shopState: upgradedMonitor, eventSupport: { hasDownJacket: false }, totalMonths: 10 }, "monitor")).toBe(11);
  });

  it("selling upgraded equipment clears the attached upgrade state", () => {
    const baseEventSupport = {
      hasGameController: false,
      hasParasol: false,
      hasDownJacket: false,
      hasBadmintonRacket: false,
      hasStrongBodyTalent: false,
      hasFinanceTalent: false,
    };

    const soldChair = applyShopItemOwnership(
      { ...createShopState(), chairOwned: true, chairUpgrade: "massage" },
      baseEventSupport,
      "chair",
      false,
    );
    expect(soldChair.shopState.chairOwned).toBe(false);
    expect(soldChair.shopState.chairUpgrade).toBeNull();

    const soldMonitor = applyShopItemOwnership(
      { ...createShopState(), monitorOwned: true, monitorUpgrade: "dual" },
      baseEventSupport,
      "monitor",
      false,
    );
    expect(soldMonitor.shopState.monitorOwned).toBe(false);
    expect(soldMonitor.shopState.monitorUpgrade).toBeNull();

    const soldBike = applyShopItemOwnership(
      { ...createShopState(), bikeOwned: true, bikeUpgrade: "road" },
      baseEventSupport,
      "bike",
      false,
    );
    expect(soldBike.shopState.bikeOwned).toBe(false);
    expect(soldBike.shopState.bikeUpgrade).toBeNull();
  });
});
