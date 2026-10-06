import type { CoffeeState, EventSupportState, ShopState } from "./v2-types";
import { getMeetingExperienceDiscount } from "./v2-growth-system";
import type { ConferenceRegionId } from "./v2-conference-system";

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

export function getRegionalMeetingCount(counters: { domesticMeetingCount?: number; asiaMeetingCount?: number; westMeetingCount?: number }, region: ConferenceRegionId): number {
  return Math.max(0, Math.floor(region === "domestic" ? counters.domesticMeetingCount ?? 0 : region === "asia" ? counters.asiaMeetingCount ?? 0 : counters.westMeetingCount ?? 0));
}

export function getRegionalMeetingDiscount(counters: { domesticMeetingCount?: number; asiaMeetingCount?: number; westMeetingCount?: number }, region: ConferenceRegionId, selfPayCost: number): number {
  return getMeetingExperienceDiscount(Math.floor(getRegionalMeetingCount(counters, region) / 3) * 4, selfPayCost);
}
