import {
  getFellowTaskLabel,
  getFellowTaskSanCost,
  getFellowTypeLabel,
  resolveFellowTaskAdvance,
} from "./v2-fellow-progression";
import { clampSan, pushLog } from "./v2-engine-helpers";
import {
  appendRelationshipRewardEvent,
  getRelationshipActionBlockedState,
} from "./v2-engine-relationship-actions-shared";
import { buildFellowTaskRewardEvent } from "./v2-relationship-task-events";
import type { GameState } from "./v2-types";
import type { ApplyStateProgression } from "./v2-engine-relationship-actions-shared";

export function advanceFellowTaskAction(
  state: GameState,
  relationshipId: string | undefined,
  isFree: boolean,
  applyStateProgression: ApplyStateProgression,
): GameState {
  const blockedState = getRelationshipActionBlockedState(state);
  if (blockedState) return blockedState;

  if (!relationshipId) {
    return pushLog(state, "缺少同门关系 ID。");
  }

  const profileIndex = state.fellowProgressState.findIndex((profile) => profile.id === relationshipId);
  if (profileIndex < 0) {
    return pushLog(state, "未找到对应的同门关系。");
  }

  const profile = state.fellowProgressState[profileIndex];
  if (!profile) {
    return pushLog(state, "未找到对应的同门关系。");
  }
  if (isFree && !profile.canInteract) {
    return pushLog(state, "当前与这位同门的关系还没有积累到可交流节点。");
  }
  if (!isFree && profile.taskUsedThisMonth) {
    return pushLog(state, "本月已推进过这位同门的任务。");
  }
  const sanCost = getFellowTaskSanCost(profile.taskType);
  if (!isFree && state.player.san < sanCost) {
    return pushLog(state, `${getFellowTaskLabel(profile.taskType)}需要 ${sanCost} 点 SAN，当前不足。`);
  }

  const result = resolveFellowTaskAdvance(profile, state.player.research, {
    isFree,
    consumeInteraction: isFree,
  });
  const nextFellowProgressState = state.fellowProgressState.map((item, index) => (
    index === profileIndex ? result.fellowProgressProfile : { ...item }
  ));
  let nextState: GameState = {
    ...state,
    player: {
      ...state.player,
      san: clampSan(state.player.san - result.sanCost, state.sanCap),
    },
    fellowProgressState: nextFellowProgressState,
  };

  const fellowTypeLabel = getFellowTypeLabel(profile.type);
  const fellowTaskLabel = getFellowTaskLabel(profile.taskType);
  nextState = pushLog(
    nextState,
    isFree
      ? `与${fellowTypeLabel}交流，免费推进${fellowTaskLabel}，进度 +${result.growth}。`
      : `${fellowTaskLabel}，SAN -${result.sanCost}，进度 +${result.growth}。`,
  );

  if (!result.completed) {
    return applyStateProgression(nextState);
  }

  nextState = pushLog(nextState, `${fellowTypeLabel}任务完成：亲和度 +1。`);
  const rewardProfile = nextState.fellowProgressState[profileIndex];
  if (!rewardProfile) {
    return applyStateProgression(nextState);
  }
  nextState = appendRelationshipRewardEvent(
    nextState,
    buildFellowTaskRewardEvent({
      totalMonths: nextState.totalMonths,
      profile: rewardProfile,
      papers: nextState.papers,
    }),
    "当前没有可接收同门论文加成的草稿，论文奖励已跳过。",
  );

  return applyStateProgression(nextState);
}
