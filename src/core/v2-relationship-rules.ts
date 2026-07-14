import type { RelationshipKind, RelationshipState } from "./v2-types";

export function createRelationshipState(): RelationshipState {
  return {
    unlockedSlots: 2,
    occupiedSlots: 0,
    advisorCount: 0,
    seniorCount: 0,
    juniorCount: 0,
    peerCount: 0,
    loverCount: 0,
    mentorshipStacks: 0,
  };
}

export function getUnlockedRelationshipSlotCount(social: number): number {
  if (social >= 18) return 5;
  if (social >= 12) return 4;
  if (social >= 6) return 3;
  return 2;
}

export function syncRelationshipState(state: RelationshipState, social: number): RelationshipState {
  return {
    ...state,
    unlockedSlots: Math.max(state.unlockedSlots, getUnlockedRelationshipSlotCount(social)),
  };
}

function incrementRelationshipKindCount(state: RelationshipState, kind: RelationshipKind): RelationshipState {
  switch (kind) {
    case "advisor":
      return { ...state, advisorCount: state.advisorCount + 1 };
    case "senior":
      return { ...state, seniorCount: state.seniorCount + 1 };
    case "junior":
      return { ...state, juniorCount: state.juniorCount + 1 };
    case "peer":
      return { ...state, peerCount: state.peerCount + 1 };
    case "lover":
      return { ...state, loverCount: state.loverCount + 1 };
    default:
      return state;
  }
}

export function tryAddRelationship(state: RelationshipState, kind: RelationshipKind): { nextState: RelationshipState; added: boolean } {
  if (state.occupiedSlots >= state.unlockedSlots) {
    return { nextState: { ...state }, added: false };
  }

  const withKind = incrementRelationshipKindCount(state, kind);
  return {
    nextState: {
      ...withKind,
      occupiedSlots: withKind.occupiedSlots + 1,
    },
    added: true,
  };
}

export function addMentorshipStacks(state: RelationshipState, stackDelta: number): RelationshipState {
  if (!Number.isFinite(stackDelta) || stackDelta === 0) {
    return { ...state };
  }

  return {
    ...state,
    mentorshipStacks: Math.max(0, state.mentorshipStacks + stackDelta),
  };
}

export function getMonthlyRelationshipEffects(state: RelationshipState): { sanDelta: number; citationDelta: number } {
  return {
    sanDelta: -state.mentorshipStacks,
    citationDelta: state.juniorCount * 3 * state.mentorshipStacks,
  };
}
