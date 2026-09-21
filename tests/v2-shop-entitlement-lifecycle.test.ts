import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getShopActionPrice } from "../src/core/v2-shop-transactions";
import type { DispatchPayload, GameState, ShopItemId } from "../src/core/v2-types";

const workstationPurchases = [
  { action: "buy-shop-item", payload: { shopItemId: "keyboard" } },
  { action: "buy-shop-item", payload: { shopItemId: "monitor" } },
  { action: "buy-shop-item", payload: { shopItemId: "chair" } },
  { action: "upgrade-shop-item", payload: { shopUpgradeId: "chair-advanced" } },
  { action: "buy-coffee-machine", payload: {} },
  { action: "upgrade-coffee-machine", payload: { shopUpgradeId: "manual" } },
] satisfies Array<{ action: Parameters<typeof getShopActionPrice>[1]; payload: DispatchPayload }>;

function playingState(): GameState {
  const initial = createInitialState();
  return { ...initial, phase: "playing", year: 1, month: 2, totalMonths: 2,
    player: { ...initial.player, money: 0, san: 20 }, eventQueue: [] };
}

function claimFunding(state: GameState, label: string): GameState {
  let next = dispatchAction(state, "debug-trigger-event", { eventId: "random-8" });
  for (let stage = 0; stage < 3; stage += 1) {
    const event = next.eventQueue.find((entry) => entry.chainId === "random-8")!;
    expect(event).toBeDefined();
    const choice = event.choices.length === 1 ? event.choices[0]! : event.choices.find((entry) => entry.label === label)!;
    const payload = { eventId: event.id, eventChoiceId: choice.id };
    next = dispatchAction(next, "resolve-event", payload);
    const repeated = dispatchAction(next, "resolve-event", payload);
    expect(repeated.shopState.entitlements).toEqual(next.shopState.entitlements);
    expect(repeated.eventQueue).toEqual(next.eventQueue);
    next = repeated;
  }
  return next;
}

describe("shop reward lifecycle", () => {
  it.each(workstationPurchases)("shares one renovation allowance across all purchases after $action $payload", ({ action, payload }) => {
    let state = claimFunding(playingState(), "装修工位");
    if (action === "upgrade-shop-item") state.shopState.chairOwned = true;
    if (action === "upgrade-coffee-machine") state.coffeeState.machineOwned = true;
    for (const purchase of workstationPurchases) {
      expect(getShopActionPrice(state, purchase.action, purchase.payload)).toBe(0);
    }
    const before = structuredClone(state);
    state = dispatchAction(state, action, payload);
    expect(state.shopState.entitlements.workstationTransaction).toBe(0);
    expect(state.player.money).toBe(0);
    expect(before.shopState.entitlements.workstationTransaction).toBe(1);
    for (const purchase of workstationPurchases) {
      expect(getShopActionPrice(state, purchase.action, purchase.payload)).toBeGreaterThan(0);
      const rejected = dispatchAction(state, purchase.action, purchase.payload);
      expect(rejected.shopState).toEqual(state.shopState);
      expect(rejected.coffeeState).toEqual(state.coffeeState);
      expect(rejected.player.money).toBe(0);
    }
  });

  it("preserves renovation on invalid operations and uses it before a lover gift", () => {
    let state = claimFunding(playingState(), "装修工位");
    state = { ...state, loverProgressState: { ...state.loverProgressState, giftCoupons: 1 } };
    state = dispatchAction(state, "upgrade-shop-item", { shopUpgradeId: "chair-advanced" });
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "manual" });
    expect(state.shopState.entitlements.workstationTransaction).toBe(1);
    expect(state.loverProgressState.giftCoupons).toBe(1);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    expect(state.shopState.entitlements.workstationTransaction).toBe(0);
    expect(state.loverProgressState.giftCoupons).toBe(1);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "keyboard" });
    expect(state.loverProgressState.giftCoupons).toBe(1);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "monitor" });
    expect(state.shopState.monitorOwned).toBe(true);
    expect(state.loverProgressState.giftCoupons).toBe(0);
    state = dispatchAction(state, "buy-coffee-machine");
    expect(state.coffeeState.machineOwned).toBe(false);
  });

  it.each<ShopItemId>(["keyboard", "monitor", "chair"])("consumes renovation reimbursement for %s once across sale and repurchase", (shopItemId) => {
    let state = claimFunding(playingState(), "装修工位");
    expect(getShopActionPrice(state, "buy-shop-item", { shopItemId })).toBe(0);
    state = dispatchAction(state, "buy-shop-item", { shopItemId });
    const bought = structuredClone(state.shopState);
    state = dispatchAction(state, "buy-shop-item", { shopItemId });
    expect(state.shopState).toEqual(bought);
    state = dispatchAction(state, "sell-shop-item", { shopItemId });
    expect(state.player.money).toBe(0);
    expect(getShopActionPrice(state, "buy-shop-item", { shopItemId })).toBeGreaterThan(0);
    const sold = structuredClone(state.shopState);
    state = dispatchAction(state, "buy-shop-item", { shopItemId });
    expect(state.shopState).toEqual(sold);
  });

  it("cannot also upgrade or repurchase a coffee machine after using renovation to buy it", () => {
    let state = claimFunding(playingState(), "装修工位");
    state = dispatchAction(state, "buy-coffee-machine");
    state = dispatchAction(state, "upgrade-coffee-machine", { shopUpgradeId: "manual" });
    expect(state.shopState.entitlements.workstationTransaction).toBe(0);
    expect(state.coffeeState.machineUpgrade).toBeNull();
    state = dispatchAction(state, "sell-coffee-machine");
    expect(state.player.money).toBe(0);
    expect(getShopActionPrice(state, "buy-coffee-machine", {})).toBeGreaterThan(0);
    state = dispatchAction(state, "buy-coffee-machine");
    expect(state.coffeeState.machineOwned).toBe(false);
  });

  it("consumes GPU reimbursement before one lover gift, then requires payment", () => {
    let state = claimFunding(playingState(), "买显卡");
    state = { ...state, loverProgressState: { ...state.loverProgressState, giftCoupons: 1 } };
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(state.shopState.gpuLevel).toBe(1);
    expect(state.shopState.entitlements.gpuTransaction).toBe(0);
    expect(state.loverProgressState.giftCoupons).toBe(1);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(state.shopState.gpuLevel).toBe(2);
    expect(state.loverProgressState.giftCoupons).toBe(0);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(state.shopState.gpuLevel).toBe(2);
    state = dispatchAction(state, "sell-shop-item", { shopItemId: "gpu_buy" });
    expect(state.player.money).toBe(0);
    state = dispatchAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    expect(state.shopState.gpuLevel).toBe(0);
  });
});
