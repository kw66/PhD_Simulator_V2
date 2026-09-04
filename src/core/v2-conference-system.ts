import { applyTierResist, getTierResistedNarrative } from "./v2-sanity-rules";
import type { EventCounters, EventSupportState, ShopState } from "./v2-types";
import { getMeetingSelfPayDiscount } from "./v2-meeting-system";

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
}

export interface ConferenceDecisionCost {
  mode: ConferenceDecisionMode;
  resource: ConferenceCostResource;
  actualCost: number;
  meetingDiscount: number;
  countsAsMeeting: boolean;
  resistanceNarrative?: string;
}

export function getConferenceBaseCosts(region: ConferenceRegionId): ConferenceBaseCosts {
  if (region === "domestic") {
    return { selfPay: 2, advisorCost: 1, proxyCost: 0 };
  }
  if (region === "asia") {
    return { selfPay: 4, advisorCost: 2, proxyCost: 1 };
  }
  return { selfPay: 6, advisorCost: 3, proxyCost: 1 };
}

export function resolveConferenceDecisionCost(
  input: ConferenceDecisionInput,
  getRoll: () => number = Math.random,
): ConferenceDecisionCost {
  const baseCosts = getConferenceBaseCosts(input.region);
  const meetingDiscount = getMeetingSelfPayDiscount(input.eventCounters.meetingCount, baseCosts.selfPay);

  if (input.mode === "self") {
    return {
      mode: input.mode,
      resource: "money",
      actualCost: Math.max(0, baseCosts.selfPay - meetingDiscount),
      meetingDiscount,
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
      meetingDiscount: 0,
      countsAsMeeting: true,
      resistanceNarrative: getTierResistedNarrative("导师好感", -baseCosts.advisorCost, favorResult),
    };
  }

  if (baseCosts.proxyCost === 0) {
    return {
      mode: input.mode,
      resource: "money",
      actualCost: 0,
      meetingDiscount: 0,
      countsAsMeeting: false,
    };
  }

  const socialResult = applyTierResist(-baseCosts.proxyCost, input.social, getRoll);
  const actualCost = Math.max(0, -socialResult.effectiveChange);
  return {
    mode: input.mode,
    resource: "money",
    actualCost,
      meetingDiscount: 0,
    countsAsMeeting: false,
    resistanceNarrative: getTierResistedNarrative("社交", -baseCosts.proxyCost, socialResult),
  };
}
