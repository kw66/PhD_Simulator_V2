import type { EventSupportState, ShopState } from "./v2-types";
import { getMeetingExperienceDiscount } from "./v2-growth-system";

export function hasFullGear(shopState: ShopState, eventSupport: EventSupportState): boolean {
  return shopState.ebikeOwned
    && eventSupport.hasParasol
    && eventSupport.hasDownJacket;
}

export function getMeetingSelfPayDiscount(meetingCount: number, selfPayCost: number): number {
  return getMeetingExperienceDiscount(meetingCount, selfPayCost);
}
