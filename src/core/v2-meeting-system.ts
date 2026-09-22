import type { CoffeeState, EventSupportState, ShopState } from "./v2-types";
import { getMeetingExperienceDiscount } from "./v2-growth-system";

export function hasFullGear(shopState: ShopState, eventSupport: EventSupportState): boolean {
  return shopState.ebikeOwned
    && eventSupport.hasParasol
    && eventSupport.hasDownJacket;
}

/** The four core workstation purchases that unlock the permanent workstation talent. */
export function hasPerfectWorkstation(shopState: ShopState, coffeeState: CoffeeState): boolean {
  return shopState.keyboardOwned
    && shopState.monitorOwned
    && shopState.chairOwned
    && coffeeState.machineOwned;
}

export function getMeetingSelfPayDiscount(meetingCount: number, selfPayCost: number): number {
  return getMeetingExperienceDiscount(meetingCount, selfPayCost);
}
