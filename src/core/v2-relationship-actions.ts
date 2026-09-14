import { pushLog } from "./v2-engine-helpers";
import { createLoverProgressState } from "./v2-lover-progression";
import { createLoverState } from "./v2-lover-system";
import { getFellowRoleLabel } from "./v2-fellow-progression";
import type { GameState } from "./v2-types";

function decrementFellowCount(state: GameState, type: "senior" | "junior" | "peer"): GameState["relationshipState"] {
  const countKey = ({ senior: "seniorCount", junior: "juniorCount", peer: "peerCount" } as const)[type];
  return {
    ...state.relationshipState,
    [countKey]: Math.max(0, state.relationshipState[countKey] - 1),
    occupiedSlots: Math.max(0, state.relationshipState.occupiedSlots - 1),
  };
}

export function endRelationship(state: GameState, relationshipId: string): GameState {
  if (relationshipId === "advisor") {
    return pushLog(state, "导师关系不能结束。");
  }

  if (relationshipId === "lover") {
    if (!state.loverState.active && state.relationshipState.loverCount === 0) return state;
    const nextState = {
      ...state,
      relationshipState: { ...state.relationshipState, loverCount: 0 },
      loverState: createLoverState(),
      loverProgressState: createLoverProgressState(),
      buffs: state.buffs.filter((buff) => buff.relationshipId !== "lover"),
    };
    return pushLog(nextState, "分手：这段恋爱关系已经结束。");
  }

  const profile = state.fellowProgressState.find((item) => item.id === relationshipId);
  if (!profile) return state;

  const nextState = {
    ...state,
    relationshipState: decrementFellowCount(state, profile.type),
    fellowProgressState: state.fellowProgressState.filter((item) => item.id !== relationshipId),
    buffs: state.buffs.filter((buff) => buff.relationshipId !== relationshipId),
  };
  return pushLog(nextState, `停止合作：已与${getFellowRoleLabel(profile.type, profile.gender)}停止合作。`);
}
