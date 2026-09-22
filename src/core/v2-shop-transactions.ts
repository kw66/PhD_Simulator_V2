import {
  AI_SLOT_IDS,
  createAiBuffs,
  getAiModelForTotalMonths,
} from "./v2-ai-shop";
import { applyAiActivationEffects } from "./v2-ai-activation";
import { addOrReplaceBuffs, removeBuffs } from "./v2-buffs";
import {
  COFFEE_MACHINE_UPGRADE_DEFINITIONS,
  getAvailableCoffeeMachineUpgrades,
  getCoffeeMachineSellPrice,
  getCoffeeSanGain,
} from "./v2-coffee-system";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import {
  canBuyShopItem,
  canSellShopItem,
  getGpuTierDefinition,
  getNextGpuTierDefinition,
  getAvailableShopUpgrades,
  getShopItemDefinition,
  getShopUpgradeDefinition,
} from "./v2-shop-items";
import { getNextBikeTierDefinition } from "./v2-bike-system";
import { getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "./v2-support-items";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "./v2-development-flags";
import { consumeLoverGift, getGiftAwareShopSellPrice, getLoverGiftQuote, getShopActionBasePrice, recordBikeGiftDiscount, recordShopInvestment } from "./v2-lover-gift";
import type { AiSlotId, CoffeeMachineUpgradeId, DispatchPayload, GameActionId, GameState, ShopItemId, ShopUpgradeId, SupportItemId } from "./v2-types";

type CoffeeMachineUpgrade = Exclude<CoffeeMachineUpgradeId, null>;

type ShopActionId = Extract<
  GameActionId,
  | "buy-shop-item"
  | "sell-shop-item"
  | "upgrade-shop-item"
  | "buy-coffee"
  | "buy-coffee-machine"
  | "sell-coffee-machine"
  | "upgrade-coffee-machine"
  | "toggle-coffee-subscription"
  | "buy-ai-month"
  | "toggle-ai-subscription"
  | "buy-support-item"
  | "sell-support-item"
>;

function hasAiReimbursement(state: GameState): boolean {
  return state.eventSupport.aiCostsCoveredUntilTotalMonths === state.totalMonths;
}

function getAiState(state: GameState) {
  return state.aiShopState;
}

function syncAiBuffs(state: GameState): GameState {
  const withoutAiBuffs = removeBuffs(state.buffs, AI_SLOT_IDS.map((slot) => `ai-${slot}`));
  return { ...state, buffs: addOrReplaceBuffs(withoutAiBuffs, createAiBuffs(state.aiShopState)) };
}

function updateMoney(state: GameState, money: number): GameState {
  return { ...state, player: { ...state.player, money } };
}

function fail(state: GameState, message: string): GameState {
  return pushNoOpLog(state, message);
}

function isCoffeeMachineUpgrade(value: string): value is CoffeeMachineUpgrade {
  return COFFEE_MACHINE_UPGRADE_DEFINITIONS.some((upgrade) => upgrade.id === value);
}

function payForPurchase(state: GameState, price: number, usesGift: boolean): GameState {
  return updateMoney(usesGift ? consumeLoverGift(state) : state, state.player.money - price);
}

function purchaseCostText(price: number, usesGift: boolean): string {
  return usesGift ? "恋人赠礼，本次免费" : price === 0 ? "导师经费报销" : `金币 -${price}`;
}

function buyShopItem(state: GameState, itemId: ShopItemId): GameState {
  const item = getShopItemDefinition(itemId);
  const view = { shopState: state.shopState, eventSupport: state.eventSupport };
  if (!canBuyShopItem(view, itemId)) return fail(state, `${item.name} 当前无法购买。`);
  const basePrice = getShopActionBasePrice(state, "buy-shop-item", { shopItemId: itemId });
  if (basePrice === null) return fail(state, `${item.name} 当前无法购买。`);
  const { price, usesGift } = getLoverGiftQuote(state, basePrice);
  if (state.player.money < price) return fail(state, `金币不足，购买${item.name}需要 ${price} 金币。`);

  let shopState = {
    ...state.shopState,
    investments: { ...state.shopState.investments },
    entitlements: { ...state.shopState.entitlements },
  };
  let eventSupport = { ...state.eventSupport };
  let transactionText = `购买${item.name}`;
  if (itemId === "gpu_buy") {
    const nextTier = getNextGpuTierDefinition(shopState.gpuLevel);
    if (!nextTier) return fail(state, "显卡已经升级到最高型号。 ");
    transactionText = shopState.gpuLevel === 0
      ? `购买 ${nextTier.name}`
      : `显卡升级为 ${nextTier.name}`;
    shopState.gpuLevel = nextTier.level;
    shopState.investments.gpu += price;
    if (shopState.entitlements.gpuTransaction > 0) shopState.entitlements.gpuTransaction -= 1;
  } else if (itemId === "chair") {
    shopState.chairOwned = true;
    shopState.investments.chair += price;
    if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  } else if (itemId === "keyboard") {
    shopState.keyboardOwned = true;
    shopState.investments.keyboard += price;
    if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  } else if (itemId === "monitor") {
    shopState.monitorOwned = true;
    shopState.investments.monitor += price;
    if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  } else if (itemId === "bike") {
    const nextTier = getNextBikeTierDefinition(shopState.bikeLevel);
    if (!nextTier) return fail(state, "自行车已经升级到最高等级。 ");
    shopState.bikeOwned = true;
    shopState.bikeLevel = nextTier.level;
    shopState.investments.bike = (shopState.investments.bike ?? 0) + price;
    if (usesGift) shopState.investments = recordBikeGiftDiscount({ ...state, shopState }, basePrice);
    transactionText = shopState.bikeLevel === 1
      ? `购买${nextTier.name}`
      : `自行车升级为${nextTier.name}`;
  } else if (itemId === "ebike") {
    shopState.ebikeOwned = true;
    shopState.investments = recordShopInvestment(state, itemId, price);
  } else if (itemId === "down_jacket") {
    eventSupport.hasDownJacket = true;
    shopState.investments = recordShopInvestment(state, itemId, price);
  }

  return pushLog({
    ...payForPurchase(state, price, usesGift),
    shopState,
    eventSupport,
  }, `商店：${transactionText}，${purchaseCostText(price, usesGift)}。`);
}

function sellShopItem(state: GameState, itemId: ShopItemId): GameState {
  const item = getShopItemDefinition(itemId);
  const view = { shopState: state.shopState, eventSupport: state.eventSupport };
  if (!canSellShopItem(view, itemId)) return fail(state, `你没有可出售的${item.name}。`);

  const sellPrice = getGiftAwareShopSellPrice(state, itemId);
  const shopState = {
    ...state.shopState,
    investments: { ...state.shopState.investments },
    entitlements: { ...state.shopState.entitlements },
  };
  const eventSupport = { ...state.eventSupport };
  let soldItemName = item.name;
  if (itemId === "gpu_buy") {
    soldItemName = getGpuTierDefinition(shopState.gpuLevel)?.name ?? item.name;
    shopState.gpuLevel = 0;
    shopState.investments.gpu = 0;
  } else if (itemId === "chair") {
    shopState.chairOwned = false;
    shopState.chairUpgrade = null;
    shopState.investments.chair = 0;
  } else if (itemId === "keyboard") {
    shopState.keyboardOwned = false;
    shopState.investments.keyboard = 0;
  } else if (itemId === "monitor") {
    shopState.monitorOwned = false;
    shopState.investments.monitor = 0;
  } else if (itemId === "bike") {
    shopState.bikeOwned = false;
    shopState.bikeLevel = 0;
    shopState.investments.bike = 0;
    shopState.investments = recordShopInvestment({ ...state, shopState }, "bikeGiftDiscount");
  } else if (itemId === "ebike") {
    shopState.ebikeOwned = false;
    shopState.investments = recordShopInvestment(state, itemId);
  } else if (itemId === "down_jacket") {
    eventSupport.hasDownJacket = false;
    shopState.investments = recordShopInvestment(state, itemId);
  }

  return pushLog({
    ...updateMoney(state, state.player.money + sellPrice),
    shopState,
    eventSupport,
  }, `商店：出售${soldItemName}，金币 +${sellPrice}。`);
}

function getShopUpgradeItemId(_upgradeId: ShopUpgradeId): "chair" {
  return "chair";
}

function upgradeShopItem(state: GameState, upgradeId: ShopUpgradeId): GameState {
  const upgrade = getShopUpgradeDefinition(upgradeId);
  const itemId = getShopUpgradeItemId(upgradeId);
  const available = getAvailableShopUpgrades({ shopState: state.shopState }, itemId).some((entry) => entry.id === upgradeId);
  if (!available) return fail(state, `${upgrade.name} 当前无法升级。`);
  const { price, usesGift } = getLoverGiftQuote(state, getShopActionBasePrice(state, "upgrade-shop-item", { shopUpgradeId: upgradeId })!);
  if (state.player.money < price) return fail(state, `金币不足，升级${upgrade.name}需要 ${price} 金币。`);

  const upgradeName = upgradeId.split("-")[1] as "advanced" | "massage" | "torture" | "spike" | "hammock";
  const shopState = {
    ...state.shopState,
    investments: { ...state.shopState.investments },
    entitlements: { ...state.shopState.entitlements },
  };
  if (itemId === "chair") {
    shopState.chairUpgrade = upgradeName as typeof shopState.chairUpgrade;
    shopState.investments.chair += price;
    if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  }
  return pushLog({
    ...payForPurchase(state, price, usesGift),
    shopState,
  }, `商店：升级${upgrade.name}，${purchaseCostText(price, usesGift)}。`);
}

function buyCoffee(state: GameState): GameState {
  const { price: coffeePrice, usesGift } = getLoverGiftQuote(state, getShopActionBasePrice(state, "buy-coffee", {})!);
  const coffeeState = state.coffeeState;
  if (coffeeState.machineUpgrade !== "unlimited" && coffeeState.coffeePurchaseCountThisMonth >= 1) {
    return fail(state, "本月的冰美式已经买过了。 ");
  }
  if (state.player.money < coffeePrice) return fail(state, `金币不足，购买冰美式需要 ${coffeePrice} 金币。`);

  const coffeeGain = getCoffeeSanGain(coffeeState);
  const nextSan = Math.min(state.sanCap, state.player.san + coffeeGain);
  const actualCoffeeGain = nextSan - state.player.san;
  const nextCoffeeState = {
    ...coffeeState,
    coffeePurchaseCountThisMonth: coffeeState.coffeePurchaseCountThisMonth + 1,
    coffeeProducedCountThisMonth: coffeeState.coffeeProducedCountThisMonth + Number(coffeeState.machineOwned),
    machineTrackedCoffeeCount: coffeeState.machineTrackedCoffeeCount + Number(coffeeState.machineOwned),
  };
  return pushLog({
    ...payForPurchase(state, coffeePrice, usesGift),
    coffeeState: nextCoffeeState,
    player: {
      ...state.player,
      money: state.player.money - coffeePrice,
      san: nextSan,
    },
  }, `商店：购买冰美式，${purchaseCostText(coffeePrice, usesGift)}；SAN +${actualCoffeeGain}。`);
}

function sellCoffeeMachine(state: GameState): GameState {
  if (!state.coffeeState.machineOwned) return fail(state, "你还没有咖啡机。 ");
  const sellPrice = getCoffeeMachineSellPrice(state.coffeeState);
  return pushLog({
    ...updateMoney(state, state.player.money + sellPrice),
    coffeeState: {
      ...state.coffeeState,
      machineOwned: false,
      machineUpgrade: null,
      machineInvestment: 0,
    },
  }, `商店：出售咖啡机，金币 +${sellPrice}。`);
}

function buyCoffeeMachine(state: GameState): GameState {
  if (state.coffeeState.machineOwned) return fail(state, "你已经拥有咖啡机。 ");
  const { price, usesGift } = getLoverGiftQuote(state, getShopActionBasePrice(state, "buy-coffee-machine", {})!);
  if (state.player.money < price) return fail(state, `金币不足，购买咖啡机需要 ${price} 金币。`);
  const shopState = {
    ...state.shopState,
    entitlements: { ...state.shopState.entitlements },
  };
  if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  return pushLog({
    ...payForPurchase(state, price, usesGift),
    shopState,
    coffeeState: {
      ...state.coffeeState,
      machineOwned: true,
      machineInvestment: price,
    },
  }, `商店：购买咖啡机，${purchaseCostText(price, usesGift)}。`);
}

function upgradeCoffeeMachine(state: GameState, upgradeId: CoffeeMachineUpgrade): GameState {
  const upgrade = getAvailableCoffeeMachineUpgrades(state.coffeeState).find((entry) => entry.id === upgradeId);
  if (!upgrade) return fail(state, "该咖啡机升级当前无法使用。 ");
  const { price, usesGift } = getLoverGiftQuote(state, getShopActionBasePrice(state, "upgrade-coffee-machine", { shopUpgradeId: upgradeId })!);
  if (state.player.money < price) return fail(state, `金币不足，升级${upgrade.name}需要 ${price} 金币。`);
  const shopState = {
    ...state.shopState,
    entitlements: { ...state.shopState.entitlements },
  };
  if (shopState.entitlements.workstationTransaction > 0) shopState.entitlements.workstationTransaction -= 1;
  return pushLog({
    ...payForPurchase(state, price, usesGift),
    shopState,
    coffeeState: {
      ...state.coffeeState,
      machineUpgrade: upgrade.id,
      machineInvestment: state.coffeeState.machineInvestment + price,
    },
  }, `商店：升级${upgrade.name}，${purchaseCostText(price, usesGift)}。`);
}

function toggleCoffeeSubscription(state: GameState): GameState {
  const enabled = !state.coffeeState.subscriptionEnabled;
  return {
    ...state,
    coffeeState: {
      ...state.coffeeState,
      subscriptionEnabled: enabled,
      subscriptionPaused: false,
    },
  };
}

function buySupportItem(state: GameState, itemId: SupportItemId): GameState {
  const item = getSupportItemDefinition(itemId);
  if (isSupportItemOwned(state.eventSupport, itemId)) return fail(state, `你已经拥有${item.name}。`);
  const { price, usesGift } = getLoverGiftQuote(state, item.price);
  if (state.player.money < price) return fail(state, `金币不足，购买${item.name}需要 ${price} 金币。`);
  const eventSupport = { ...state.eventSupport };
  if (itemId === "badminton_racket") eventSupport.hasBadmintonRacket = true;
  if (itemId === "parasol") eventSupport.hasParasol = true;
  return pushLog({
    ...payForPurchase(state, price, usesGift),
    shopState: { ...state.shopState, investments: recordShopInvestment(state, itemId, price) },
    eventSupport,
  }, `商店：购买${item.name}，${purchaseCostText(price, usesGift)}。`);
}

function sellSupportItem(state: GameState, itemId: SupportItemId): GameState {
  const item = getSupportItemDefinition(itemId);
  if (!isSupportItemOwned(state.eventSupport, itemId)) return fail(state, `你没有可出售的${item.name}。`);
  const sellPrice = getGiftAwareShopSellPrice(state, itemId);
  const eventSupport = { ...state.eventSupport };
  if (itemId === "badminton_racket") eventSupport.hasBadmintonRacket = false;
  if (itemId === "parasol") eventSupport.hasParasol = false;
  return pushLog({
    ...updateMoney(state, state.player.money + sellPrice),
    shopState: { ...state.shopState, investments: recordShopInvestment(state, itemId) },
    eventSupport,
  }, `商店：出售${item.name}，金币 +${sellPrice}。`);
}

function buyAiMonth(state: GameState, slot: AiSlotId): GameState {
  const model = getAiModelForTotalMonths(state.totalMonths, slot);
  const subscription = getAiState(state).subscriptions[slot];
  if (subscription.active) return fail(state, `${model.name} 本月已经订购。`);
  const { price, usesGift } = getLoverGiftQuote(state, hasAiReimbursement(state) ? 0 : model.price);
  if (state.player.money < price) return fail(state, `金币不足，${model.name}本月需要 ${price} 金币。`);
  const purchasedState = syncAiBuffs({
    ...payForPurchase(state, price, usesGift),
    aiShopState: {
      subscriptions: {
        ...getAiState(state).subscriptions,
        [slot]: {
          ...subscription,
          active: true,
          paused: false,
          modelId: model.id,
          lastRenewalTotalMonths: state.totalMonths,
        },
      },
    },
  });
  const activated = applyAiActivationEffects(purchasedState, [model]);
  const effectDetails = [...activated.polishDetails, ...activated.readingDetails];
  const effectText = effectDetails.length > 0 ? `；${effectDetails.join("；")}` : "";
  const costText = usesGift ? "恋人赠礼，本次免费" : hasAiReimbursement(state) ? "导师经费报销" : price === 0 ? "免费" : `金币 -${price}`;
  return pushLog(activated.nextState, `商店：购买${model.name}，${costText}，本月生效${effectText}。`);
}

function toggleAiSubscription(state: GameState, slot: AiSlotId): GameState {
  const model = getAiModelForTotalMonths(state.totalMonths, slot);
  const current = getAiState(state).subscriptions[slot];
  const enabled = !current.enabled;
  return {
    ...state,
    aiShopState: {
      subscriptions: {
        ...getAiState(state).subscriptions,
        [slot]: {
          ...current,
          enabled,
          paused: enabled ? current.paused : false,
          modelId: enabled && current.modelId === null ? model.id : current.modelId,
        },
      },
    },
  };
}

export function applyShopAction(state: GameState, actionId: ShopActionId, payload: DispatchPayload): GameState {
  if (
    state.phase !== "playing"
    || (state.month <= 0 && !SHOW_ALL_MODULES_DURING_DEVELOPMENT)
    || (state.totalMonths <= 0 && !SHOW_ALL_MODULES_DURING_DEVELOPMENT)
  ) return state;
  switch (actionId) {
    case "buy-shop-item":
      return payload.shopItemId ? buyShopItem(state, payload.shopItemId) : state;
    case "sell-shop-item":
      return payload.shopItemId ? sellShopItem(state, payload.shopItemId) : state;
    case "upgrade-shop-item":
      return payload.shopUpgradeId ? upgradeShopItem(state, payload.shopUpgradeId as ShopUpgradeId) : state;
    case "buy-coffee":
      return buyCoffee(state);
    case "buy-coffee-machine":
      return buyCoffeeMachine(state);
    case "sell-coffee-machine":
      return sellCoffeeMachine(state);
    case "upgrade-coffee-machine":
      return payload.shopUpgradeId && isCoffeeMachineUpgrade(payload.shopUpgradeId)
        ? upgradeCoffeeMachine(state, payload.shopUpgradeId)
        : state;
    case "toggle-coffee-subscription":
      return toggleCoffeeSubscription(state);
    case "buy-ai-month":
      return payload.aiSlotId ? buyAiMonth(state, payload.aiSlotId) : state;
    case "toggle-ai-subscription":
      return payload.aiSlotId ? toggleAiSubscription(state, payload.aiSlotId) : state;
    case "buy-support-item":
      return payload.supportItemId ? buySupportItem(state, payload.supportItemId) : state;
    case "sell-support-item":
      return payload.supportItemId ? sellSupportItem(state, payload.supportItemId) : state;
    default:
      return state;
  }
}

export { getShopActionPrice } from "./v2-lover-gift";

export function isSupportItemOwnedInState(state: GameState, itemId: SupportItemId): boolean {
  return isSupportItemOwned(state.eventSupport, itemId);
}

export { getSupportItemDefinition, getSupportItemSellPrice };
