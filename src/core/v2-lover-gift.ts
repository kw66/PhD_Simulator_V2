import { AI_SLOT_IDS, getAiModelForTotalMonths, hasAiReimbursement } from "./v2-ai-shop";
import { getLabReimbursementCount, getLabReimbursementKind } from "./v2-lab-reimbursement";
import { getNextBikeTierDefinition } from "./v2-bike-system";
import { COFFEE_MACHINE_PRICE, COFFEE_MACHINE_UPGRADE_DEFINITIONS, getAvailableCoffeeMachineUpgrades, getCoffeeBuyPrice } from "./v2-coffee-system";
import { canBuyShopItem, getAvailableShopUpgrades, getShopItemSellPrice } from "./v2-shop-items-ownership";
import { SHOP_ITEM_DEFINITIONS, getNextGpuPrice, getShopItemDefinition, getShopUpgradeDefinition } from "./v2-shop-items-shared";
import { SUPPORT_ITEM_DEFINITIONS, getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "./v2-support-items";
import type { DispatchPayload, GameState, ShopItemId, ShopUpgradeId, SupportItemId } from "./v2-types";

export type ShopPurchaseAction = "buy-shop-item" | "upgrade-shop-item" | "buy-coffee" | "buy-coffee-machine" | "upgrade-coffee-machine" | "buy-ai-month" | "buy-support-item";
type PurchasePayload = Pick<DispatchPayload, "shopItemId" | "shopUpgradeId" | "aiSlotId" | "supportItemId">;
type GiftState = Pick<GameState, "loverProgressState">;
type FixedResaleItem = "ebike" | "down_jacket" | SupportItemId;
type ShopInvestments = GameState["shopState"]["investments"] & Partial<Record<FixedResaleItem | "bikeGiftDiscount", number>>;

export function getLoverGiftCount(state: GiftState): number {
  return state.loverProgressState.giftCoupons ?? 0;
}

export function consumeLoverGift(state: GameState): GameState {
  const count = getLoverGiftCount(state);
  if (count <= 0) return state;
  const loverProgressState = { ...state.loverProgressState, giftCoupons: count - 1 };
  return { ...state, loverProgressState };
}

export function getShopActionListedPrice(state: GameState, actionId: ShopPurchaseAction, payload: PurchasePayload): number | null {
  if (actionId === "buy-shop-item" && payload.shopItemId) {
    const itemId = payload.shopItemId;
    if (itemId === "gpu_buy") {
      const price = getNextGpuPrice(state.shopState.gpuLevel);
      return price;
    }
    if (itemId === "bike") return getNextBikeTierDefinition(state.shopState.bikeLevel)?.price ?? null;
    return getShopItemDefinition(itemId).price;
  }
  if (actionId === "upgrade-shop-item" && payload.shopUpgradeId) {
    return getShopUpgradeDefinition(payload.shopUpgradeId as ShopUpgradeId).price;
  }
  if (actionId === "buy-coffee") return getCoffeeBuyPrice(state.coffeeState);
  if (actionId === "buy-coffee-machine") return COFFEE_MACHINE_PRICE;
  if (actionId === "upgrade-coffee-machine" && payload.shopUpgradeId) {
    const upgrade = COFFEE_MACHINE_UPGRADE_DEFINITIONS.find((entry) => entry.id === payload.shopUpgradeId);
    return upgrade?.price ?? null;
  }
  if (actionId === "buy-ai-month" && payload.aiSlotId) {
    return getAiModelForTotalMonths(state.totalMonths, payload.aiSlotId).price;
  }
  if (actionId === "buy-support-item" && payload.supportItemId) return getSupportItemDefinition(payload.supportItemId).price;
  return null;
}

export function getShopActionBasePrice(state: GameState, actionId: ShopPurchaseAction, payload: PurchasePayload): number | null {
  const listedPrice = getShopActionListedPrice(state, actionId, payload);
  if (listedPrice === null) return null;
  const kind = getLabReimbursementKind(actionId, payload);
  if (kind && (state.shopState.entitlements[kind] > 0 || getLabReimbursementCount(state, kind) > 0)) return 0;
  if (actionId === "buy-ai-month" && hasAiReimbursement(state)) return 0;
  return listedPrice;
}

export function getShopLabFundingCost(state: GameState, actionId: ShopPurchaseAction, payload: PurchasePayload): number {
  const kind = getLabReimbursementKind(actionId, payload);
  const covered = kind
    ? state.shopState.entitlements[kind] === 0 && getLabReimbursementCount(state, kind) > 0
    : actionId === "buy-ai-month" && hasAiReimbursement(state);
  return covered ? getShopActionListedPrice(state, actionId, payload) ?? 0 : 0;
}

export function hasOtherLoverGiftPurchases(state: GameState): boolean {
  if (SHOP_ITEM_DEFINITIONS.some((item) => canBuyShopItem(state, item.id))) return true;
  if (getAvailableShopUpgrades(state, "chair").length > 0) return true;
  if (!state.coffeeState.machineOwned) return true;
  if (getAvailableCoffeeMachineUpgrades(state.coffeeState).length > 0) return true;
  if (SUPPORT_ITEM_DEFINITIONS.some((item) => !isSupportItemOwned(state.eventSupport, item.id))) return true;
  return AI_SLOT_IDS.some((slot) => {
    const subscription = state.aiShopState.subscriptions[slot];
    const model = getAiModelForTotalMonths(state.totalMonths, slot);
    const purchasedThisMonth = subscription.active && subscription.lastRenewalTotalMonths === state.totalMonths;
    return !purchasedThisMonth && (!subscription.enabled || subscription.modelId !== model.id);
  });
}

export function getLoverGiftQuote(state: GameState, basePrice: number, automatic = false): { price: number; usesGift: boolean } {
  const usesGift = basePrice > 0 && getLoverGiftCount(state) > 0
    && (!automatic || !hasOtherLoverGiftPurchases(state));
  return { price: usesGift ? 0 : basePrice, usesGift };
}

export function getShopActionPrice(state: GameState, actionId: ShopPurchaseAction, payload: PurchasePayload): number | null {
  const basePrice = getShopActionBasePrice(state, actionId, payload);
  return basePrice === null ? null : getLoverGiftQuote(state, basePrice).price;
}

export function getGiftAwareShopSellPrice(state: GameState, itemId: ShopItemId | SupportItemId): number {
  const investments: ShopInvestments = state.shopState.investments;
  if (itemId === "bike") {
    return Math.max(0, getShopItemSellPrice(state, itemId) - Math.ceil((investments.bikeGiftDiscount ?? 0) / 2));
  }
  if (itemId === "ebike" || itemId === "down_jacket" || itemId === "parasol" || itemId === "badminton_racket") {
    const investment = investments[itemId];
    if (investment !== undefined) return Math.floor(investment / 2);
  }
  return itemId === "parasol" || itemId === "badminton_racket"
    ? getSupportItemSellPrice(itemId) : getShopItemSellPrice(state, itemId);
}

export function recordShopInvestment(state: GameState, itemId: FixedResaleItem | "bikeGiftDiscount", price?: number): ShopInvestments {
  const investments: ShopInvestments = { ...state.shopState.investments };
  if (price === undefined) delete investments[itemId];
  else investments[itemId] = price;
  return investments;
}

export function recordBikeGiftDiscount(state: GameState, basePrice: number): ShopInvestments {
  const investments: ShopInvestments = state.shopState.investments;
  return { ...investments, bikeGiftDiscount: (investments.bikeGiftDiscount ?? 0) + basePrice };
}
