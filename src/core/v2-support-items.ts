import type { EventSupportState, SupportItemId } from "./v2-types";

export interface SupportItemDefinition {
  id: SupportItemId;
  name: string;
  description: string;
  price: number;
}

const SUPPORT_ITEM_STATE_KEYS: Record<SupportItemId, keyof EventSupportState> = {
  badminton_racket: "hasBadmintonRacket",
  parasol: "hasParasol",
};

export const SUPPORT_ITEM_DEFINITIONS: SupportItemDefinition[] = [
  { id: "badminton_racket", name: "羽毛球拍", description: "羽毛球实力 +40", price: 6 },
  { id: "parasol", name: "遮阳伞", description: "免除夏季主动操作的额外消耗：SAN +1", price: 10 },
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

export function getSupportItemSellPrice(itemId: SupportItemId): number {
  return Math.floor(getSupportItemDefinition(itemId).price / 2);
}
