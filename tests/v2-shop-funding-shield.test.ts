import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { applyMonthlyEffects, applyMonthStartSubscriptions } from "../src/core/v2-monthly-effects";
import { getShopActionListedPrice, getShopLabFundingCost, type ShopPurchaseAction } from "../src/core/v2-lover-gift";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { DispatchPayload, GameState } from "../src/core/v2-types";

function playing(): GameState {
  const state = createInitialState();
  return { ...state, selectedRoleId: "teacher-child", phase: "playing", month: 1, totalMonths: 1,
    roleTalents: { levels: { "funding-shield": 1 } },
    player: { ...state.player, san: 5, money: 100 },
    advisorProgressState: { ...state.advisorProgressState, funding: 100 } };
}

describe("teacher-child shop funding", () => {
  const purchases: Array<[ShopPurchaseAction, DispatchPayload, (state: GameState) => void]> = [
    ["buy-shop-item", { shopItemId: "chair" }, () => {}],
    ["buy-shop-item", { shopItemId: "bike" }, () => {}],
    ["buy-support-item", { supportItemId: "parasol" }, () => {}],
    ["buy-coffee", {}, () => {}],
    ["buy-coffee-machine", {}, () => {}],
    ["upgrade-shop-item", { shopUpgradeId: "chair-advanced" }, (s) => { s.shopState.chairOwned = true; }],
    ["upgrade-coffee-machine", { shopUpgradeId: "manual" }, (s) => { s.coffeeState.machineOwned = true; }],
    ["buy-ai-month", { aiSlotId: "gpt" }, () => {}],
  ];

  it.each(purchases)("pays listed lab cost once for %s %j", (action, payload, prepare) => {
    const state = playing();
    prepare(state);
    const listed = getShopActionListedPrice(state, action, payload)!;
    expect(listed).toBeGreaterThan(0);
    expect(getShopActionPrice(state, action, payload)).toBe(0);
    const next = applyShopAction(state, action, payload);
    expect(next.player.money).toBe(state.player.money);
    expect(next.personalSpending ?? 0).toBe(state.personalSpending ?? 0);
    expect(next.advisorProgressState.funding).toBe(100 - listed);
    expect(next.labFinanceLedger?.amounts["student-reimbursement"]).toBe(-listed);
    expect(next.shopState.labReimbursements.gpuTransaction).toBe(0);
    expect(next.shopState.labReimbursements.workstationTransaction).toBe(0);
  });

  it("requires both the 60 gate and enough funding, then falls back to personal payment", () => {
    const state = playing();
    state.advisorProgressState.funding = 59.9;
    expect(getShopLabFundingCost(state, "buy-shop-item", { shopItemId: "chair" })).toBe(0);
    const personal = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(personal.player.money).toBe(90);
    expect(personal.advisorProgressState.funding).toBe(59.9);
    state.advisorProgressState.funding = 60;
    const covered = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(covered.advisorProgressState.funding).toBe(50);
    const second = applyShopAction(covered, "buy-shop-item", { shopItemId: "keyboard" });
    expect(second.player.money).toBe(93);
    expect(second.advisorProgressState.funding).toBe(50);
  });

  it("does not charge funds or consume a gift for failed purchases or toggles", () => {
    const state = playing();
    state.shopState.chairOwned = true;
    for (const [action, payload] of [["buy-shop-item", { shopItemId: "chair" }],
      ["upgrade-coffee-machine", { shopUpgradeId: "manual" }],
      ["toggle-coffee-subscription", {}]] as const) {
      const next = applyShopAction(state, action, payload);
      expect(next.advisorProgressState.funding).toBe(100);
      expect(next.labFinanceLedger).toEqual(state.labFinanceLedger);
    }
  });

  it("keeps entitlement, event reimbursement, and gift priority", () => {
    const state = playing();
    state.loverProgressState.giftCoupons = 1;
    const gift = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(gift.loverProgressState.giftCoupons).toBe(0);
    expect(gift.advisorProgressState.funding).toBe(100);
    state.shopState.labReimbursements = { totalMonths: 1, workstationTransaction: 1, gpuTransaction: 0 };
    const event = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(event.loverProgressState.giftCoupons).toBe(1);
    expect(event.advisorProgressState.funding).toBe(90);
    expect(event.shopState.labReimbursements.workstationTransaction).toBe(0);
    state.shopState.entitlements.workstationTransaction = 1;
    const entitlement = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(entitlement.loverProgressState.giftCoupons).toBe(1);
    expect(entitlement.advisorProgressState.funding).toBe(100);
    expect(entitlement.shopState.labReimbursements.workstationTransaction).toBe(1);
  });

  it("preserves unaffordable event reimbursement without falling back or charging", () => {
    const state = playing();
    state.advisorProgressState.funding = 3;
    state.shopState.labReimbursements = { totalMonths: 1, workstationTransaction: 1, gpuTransaction: 0 };
    const next = applyShopAction(state, "buy-shop-item", { shopItemId: "chair" });
    expect(next.shopState.chairOwned).toBe(false);
    expect(next.advisorProgressState.funding).toBe(3);
    expect(next.player.money).toBe(100);
    expect(next.shopState.labReimbursements.workstationTransaction).toBe(1);
  });

  it("renews coffee from funding and rechecks the gate for the next AI subscription", () => {
    const state = playing();
    state.coffeeState.machineOwned = true;
    state.coffeeState.machineUpgrade = "manual";
    state.coffeeState.subscriptionEnabled = true;
    state.aiShopState.subscriptions.gpt.enabled = true;
    state.advisorProgressState.funding = 60;
    state.player.money = 3;
    const result = applyMonthStartSubscriptions(state);
    expect(result.nextState.advisorProgressState.funding).toBe(59);
    expect(result.nextState.player.money).toBe(1);
    expect(result.nextState.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
    expect(result.resolution.items.find((i) => i.id === "coffee-subscription")?.note).toContain("经费护航");
    expect(result.resolution.items.find((i) => i.id === "ai-renewal-gpt")?.appliedStats.money).toBe(-2);
  });

  it("does not spend funding on skipped full-SAN coffee", () => {
    const state = playing();
    state.player.san = state.sanCap;
    state.coffeeState.subscriptionEnabled = true;
    const next = applyMonthStartSubscriptions(state).nextState;
    expect(next.advisorProgressState.funding).toBe(100);
    expect(next.coffeeState.coffeePurchaseCountThisMonth).toBe(0);
  });

  it("funds automatic coffee machine production without counting personal spending", () => {
    const state = playing();
    state.coffeeState.machineOwned = true;
    state.coffeeState.machineUpgrade = "automatic";
    const result = applyMonthlyEffects(state);
    expect(result.resolution.items.find((i) => i.id === "automatic-coffee-machine")?.appliedStats.money).toBe(0);
    expect(result.nextState.labFinanceLedger?.amounts["student-reimbursement"]).toBe(-2);
  });

  it("keeps r27 AI-only funding and paid coffee subscriptions", () => withGameplayRuleset("20261022-r27", () => {
    const state = playing();
    expect(getShopActionPrice(state, "buy-shop-item", { shopItemId: "chair" })).toBe(10);
    expect(getShopActionPrice(state, "buy-ai-month", { aiSlotId: "gpt" })).toBe(0);
    state.coffeeState.subscriptionEnabled = true;
    const result = applyMonthStartSubscriptions(state);
    expect(result.nextState.advisorProgressState.funding).toBe(100);
    expect(result.nextState.player.money).toBe(98);
  }));
});
