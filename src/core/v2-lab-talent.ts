import { getFellowTypeLabel } from "./v2-fellow-progression";
import type {
  AdvisorProgressState,
  FellowProgressProfile,
  LoverProgressState,
  LoverState,
  RelationshipState,
} from "./v2-types";

interface ResearchActor {
  id: string;
  research: number;
}

export interface LabTalentGrowthResult {
  fellowProgressState: FellowProgressProfile[];
  loverProgressState: LoverProgressState;
  logs: string[];
}

function shouldApplyLabGrowth(totalMonths: number, startTotalMonths: number | null): boolean {
  if (typeof startTotalMonths !== "number") {
    return false;
  }
  const monthsSinceAdded = totalMonths - startTotalMonths;
  return monthsSinceAdded > 0 && monthsSinceAdded % 12 === 0;
}

function countHigherResearchActors(actors: ResearchActor[], selfId: string, currentResearch: number): number {
  return actors.filter((actor) => actor.id !== selfId && actor.research > currentResearch).length;
}

export function isLabTalentActive(relationshipState: RelationshipState): boolean {
  return relationshipState.advisorCount > 0
    && relationshipState.seniorCount > 0
    && relationshipState.juniorCount > 0;
}

export function getLabTalentTeamSize(relationshipState: RelationshipState): number {
  return relationshipState.occupiedSlots;
}

export function getLabTalentActionBonus(relationshipState: RelationshipState): number {
  return isLabTalentActive(relationshipState) ? getLabTalentTeamSize(relationshipState) : 0;
}

export function applyLabTalentGrowth(input: {
  totalMonths: number;
  playerResearch: number;
  relationshipState: RelationshipState;
  advisorProgressState: AdvisorProgressState;
  fellowProgressState: FellowProgressProfile[];
  loverProgressState: LoverProgressState;
  loverState: LoverState;
}): LabTalentGrowthResult {
  if (!isLabTalentActive(input.relationshipState)) {
    return {
      fellowProgressState: input.fellowProgressState,
      loverProgressState: input.loverProgressState,
      logs: [],
    };
  }

  const actors: ResearchActor[] = [
    { id: "player", research: input.playerResearch },
    { id: "advisor", research: input.advisorProgressState.researchResource },
    ...input.fellowProgressState.map((profile) => ({ id: profile.id, research: profile.research })),
    ...(input.loverProgressState.active && input.loverState.active
      ? [{ id: "lover", research: input.loverProgressState.research }]
      : []),
  ];

  const logs: string[] = [];
  const fellowIndexByType = new Map<string, number>();
  const nextFellowProgressState = input.fellowProgressState.map((profile) => {
    if (!shouldApplyLabGrowth(input.totalMonths, profile.startTotalMonths)) {
      return profile;
    }

    const higherCount = countHigherResearchActors(actors, profile.id, profile.research);
    const growth = Math.floor(higherCount / 2);
    const appliedGrowth = Math.max(0, Math.min(20, profile.research + growth) - profile.research);
    if (appliedGrowth <= 0) {
      return profile;
    }

    const nextIndex = (fellowIndexByType.get(profile.type) ?? 0) + 1;
    fellowIndexByType.set(profile.type, nextIndex);
    logs.push(`实验室互帮互助：${getFellowTypeLabel(profile.type)} ${nextIndex} 科研 +${appliedGrowth}（组内 ${higherCount} 人高于 TA）。`);
    return {
      ...profile,
      research: profile.research + appliedGrowth,
    };
  });

  let nextLoverProgressState = input.loverProgressState;
  if (
    input.loverProgressState.active
    && input.loverState.active
    && shouldApplyLabGrowth(input.totalMonths, input.loverState.startTotalMonths)
  ) {
    const higherCount = countHigherResearchActors(actors, "lover", input.loverProgressState.research);
    const growth = Math.floor(higherCount / 2);
    const appliedGrowth = Math.max(0, Math.min(20, input.loverProgressState.research + growth) - input.loverProgressState.research);
    if (appliedGrowth > 0) {
      nextLoverProgressState = {
        ...input.loverProgressState,
        research: input.loverProgressState.research + appliedGrowth,
      };
      logs.push(`实验室互帮互助：恋人科研 +${appliedGrowth}（组内 ${higherCount} 人高于 TA）。`);
    }
  }

  return {
    fellowProgressState: nextFellowProgressState,
    loverProgressState: nextLoverProgressState,
    logs,
  };
}
