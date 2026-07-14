import { createRelationshipState, syncRelationshipState } from "./v2-relationship-rules";
import type { GameState } from "./v2-types";
import { getLegacyRelationshipCount, isObject } from "./v2-persistence-normalize-relationship-legacy";

export function normalizeRelationshipState(value: Record<string, unknown>): GameState["relationshipState"] {
  const baseState = createRelationshipState();
  if (!isObject(value.relationshipState)) {
    const social = isObject(value.player) && typeof value.player.social === "number" ? value.player.social : 0;
    const legacyState = {
      ...baseState,
      occupiedSlots: Array.isArray(value.relationships) ? value.relationships.filter((item) => isObject(item)).length : baseState.occupiedSlots,
      advisorCount: getLegacyRelationshipCount(value, "advisor"),
      seniorCount: getLegacyRelationshipCount(value, "senior"),
      juniorCount: getLegacyRelationshipCount(value, "junior"),
      peerCount: getLegacyRelationshipCount(value, "peer"),
      loverCount: getLegacyRelationshipCount(value, "lover"),
    };
    const syncedState = syncRelationshipState(legacyState, social);
    return syncedState.occupiedSlots > syncedState.unlockedSlots
      ? { ...syncedState, unlockedSlots: syncedState.occupiedSlots }
      : syncedState;
  }

  const nextState = {
    unlockedSlots: typeof value.relationshipState.unlockedSlots === "number" ? value.relationshipState.unlockedSlots : baseState.unlockedSlots,
    occupiedSlots: typeof value.relationshipState.occupiedSlots === "number" ? value.relationshipState.occupiedSlots : baseState.occupiedSlots,
    advisorCount: typeof value.relationshipState.advisorCount === "number" ? value.relationshipState.advisorCount : baseState.advisorCount,
    seniorCount: typeof value.relationshipState.seniorCount === "number" ? value.relationshipState.seniorCount : baseState.seniorCount,
    juniorCount: typeof value.relationshipState.juniorCount === "number" ? value.relationshipState.juniorCount : baseState.juniorCount,
    peerCount: typeof value.relationshipState.peerCount === "number" ? value.relationshipState.peerCount : baseState.peerCount,
    loverCount: typeof value.relationshipState.loverCount === "number" ? value.relationshipState.loverCount : baseState.loverCount,
    mentorshipStacks: typeof value.relationshipState.mentorshipStacks === "number" ? value.relationshipState.mentorshipStacks : baseState.mentorshipStacks,
  };
  const social = isObject(value.player) && typeof value.player.social === "number" ? value.player.social : 0;
  return syncRelationshipState(nextState, social);
}
