import {
  clampSan,
  clonePlayer,
  pushLog,
} from "./v2-engine-helpers";
import { enqueueMonthlyEventsForMonth } from "./v2-event-scheduler";
import {
  getUnlockedPaperSlotCount,
} from "./v2-paper-rules";
import {
  createPhdDecision,
  getGraduationScoreTarget,
  getMonthLimitByDegree,
  getPhdDecisionRequirement,
} from "./v2-progression";
import {
  getCurrentEvent,
  getCurrentQueueEvent,
  hasBlockingQueueEvent,
} from "./v2-event-queue";
import {
  syncRelationshipState,
} from "./v2-relationship-rules";
import {
  applyChairEmergencyRecovery,
} from "./v2-shop-items";
import type {
  EndingId,
  EventQueueItem,
  GameState,
  PendingEvent,
  Paper,
  PlayerStats,
} from "./v2-types";

function finalize(state: GameState, ending: EndingId, text: string): GameState {
  return pushLog({ ...state, phase: "finished", ending }, text);
}

export function syncPaperSlotUnlocks(state: GameState): GameState {
  const unlockedPaperSlotCount = getUnlockedPaperSlotCount(state.player.research);
  if (unlockedPaperSlotCount <= state.paperSlotsUnlocked) {
    return state;
  }

  return pushLog(
    { ...state, paperSlotsUnlocked: unlockedPaperSlotCount },
    `科研能力达到 ${state.player.research}，论文槽位解锁到 ${unlockedPaperSlotCount}。`,
  );
}

function syncRelationshipUnlocks(state: GameState): GameState {
  const nextRelationshipState = syncRelationshipState(state.relationshipState, state.player.social);
  if (nextRelationshipState.unlockedSlots === state.relationshipState.unlockedSlots) {
    return state;
  }

  return pushLog(
    { ...state, relationshipState: nextRelationshipState },
    `社交达到 ${state.player.social}，关系槽位解锁到 ${nextRelationshipState.unlockedSlots}。`,
  );
}

function logQueuedEvent(state: GameState, event: PendingEvent): GameState {
  return pushLog(state, `触发事件：${event.title}`);
}

function evaluateGraduationAtDeadline(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state)) return state;
  if (state.pendingDecision) return state;
  if (state.totalMonths < state.maxMonths) return state;

  if (state.totalResearchScore >= currentGraduationTarget(state)) {
    return finalize(
      state,
      state.degree === "master" ? "master" : "phd",
      `达到${state.degree === "master" ? "硕士" : "博士"}毕业要求，顺利完成当前阶段。`,
    );
  }

  return finalize(state, "delay", `到达毕业月，但科研分仍未达到 ${currentGraduationTarget(state)} 分。`);
}

function maybeOpenPhdDecision(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state) || state.pendingDecision) return state;
  if (state.degree !== "master") return state;
  if (state.month !== 10 || (state.year !== 2 && state.year !== 3)) return state;

  const requiredScore = getPhdDecisionRequirement(state.selectedAdvisorId, state.year);
  if (requiredScore === null) return state;
  if (state.totalResearchScore < requiredScore) {
    return pushLog(state, `第 ${state.year} 年 10 月转博线为 ${requiredScore} 分，你当前只有 ${state.totalResearchScore} 分。`);
  }

  return pushLog(
    { ...state, pendingDecision: createPhdDecision(state.year, requiredScore) },
    `达到第 ${state.year} 年转博线，可决定是否继续读博。`,
  );
}

export function currentGraduationTarget(state: GameState): number {
  return getGraduationScoreTarget(state.degree, state.selectedAdvisorId) ?? state.graduationScoreTarget ?? 0;
}

export function currentMonthLimit(state: GameState): number {
  return getMonthLimitByDegree(state.degree);
}

export function applyStateProgression(state: GameState): GameState {
  const nextState = applyChairEmergencyRecoveryToState(state);
  const endedState = evaluateImmediateEndings(nextState);
  if (endedState.phase !== "playing") {
    return endedState;
  }
  return syncRelationshipUnlocks(syncPaperSlotUnlocks(endedState));
}

export function applyChairEmergencyRecoveryToState(state: GameState): GameState {
  const recovery = applyChairEmergencyRecovery(state.shopState, state.player.san);
  if (!recovery.triggered) {
    return state;
  }

  return pushLog({
    ...state,
    player: { ...state.player, san: recovery.san },
  }, "锥刺股椅触发，SAN 恢复到 2。");
}

export function evaluateImmediateEndings(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.player.san < 0) return finalize(state, "burnout", "SAN 已跌破 0，本轮提前结束。");
  if (state.player.money < 0) return finalize(state, "poor", "金钱已跌破 0，本轮提前结束。");
  if (state.player.favor < 0) return finalize(state, "expelled", "导师好感已跌破 0，本轮提前结束。");
  if (state.player.social < 0) return finalize(state, "isolated", "社交能力已跌破 0，本轮提前结束。");
  return state;
}

export function getActionBlockedState(state: GameState): GameState | null {
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state)) return pushLog(state, "当前必须先处理待办事件。");
  if (state.pendingDecision) return pushLog(state, "当前必须先处理转博投择。");
  if (state.actionsRemaining <= 0) return pushLog(state, "本月行动次数已用尽。");
  return null;
}

export function spendAction(
  state: GameState,
  text: string,
  updater: (player: PlayerStats) => PlayerStats,
  papers?: Paper[],
): GameState {
  const blockedState = getActionBlockedState(state);
  if (blockedState) return blockedState;

  const nextState: GameState = {
    ...state,
    actionsRemaining: state.actionsRemaining - 1,
    player: updater(clonePlayer(state.player)),
    papers: papers ?? state.papers,
  };

  return applyStateProgression(pushLog(nextState, text));
}

export function maybeEnqueueFixedEvents(state: GameState): GameState {
  const { nextState, queuedEvents } = enqueueMonthlyEventsForMonth(state);
  return queuedEvents.reduce(logQueuedEvent, nextState);
}

export function runPostQueuePipeline(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state)) return state;

  const nextState = maybeOpenPhdDecision(state);
  if (nextState.pendingDecision) return nextState;
  return evaluateGraduationAtDeadline(nextState);
}

export function resolveQueuedEvent(
  state: GameState,
  eventId: string | undefined,
  eventChoiceId: string | undefined,
  resolver: (
    currentState: GameState,
    currentEvent: EventQueueItem,
    choiceId: string | undefined,
    helpers: {
      applyChairEmergencyRecoveryToState: typeof applyChairEmergencyRecoveryToState;
      evaluateImmediateEndings: typeof evaluateImmediateEndings;
      runPostQueuePipeline: typeof runPostQueuePipeline;
    },
  ) => GameState,
): GameState {
  const currentEvent = eventId ? getCurrentEvent(state.eventQueue, eventId) : getCurrentQueueEvent(state);
  if (!currentEvent) return state;
  return resolver(state, currentEvent, eventChoiceId, {
    applyChairEmergencyRecoveryToState,
    evaluateImmediateEndings,
    runPostQueuePipeline,
  });
}

export function resolvePhdYes(state: GameState): GameState {
  if (!state.pendingDecision) return state;
  const phdGraduationTarget = getGraduationScoreTarget("phd", state.selectedAdvisorId);
  if (phdGraduationTarget === null) {
    return pushLog(state, "导师尚未确定，当前无法继续转博决策。");
  }
  const nextState = pushLog(
    {
      ...state,
      degree: "phd",
      maxMonths: getMonthLimitByDegree("phd"),
      graduationScoreTarget: phdGraduationTarget,
      pendingDecision: null,
    },
    "你选择继续读博，目标切换为博士毕业线。",
  );
  return runPostQueuePipeline(nextState);
}

export function resolvePhdNo(state: GameState): GameState {
  if (!state.pendingDecision) return state;
  const nextState = pushLog({ ...state, pendingDecision: null }, "你决定先完成当前硕士阶段。");
  if (nextState.phase !== "playing" || hasBlockingQueueEvent(nextState)) {
    return nextState;
  }
  return evaluateGraduationAtDeadline(nextState);
}

export function restWithShopRecovery(
  state: GameState,
  sanGain: number,
): GameState {
  return spendAction(state, `休息，SAN +${sanGain}。`, (player) => ({
    ...player,
    san: clampSan(player.san + sanGain, state.sanCap),
  }));
}
