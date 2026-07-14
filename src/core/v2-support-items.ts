import type { EventSupportState, SupportItemId } from "./v2-types";

export interface SupportItemDefinition {
  id: SupportItemId;
  name: string;
  description: string;
  price: number;
}

const SUPPORT_ITEM_STATE_KEYS: Record<SupportItemId, keyof EventSupportState> = {
  badminton_racket: "hasBadmintonRacket",
  game_controller: "hasGameController",
  parasol: "hasParasol",
};

export const SUPPORT_ITEM_DEFINITIONS: SupportItemDefinition[] = [
  { id: "badminton_racket", name: "羽毛球拍", description: "羽毛球比赛 2 次尝试机会。", price: 4 },
  { id: "game_controller", name: "游戏手柄", description: "玩游戏时 SAN 消耗 -2。", price: 4 },
  { id: "parasol", name: "遮阳伞", description: "使夏季 SAN debuff 无效。", price: 10 },
];

export function getSupportItemDefinition(itemId: SupportItemId): SupportItemDefinition {
  const item = SUPPORT_ITEM_DEFINITIONS.find((definition) => definition.id === itemId);
  if (!item) {
    throw new Error(`Unknown support item: ${itemId}`);
  }
  return item;
}

export function isSupportItemOwned(eventSupport: EventSupportState, itemId: SupportItemId): boolean {
  return eventSupport[SUPPORT_ITEM_STATE_KEYS[itemId]] === true;
}

export function applySupportItemOwnership(
  eventSupport: EventSupportState,
  itemId: SupportItemId,
  owned: boolean,
): EventSupportState {
  return {
    ...eventSupport,
    [SUPPORT_ITEM_STATE_KEYS[itemId]]: owned,
  };
}

export function getSupportItemSellPrice(itemId: SupportItemId): number {
  return Math.floor(getSupportItemDefinition(itemId).price / 2);
}
