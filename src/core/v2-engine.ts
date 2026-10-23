import { settleTeacherChildFavorMilestones } from "./v2-teacher-child-talents";
import { createGameRandomState, withGameRandom } from "./v2-game-random";
import { settleCaptainMonth, syncCaptainMembers } from "./v2-captain-runtime";
import { prepareRewinderYear, completeRewinderYear, isRewinderYearEnd, toggleRewinderPerson } from "./v2-rewinder";
import { replayPendingEvent } from "./v2-event-replay";
import { syncPaperResearchStarted } from "./v2-paper-competition";
import { isAcademicYearEnd, prepareAcademicArchive, toggleAcademicPerson, selectAcademicSource, completeAcademicArchive } from "./v2-rewinder-academic";
import { observeAchievements } from "./v2-achievement-runtime";
import { getEffectiveResearch, getEffectiveSocial } from "./v2-effective-attributes";
import { dispatchDebugAction } from "./v2-debug-tools";
import { appendAcademicYearLog } from "./v2-academic-year-log";
import { recordTalentTransitions, upgradePerfectWorkstation } from "./v2-talent-transitions";
import { dispatchSetupAction } from "./v2-engine-action-dispatch";
import { evaluateCoreEndings, finishTrainingIfReady, quitGame } from "./v2-ending-system";
import { applyQueuedEventEffects, refreshPendingEventDecisions } from "./v2-engine-event-resolution";
import { hasManualBlockingEvents, settleLinearEvents } from "./v2-event-auto-resolution";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "./v2-development-flags";
import { pushLog, pushMilestoneLog, pushNoOpLog } from "./v2-engine-helpers";
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
import { yearlyResetRandomEventState, normalizeRoleTalentIllnessProbability } from "./v2-random-event-rules";
import { getMonthEndIllnessDelta, settleCurseMonthStart, repayCurseDebt } from "./v2-curse-system";
import { settleScheduledActionBuffs } from "./v2-study-fatigue";
import { investRoleTalentMoney } from "./v2-role-talent-investments";
import { activatePendingRandomEvents, releasePrematurePaperCompetitions } from "./v2-paper-competition-waiting";
import { refreshPaperCompetitionEvents } from "./v2-paper-competition-preview";
import { applyMonthlyEffects, applyMonthStartSubscriptions, getMonthlyPersonalSpending, resolveMonthlyEffects } from "./v2-monthly-effects";
import { getInternshipStatus } from "./v2-internship-system";
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
import { buildConferenceDecisionEventsForAcceptedPapers, createConferenceDecisionAct1, refreshConferenceDecision } from "./v2-conference-events";
import { getConferenceTripId } from "./v2-conference-identity";
import { settleDueConferenceAttendance } from "./v2-conference-attendance";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { applyShopAction } from "./v2-shop-transactions";
import { endRelationship } from "./v2-relationship-actions";
import { recordRelationshipActivityMonth } from "./v2-relationship-activity-history";
import { recordSanMonth } from "./v2-san-history";
import { consumeActiveOperation, getActiveOperationAllowance } from "./v2-ai-shop";
import { settleRoleTalentMonthStart, settleRoleTalentMonthEnd, settleRoleTalentYearEnd, syncRoleTalentFellows, settleRoleTalentDiseaseMilestones } from "./v2-role-talent-lifecycle";
import { applyRoleTalentRest } from "./v2-role-talent-rest";
import { settleGreedCoinGames } from "./v2-role-talent-greed";
import { advanceFellowTask } from "./v2-fellow-actions";
import { settlePendingFellowHelp } from "./v2-fellow-cooperation";
import { advanceFellowResearch, attendFellowConferences, ensureFellowPapers } from "./v2-fellow-research";
import { ensureFellowFinanceAccounts } from "./v2-fellow-finance";
import { formatMoney, normalizeGameMoney, recordPersonalSpending } from "./v2-money";
import { settleFellowAcademicYear } from "./v2-fellow-lifecycle";
import { settleLabResearchGrowth } from "./v2-lab-talent";
import { settleJournalPublicationFees } from "./v2-lab-publication-costs";
import { advanceAdvisorProject, settleAdvisorMonth, syncAdvisorResearchAccumulation } from "./v2-advisor-progress";
import { settleAdvisorGuidance } from "./v2-advisor-guidance";
import { advanceLoverDate, advanceLoverMonth, settlePendingLoverHelp } from "./v2-lover-progression";
import { advanceThesisResearchPoint, createInitialThesisState, syncThesisState } from "./v2-thesis-rules";
import { prepareCareer } from "./v2-graduation-career";
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
    if (item.id === "internship-monthly") return [];
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

function buildInternshipSettlementLog(
  resolution: ReturnType<typeof applyMonthlyEffects>["resolution"],
): string {
  const item = resolution.items.find((entry) => entry.id === "internship-monthly");
  if (!item) return "";
  const stats = (Object.keys(MONTHLY_LOG_STAT_LABELS) as Array<keyof PlayerStats>)
    .flatMap((statId) => {
      const value = item.appliedStats[statId] ?? 0;
      return value === 0 && statId !== "san" && statId !== "money"
        ? [] : [`${MONTHLY_LOG_STAT_LABELS[statId]} ${formatSignedValue(value)}`];
    });
  return `${item.name}结算：${stats.join("、")}${item.note ? `（${item.note}）` : ""}`;
}

function buildInternshipLifecycleLogs(before: GameState, after: GameState): string[] {
  const previous = getInternshipStatus(before);
  const current = getInternshipStatus(after);
  const logs: string[] = [];
  if (previous.pending && current.active) {
    logs.push(`${current.kind === "remote3" ? "远程实习" : "大厂实习"}开始：本月起生效。`);
  }
  if (previous.active && !current.active) {
    logs.push(`${previous.kind === "remote3" ? "远程实习" : "大厂实习"}结束：本次实习已完成。`);
  }
  return logs;
}

function buildMonthAdvanceLog(
  year: number,
  month: number,
  resolution: ReturnType<typeof applyMonthlyEffects>["resolution"],
): string {
  return `进入第 ${year} 年 ${month} 月。${buildMonthStartSettlementLog(resolution)}`;
}

function takeRest(state: GameState): GameState {
  if (state.phase !== "playing" || (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT)) return state;
  if (!getActiveOperationAllowance(state, "rest").allowed) return pushNoOpLog(state, "本月行动次数已用尽。");
  state = consumeActiveOperation(state, "rest");
  const nextState = applyRoleTalentRest(state);
  const appliedGain = nextState.player.san - state.player.san;
  return appliedGain === 0 ? nextState : pushLog(nextState, `休息：你放下手头的事休息了一会儿，SAN +${formatMoney(appliedGain)}。`);
}

function resolveQueuedEvent(state: GameState, eventId: string | undefined, choiceId: string | undefined): GameState {
  const event = eventId ? getCurrentEvent(state.eventQueue, eventId) : getCurrentQueueEvent(state);
  if (!event) return state;
  const isRewinder = !!event.rewinderPresentation && !!state.rewinderState?.pending && choiceId === "confirm-rewinder-year";
  const prepared = isRewinder ? completeRewinderYear(state) : state;
  const updatedEvent = prepared.eventQueue.find(item => item.id === event.id) ?? event;
  const result = applyQueuedEventEffects(prepared, updatedEvent, choiceId, {
    evaluateImmediateEndings: evaluateCoreEndings,
    runPostQueuePipeline: (nextState) => nextState,
  });
  return isRewinder && result.phase === "playing" && !result.eventQueue.some(item => item.id === event.id) ? advanceMonth(result) : result;
}

function createAdvancedCalendarState(state: GameState): GameState {
  const nextTotalMonths = state.totalMonths + 1;
  const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
  const randomState = calendar.month === 1 && calendar.year > state.year
    ? yearlyResetRandomEventState(state)
    : state;
  const monthEndIllnessDelta = getMonthEndIllnessDelta(state);
  const calendarState = appendAcademicYearLog({
    ...state,
    ...randomState,
    totalMonths: nextTotalMonths,
    year: calendar.year,
    month: calendar.month,
    illnessProbability: normalizeRoleTalentIllnessProbability(state, state.illnessProbability + monthEndIllnessDelta),
    actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false },
    eventQueue: decrementEventQueueDeadlines(state.eventQueue),
  });
  const curseState = evaluateCoreEndings(settleCurseMonthStart(calendarState));
  if (curseState.phase !== "playing") return curseState;
  const decayedPaperState = applyPrepublicationPaperDecay(settleScheduledActionBuffs(settleCaptainMonth(settleRoleTalentMonthStart(curseState))));
  const reviewProgressState = advancePaperReviewDeadlines(decayedPaperState);
  const reviewResolution = resolveDuePaperReviews(reviewProgressState);
  const journalResolution = resolveReadyJournalPapers(reviewResolution.state);
  const monthlyResolution = resolveMonthlyEffects(journalResolution.state);
  if (state.selectedRoleId !== "rich-reversed" && [monthlyResolution.player.san, monthlyResolution.player.money, monthlyResolution.player.favor, monthlyResolution.player.social]
    .some((value) => value < 0)) {
    const emergencyRecovery = monthlyResolution.items.find((item) => item.id === "chair-emergency")?.appliedStats.san ?? 0;
    return evaluateCoreEndings(pushLog(recordPersonalSpending({
      ...(monthlyResolution.settledState ?? journalResolution.state),
      player: monthlyResolution.player,
      shopState: {
        ...journalResolution.state.shopState,
        chairSanRecovered: (journalResolution.state.shopState.chairSanRecovered ?? 0) + emergencyRecovery,
      },
    }, Math.max(0, getMonthlyPersonalSpending(monthlyResolution) - (monthlyResolution.recordedPersonalSpending ?? 0))), buildMonthAdvanceLog(calendar.year, calendar.month, monthlyResolution)));
  }
  const monthlyEffects = applyMonthlyEffects(journalResolution.state);
  const monthLog = buildMonthAdvanceLog(calendar.year, calendar.month, monthlyEffects.resolution);
  let monthlyLoggedState = pushLog(monthlyEffects.nextState, monthLog);
  const internshipSettlement = buildInternshipSettlementLog(monthlyEffects.resolution);
  if (internshipSettlement) monthlyLoggedState = pushMilestoneLog(monthlyLoggedState, internshipSettlement, "internship-settlement");
  for (const lifecycleLog of buildInternshipLifecycleLogs(state, monthlyEffects.nextState)) {
    monthlyLoggedState = pushMilestoneLog(monthlyLoggedState, lifecycleLog, "internship-lifecycle");
  }
  const monthlyState = evaluateCoreEndings(monthlyLoggedState);
  if (monthlyState.phase !== "playing") return monthlyState;
  return MONTH_START_RELATIONSHIP_STEPS.reduce((current, step) => current.phase === "playing"
    ? evaluateCoreEndings(step(current)) : current, monthlyState);
}

/** Track journal revision scores after each contribution; publication waits for the player's click. */
function settleReadyJournals(state: GameState): GameState {
  return resolveReadyJournalPapers(state).state;
}

/** Month-start order after the player's own settlement; applyMonthlyEffects has already tracked journal scores. */
const MONTH_START_RELATIONSHIP_STEPS: ReadonlyArray<(state: GameState) => GameState> = [
  attendFellowConferences,
  advanceFellowResearch,
  settleReadyJournals,
  attendFellowConferences,
  advanceLoverMonth,
  settleReadyJournals,
  settleAdvisorMonth,
];

function enqueueAcceptedPaperConferenceEvents(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const candidates = [...state.papers, ...state.externalPublications]
    .filter((paper): paper is typeof paper & { target: NonNullable<typeof paper.target>; submittedMonth: number; submittedYear: number } => (
      paper.status === "published"
      && (!paper.leadAuthorId || paper.leadAuthorId === "player")
      && !paper.nonFirstAuthor
      && !paper.journalTarget && !paper.publication?.journalTarget
      && paper.conferenceHandled !== true
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
      availableAtTotalMonths: paper.conferenceAvailableAtTotalMonths ?? state.totalMonths,
    }));
  if (candidates.length === 0) return state;
  const builderState = {
    playerAttributeState: state,
    selectedRoleId: state.selectedRoleId,
    internshipCount: state.internshipCount,
    loverProgressState: state.loverProgressState,
    totalMonths: state.totalMonths,
    favor: state.player.favor,
    money: state.player.money,
    advisorProgressState: state.advisorProgressState,
    social: getEffectiveSocial(state),
    research: getEffectiveResearch(state),
    researchCapacityState: state.researchCapacityState,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
    relationshipState: state.relationshipState,
    conferenceEncounterState: state.conferenceEncounterState,
    conferenceLocationSeed: state.conferenceLocationSeed,
    conferenceCareerState: state.conferenceCareerState,
    internshipState: state.internshipState,
    loverState: state.loverState,
    fellowProgressState: state.fellowProgressState,
    fellowPapers: state.fellowPapers,
    externalPublications: state.externalPublications,
    papers: state.papers,
  };
  const grouped = buildConferenceDecisionEventsForAcceptedPapers(candidates, builderState, () => 0);
  let nextState = state;
  for (const group of grouped) {
    const context = group.conferencePreview!.context;
    const planned = nextState.conferenceAttendancePlans?.find((plan) => getConferenceTripId(plan.context) === getConferenceTripId(context));
    if (planned) {
      const paperIds = [...new Set([...planned.context.paperIds, ...context.paperIds])];
      if (paperIds.length !== planned.context.paperIds.length) {
        nextState = { ...nextState, conferenceAttendancePlans: nextState.conferenceAttendancePlans!.map((plan) => plan !== planned ? plan : {
          ...plan, context: { ...plan.context, paperIds, paperCount: paperIds.length,
            paperPresentations: [...new Map([...(plan.context.paperPresentations ?? []), ...(context.paperPresentations ?? [])].map((paper) => [paper.id, paper])).values()],
          },
        }) };
      }
      continue;
    }
    const previous = nextState.eventQueue.find((event) => event.conferencePreview
      && getConferenceTripId(event.conferencePreview.context) === getConferenceTripId(context));
    if (!previous?.conferencePreview) {
      nextState = enqueuePendingEvents(nextState, [createConferenceDecisionAct1(context, builderState)]).nextState;
      continue;
    }
    const originalContext = previous.conferencePreview.context;
    const paperIds = [...new Set([...originalContext.paperIds, ...context.paperIds])];
    if (paperIds.length === originalContext.paperIds.length) continue;
    const merged = { ...context, id: originalContext.id, paperIds, paperCount: paperIds.length,
      paperPresentations: [...new Map([...(originalContext.paperPresentations ?? []), ...(context.paperPresentations ?? [])]
        .map((paper) => [paper.id, paper])).values()],
    };
    const updated = refreshConferenceDecision(nextState, { ...previous,
      conferencePreview: { ...previous.conferencePreview, context: merged },
    });
    nextState = { ...nextState, eventQueue: nextState.eventQueue.map((event) => event.id === previous.id ? updated : event) };
  }
  return nextState;
}

function advanceMonth(state: GameState, force = false): GameState {
  if (state.phase !== "playing") return state;
  state = evaluateCoreEndings(settleJournalPublicationFees(state));
  if (state.phase !== "playing") return state;
  if (force && state.rewinderState?.pending) state = completeRewinderYear(state);
  if (force) state = discardBlockingQueueEvents(state);
  if (hasManualBlockingEvents(state)) return pushNoOpLog(state, "必须先处理待办事件。");
  state = settleLinearEvents(state, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
  if (state.phase !== "playing") return state;
  if (force) state = discardBlockingQueueEvents(state);
  if (hasBlockingQueueEvent(state)) return pushNoOpLog(state, "必须先处理待办事件。");

  if (isPreEnrollmentState(state)) {
    const enrolledState = appendAcademicYearLog({
      ...recordSanMonth(state),
      year: 1,
      month: 1,
      totalMonths: 1,
      coffeeState: {
        ...state.coffeeState,
        coffeePurchaseCountThisMonth: 0,
        coffeeProducedCountThisMonth: 0,
      },
      actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false },
    });
    const subscriptionSettlement = applyMonthStartSubscriptions(advanceFellowResearch(enrolledState));
    const settledState = evaluateCoreEndings(pushLog(
      subscriptionSettlement.nextState,
      `正式入学，研究生生涯开始了。${buildMonthStartSettlementLog(subscriptionSettlement.resolution)}`,
    ));
    if (settledState.phase !== "playing") return settledState;
    const queued = enqueueMonthlyEventsForMonth(settledState);
    return settleLinearEvents(observeAchievements(settledState, queued.nextState), (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
  }

  if (state.totalMonths >= state.maxMonths && state.eventQueue.some((event) => event.deadlineMonths <= 0)) return state;

  if (state.month === 10 || state.totalMonths >= state.maxMonths) {
    state = evaluateCoreEndings(settleReadyJournals(settlePendingPaperHelp(state)));
  }
  if (state.phase !== "playing") return state;
  if (force) state = discardBlockingQueueEvents(state);
  if (hasManualBlockingEvents(state)) return state;
  if (state.rewinderState?.monthEndProcessed !== state.totalMonths) {
    state = settleRoleTalentMonthEnd(settleRoleTalentYearEnd(settleLabResearchGrowth(settleFellowAcademicYear(state))));
  }
  if (state.rewinderState?.academic) {
    state = evaluateCoreEndings(state);
    if (state.phase !== "playing") return state;
  }
  if (isAcademicYearEnd(state)) return prepareAcademicArchive(recordRelationshipActivityMonth(syncAdvisorResearchAccumulation(state)));
  if (isRewinderYearEnd(state)) return prepareRewinderYear(syncAdvisorResearchAccumulation(state));
  if (state.totalMonths >= state.maxMonths) return finishTrainingIfReady(syncAdvisorResearchAccumulation(state));

  const nextState = evaluateCoreEndings(settleDueConferenceAttendance(enqueueAcceptedPaperConferenceEvents(
    createAdvancedCalendarState(recordRelationshipActivityMonth(recordSanMonth(state))),
  )));
  if (nextState.phase !== "playing") return nextState;
  const queuedState = observeAchievements(nextState, enqueueMonthlyEventsForMonth(nextState).nextState);
  return settleLinearEvents(queuedState, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
}

export function createInitialState(): GameState {
  return buildInitialState();
}

function settlePendingPaperHelp(state: GameState): GameState {
  let current = ensureFellowPapers(state);
  while (true) {
    const next = settleAdvisorGuidance(settlePendingLoverHelp(settlePendingFellowHelp(current)));
    if (next === current) return next;
    current = next;
  }
}

export function dispatchAction(state: GameState, actionId: GameActionId, payload: DispatchPayload = {}): GameState {
  if (state.phase === "playing") state = upgradePerfectWorkstation(state);
  // Leaving a run must not carry its consumed random cursor into the next start.
  const source = actionId === "restart-game" || actionId === "reset-game"
    ? { ...state, randomState: createGameRandomState() } : state;
  const run = () => {
    const next = dispatchActionInternal(source, actionId, payload);
    if (next === source || source.phase === "finished" || actionId === "set-linear-event-blocking" || actionId === "set-event-intro-skipping" || actionId === "select-paper") return next;
    return observeAchievements(source, next, actionId, payload);
  };
  if (!actionId.startsWith("debug-")) return withGameRandom(source, run);
  const next = run();
  // Debug fixtures can rebuild the whole state. Keep the normal run's saved
  // stream intact while leaving explicit debug rerolls nondeterministic.
  return next !== source && !next.randomState && source.randomState
    ? { ...next, randomState: { ...source.randomState } } : next;
}

function dispatchActionInternal(state: GameState, actionId: GameActionId, payload: DispatchPayload): GameState {
  state = normalizeGameMoney(state);
  if (actionId === "restart-game") {
    return dispatchAction({
      ...createInitialState(),
      blockLinearEvents: state.blockLinearEvents,
      skipBranchEventIntro: state.skipBranchEventIntro,
      debugEventReplayEnabled: state.debugEventReplayEnabled,
    }, "start-game", {
      roleId: state.selectedRoleId,
      curseDifficulty: payload.curseDifficulty ?? state.curseState?.difficulty,
      captainTagLevels: payload.captainTagLevels ?? state.captainState?.levels,
      talentAllocation: payload.talentAllocation ?? state.roleTalents?.levels,
    });
  }
  const setupState = dispatchSetupAction(state, actionId, payload, createInitialState);
  if (setupState !== null) {
    if (actionId === "start-game" && setupState !== state && setupState.rewinderState?.academic
      && setupState.rewinderState.academic.startYear > 1) {
      const september = createAdvancedCalendarState(setupState);
      if (september.phase !== "playing") return september;
      const queued = enqueueMonthlyEventsForMonth(syncThesisState(september)).nextState;
      return settleLinearEvents(queued, (current, eventId, eventChoiceId) => dispatchAction(current, "resolve-event", { eventId, eventChoiceId }));
    }
    return setupState;
  }
  if (actionId === "debug-trigger-ending") return dispatchDebugAction(state, actionId, payload) ?? state;
  if (state.rewinderState?.academic?.pending || state.rewinderState?.academic?.completed) {
    if (actionId === "toggle-rewinder-archive-person") return toggleAcademicPerson(state, payload.rewinderPersonKey);
    if (actionId === "select-rewinder-archive-papers") return selectAcademicSource(state, "paperSource", payload.rewinderPaperSource);
    if (actionId === "select-rewinder-archive-coffee") return selectAcademicSource(state, "coffeeSource", payload.rewinderCoffeeSource);
    if (actionId === "confirm-rewinder-archive") return completeAcademicArchive(state);
    return state;
  }
  if (state.phase === "finished") return state;
  if ((actionId === "set-linear-event-blocking" || actionId === "set-event-intro-skipping") && state.phase !== "playing") return dispatchGameAction(state, actionId, payload);
  if (state.phase !== "playing") return dispatchDebugAction(state, actionId, payload) ?? state;
  if (actionId === "quit-game") return quitGame(state);
  const debugAction = actionId.startsWith("debug-");
  if (!debugAction) {
    const checkedState = evaluateCoreEndings(state);
    if (checkedState.phase !== "playing") return checkedState;
    state = checkedState;
  }
  state = syncPaperResearchStarted(releasePrematurePaperCompetitions(state));
  let nextState = normalizeGameMoney(syncCaptainMembers(ensureFellowFinanceAccounts(dispatchGameAction(ensureFellowPapers(syncCaptainMembers(state)), actionId, payload))));
  if (nextState.rewinderState?.academic?.pending) return nextState;
  if (state.degree === "master" && nextState.degree === "phd") {
    nextState = { ...nextState, thesis: createInitialThesisState(),
      careerProgress: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
      careerInterviewExperience: { internet: 0, stateOwned: 0, civilService: 0, academic: 0 },
      careerPreparedMonths: {},
      careerLastRecruitmentTotalMonths: null,
      careerOffers: {},
      eventQueue: nextState.eventQueue.filter((event) => event.source !== "thesis" && event.source !== "career"),
    };
  }
  if (nextState.phase !== "playing") return nextState;
  nextState = settleGreedCoinGames(settleTeacherChildFavorMilestones(settleRoleTalentDiseaseMilestones(syncRoleTalentFellows(nextState))));
  const checkedState = debugAction ? nextState : evaluateCoreEndings(nextState);
  if (checkedState.phase !== "playing") return checkedState;
  const helpedState = settlePendingPaperHelp(checkedState);
  const settledState = actionId === "resolve-event" || actionId === "replay-event" || actionId === "rewinder-replay-event"
    || (helpedState.papers !== state.papers && helpedState.papers.some((paper) => paper.status === "journal-reviewing"))
    ? resolveReadyJournalPapers(helpedState).state : helpedState;
  const conferenceState = syncPaperResearchStarted(syncThesisState(settleDueConferenceAttendance(enqueueAcceptedPaperConferenceEvents(settledState))));
  const refreshed = refreshPendingEventDecisions(refreshPaperReviewEvents(refreshPaperCompetitionEvents(activatePendingRandomEvents(syncAdvisorResearchAccumulation(conferenceState)))));
  if (debugAction) return refreshed;
  const evaluated = evaluateCoreEndings(settleGreedCoinGames(refreshed));
  if (evaluated.phase !== "playing") return evaluated;
  const recorded = recordTalentTransitions(state, evaluated);
  return normalizeGameMoney(recorded);
}

function dispatchGameAction(state: GameState, actionId: GameActionId, payload: DispatchPayload): GameState {
  const debugState = dispatchDebugAction(state, actionId, payload);
  if (debugState !== null) return debugState;

  switch (actionId) {
    case "repay-debt":
      return repayCurseDebt(state, payload.debtRepayment);
    case "invest-money": {
      const investment = investRoleTalentMoney(state);
      return investment.success ? pushLog(investment.state, investment.message) : pushNoOpLog(state, investment.message);
    }
    case "toggle-gold-power": {
      if (state.phase !== "playing" || state.selectedRoleId !== "rich"
        || !state.roleTalents || !state.roleTalents.levels["gold-power-alpha"]) return state;
      return { ...state, roleTalents: { ...state.roleTalents, goldPowerEnabled: !state.roleTalents.goldPowerEnabled } };
    }
    case "advance-thesis-point":
      return typeof payload.thesisPointIndex === "number"
        ? advanceThesisResearchPoint(syncThesisState(state), payload.thesisPointIndex) : state;
    case "prepare-career":
      return payload.careerType ? prepareCareer(state, payload.careerType) : state;
    case "set-linear-event-blocking":
      return typeof payload.blockLinearEvents === "boolean" ? { ...state, blockLinearEvents: payload.blockLinearEvents } : state;
    case "set-event-intro-skipping":
      return typeof payload.skipBranchEventIntro === "boolean" ? { ...state, skipBranchEventIntro: payload.skipBranchEventIntro } : state;
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
    case "replay-event":
    case "rewinder-replay-event":
      return replayPendingEvent(state, payload, resolveQueuedEvent);
    case "end-relationship":
      return payload.relationshipId && state.phase === "playing"
        ? endRelationship(state, payload.relationshipId)
        : state;
    case "relationship-task":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return payload.relationshipId ? resolveReadyJournalPapers(advanceFellowTask(state, payload.relationshipId)).state : state;
    case "advisor-project":
      if (isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT) return state;
      return advanceAdvisorProject(state, payload.projectType ?? "horizontal");
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
    case "toggle-rewinder-person":
      return toggleRewinderPerson(state, payload.rewinderPersonKey);
    case "force-next-month":
      return advanceMonth(discardBlockingQueueEvents(state), true);
    default:
      return state;
  }
}
