import type { EventCounters, EventSupportState, ShopState } from "./v2-types";

export function hasFullGear(shopState: ShopState, eventSupport: EventSupportState): boolean {
  return shopState.bikeUpgrade === "ebike"
    && eventSupport.hasParasol
    && eventSupport.hasDownJacket;
}

export function getFullGearMeetingDiscount(
  meetingCount: number,
  shopState: ShopState,
  eventSupport: EventSupportState,
): number {
  if (!hasFullGear(shopState, eventSupport)) {
    return 0;
  }
  return Math.min(2 + Math.floor(Math.max(0, meetingCount) / 4), 6);
}

export function incrementMeetingCount(eventCounters: EventCounters): EventCounters {
  return {
    ...eventCounters,
    meetingCount: eventCounters.meetingCount + 1,
  };
}