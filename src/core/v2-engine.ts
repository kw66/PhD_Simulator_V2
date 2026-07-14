import {
  dispatchEconomyAction,
  dispatchPaperProgressAction,
  dispatchPaperSubmissionAction,
  dispatchRelationshipAction,
  dispatchSetupAction,
} from "./v2-engine-action-dispatch";
import { applyQueuedEventEffects as runQueuedEventEffects } from "./v2-engine-event-resolution";
import {
  clampSan,
  pushLog,
} from "./v2-engine-helpers";
import {
  applyChairEmergencyRecoveryToState,
  applyStateProgression,
  currentGraduationTarget,
  currentMonthLimit,
  evaluateImmediateEndings,
  getActionBlockedState,
  maybeEnqueueFixedEvents,
  resolvePhdNo,
  resolvePhdYes,
  resolveQueuedEvent,
  restWithShopRecovery,
  runPostQueuePipeline,
  spendAction,
  syncPaperSlotUnlocks,
} from "./v2-engine-flow";
import {
  createBaseMonthTransitionState,
  prepareMonthAdvance,
} from "./v2-engine-month-advance-pipeline";
import {
  appendMonthAdvanceLogs,
  applyMonthPostAcademicEvents,
} from "./v2-engine-month-post-events";
import {
  createInitialState as buildInitialState,
} from "./v2-engine-state-factory";
import {
  hasBlockingQueueEvent,
} from "./v2-event-queue";
import {
  getAdvisorOptions,
  getRoleOptions,
  isPreEnrollmentState,
} from "./v2-progression";
import {
  getShopRestSanGain,
} from "./v2-shop-items";
import type {
  AdvisorDefinition,
  DispatchPayload,
  GameActionId,
  GameState,
  RoleDefinition,
} from "./v2-types";

function advanceMonth(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state)) return pushLog(state, "必须先处理待办事件。");
  if (state.pendingDecision) return pushLog(state, "必须先处理转博抉择。");

  if (isPreEnrollmentState(state)) {
    const enrolledState = pushLog(
      {
        ...state,
        year: 1,
        month: 1,
        totalMonths: 1,
        actionsRemaining: state.maxActionsPerMonth,
      },
      "正式入学，研究生生涯开始了。",
    );
    return runPostQueuePipeline(maybeEnqueueFixedEvents(enrolledState));
  }

  const monthAdvance = prepareMonthAdvance(state);
  let nextState = createBaseMonthTransitionState({
    state,
    preparation: monthAdvance,
    maxMonths: currentMonthLimit(state),
    graduationScoreTarget: currentGraduationTarget(state),
  });

  nextState = applyMonthPostAcademicEvents(
    nextState,
    monthAdvance.academicProgress.nextPapers,
    monthAdvance.academicProgress.acceptedConferencePapers,
    monthAdvance.publishedPaperCountBeforeAdvance,
  );

  nextState = syncPaperSlotUnlocks(nextState);
  nextState = appendMonthAdvanceLogs(
    nextState,
    monthAdvance.academicProgress.reviewLogs,
    monthAdvance.monthlyUpkeep.shopLogs,
    monthAdvance.monthlyUpkeep.coffeeLogs,
    monthAdvance.monthlyUpkeep.readingLogs,
  );

  nextState = evaluateImmediateEndings(applyChairEmergencyRecoveryToState(nextState));
  if (nextState.phase !== "playing") return nextState;

  nextState = maybeEnqueueFixedEvents(nextState);
  return runPostQueuePipeline(nextState);
}

export function createInitialState(): GameState {
  return buildInitialState();
}

export function dispatchAction(state: GameState, actionId: GameActionId, payload: DispatchPayload = {}): GameState {
  const setupState = dispatchSetupAction(state, actionId, payload, createInitialState);
  if (setupState !== null) return setupState;

  const economyState = dispatchEconomyAction(state, actionId, payload);
  if (economyState !== null) return economyState;

  const relationshipState = dispatchRelationshipAction(state, actionId, payload, applyStateProgression);
  if (relationshipState !== null) return relationshipState;

  const paperProgressState = dispatchPaperProgressAction(
    state,
    actionId,
    payload,
    getActionBlockedState,
    spendAction,
  );
  if (paperProgressState !== null) return paperProgressState;

  const paperSubmissionState = dispatchPaperSubmissionAction(state, actionId, payload, spendAction);
  if (paperSubmissionState !== null) return paperSubmissionState;

  switch (actionId) {
    case "work":
      if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
      return spendAction(state, "打工，金钱 +2，SAN -1。", (player) => ({
        ...player,
        money: player.money + 2,
        san: clampSan(player.san - 1),
      }));
    case "rest":
      if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
      return restWithShopRecovery(state, getShopRestSanGain(state.shopState));
    case "resolve-event":
      return resolveQueuedEvent(state, payload.eventId, payload.eventChoiceId, runQueuedEventEffects);
    case "resolve-phd-yes":
      return resolvePhdYes(state);
    case "resolve-phd-no":
      return resolvePhdNo(state);
    case "next-month":
      return advanceMonth(state);
    default:
      return state;
  }
}

export function getCurrentRoleOptions(): RoleDefinition[] {
  return getRoleOptions();
}

export function getCurrentAdvisorOptions(): AdvisorDefinition[] {
  return getAdvisorOptions();
}
