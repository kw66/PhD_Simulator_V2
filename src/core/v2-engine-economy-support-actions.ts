import {
  applySupportItemOwnership,
  getSupportItemDefinition,
  getSupportItemSellPrice,
  isSupportItemOwned,
} from "./v2-support-items";
import { pushLog } from "./v2-engine-helpers";
import { getEconomyActionBlockedState } from "./v2-engine-economy-actions-shared";
import type { DispatchPayload, GameState } from "./v2-types";

export function buySupportItemAction(state: GameState, itemId?: DispatchPayload["supportItemId"]): GameState {
  if (!itemId) {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }

  const item = getSupportItemDefinition(itemId);
  if (isSupportItemOwned(state.eventSupport, itemId)) {
    return pushLog(state, `${item.name} 已拥有，无需重复购买。`);
  }
  if (state.player.money < item.price) {
    return pushLog(state, `${item.name} 需要 ${item.price} 金钱，当前不足。`);
  }

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money - item.price },
      eventSupport: applySupportItemOwnership(state.eventSupport, itemId, true),
    },
    `购入 ${item.name}，金钱 -${item.price}。`,
  );
}

export function sellSupportItemAction(state: GameState, itemId?: DispatchPayload["supportItemId"]): GameState {
  if (!itemId) {
    return state;
  }

  const blockedState = getEconomyActionBlockedState(state);
  if (blockedState) {
    return blockedState;
  }

  const item = getSupportItemDefinition(itemId);
  if (!isSupportItemOwned(state.eventSupport, itemId)) {
    return pushLog(state, `${item.name} 尚未拥有，无法卖出。`);
  }
  const sellPrice = getSupportItemSellPrice(itemId);

  return pushLog(
    {
      ...state,
      player: { ...state.player, money: state.player.money + sellPrice },
      eventSupport: applySupportItemOwnership(state.eventSupport, itemId, false),
    },
    `卖出 ${item.name}，金钱 +${sellPrice}。`,
  );
}
