import { gameRandom } from "./v2-game-random";
import { getEffectiveResearch } from "./v2-effective-attributes";
import { getRelationshipSanCost } from "./v2-buffs";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { advanceFellowCooperationWithLog, settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { getFellowName, getFellowTaskSanCost } from "./v2-fellow-progression";
import type { FellowProgressProfile, GameState } from "./v2-types";
import { formatSanPayment, paySanCost, quoteSanPayment } from "./v2-role-talent-costs";

export function getFellowDiscussionSanCost(state: GameState, profile: FellowProgressProfile): number {
  return getRelationshipSanCost(state, getFellowTaskSanCost(profile.taskType));
}

export function advanceFellowTask(state: GameState, fellowId: string, random: () => number = gameRandom): GameState {
  if (state.phase !== "playing") return state;
  const profile = state.fellowProgressState.find((fellow) => fellow.id === fellowId);
  if (!profile || profile.taskUsedThisMonth) return state;
  const sanCost = getFellowDiscussionSanCost(state, profile);
  const payment = quoteSanPayment(state, sanCost);
  if (!payment.allowed) return pushNoOpLog(state, `科研协作：SAN不足，需要${sanCost}`);
  const progress = Math.floor(getEffectiveResearch(state) + Math.floor(random() * 6));
  const paidState = {
    ...paySanCost(state, sanCost),
    fellowProgressState: state.fellowProgressState.map((fellow) => fellow.id === fellowId
      ? { ...fellow, taskUsedThisMonth: true } : fellow),
  };
  const settledState = settlePendingFellowHelp(paidState, random);
  const actionState = pushLog(settledState,
    `科研协作：${getFellowName(profile)}，协作进度 +${progress}${sanCost > 0 ? `，${formatSanPayment(payment)}` : ""}`);
  return settlePendingFellowHelp(advanceFellowCooperationWithLog(actionState, fellowId, progress, state), random);
}
