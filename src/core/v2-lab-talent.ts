import type { RelationshipState } from "./v2-types";

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
