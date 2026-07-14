import {
  LOVER_DATE_MONEY_COST,
  resolveLoverTaskAdvance,
} from "./v2-lover-progression";
import { clampSan, pushLog } from "./v2-engine-helpers";
import {
  appendRelationshipRewardEvent,
  getRelationshipActionBlockedState,
} from "./v2-engine-relationship-actions-shared";
import { buildLoverTaskRewardEvent } from "./v2-relationship-task-events";
import type { GameState } from "./v2-types";
import type { ApplyStateProgression } from "./v2-engine-relationship-actions-shared";

export function advanceLoverTaskAction(
  state: GameState,
  isFree: boolean,
  applyStateProgression: ApplyStateProgression,
): GameState {
  const blockedState = getRelationshipActionBlockedState(state);
  if (blockedState) return blockedState;

  if (!state.loverState.active || !state.loverProgressState.active || !state.loverState.type) {
    return pushLog(state, "当前没有可推进的恋爱任务。");
  }
  if (isFree && !state.loverProgressState.canInteract) {
    return pushLog(state, "当前与恋人的关系还没有积累到可交流节点。");
  }
  if (!isFree && state.loverProgressState.taskUsedThisMonth) {
    return pushLog(state, "本月已约会过一次。");
  }
  if (!isFree && state.player.money < LOVER_DATE_MONEY_COST) {
    return pushLog(state, `约会需要 ${LOVER_DATE_MONEY_COST} 金钱，当前不足。`);
  }

  const result = resolveLoverTaskAdvance(state.loverProgressState, {
    type: state.loverState.type,
    currentSan: state.player.san,
    sanCap: state.sanCap,
    persistentExtraActions: state.persistentExtraActions,
    isFree,
    consumeInteraction: isFree,
  });
  const nextSanCap = state.sanCap + result.sanCapDelta;
  let nextState: GameState = {
    ...state,
    sanCap: nextSanCap,
    player: {
      ...state.player,
      money: state.player.money - result.moneyCost,
      san: clampSan(state.player.san + result.sanDelta, nextSanCap),
    },
    loverState: {
      ...state.loverState,
      beautifulExtraRecoveryRate: state.loverState.beautifulExtraRecoveryRate + result.beautifulExtraRecoveryRateDelta,
    },
    loverProgressState: result.loverProgressState,
    persistentExtraActions: {
      idea: state.persistentExtraActions.idea + (result.persistentExtraActionDeltas.idea ?? 0),
      experiment: state.persistentExtraActions.experiment + (result.persistentExtraActionDeltas.experiment ?? 0),
      writing: state.persistentExtraActions.writing + (result.persistentExtraActionDeltas.writing ?? 0),
    },
  };

  nextState = pushLog(nextState, isFree
    ? `与恋人交流，免费推进约会进度 +${result.growth}。`
    : `与恋人约会，金钱 -${result.moneyCost}，进度 +${result.growth}。`);

  if (!result.completed) {
    return applyStateProgression(nextState);
  }

  const specialEffectParts: string[] = ["亲密度 +1"];
  if (result.sanDelta > 0) {
    specialEffectParts.push(`SAN +${result.sanDelta}`);
  }
  if (result.sanCapDelta > 0) {
    specialEffectParts.push(`SAN 上限 +${result.sanCapDelta}`);
  }
  if (result.beautifulExtraRecoveryRateDelta > 0) {
    specialEffectParts.push(`每月额外回复率 +${result.beautifulExtraRecoveryRateDelta}%`);
  }
  if ((result.persistentExtraActionDeltas.idea ?? 0) > 0) {
    specialEffectParts.push("想 idea 多 1 次");
  }
  if ((result.persistentExtraActionDeltas.experiment ?? 0) > 0) {
    specialEffectParts.push("做实验多 1 次");
  }
  if ((result.persistentExtraActionDeltas.writing ?? 0) > 0) {
    specialEffectParts.push("写论文多 1 次");
  }
  nextState = pushLog(nextState, `恋爱进展：${specialEffectParts.join("，")}。`);
  nextState = appendRelationshipRewardEvent(
    nextState,
    buildLoverTaskRewardEvent({
      totalMonths: nextState.totalMonths,
      completedTaskCount: nextState.loverProgressState.completedTaskCount,
      paperBonusTotal: result.paperBonusTotal,
      papers: nextState.papers,
    }),
    "当前没有可接收恋人帮助的草稿，论文奖励已跳过。",
  );

  return applyStateProgression(nextState);
}
