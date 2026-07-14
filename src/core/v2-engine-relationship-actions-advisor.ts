import {
  ADVISOR_TASK_SAN_COST,
  resolveAdvisorTaskAdvance,
} from "./v2-advisor-progress";
import { clampSan, pushLog } from "./v2-engine-helpers";
import {
  appendRelationshipRewardEvent,
  getRelationshipActionBlockedState,
} from "./v2-engine-relationship-actions-shared";
import { clampResearchToCap } from "./v2-research-cap-system";
import { buildAdvisorTaskRewardEvent } from "./v2-relationship-task-events";
import type { GameState } from "./v2-types";
import type { ApplyStateProgression } from "./v2-engine-relationship-actions-shared";

export function advanceAdvisorTaskAction(
  state: GameState,
  isFree: boolean,
  applyStateProgression: ApplyStateProgression,
): GameState {
  const blockedState = getRelationshipActionBlockedState(state);
  if (blockedState) return blockedState;

  if (isFree && !state.advisorProgressState.canInteract) {
    return pushLog(state, "当前与导师的关系还没有积累到可交流节点。");
  }
  if (!isFree && state.advisorProgressState.taskUsedThisMonth) {
    return pushLog(state, "本月已推进过导师项目。");
  }
  if (!isFree && state.player.san < ADVISOR_TASK_SAN_COST) {
    return pushLog(state, `导师项目需要 ${ADVISOR_TASK_SAN_COST} 点 SAN，当前不足。`);
  }

  const result = resolveAdvisorTaskAdvance(state.advisorProgressState, state.player.research, {
    isFree,
    consumeInteraction: isFree,
  });
  let nextState: GameState = {
    ...state,
    player: {
      ...state.player,
      san: clampSan(state.player.san - result.sanCost, state.sanCap),
      money: state.player.money + result.moneyDelta,
      research: clampResearchToCap(state.player.research + result.researchDelta, state.researchCapacityState),
    },
    advisorProgressState: result.advisorProgressState,
  };

  nextState = pushLog(nextState, isFree
    ? `与导师交流，免费推进项目，进度 +${result.growth}。`
    : `推进导师项目，SAN -${result.sanCost}，进度 +${result.growth}。`);

  if (!result.completed) {
    return applyStateProgression(nextState);
  }

  nextState = pushLog(
    nextState,
    result.moneyDelta > 0
      ? `导师项目完成：亲和度 +1，科研资源 +1，横向项目金钱 +${result.moneyDelta}。`
      : `导师项目完成：亲和度 +1，科研资源 +1，纵向项目科研 +${result.researchDelta}。`,
  );
  nextState = appendRelationshipRewardEvent(
    nextState,
    buildAdvisorTaskRewardEvent({
      totalMonths: nextState.totalMonths,
      completedProjectCount: nextState.advisorProgressState.completedProjectCount,
      paperBonus: result.paperBonus,
      papers: nextState.papers,
    }),
    "当前没有可接收导师论文加成的草稿，论文奖励已跳过。",
  );

  return applyStateProgression(nextState);
}
