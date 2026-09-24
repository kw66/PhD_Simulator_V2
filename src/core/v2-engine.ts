import { dispatchDebugAction } from "./v2-debug-tools";
import { recordTalentTransitions } from "./v2-talent-transitions";
import { dispatchSetupAction } from "./v2-engine-action-dispatch";
import { evaluateCoreEndings, finishTrainingIfReady, quitGame } from "./v2-ending-system";
import { applyQueuedEventEffects, refreshPendingEventDecisions } from "./v2-engine-event-resolution";
import { hasManualBlockingEvents, settleLinearEvents } from "./v2-event-auto-resolution";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "./v2-development-flags";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { createInitialState as buildInitialState } from "./v2-engine-state-factory";
import { enqueueMonthlyEventsForMonth } from "./v2-event-scheduler";
import {
  decrementEventQueueDeadlines,
  discardBlockingQueueEvents,
  getCurrentEvent,
  getCurrentQueueEvent,
  hasBlockingQueueEvent,
} from "./v2-event-queue";
import { getCalendarForTotalMonths, isPreEnrollmentState } from "./v2-progression";
import { hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { yearlyResetRandomEventState } from "./v2-random-event-rules";
import { activatePendingPaperCompetitionEvents } from "./v2-paper-competition-waiting";
import { refreshPaperCompetitionEvents } from "./v2-paper-competition-preview";
import { applyMonthlyEffects, applyMonthStartSubscriptions, resolveMonthlyEffects } from "./v2-monthly-effects";
import { applyReadPaperActions, getManualReadPaperCount } from "./v2-reading-system";
import { applyResearchOperation, createResearchPaper } from "./v2-research-operation";
import { applyPartTimeWork } from "./v2-part-time-work";
import {
  applyPrepublicationPaperDecay,
  discardDraftPaper,
  rerollPaperTopic,
  submitPaper,
  withdrawPaper,
} from "./v2-paper-rules";
import { applyPaperPromotion } from "./v2-publication-actions";
import { advancePaperReviewDeadlines, refreshPaperReviewEvents, resolveDuePaperReviews } from "./v2-publication-system";
import { resolveReadyJournalPapers, submitJournalPaper } from "./v2-journal-system";
import { buildConferenceDecisionEventsForAcceptedPapers } from "./v2-conference-events";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { applyShopAction } from "./v2-shop-transactions";
import { getShopRestSanGain } from "./v2-shop-items-effects";
import { DISEASE_MONTH_END_CHANGE_BY_SAN_TIER } from "./v2-sanity-rules";
import { endRelationship } from "./v2-relationship-actions";
import { advanceFellowTask } from "./v2-fellow-actions";
import { settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { advanceFellowResearch, attendFellowConferences, ensureFellowPapers } from "./v2-fellow-research";
import { advanceAdvisorHorizontal, settleAdvisorMonth, syncAdvisorResearchAccumulation } from "./v2-advisor-progress";
import { advanceLoverDate, advanceLoverMonth, settlePendingLoverHelp } from "./v2-lover-progression";
import type { DispatchPayload, GameActionId, GameState, PlayerStats } from "./v2-types";

const MONTHLY_LOG_STAT_LABELS: Record<keyof PlayerStats, string> = {
  san: "SAN",
  research: "科研",
  social: "社交",
  favor: "导师好感",
  money: "金币",
};

function formatSignedValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

function buildMonthStartSettlementLog(
  resolution: ReturnType<typeof applyMonthlyEffects>["resolution"],
): string {
  const details = resolution.items.flatMap((item) => {
    const changes = (Object.keys(MONTHLY_LOG_STAT_LABELS) as Array<keyof PlayerStats>).flatMap((statId) => {
      const value = item.appliedStats[statId] ?? 0;
      const preserveZero = (statId === "san" || statId === "money") && Object.hasOwn(item.appliedStats, statId);
      return value === 0 && !preserveZero ? [] : [`${MONTHLY_LOG_STAT_LABELS[statId]} ${formatSignedValue(value)}`];
    });
    if (changes.length > 0) {
      return [`${item.name} ${changes.join("、")}${item.note ? `（${item.note}）` : ""}`];
    }
    return item.note ? [`${item.name} ${item.note}`] : [];
  });
  return details.length > 0 ? `\n月初结算：${details.join("｜")}` : "";
}

function buildMonthAdvanceLog(
  year: number,
  month: number,
  resolution: ReturnType<typeof applyMonthlyEffects>["resolution"],
): string {
  return `进入第 ${year} 年 ${month} 月。${buildMonthStartSettlementLog(resolution)}`;
}

function preserveExistingRelationships(before: GameState, after: GameState): GameState {
  const beforeFellows = before.fellowProgressState;
  const afterFellowIds = new Set(after.fellowProgressState.map((profile) => profile.id));
  const missingFellows = beforeFellows.filter((profile) => !afterFellowIds.has(profile.id));
  const fellowProgressState = missingFellows.length > 0
    ? [...after.fellowProgressState, ...missingFellows]
    : after.fellowProgressState;
  const fellowCountMinimums = {
    seniorCount: before.relationshipState.seniorCount,
    juniorCount: before.relationshipState.juniorCount,
    peerCount: before.relationshipState.peerCount,
  };
  const relationshipState = {
    ...after.relationshipState,
    seniorCount: Math.max(after.relationshipState.seniorCount, fellowCountMinimums.seniorCount),
    juniorCount: Math.max(after.relationshipState.juniorCount, fellowCountMinimums.juniorCount),
    peerCount: Math.max(after.relationshipState.peerCount, fellowCountMinimums.peerCount),
    occupiedSlots: Math.max(after.relationshipState.occupiedSlots, before.relationshipState.occupiedSlots),
    advisorCount: Math.max(after.relationshipState.advisorCount, before.relationshipState.advisorCount),
    loverCount: Math.max(after.relationshipState.loverCount, before.relationshipState.loverCount),
  };
  const loverWasActive = before.loverState.active || before.loverProgressState.active || before.relationshipState.loverCount > 0;
  const loverWasCleared = loverWasActive && (!after.loverState.active || !after.loverProgressState.active);
  return {
    ...after,
    fellowProgressState,
    relationshipState,
    ...(loverWasCleared ? {
      loverState: before.loverState,
      loverProgressState: before.loverProgressState,
    } : {}),
    ...(before.selectedAdvisorName && !after.selectedAdvisorName
      ? { selectedAdvisorName: before.selectedAdvisorName } : {}),
  };
}

function takeRest(state: GameState): GameState {
  if (state.phase !== "playing" || (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT)) return state;
  const sanGain = getShopRestSanGain(state.shopState);
  if (state.actionState.used >= state.actionState.limit) return pushNoOpLog(state, "本月行动次数已用尽。");
  const nextSan = Math.min(state.sanCap, state.player.san + sanGain);
  const appliedGain = nextSan - state.player.san;
  const chairSanRecovered = state.shopState.chairUpgrade === "hammock" && appliedGain > 0
    ? Math.max(0, state.shopState.chairSanRecovered ?? 0) + appliedGain
    : state.shopState.chairSanRecovered;
  const nextState = {
    ...state,
    player: { ...state.player, san: nextSan },
    actionState: { ...state.actionState, used: state.actionState.used + 1 },
    shopState: chairSanRecovered === state.shopState.chairSanRecovered
      ? state.shopState
      : { ...state.shopState, chairSanRecovered },
  };
  return appliedGain === 0 ? nextState : pushLog(nextState, `休息：你放下手头的事休息了一会儿，SAN +${appliedGain}。`);
}

function resolveQueuedEvent(state: GameState, eventId: string | undefined, choiceId: string | undefined): GameState {
  const event = eventId ? getCurrentEvent(state.eventQueue, eventId) : getCurrentQueueEvent(state);
  if (!event) return state;
  return applyQueuedEventEffects(state, event, choiceId, {
    evaluateImmediateEndings: evaluateCoreEndings,
    runPostQueuePipeline: (nextState) => nextState,
  });
}

function createAdvancedCalendarState(state: GameState): GameState {
  const nextTotalMonths = state.totalMonths + 1;
  const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
  const publishedPaperCount = state.papers.filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true).length
    + state.externalPublications.filter((paper) => paper.status === "published" && paper.nonFirstAuthor !== true).length;
  const randomState = calendar.month === 1 && calendar.year > state.year
    ? yearlyResetRandomEventState(state, publishedPaperCount, hasRecoverableDraftPaper(state))
    : state;
  if (randomState !== state) {
    const queuedRandomIds = new Set(state.eventQueue.flatMap((event) => (
      event.source === "random" && event.randomReplay ? [event.randomReplay.eventId] : []
    )));
    randomState.availableRandomEvents = randomState.availableRandomEvents.filter((eventId) => !queuedRandomIds.has(eventId));
    randomState.usedRandomEvents = [...new Set([...randomState.usedRandomEvents, ...queuedRandomIds])];
  }
  const monthEndIllnessDelta = state.totalMonths > 0
    ? DISEASE_MONTH_END_CHANGE_BY_SAN_TIER[state.player.san < 6 ? 0 : state.player.san < 12 ? 1 : state.player.san < 18 ? 2 : 3]
    : 0;
  const calendarState: GameState = {
    ...state,
    ...randomState,
    totalMonths: nextTotalMonths,
    year: calendar.year,
    month: calendar.month,
    illnessProbability: Math.max(0, Math.min(100, state.illnessProbability + monthEndIllnessDelta)),
    actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false },
    eventQueue: decrementEventQueueDeadlines(state.eventQueue),
  };
  const decayedPaperState = applyPrepublicationPaperDecay(calendarState);
  const reviewProgressState = advancePaperReviewDeadlines(decayedPaperState);
  const reviewResolution = resolveDuePaperReviews(reviewProgressState);
  const journalResolution = resolveReadyJournalPapers(reviewResolution.state);
  const monthlyResolution = resolveMonthlyEffects(journalResolution.state);
  if ([monthlyResolution.player.san, monthlyResolution.player.money, monthlyResolution.player.favor, monthlyResolution.player.social]
    .some((value) => value < 0)) {
    const emergencyRecovery = monthlyResolution.items.find((item) => item.id === "chair-emergency")?.appliedStats.san ?? 0;
    return evaluateCoreEndings(pushLog({
      ...journalResolution.state,
      player: monthlyResolution.player,
      shopState: {
        ...journalResolution.state.shopState,
        chairSanRecovered: (journalResolution.state.shopState.chairSanRecovered ?? 0) + emergencyRecovery,
      },
    }, buildMonthAdvanceLog(calendar.year, calendar.month, monthlyResolution)));
  }
  const monthlyEffects = applyMonthlyEffects(journalResolution.state);
  const monthLog = buildMonthAdvanceLog(calendar.year, calendar.month, monthlyEffects.resolution);
  const monthlyState = evaluateCoreEndings(pushLog(monthlyEffects.nextState, monthLog));
  if (monthlyState.phase !== "playing") return monthlyState;
  const fellowResearchState = advanceFellowResearch(resolveReadyJournalPapers(monthlyState).state);
  const settledJournalState = attendFellowConferences(resolveReadyJournalPapers(fellowResearchState).state);
  return settleAdvisorMonth(resolveReadyJournalPapers(advanceLoverMonth(settledJournalState)).state);
}

function enqueueAcceptedPaperConferenceEvents(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const candidates = [...state.papers, ...state.externalPublications]
    .filter((paper): paper is typeof paper & { target: NonNullable<typeof paper.target>; submittedMonth: number; submittedYear: number } => (
      paper.status === "published"
      && !paper.leadAuthorId
      && paper.conferenceHandled !== true
      && (paper.conferenceAvailableAtTotalMonths === undefined || paper.conferenceAvailableAtTotalMonths <= state.totalMonths)
      && paper.target !== null
      && typeof paper.submittedMonth === "number"
      && typeof paper.submittedYear === "number"
    ))
    .map((paper) => ({
      id: paper.id,
      target: paper.target,
      submittedMonth: paper.submittedMonth,
      submittedYear: paper.submittedYear,
      title: paper.title,
      acceptType: paper.publication?.acceptType ?? "Poster",
    }));
  if (candidates.length === 0) return state;
  const result = enqueuePendingEvents(state, buildConferenceDecisionEventsForAcceptedPapers(candidates, {
    favor: state.player.favor,
    social: state.player.social,
    research: state.player.research,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
    relationshipState: state.relationshipState,
    conferenceEncounterState: state.conferenceEncounterState,
    conferenceLocationSeed: state.conferenceLocationSeed,
    conferenceCareerState: state.conferenceCareerState,
    internshipState: state.internshipState,
    loverState: state.loverState,
  }));
  return result.nextState;
}

function advanceMonth(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (hasManualBlockingEvents(state)) return pushNoOpLog(state, "必须先处理待办事件。");
  state = settleLinearEvents(state, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
  if (state.phase !== "playing") return state;
  if (hasBlockingQueueEvent(state)) return pushNoOpLog(state, "必须先处理待办事件。");

  if (isPreEnrollmentState(state)) {
    const enrolledState = {
      ...state,
      year: 1,
      month: 1,
      totalMonths: 1,
      coffeeState: {
        ...state.coffeeState,
        coffeePurchaseCountThisMonth: 0,
        coffeeProducedCountThisMonth: 0,
      },
      actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false },
    };
    const subscriptionSettlement = applyMonthStartSubscriptions(advanceFellowResearch(enrolledState));
    const settledState = evaluateCoreEndings(pushLog(
      subscriptionSettlement.nextState,
      `正式入学，研究生生涯开始了。${buildMonthStartSettlementLog(subscriptionSettlement.resolution)}`,
    ));
    if (settledState.phase !== "playing") return settledState;
    const queued = enqueueMonthlyEventsForMonth(settledState);
    return settleLinearEvents(queued.nextState, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
  }

  if (state.totalMonths >= state.maxMonths) return state;

  const nextState = evaluateCoreEndings(enqueueAcceptedPaperConferenceEvents(createAdvancedCalendarState(state)));
  if (nextState.phase !== "playing") return nextState;
  const queuedState = enqueueMonthlyEventsForMonth(nextState).nextState;
  return settleLinearEvents(queuedState, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
}

export function createInitialState(): GameState {
  return buildInitialState();
}

export function dispatchAction(state: GameState, actionId: GameActionId, payload: DispatchPayload = {}): GameState {
  if (actionId === "restart-game") {
    return dispatchAction({ ...createInitialState(), blockLinearEvents: state.blockLinearEvents }, "start-game", {
      roleId: state.selectedRoleId,
    });
  }
  const setupState = dispatchSetupAction(state, actionId, payload, createInitialState);
  if (setupState !== null) return setupState;
  if (state.phase === "finished") return state;
  if (actionId === "set-linear-event-blocking" && state.phase !== "playing") return dispatchGameAction(state, actionId, payload);
  if (state.phase !== "playing") return dispatchDebugAction(state, actionId, payload) ?? state;
  if (actionId === "quit-game") return quitGame(state);
  const debugAction = actionId.startsWith("debug-");
  if (!debugAction) {
    const checkedState = evaluateCoreEndings(state);
    if (checkedState.phase !== "playing") return checkedState;
    state = checkedState;
  }
  const nextStateRaw = dispatchGameAction(ensureFellowPapers(state), actionId, payload);
  const nextState = actionId === "resolve-event"
    ? preserveExistingRelationships(state, nextStateRaw)
    : nextStateRaw;
  if (nextState.phase !== "playing") return nextState;
  const checkedState = debugAction ? nextState : evaluateCoreEndings(nextState);
  if (checkedState.phase !== "playing") return checkedState;
  const helpedState = settlePendingLoverHelp(settlePendingFellowHelp(ensureFellowPapers(checkedState)));
  const settledState = actionId === "resolve-event"
    || (helpedState.papers !== state.papers && helpedState.papers.some((paper) => paper.status === "journal-reviewing"))
    ? resolveReadyJournalPapers(helpedState).state : helpedState;
  const refreshed = refreshPendingEventDecisions(refreshPaperReviewEvents(refreshPaperCompetitionEvents(activatePendingPaperCompetitionEvents(syncAdvisorResearchAccumulation(settledState)))));
  if (debugAction) return refreshed;
  const evaluated = evaluateCoreEndings(refreshed);
  if (evaluated.phase !== "playing") return evaluated;
  return finishTrainingIfReady(recordTalentTransitions(state, evaluated));
}

function dispatchGameAction(state: GameState, actionId: GameActionId, payload: DispatchPayload): GameState {
  const debugState = dispatchDebugAction(state, actionId, payload);
  if (debugState !== null) return debugState;

  switch (actionId) {
    case "set-linear-event-blocking":
      return typeof payload.blockLinearEvents === "boolean" ? { ...state, blockLinearEvents: payload.blockLinearEvents } : state;
    case "select-paper": {
      const paper = payload.paperId
        ? state.papers.find((entry) => entry.id === payload.paperId)
        : null;
      if (!paper || (paper.status !== "draft" && paper.status !== "journal-reviewing")) return state;
      if (state.selectedPaperId === paper.id) return state;
      return {
        ...state,
        selectedPaperId: paper.id,
      };
    }
    case "create-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return typeof payload.paperSlotIndex === "number"
        ? createResearchPaper(state, payload.paperSlotIndex)
        : state;
    case "reroll-paper-topic":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId ? rerollPaperTopic(state, payload.paperId) : state;
    case "discard-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId ? discardDraftPaper(state, payload.paperId) : state;
    case "research-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId && payload.paperActionType
        ? resolveReadyJournalPapers(
          applyResearchOperation(state, payload.paperId, payload.paperActionType),
        ).state
        : state;
    case "submit-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId && payload.paperTarget
        ? submitPaper(state, payload.paperId, payload.paperTarget)
        : state;
    case "submit-journal-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId && payload.journalTarget
        ? submitJournalPaper(state, payload.paperId, payload.journalTarget)
        : state;
    case "withdraw-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.paperId ? withdrawPaper(state, payload.paperId) : state;
    case "promote-paper":
      if (!payload.paperId || !payload.promotionId) return state;
      return applyPaperPromotion(state, payload.paperId, payload.promotionId);
    case "read-paper":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return applyReadPaperActions(state, getManualReadPaperCount(state), {
        consumeMonthlyAction: true,
        consumeMonthlyActionOnce: true,
        allowSanOverdraw: false,
      }).nextState;
    case "part-time-work":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return applyPartTimeWork(state);
    case "rest":
      return takeRest(state);
    case "resolve-event":
      return resolveQueuedEvent(state, payload.eventId, payload.eventChoiceId);
    case "end-relationship":
      return payload.relationshipId && state.phase === "playing"
        ? endRelationship(state, payload.relationshipId)
        : state;
    case "relationship-task":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.relationshipId ? resolveReadyJournalPapers(advanceFellowTask(state, payload.relationshipId)).state : state;
    case "advisor-horizontal":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return advanceAdvisorHorizontal(state);
    case "lover-play":
      return advanceLoverDate(state, "play");
    case "lover-study":
      return advanceLoverDate(state, "study");
    case "lover-shopping":
      return advanceLoverDate(state, "shopping");
    case "buy-shop-item":
    case "sell-shop-item":
    case "upgrade-shop-item":
    case "buy-coffee":
    case "buy-coffee-machine":
    case "sell-coffee-machine":
    case "upgrade-coffee-machine":
    case "toggle-coffee-subscription":
    case "buy-ai-month":
    case "toggle-ai-subscription":
    case "buy-support-item":
    case "sell-support-item":
      return applyShopAction(state, actionId, payload);
    case "next-month":
      return advanceMonth(state);
    case "force-next-month":
      return advanceMonth(discardBlockingQueueEvents(state));
    default:
      return state;
  }
}
