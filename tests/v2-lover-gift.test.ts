import { describe, expect, it } from "vitest";
import { renderShopSection } from "../src/app/v2-render-shop-panel";
import { renderApp } from "../src/app/v2-render";
import { AI_SLOT_IDS, getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { BIKE_TIER_DEFINITIONS } from "../src/core/v2-bike-system";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getGiftAwareShopSellPrice, getLoverGiftCount, getLoverGiftQuote, hasOtherLoverGiftPurchases } from "../src/core/v2-lover-gift";
import { advanceLoverDate, createLoverProgressState } from "../src/core/v2-lover-progression";
import { applyMonthlyEffects, applyMonthStartSubscriptions, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import type { GameState, ShopItemId, SupportItemId } from "../src/core/v2-types";

function giftState(giftCoupons = 1): GameState {
  const initial = createInitialState();
  const loverProgressState = { ...initial.loverProgressState, giftCoupons };
  return {
    ...initial,
    phase: "playing",
    month: 2,
    totalMonths: 2,
    player: { ...initial.player, money: 0, san: 5 },
    loverProgressState,
    log: [],
  };
}

function fullyEquipped(): GameState {
  const state = giftState();
  state.shopState = {
    ...state.shopState, gpuLevel: 10, chairOwned: true, chairUpgrade: "advanced",
    keyboardOwned: true, monitorOwned: true, bikeOwned: true, bikeLevel: BIKE_TIER_DEFINITIONS.length, ebikeOwned: true,
  };
  state.eventSupport = { ...state.eventSupport, hasDownJacket: true, hasParasol: true, hasBadmintonRacket: true };
  state.coffeeState = { ...state.coffeeState, machineOwned: true, machineUpgrade: "unlimited" };
  for (const slot of AI_SLOT_IDS) {
    state.aiShopState.subscriptions[slot] = {
      enabled: true, active: false, paused: false,
      modelId: getAiModelForTotalMonths(state.totalMonths, slot).id,
      lastRenewalTotalMonths: state.totalMonths - 1,
    };
  }
  return state;
}

function findButton(html: string, action: string, attribute?: string): string {
  const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gu)?.find((entry) => (
    entry.includes(`data-action="${action}"`) && (!attribute || entry.includes(attribute))
  ));
  expect(button).toBeDefined();
  return button!;
}

describe("lover shopping gifts", () => {
  it.each<ShopItemId>(["gpu_buy", "chair", "keyboard", "monitor", "bike", "ebike", "down_jacket"])("waives %s and prevents resale arbitrage", (shopItemId) => {
    const state = giftState();
    const before = structuredClone(state);
    expect(getShopActionPrice(state, "buy-shop-item", { shopItemId })).toBe(0);
    const bought = applyShopAction(state, "buy-shop-item", { shopItemId });
    expect(getLoverGiftCount(bought)).toBe(0);
    expect(bought.player.money).toBe(0);
    expect(JSON.stringify(bought.log)).toContain("恋人赠礼，本次免费");
    expect(getGiftAwareShopSellPrice(bought, shopItemId)).toBe(0);
    const sold = applyShopAction(bought, "sell-shop-item", { shopItemId });
    expect(sold.player.money).toBe(0);
    expect(state).toEqual(before);
  });

  it.each<SupportItemId>(["parasol", "badminton_racket"])("waives support %s and clears its investment after sale", (supportItemId) => {
    const bought = applyShopAction(giftState(), "buy-support-item", { supportItemId });
    expect(bought.player.money).toBe(0);
    expect(getLoverGiftCount(bought)).toBe(0);
    expect(getGiftAwareShopSellPrice(bought, supportItemId)).toBe(0);
    const restored: GameState = JSON.parse(JSON.stringify(bought));
    const sold = applyShopAction(restored, "sell-support-item", { supportItemId });
    expect(sold.player.money).toBe(0);
    const paid = applyShopAction({ ...sold, player: { ...sold.player, money: 30 } }, "buy-support-item", { supportItemId });
    expect(getGiftAwareShopSellPrice(paid, supportItemId)).toBeGreaterThan(0);
  });

  it("preserves paid investments when gifting upgrades", () => {
    const state = giftState(3);
    state.shopState.gpuLevel = 1;
    state.shopState.investments.gpu = 6;
    state.shopState.chairOwned = true;
    state.shopState.investments.chair = 10;
    state.shopState.bikeOwned = true;
    state.shopState.bikeLevel = 1;
    state.shopState.investments.bike = 6;
    const gpu = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    const chair = applyShopAction(gpu, "upgrade-shop-item", { shopUpgradeId: "chair-massage" });
    const bike = applyShopAction(chair, "buy-shop-item", { shopItemId: "bike" });
    expect(bike.shopState).toMatchObject({ gpuLevel: 2, chairUpgrade: "massage", bikeLevel: 2 });
    expect(bike.shopState.investments).toMatchObject({ gpu: 6, chair: 10, bike: 6 });
    expect(getGiftAwareShopSellPrice(bike, "bike")).toBe(3);
    expect(getLoverGiftCount(bike)).toBe(0);
    expect(bike.player.money).toBe(0);
  });

  it("gifts coffee machines, upgrades and repeat manual coffee purchases", () => {
    const state = giftState(4);
    const machine = applyShopAction(state, "buy-coffee-machine", {});
    const upgraded = applyShopAction(machine, "upgrade-coffee-machine", { shopUpgradeId: "unlimited" });
    const first = applyShopAction(upgraded, "buy-coffee", {});
    const second = applyShopAction(first, "buy-coffee", {});
    expect(second.coffeeState).toMatchObject({ machineOwned: true, machineUpgrade: "unlimited", machineInvestment: 0, coffeePurchaseCountThisMonth: 2 });
    expect(second.player.money).toBe(0);
    expect(second.player.san).toBe(state.player.san + 6);
    expect(getLoverGiftCount(second)).toBe(0);
    expect(applyShopAction(second, "sell-coffee-machine", {}).player.money).toBe(0);
  });

  it("waives paid AI while retaining activation effects", () => {
    const state = giftState();
    const bought = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(bought.aiShopState.subscriptions.gpt.active).toBe(true);
    expect(bought.buffs.some((buff) => buff.id === "ai-gpt")).toBe(true);
    expect(getLoverGiftCount(bought)).toBe(0);
    expect(bought.player.money).toBe(0);
  });

  it("does not spend gifts on free models or reimbursed purchases and upgrades", () => {
    const state = giftState();
    state.shopState.entitlements.workstationTransaction = 4;
    state.shopState.chairOwned = true;
    state.eventSupport.aiCostsCoveredUntilTotalMonths = state.totalMonths;
    let current = applyShopAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    current = applyShopAction(current, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
    current = applyShopAction(current, "buy-coffee-machine", {});
    current = applyShopAction(current, "upgrade-coffee-machine", { shopUpgradeId: "manual" });
    current = applyShopAction(current, "buy-ai-month", { aiSlotId: "gpt" });
    current = applyShopAction(current, "buy-ai-month", { aiSlotId: "doubao" });
    expect(getLoverGiftCount(current)).toBe(1);
    expect(current.player.money).toBe(0);
    expect(getLoverGiftCount(applyShopAction(giftState(), "buy-ai-month", { aiSlotId: "doubao" }))).toBe(1);
  });

  it("adds all reimbursement effects in debug without stacking or consuming existing gifts", () => {
    const initial = giftState(3);
    initial.shopState.entitlements.gpuTransaction = 2;
    const state = dispatchAction(initial, "debug-add-all-buffs");
    expect(state.loverProgressState.giftCoupons).toBe(3);
    expect(state.shopState.entitlements.gpuTransaction).toBe(2);
    expect(Object.values(state.shopState.entitlements).every((count) => count >= 1)).toBe(true);
    expect(state.log).toEqual(initial.log);
    expect(dispatchAction(state, "debug-add-all-buffs")).toEqual(state);
    const html = renderApp(state);
    expect(html).toContain(">显卡免单 ×2</button>");
    expect(html).toContain(">工位报销</button>");
    expect(html).toContain(">恋人回礼 ×3</button>");
    const spent = { ...state, shopState: { ...state.shopState, entitlements: { ...state.shopState.entitlements, gpuTransaction: 0 } },
      loverProgressState: { ...state.loverProgressState, giftCoupons: 0 } };
    const replenished = dispatchAction(spent, "debug-add-all-buffs");
    expect(replenished.shopState.entitlements.gpuTransaction).toBe(1);
    expect(replenished.loverProgressState.giftCoupons).toBe(1);
  });

  it.each([0, 1])("uses GPU reimbursement before a lover gift at GPU level %s", (gpuLevel) => {
    const state = giftState();
    state.shopState.gpuLevel = gpuLevel;
    state.shopState.entitlements.gpuTransaction = 1;
    const reimbursed = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(reimbursed.shopState.gpuLevel).toBe(gpuLevel + 1);
    expect(reimbursed.shopState.entitlements.gpuTransaction).toBe(0);
    expect(getLoverGiftCount(reimbursed)).toBe(1);
    expect(reimbursed.player.money).toBe(0);
    const gifted = applyShopAction(reimbursed, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(getLoverGiftCount(gifted)).toBe(0);
    expect(gifted.player.money).toBe(0);
  });

  it("retains coupons on unavailable, missing-payload, toggle and failed purchases", () => {
    const state = giftState();
    state.shopState.keyboardOwned = true;
    state.shopState.gpuLevel = 10;
    const results = [
      applyShopAction(state, "buy-shop-item", { shopItemId: "keyboard" }),
      applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" }),
      applyShopAction(state, "buy-shop-item", {}),
      applyShopAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" }),
      applyShopAction(state, "upgrade-coffee-machine", { shopUpgradeId: "manual" }),
      applyShopAction({ ...state, coffeeState: { ...state.coffeeState, coffeePurchaseCountThisMonth: 1 } }, "buy-coffee", {}),
      applyShopAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" }),
      applyShopAction(state, "toggle-coffee-subscription", {}),
    ];
    for (const result of results) expect(getLoverGiftCount(result)).toBe(1);
    expect(getLoverGiftCount(applyShopAction(giftState(0), "buy-shop-item", { shopItemId: "keyboard" }))).toBe(0);
  });

  it("reserves gifts for other purchases regardless of the wallet", () => {
    const state = fullyEquipped();
    state.shopState.keyboardOwned = false;
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    const settled = applyMonthStartSubscriptions(state);
    expect(getLoverGiftCount(settled.nextState)).toBe(1);
    expect(settled.nextState.aiShopState.subscriptions.gpt.paused).toBe(true);
    state.player.money = 100;
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
  });

  it("includes new AI slots and updated models among other purchases", () => {
    const state = fullyEquipped();
    state.aiShopState.subscriptions.gpt.enabled = false;
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    state.aiShopState.subscriptions.gpt.enabled = true;
    state.aiShopState.subscriptions.gpt.modelId = "older-model";
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    const settled = applyMonthStartSubscriptions(state);
    expect(getLoverGiftCount(settled.nextState)).toBe(1);
    expect(settled.nextState.aiShopState.subscriptions.gpt.enabled).toBe(false);
  });

  it.each([
    ["GPU upgrade", (state: GameState) => { state.shopState.gpuLevel = 9; }],
    ["bike upgrade", (state: GameState) => { state.shopState.bikeLevel = 3; }],
    ["chair upgrade", (state: GameState) => { state.shopState.chairUpgrade = null; }],
    ["coffee upgrade", (state: GameState) => { state.coffeeState.machineUpgrade = null; }],
    ["coffee machine", (state: GameState) => { state.coffeeState.machineOwned = false; }],
    ["support item", (state: GameState) => { state.eventSupport.hasParasol = false; }],
  ] as const)("reserves the coupon for an available %s", (_label, prepare) => {
    const state = fullyEquipped();
    prepare(state);
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
  });

  it.each([
    ["keyboard", (state: GameState) => { state.shopState.keyboardOwned = false; state.shopState.entitlements.workstationTransaction = 1; }],
    ["GPU", (state: GameState) => { state.shopState.gpuLevel = 9; state.shopState.entitlements.gpuTransaction = 1; }],
    ["chair upgrade", (state: GameState) => { state.shopState.chairUpgrade = null; state.shopState.entitlements.workstationTransaction = 1; }],
    ["coffee machine", (state: GameState) => { state.coffeeState.machineOwned = false; state.shopState.entitlements.workstationTransaction = 1; }],
    ["coffee upgrade", (state: GameState) => { state.coffeeState.machineUpgrade = null; state.shopState.entitlements.workstationTransaction = 1; }],
    ["free AI", (state: GameState) => { state.aiShopState.subscriptions.doubao.enabled = false; }],
    ["reimbursed AI", (state: GameState) => {
      state.aiShopState.subscriptions.gpt.enabled = false;
      state.eventSupport.aiCostsCoveredUntilTotalMonths = state.totalMonths;
      state.coffeeState.subscriptionEnabled = true;
    }],
  ] as const)("preserves the gift while a free %s is available", (_label, prepare) => {
    const state = fullyEquipped();
    prepare(state);
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
  });

  it("allows fallback after the free remaining equipment is acquired", () => {
    const state = fullyEquipped();
    state.shopState.keyboardOwned = false;
    state.shopState.entitlements.workstationTransaction = 1;
    const bought = applyShopAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    expect(getLoverGiftCount(bought)).toBe(1);
    expect(hasOtherLoverGiftPurchases(bought)).toBe(false);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(bought).nextState)).toBe(0);
  });

  it("keeps the coupon on duplicate AI, coffee and equipment purchases", () => {
    const state = giftState(2);
    const ai = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(getLoverGiftCount(applyShopAction(ai, "buy-ai-month", { aiSlotId: "gpt" }))).toBe(1);
    state.coffeeState.machineOwned = true;
    state.coffeeState.coffeePurchaseCountThisMonth = 1;
    expect(getLoverGiftCount(applyShopAction(state, "buy-coffee", {}))).toBe(2);
    expect(getLoverGiftCount(applyShopAction(state, "buy-coffee-machine", {}))).toBe(2);
    state.eventSupport.hasParasol = true;
    expect(getLoverGiftCount(applyShopAction(state, "buy-support-item", { supportItemId: "parasol" }))).toBe(2);
  });

  it("allows one successful paid renewal when only renewals and repeat coffee remain", () => {
    const state = fullyEquipped();
    expect(hasOtherLoverGiftPurchases(state)).toBe(false);
    const before = structuredClone(state);
    const settled = applyMonthStartSubscriptions(state);
    expect(getLoverGiftCount(settled.nextState)).toBe(0);
    expect(settled.nextState.player.money).toBe(0);
    expect(settled.resolution.items.filter((item) => item.note === "恋人赠礼，本次免费")).toHaveLength(1);
    expect(settled.nextState.aiShopState.subscriptions.doubao.active).toBe(true);
    expect(state).toEqual(before);
  });

  it("gifts coffee renewal but skips it without consuming when SAN is full", () => {
    const state = fullyEquipped();
    state.coffeeState.subscriptionEnabled = true;
    state.coffeeState.machineUpgrade = "manual";
    for (const slot of AI_SLOT_IDS) state.aiShopState.subscriptions[slot].lastRenewalTotalMonths = state.totalMonths;
    const settled = applyMonthStartSubscriptions(state);
    expect(getLoverGiftCount(settled.nextState)).toBe(0);
    expect(settled.nextState.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
    expect(settled.nextState.player.money).toBe(0);
    state.player.san = state.sanCap;
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
  });

  it("does not consume on reimbursed, disabled or already-processed renewals", () => {
    const state = fullyEquipped();
    state.eventSupport.aiCostsCoveredUntilTotalMonths = state.totalMonths;
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
    state.eventSupport.aiCostsCoveredUntilTotalMonths = null;
    for (const slot of AI_SLOT_IDS) state.aiShopState.subscriptions[slot].lastRenewalTotalMonths = state.totalMonths;
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
    for (const slot of AI_SLOT_IDS) state.aiShopState.subscriptions[slot].enabled = false;
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
  });

  it("keeps repeated quote, render and monthly previews pure", () => {
    const state = fullyEquipped();
    const before = structuredClone(state);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      expect(getLoverGiftQuote(state, 2, true)).toEqual({ price: 0, usesGift: true });
      renderShopSection(state, "ai");
      expect(previewNextMonthEffects(state).items.some((item) => item.note === "恋人赠礼，本次免费")).toBe(true);
    }
    expect(state).toEqual(before);
  });

  it("reserves gifts before earlier renewals when a disabled AI is active only in the previous month", () => {
    const state = fullyEquipped();
    state.aiShopState.subscriptions.gpt.enabled = false;
    state.aiShopState.subscriptions.gpt.active = true;
    const before = structuredClone(state);
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(1);
    const preview = previewNextMonthEffects(state);
    const actual = applyMonthlyEffects({ ...state, totalMonths: state.totalMonths + 1, month: state.month + 1 });
    expect(preview.items.filter((item) => item.source === "商店订阅"))
      .toEqual(actual.resolution.items.filter((item) => item.source === "商店订阅"));
    expect(preview.items.some((item) => item.note === "恋人赠礼，本次免费")).toBe(false);
    expect(getLoverGiftCount(actual.nextState)).toBe(1);
    expect(state).toEqual(before);
  });

  it("treats a current-month AI purchase as owned even if automatic renewal is off", () => {
    const state = fullyEquipped();
    state.aiShopState.subscriptions.gpt = { ...state.aiShopState.subscriptions.gpt,
      enabled: false, active: true, lastRenewalTotalMonths: state.totalMonths };
    expect(hasOtherLoverGiftPurchases(state)).toBe(false);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(state).nextState)).toBe(0);
  });

  it("keeps gifts across a model-release boundary in preview and settlement", () => {
    const state = fullyEquipped();
    state.totalMonths = 12;
    state.month = 12;
    for (const slot of AI_SLOT_IDS) {
      state.aiShopState.subscriptions[slot] = { ...state.aiShopState.subscriptions[slot],
        active: true, lastRenewalTotalMonths: 12 };
    }
    const before = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    const actual = applyMonthlyEffects({ ...state, totalMonths: 13, month: 1, year: 2 });
    expect(preview.items.filter((item) => item.source === "商店订阅"))
      .toEqual(actual.resolution.items.filter((item) => item.source === "商店订阅"));
    expect(preview.items.some((item) => item.note === "模型已更新，自动续费已关闭")).toBe(true);
    expect(getLoverGiftCount(actual.nextState)).toBe(1);
    expect(state).toEqual(before);
  });

  it("allows fallback after acquiring the last free AI without consuming its gift", () => {
    const state = fullyEquipped();
    state.aiShopState.subscriptions.doubao.enabled = false;
    state.aiShopState.subscriptions.doubao.modelId = null;
    expect(hasOtherLoverGiftPurchases(state)).toBe(true);
    const purchased = applyShopAction(state, "buy-ai-month", { aiSlotId: "doubao" });
    expect(getLoverGiftCount(purchased)).toBe(1);
    expect(hasOtherLoverGiftPurchases(purchased)).toBe(false);
    expect(getLoverGiftCount(applyMonthStartSubscriptions(purchased).nextState)).toBe(0);
  });

  it("keeps preview and actual gift fallback consistent without spending input coupons", () => {
    const state = fullyEquipped();
    state.loverProgressState.giftCoupons = 3;
    const before = structuredClone(state);
    const first = previewNextMonthEffects(state);
    expect(previewNextMonthEffects(state)).toEqual(first);
    const actual = applyMonthlyEffects({ ...state, totalMonths: state.totalMonths + 1, month: state.month + 1 });
    expect(first.items.filter((item) => item.source === "商店订阅"))
      .toEqual(actual.resolution.items.filter((item) => item.source === "商店订阅"));
    expect(first.items.filter((item) => item.note === "恋人赠礼，本次免费")).toHaveLength(3);
    expect(getLoverGiftCount(actual.nextState)).toBe(0);
    expect(state).toEqual(before);
  });

  it("does not renew coffee twice when processing the same month again", () => {
    const state = fullyEquipped();
    state.loverProgressState.giftCoupons = 100;
    state.coffeeState.subscriptionEnabled = true;
    const first = applyMonthStartSubscriptions(state);
    const second = applyMonthStartSubscriptions(first.nextState);
    expect(getLoverGiftCount(second.nextState)).toBe(getLoverGiftCount(first.nextState));
    expect(second.nextState.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
  });

  it("stacks shopping completion coupons without a cap and spends exactly one per paid purchase", () => {
    const state = giftState(100);
    state.player.money = 3;
    state.loverState = { ...state.loverState, active: true, type: "beautiful" };
    state.loverProgressState = { ...createLoverProgressState("beautiful", () => 0), giftCoupons: 100,
      routes: { play: { progress: 0, completed: 0 }, study: { progress: 0, completed: 0 }, shopping: { progress: 99, completed: 0 } } };
    const before = structuredClone(state);
    const completed = advanceLoverDate(state, "shopping");
    expect(getLoverGiftCount(completed)).toBe(101);
    expect(completed.player.money).toBe(0);
    const purchased = applyShopAction(completed, "buy-shop-item", { shopItemId: "keyboard" });
    expect(getLoverGiftCount(purchased)).toBe(100);
    expect(purchased.player.money).toBe(0);
    expect(state).toEqual(before);
  });

  it("shows zero resale prices for gifted fixed-price items and bikes", () => {
    let state = giftState(4);
    state = applyShopAction(state, "buy-shop-item", { shopItemId: "ebike" });
    state = applyShopAction(state, "buy-shop-item", { shopItemId: "down_jacket" });
    state = applyShopAction(state, "buy-shop-item", { shopItemId: "bike" });
    state = applyShopAction(state, "buy-support-item", { supportItemId: "parasol" });
    const html = renderShopSection(state, "gear");
    for (const itemId of ["ebike", "down_jacket", "bike"]) {
      expect(findButton(html, "sell-shop-item", `data-shop-item-id="${itemId}"`)).toContain('aria-label="出售，0 金币"');
    }
    expect(findButton(html, "sell-support-item", 'data-support-item-id="parasol"')).toContain('aria-label="出售，0 金币"');
  });

  it("enables zero-money UI purchases for equipment, support, coffee, AI and upgrades", () => {
    const state = giftState();
    const gear = renderShopSection(state, "gear");
    const ai = renderShopSection(state, "ai");
    const coffee = renderShopSection(state, "coffee");
    const rest = renderShopSection(state, "rest");
    const buttons = [
      findButton(gear, "buy-shop-item", 'data-shop-item-id="keyboard"'),
      findButton(gear, "buy-support-item", 'data-support-item-id="parasol"'),
      findButton(ai, "buy-ai-month", 'data-ai-slot-id="gpt"'),
      findButton(coffee, "buy-coffee-machine"),
      findButton(rest, "buy-shop-item", 'data-shop-item-id="chair"'),
    ];
    state.coffeeState.machineOwned = true;
    state.shopState.chairOwned = true;
    buttons.push(findButton(renderShopSection(state, "coffee", null, "manual"), "upgrade-coffee-machine"));
    buttons.push(findButton(renderShopSection(state, "coffee"), "buy-coffee"));
    buttons.push(findButton(renderShopSection(state, "rest", "chair-advanced"), "upgrade-shop-item"));
    for (const button of buttons) {
      expect(button).not.toContain("disabled");
      expect(button).toContain("has-free-price");
    }
    for (const shop of [gear, ai, coffee, rest]) expect(shop).not.toContain("shop-gift-notice");
  });

  it("tracks gift coupons in next-action effects until the last coupon is consumed", () => {
    const getNextEffects = (state: GameState) => renderApp(state).split('id="new-single-effect-list">')[1]?.split('</div>')[0] ?? "";
    const state = giftState(2);
    expect(getNextEffects(state)).toContain("恋人回礼 ×2");
    expect(getNextEffects(state)).toContain("恋人购物");
    const firstPurchase = applyShopAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    expect(getNextEffects(firstPurchase)).toContain("恋人回礼</button>");
    expect(getNextEffects(firstPurchase)).not.toContain("×2");
    const secondPurchase = applyShopAction(firstPurchase, "buy-shop-item", { shopItemId: "monitor" });
    expect(getNextEffects(secondPurchase)).not.toContain("shop-free-lover-gift");
  });
});
