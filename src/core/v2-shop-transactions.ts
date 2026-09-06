import {
  AI_SLOT_IDS,
  createAiBuffs,
  getAiModelForTotalMonths,
} from "./v2-ai-shop";
import { applyAiActivationEffects } from "./v2-ai-activation";
import { addOrReplaceBuffs, removeBuffs } from "./v2-buffs";
import {
  COFFEE_MACHINE_PRICE,
  COFFEE_MACHINE_UPGRADE_DEFINITIONS,
  getAvailableCoffeeMachineUpgrades,
  getCoffeeBuyPrice,
  getCoffeeMachineSellPrice,
  getCurrentCoffeeBonus,
} from "./v2-coffee-system";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import {
  canBuyShopItem,
  canSellShopItem,
  getGpuTierDefinition,
  getNextGpuPrice,
  getNextGpuTierDefinition,
  getAvailableShopUpgrades,
  getShopItemDefinition,
  getShopItemSellPrice,
  getShopUpgradeDefinition,
} from "./v2-shop-items";
import { getNextBikeTierDefinition } from "./v2-bike-system";
import { getSupportItemDefinition, getSupportItemSellPrice, isSupportItemOwned } from "./v2-support-items";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "./v2-development-flags";
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

function getCoffeeMachinePurchasePrice(state: GameState): number {
  return state.shopState.entitlements.coffeeMachinePurchase > 0 ? 0 : COFFEE_MACHINE_PRICE;
}

function getCoffeeMachineUpgradePurchasePrice(state: GameState, upgradeId: CoffeeMachineUpgrade): number {
  const basePrice = COFFEE_MACHINE_UPGRADE_DEFINITIONS.find((upgrade) => upgrade.id === upgradeId)?.price ?? 0;
  return state.shopState.entitlements.coffeeMachineUpgrade > 0 ? 0 : basePrice;
}

function getShopItemPurchasePrice(state: GameState, itemId: ShopItemId): number | null {
  if (itemId === "gpu_buy") {
    const basePrice = getNextGpuPrice(state.shopState.gpuLevel);
    if (basePrice === null) return null;
    return state.shopState.entitlements.gpuTransaction > 0 ? 0 : basePrice;
  }

  if (itemId === "bike") {
    return getNextBikeTierDefinition(state.shopState.bikeLevel)?.price ?? null;
  }

  const basePrice = getShopItemDefinition(itemId).price;
  if (itemId === "keyboard" && state.shopState.entitlements.keyboardPurchase > 0) return 0;
  if (itemId === "monitor" && state.shopState.entitlements.monitorPurchase > 0) return 0;
  if (itemId === "chair" && state.shopState.entitlements.chairPurchase > 0) return 0;
  return basePrice;
}

function getShopUpgradePurchasePrice(state: GameState, upgradeId: ShopUpgradeId): number {
  const basePrice = getShopUpgradeDefinition(upgradeId).price;
  return upgradeId.startsWith("chair-") && state.shopState.entitlements.chairUpgrade > 0
    ? 0
    : basePrice;
}

function buyShopItem(state: GameState, itemId: ShopItemId): GameState {
  const item = getShopItemDefinition(itemId);
  const view = { shopState: state.shopState, eventSupport: state.eventSupport };
  if (!canBuyShopItem(view, itemId)) return fail(state, `${item.name} 当前无法购买。`);
  const price = getShopItemPurchasePrice(state, itemId);
  if (price === null) return fail(state, `${item.name} 当前无法购买。`);
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
    if (shopState.entitlements.chairPurchase > 0) shopState.entitlements.chairPurchase -= 1;
  } else if (itemId === "keyboard") {
    shopState.keyboardOwned = true;
    shopState.investments.keyboard += price;
    if (shopState.entitlements.keyboardPurchase > 0) shopState.entitlements.keyboardPurchase -= 1;
  } else if (itemId === "monitor") {
    shopState.monitorOwned = true;
    shopState.investments.monitor += price;
    if (shopState.entitlements.monitorPurchase > 0) shopState.entitlements.monitorPurchase -= 1;
  } else if (itemId === "bike") {
    const nextTier = getNextBikeTierDefinition(shopState.bikeLevel);
    if (!nextTier) return fail(state, "自行车已经升级到最高等级。 ");
    shopState.bikeOwned = true;
    shopState.bikeLevel = nextTier.level;
    shopState.investments.bike = (shopState.investments.bike ?? 0) + price;
    transactionText = shopState.bikeLevel === 1
      ? `购买${nextTier.name}`
      : `自行车升级为${nextTier.name}`;
  } else if (itemId === "ebike") {
    shopState.ebikeOwned = true;
  } else if (itemId === "down_jacket") {
    eventSupport.hasDownJacket = true;
  }

  return pushLog({
    ...updateMoney(state, state.player.money - price),
    shopState,
    eventSupport,
  }, `商店：${transactionText}，${price === 0 ? "导师经费报销" : `金币 -${price}`}。`);
}

function sellShopItem(state: GameState, itemId: ShopItemId): GameState {
  const item = getShopItemDefinition(itemId);
  const view = { shopState: state.shopState, eventSupport: state.eventSupport };
  if (!canSellShopItem(view, itemId)) return fail(state, `你没有可出售的${item.name}。`);

  const sellPrice = getShopItemSellPrice(view, itemId);
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
  } else if (itemId === "ebike") {
    shopState.ebikeOwned = false;
  } else if (itemId === "down_jacket") {
    eventSupport.hasDownJacket = false;
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
  const price = getShopUpgradePurchasePrice(state, upgradeId);
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
    if (shopState.entitlements.chairUpgrade > 0) shopState.entitlements.chairUpgrade -= 1;
  }
  return pushLog({
    ...updateMoney(state, state.player.money - price),
    shopState,
  }, `商店：升级${upgrade.name}，${price === 0 ? "导师经费报销" : `金币 -${price}`}。`);
}

function buyCoffee(state: GameState): GameState {
  const coffeePrice = getCoffeeBuyPrice(state.coffeeState);
  const coffeeState = state.coffeeState;
  if (!coffeeState.machineOwned) return fail(state, "需要先购买咖啡机，才能生产冰美式。 ");
  if (coffeeState.machineUpgrade !== "unlimited" && coffeeState.coffeePurchaseCountThisMonth >= 1) {
    return fail(state, "本月的冰美式已经买过了。 ");
  }
  if (state.player.money < coffeePrice) return fail(state, `金币不足，购买冰美式需要 ${coffeePrice} 金币。`);

  const coffeeGain = 3 + getCurrentCoffeeBonus(coffeeState);
  const nextSan = Math.min(state.sanCap, state.player.san + coffeeGain);
  const actualCoffeeGain = nextSan - state.player.san;
  const nextCoffeeState = {
    ...coffeeState,
    coffeePurchaseCountThisMonth: coffeeState.coffeePurchaseCountThisMonth + 1,
    coffeeProducedCountThisMonth: coffeeState.coffeeProducedCountThisMonth + 1,
    machineTrackedCoffeeCount: coffeeState.machineTrackedCoffeeCount + 1,
  };
  return pushLog({
    ...updateMoney(state, state.player.money - coffeePrice),
    coffeeState: nextCoffeeState,
    player: {
      ...state.player,
      money: state.player.money - coffeePrice,
      san: nextSan,
    },
  }, `商店：购买冰美式，金币 -${coffeePrice}；SAN +${actualCoffeeGain}。`);
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
      subscriptionEnabled: false,
      subscriptionPaused: false,
      machineInvestment: 0,
    },
  }, `商店：出售咖啡机，金币 +${sellPrice}。`);
}

function buyCoffeeMachine(state: GameState): GameState {
  if (state.coffeeState.machineOwned) return fail(state, "你已经拥有咖啡机。 ");
  const price = getCoffeeMachinePurchasePrice(state);
  if (state.player.money < price) return fail(state, `金币不足，购买咖啡机需要 ${price} 金币。`);
  const shopState = {
    ...state.shopState,
    entitlements: { ...state.shopState.entitlements },
  };
  if (shopState.entitlements.coffeeMachinePurchase > 0) shopState.entitlements.coffeeMachinePurchase -= 1;
  return pushLog({
    ...updateMoney(state, state.player.money - price),
    shopState,
    coffeeState: {
      ...state.coffeeState,
      machineOwned: true,
      machineInvestment: price,
    },
  }, `商店：购买咖啡机，${price === 0 ? "导师经费报销" : `金币 -${price}`}。`);
}

function upgradeCoffeeMachine(state: GameState, upgradeId: CoffeeMachineUpgrade): GameState {
  const upgrade = getAvailableCoffeeMachineUpgrades(state.coffeeState).find((entry) => entry.id === upgradeId);
  if (!upgrade) return fail(state, "该咖啡机升级当前无法使用。 ");
  const price = getCoffeeMachineUpgradePurchasePrice(state, upgradeId);
  if (state.player.money < price) return fail(state, `金币不足，升级${upgrade.name}需要 ${price} 金币。`);
  const shopState = {
    ...state.shopState,
    entitlements: { ...state.shopState.entitlements },
  };
  if (shopState.entitlements.coffeeMachineUpgrade > 0) shopState.entitlements.coffeeMachineUpgrade -= 1;
  return pushLog({
    ...updateMoney(state, state.player.money - price),
    shopState,
    coffeeState: {
      ...state.coffeeState,
      machineUpgrade: upgrade.id,
      machineInvestment: state.coffeeState.machineInvestment + price,
    },
  }, `商店：升级${upgrade.name}，${price === 0 ? "导师经费报销" : `金币 -${price}`}。`);
}

function toggleCoffeeSubscription(state: GameState): GameState {
  if (!state.coffeeState.machineOwned) return fail(state, "需要先购买咖啡机，才能开启冰美式自动续费。 ");
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
  if (state.player.money < item.price) return fail(state, `金币不足，购买${item.name}需要 ${item.price} 金币。`);
  const eventSupport = { ...state.eventSupport };
  if (itemId === "badminton_racket") eventSupport.hasBadmintonRacket = true;
  if (itemId === "parasol") eventSupport.hasParasol = true;
  return pushLog({
    ...updateMoney(state, state.player.money - item.price),
    eventSupport,
  }, `商店：购买${item.name}，金币 -${item.price}。`);
}

function sellSupportItem(state: GameState, itemId: SupportItemId): GameState {
  const item = getSupportItemDefinition(itemId);
  if (!isSupportItemOwned(state.eventSupport, itemId)) return fail(state, `你没有可出售的${item.name}。`);
  const eventSupport = { ...state.eventSupport };
  if (itemId === "badminton_racket") eventSupport.hasBadmintonRacket = false;
  if (itemId === "parasol") eventSupport.hasParasol = false;
  return pushLog({
    ...updateMoney(state, state.player.money + getSupportItemSellPrice(itemId)),
    eventSupport,
  }, `商店：出售${item.name}，金币 +${getSupportItemSellPrice(itemId)}。`);
}

function buyAiMonth(state: GameState, slot: AiSlotId): GameState {
  const model = getAiModelForTotalMonths(state.totalMonths, slot);
  const subscription = getAiState(state).subscriptions[slot];
  if (subscription.active) return fail(state, `${model.name} 本月已经订购。`);
  const price = hasAiReimbursement(state) ? 0 : model.price;
  if (state.player.money < price) return fail(state, `金币不足，${model.name}本月需要 ${price} 金币。`);
  const purchasedState = syncAiBuffs({
    ...updateMoney(state, state.player.money - price),
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
  return pushLog(activated.nextState, `商店：${price === 0 ? "报销" : "购买"}${model.name}${price > 0 ? `，金币 -${price}` : ""}，本月生效${effectText}。`);
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

export function getShopActionPrice(
  state: GameState,
  actionId: "buy-shop-item" | "upgrade-shop-item" | "buy-coffee" | "buy-coffee-machine" | "upgrade-coffee-machine" | "buy-ai-month",
  payload: Pick<DispatchPayload, "shopItemId" | "shopUpgradeId" | "aiSlotId">,
): number | null {
  if (actionId === "buy-shop-item" && payload.shopItemId) return getShopItemPurchasePrice(state, payload.shopItemId);
  if (actionId === "upgrade-shop-item" && payload.shopUpgradeId) {
    return getShopUpgradePurchasePrice(state, payload.shopUpgradeId as ShopUpgradeId);
  }
  if (actionId === "buy-coffee") return getCoffeeBuyPrice(state.coffeeState);
  if (actionId === "buy-coffee-machine") return getCoffeeMachinePurchasePrice(state);
  if (actionId === "upgrade-coffee-machine" && payload.shopUpgradeId) {
    return isCoffeeMachineUpgrade(payload.shopUpgradeId)
      ? getCoffeeMachineUpgradePurchasePrice(state, payload.shopUpgradeId)
      : null;
  }
  if (actionId === "buy-ai-month" && payload.aiSlotId) {
    const model = getAiModelForTotalMonths(state.totalMonths, payload.aiSlotId);
    return hasAiReimbursement(state) ? 0 : model.price;
  }
  return null;
}

export function isSupportItemOwnedInState(state: GameState, itemId: SupportItemId): boolean {
  return isSupportItemOwned(state.eventSupport, itemId);
}

export { getSupportItemDefinition, getSupportItemSellPrice };
