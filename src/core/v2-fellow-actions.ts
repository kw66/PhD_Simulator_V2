import { getRelationshipSanCost } from "./v2-buffs";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { advanceFellowCooperationWithLog, settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { getFellowName, getFellowTaskSanCost } from "./v2-fellow-progression";
import type { FellowProgressProfile, GameState } from "./v2-types";

export function getFellowDiscussionSanCost(state: GameState, profile: FellowProgressProfile): number {
  return getRelationshipSanCost(state, getFellowTaskSanCost(profile.taskType));
}

export function advanceFellowTask(state: GameState, fellowId: string, random: () => number = Math.random): GameState {
  if (state.phase !== "playing") return state;
  const profile = state.fellowProgressState.find((fellow) => fellow.id === fellowId);
  if (!profile || profile.taskUsedThisMonth) return state;
  const sanCost = getFellowDiscussionSanCost(state, profile);
  if (state.player.san < sanCost) return pushNoOpLog(state, `科研协作：SAN不足，需要${sanCost}`);
  const progress = Math.floor(state.player.research) + Math.floor(random() * 6);
  const paidState = {
    ...state,
    player: { ...state.player, san: state.player.san - sanCost },
    fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === fellowId
      ? { ...fellow, taskUsedThisMonth: true } : fellow),
  };
  const settledState = settlePendingFellowHelp(paidState, random);
  const actionState = pushLog(settledState,
    `科研协作：${getFellowName(profile)}，协作进度 +${progress}${sanCost > 0 ? `，SAN -${sanCost}` : ""}`);
  return settlePendingFellowHelp(advanceFellowCooperationWithLog(actionState, fellowId, progress), random);
}
