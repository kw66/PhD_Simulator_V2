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

export function canAddRelationship(state: RelationshipState, kind: RelationshipKind): boolean {
  if (kind === "advisor") return state.advisorCount === 0;
  if (kind === "lover") return state.loverCount === 0;
  return state.occupiedSlots < Math.max(0, state.unlockedSlots - 1);
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
  if (!canAddRelationship(state, kind)) {
    return { nextState: { ...state }, added: false };
  }

  const withKind = incrementRelationshipKindCount(state, kind);
  const occupiesFellowSlot = kind !== "advisor" && kind !== "lover";
  return {
    nextState: {
      ...withKind,
      occupiedSlots: withKind.occupiedSlots + (occupiesFellowSlot ? 1 : 0),
    },
    added: true,
  };
}

