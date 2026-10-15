import { gameRandom } from "./v2-game-random";
import { applyTierResist, getTierResistedNarrative } from "./v2-sanity-rules";
import { previewPlayerAttributeChange } from "./v2-player-attributes";
import { CONFERENCE_TRAVEL_FEES } from "./v2-publication-fees";
import type { EventCounters, EventSupportState, ShopState, GameState } from "./v2-types";

export type ConferenceRegionId = "domestic" | "asia" | "west";
export type ConferenceDecisionMode = "self" | "advisor" | "proxy";
export type ConferenceCostResource = "money" | "favor";

export interface ConferenceBaseCosts {
  selfPay: number;
  advisorCost: number;
}

export interface ConferenceDecisionInput {
  playerAttributeState?: GameState;
  mode: ConferenceDecisionMode;
  region: ConferenceRegionId;
  favor: number;
  social: number;
  shopState: ShopState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
  paperCount?: number;
  travelAlreadyPaid?: boolean;
}

export interface ConferenceDecisionCost {
  replacementMoneyCost?: number;
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
    return { selfPay: CONFERENCE_TRAVEL_FEES.domestic, advisorCost: 1 };
  }
  if (region === "asia") {
    return { selfPay: CONFERENCE_TRAVEL_FEES.asia, advisorCost: 2 };
  }
  return { selfPay: CONFERENCE_TRAVEL_FEES.west, advisorCost: 3 };
}

export function resolveConferenceDecisionCost(
  input: ConferenceDecisionInput,
  getRoll: () => number = gameRandom,
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
    const favorResult = input.playerAttributeState
      ? previewPlayerAttributeChange(input.playerAttributeState, "favor", -baseCosts.advisorCost)
      : applyTierResist(-baseCosts.advisorCost, input.favor, getRoll);
    const actualCost = Math.max(0, -favorResult.effectiveChange);
    return {
      mode: input.mode,
      resource: "favor",
      actualCost,
      replacementMoneyCost: "moneyCost" in favorResult && typeof favorResult.moneyCost === "number" ? favorResult.moneyCost : 0,
      fundingCost: attendanceCost,
      meetingDiscount: 0,
      countsAsMeeting: true,
      resistanceNarrative: getTierResistedNarrative("导师好感", -baseCosts.advisorCost, favorResult),
    };
  }

  return {
    mode: input.mode,
    resource: "money",
    actualCost: 0,
    fundingCost: 0,
    meetingDiscount: 0,
    countsAsMeeting: false,
  };
}
