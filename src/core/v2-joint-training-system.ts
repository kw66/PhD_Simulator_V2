import type { ConferenceEncounterState, EventQueueItem, JointTrainingState, ResearchCapacityState } from "./v2-types";

export function createJointTrainingState(): JointTrainingState {
  return {
    citationBonusApplied: 0,
  };
}

export function shouldEnqueueJointTrainingInvite(input: {
  conferenceEncounterState: ConferenceEncounterState;
  eventQueue: EventQueueItem[];
}): boolean {
  return input.conferenceEncounterState.metBigBullCoop
    && input.conferenceEncounterState.bigBullDeepCount >= 2
    && !input.conferenceEncounterState.bigBullCooperation
    && !input.conferenceEncounterState.permanentlyBlockedBigBullCoop
    && !input.eventQueue.some((event) => event.chainId === "joint-training");
}

export function getJointTrainingCitationCapBonus(totalCitations: number): number {
  return Math.min(Math.floor(Math.max(0, totalCitations) / 500) * 2, 10);
}

export function reconcileJointTrainingCitationBonus(input: {
  active: boolean;
  totalCitations: number;
  hasPublicationCitationGain: boolean;
  jointTrainingState: JointTrainingState;
  researchCapacityState: ResearchCapacityState;
}): {
  jointTrainingState: JointTrainingState;
  researchCapacityState: ResearchCapacityState;
  capDelta: number;
  logs: string[];
} {
  if (!input.active || !input.hasPublicationCitationGain) {
    return {
      jointTrainingState: { ...input.jointTrainingState },
      researchCapacityState: { ...input.researchCapacityState },
      capDelta: 0,
      logs: [],
    };
  }

  const nextCitationBonus = getJointTrainingCitationCapBonus(input.totalCitations);
  const previousCitationBonus = input.jointTrainingState.citationBonusApplied;
  if (nextCitationBonus <= previousCitationBonus) {
    return {
      jointTrainingState: { ...input.jointTrainingState },
      researchCapacityState: { ...input.researchCapacityState },
      capDelta: 0,
      logs: [],
    };
  }

  const capDelta = nextCitationBonus - previousCitationBonus;
  return {
    jointTrainingState: {
      citationBonusApplied: nextCitationBonus,
    },
    researchCapacityState: {
      ...input.researchCapacityState,
      jointTrainingCitationCapBonus: nextCitationBonus,
    },
    capDelta,
    logs: [`联培加成：引用达到 ${input.totalCitations}，科研上限 +${capDelta}（联培累计 +${nextCitationBonus}）。`],
  };
}
