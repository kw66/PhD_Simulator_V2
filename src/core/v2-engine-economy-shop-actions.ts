import {
  applyShopItemOwnership,
  applyShopItemUpgrade,
  canBuyShopItem,
  canSellShopItem,
  canUpgradeShopItem,
  getShopItemDefinition,
  getShopItemSellPrice,
  getShopUpgradeDefinition,
} from "./v2-shop-items";
import { pushLog } from "./v2-engine-helpers";
import { getEconomyActionBlockedState } from "./v2-engine-economy-actions-shared";
import type { DispatchPayload, GameState } from "./v2-types";

export function buyShopItemAction(state: GameState, itemId?: DispatchPayload["shopItemId"]): GameState {
  if (!itemId) {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }

  const item = getShopItemDefinition(itemId);
  if (state.player.money < item.price) {
    return pushLog(state, `${item.name} 需要 ${item.price} 金钱，当前不足。`);
  }
  if (!canBuyShopItem({ shopState: state.shopState, eventSupport: state.eventSupport, totalMonths: state.totalMonths }, itemId)) {
    return pushLog(state, `${item.name} 当前无法继续购买。`);
  }

  const nextOwnership = applyShopItemOwnership(state.shopState, state.eventSupport, itemId, true);

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money - item.price },
      shopState: nextOwnership.shopState,
      eventSupport: nextOwnership.eventSupport,
    },
    `购入 ${item.name}，金钱 -${item.price}。`,
  );
}

export function upgradeShopItemAction(state: GameState, upgradeId?: DispatchPayload["shopUpgradeId"]): GameState {
  if (!upgradeId) {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }

  const upgrade = getShopUpgradeDefinition(upgradeId);
  if (!canUpgradeShopItem({ shopState: state.shopState }, upgradeId)) {
    return pushLog(state, `${upgrade.name} 当前无法升级。`);
  }
  if (state.player.money < upgrade.price) {
    return pushLog(state, `${upgrade.name} 需要 ${upgrade.price} 金钱，当前不足。`);
  }

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money - upgrade.price },
      shopState: applyShopItemUpgrade(state.shopState, upgradeId),
    },
    `升级为 ${upgrade.name}，金钱 -${upgrade.price}。`,
  );
}

export function sellShopItemAction(state: GameState, itemId?: DispatchPayload["shopItemId"]): GameState {
  if (!itemId) {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }

  const item = getShopItemDefinition(itemId);
  if (!canSellShopItem({ shopState: state.shopState, eventSupport: state.eventSupport, totalMonths: state.totalMonths }, itemId)) {
    return pushLog(state, `${item.name} 当前无法卖出。`);
  }
  const sellPrice = getShopItemSellPrice(
    { shopState: state.shopState, eventSupport: state.eventSupport, totalMonths: state.totalMonths },
    itemId,
  );
  const nextOwnership = applyShopItemOwnership(state.shopState, state.eventSupport, itemId, false);

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money + sellPrice },
      shopState: nextOwnership.shopState,
      eventSupport: nextOwnership.eventSupport,
    },
    `卖出 ${item.name}，金钱 +${sellPrice}。`,
  );
}
