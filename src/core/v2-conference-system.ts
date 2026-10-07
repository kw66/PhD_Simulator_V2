import { applyTierResist, getTierResistedNarrative } from "./v2-sanity-rules";
import { CONFERENCE_TRAVEL_FEES } from "./v2-publication-fees";
import type { EventCounters, EventSupportState, ShopState } from "./v2-types";

export type ConferenceRegionId = "domestic" | "asia" | "west";
export type ConferenceDecisionMode = "self" | "advisor" | "proxy";
export type ConferenceCostResource = "money" | "favor";

export interface ConferenceBaseCosts {
  selfPay: number;
  advisorCost: number;
  proxyCost: number;
}

export interface ConferenceDecisionInput {
  mode: ConferenceDecisionMode;
  region: ConferenceRegionId;
  favor: number;
  social: number;
  shopState: ShopState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
  paperCount?: number;
  travelAlreadyPaid?: boolean;
  hasFellowAtConference?: boolean;
}

export interface ConferenceDecisionCost {
  mode: ConferenceDecisionMode;
  resource: ConferenceCostResource;
  actualCost: number;
  fundingCost: number;
  meetingDiscount: number;
  countsAsMeeting: boolean;
  resistanceNarrative?: string;
}

export function getConferenceBaseCosts(region: ConferenceRegionId): ConferenceBaseCosts {
  if (region === "domestic") {
    return { selfPay: CONFERENCE_TRAVEL_FEES.domestic, advisorCost: 1, proxyCost: 1 };
  }
  if (region === "asia") {
    return { selfPay: CONFERENCE_TRAVEL_FEES.asia, advisorCost: 2, proxyCost: 1 };
  }
  return { selfPay: CONFERENCE_TRAVEL_FEES.west, advisorCost: 3, proxyCost: 1 };
}

export function resolveConferenceDecisionCost(
  input: ConferenceDecisionInput,
  getRoll: () => number = Math.random,
): ConferenceDecisionCost {
  const baseCosts = getConferenceBaseCosts(input.region);
  const attendanceCost = input.travelAlreadyPaid ? 0 : baseCosts.selfPay;

  if (input.mode === "self") {
    return {
      mode: input.mode,
      resource: "money",
      actualCost: attendanceCost,
      fundingCost: 0,
      meetingDiscount: 0,
      countsAsMeeting: true,
    };
  }

  if (input.mode === "advisor") {
    const favorResult = applyTierResist(-baseCosts.advisorCost, input.favor, getRoll);
    const actualCost = Math.max(0, -favorResult.effectiveChange);
    return {
      mode: input.mode,
      resource: "favor",
      actualCost,
      fundingCost: attendanceCost,
      meetingDiscount: 0,
      countsAsMeeting: true,
      resistanceNarrative: getTierResistedNarrative("导师好感", -baseCosts.advisorCost, favorResult),
    };
  }

  return {
    mode: input.mode,
    resource: "money",
    actualCost: input.hasFellowAtConference ? 0 : baseCosts.proxyCost,
    fundingCost: 0,
    meetingDiscount: 0,
    countsAsMeeting: false,
  };
}
