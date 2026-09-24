import { buildConferenceDecisionEventsForAcceptedPapers } from "./v2-conference-events";
import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { SCORE_BY_TARGET } from "./v2-content";
import type { CareerType } from "./v2-career-rules";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { applyQueuedEventEffects, rebaseGeneratedEventIds } from "./v2-engine-event-resolution";
import { addOrReplaceBuffs } from "./v2-buffs";
import { createAiBuffs, createAiShopState, getAiModelById } from "./v2-ai-shop";
import { clampSan, pushLog } from "./v2-engine-helpers";
import { createBeforeGradSchoolAct1Event } from "./v2-fixed-events-before-grad-school";
import { createCcigEvent } from "./v2-fixed-events-ccig";
import { createMentorAssignEvent } from "./v2-fixed-events-mentor-assign";
import { createScholarshipEvent } from "./v2-fixed-events-scholarship";
import { createSummerVacationEvent } from "./v2-fixed-events-summer";
import { createTeachersDayEvent } from "./v2-fixed-events-teachers-day";
import { createWinterVacationEvent } from "./v2-fixed-events-winter";
import { createYearSummaryEvent } from "./v2-fixed-events-year-summary";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "./v2-internship-events";
import { buildJointTrainingContext, createJointTrainingAct1 } from "./v2-joint-training-events";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "./v2-lover-events";
import { createCareerEventForType } from "./v2-monthly-career-events";
import { collectThesisEventForMonth } from "./v2-monthly-thesis-events";
import { createPhdDecisionEvent } from "./v2-phd-decision-event";
import { createDraftPaper, REVIEW_STABLE_SCORE_BY_TARGET } from "./v2-paper-rules";
import { getJournalDefinition } from "./v2-journal-system";
import { getCalendarForTotalMonths, getRoleDefinition } from "./v2-progression";
import { attachPaperPublication, createGrantedPublishedPaper, recordPaperAcceptances } from "./v2-publication-rules";
import { resolveDuePaperReviews } from "./v2-publication-system";
import { createRandomEventById } from "./v2-random-event-router";
import { createIllnessRandomEvent } from "./v2-random-events-core-health";
import { hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { clampResearchToCap } from "./v2-research-cap-system";
import { canAddRelationship, syncRelationshipState } from "./v2-relationship-rules";
import { DEBUG_RELATIONSHIP_TYPES } from "./v2-action-ids";
import { createCustomFellowProgressProfile, createGeneratedFellowProfileAddition, getFellowName, getFellowRoleLabel } from "./v2-fellow-progression";
import { createLoverProgressState } from "./v2-lover-progression";
import { activateLover } from "./v2-lover-system";
import { pickRandomAdvisorName } from "./v2-random-name";
import { isPaperCompetitionEventId } from "./v2-paper-competition";
import { activatePendingPaperCompetitionEvents, rememberPendingPaperCompetitionEvent } from "./v2-paper-competition-waiting";
import { getCurrentEvent } from "./v2-event-queue";
import type {
  Buff,
  DebugRelationshipType,
  DebugStatId,
  DispatchPayload,
  GameActionId,
  GameState,
  PaperAcceptType,
  JournalTarget,
  PaperTarget,
  PendingEvent,
} from "./v2-types";

/** Representative fixtures use the same source labels as their gameplay counterparts. */
export function createDebugBuffs(): Buff[] {
  const aiBuffs = [
    ["ai-debug-gpt", "gpt-5.6-sol"],
    ["ai-debug-claude", "claude-fable-5"],
    ["ai-debug-gemini", "gemini-3"],
    ["ai-debug-deepseek", "deepseek-v4"],
    ["ai-debug-doubao", "doubao-seed-4"],
    ["ai-debug-kimi-manual", "kimi-k1.5"],
    ["ai-debug-kimi-auto", "kimi-k3"],
  ].map(([id, modelId]) => {
    const model = getAiModelById(modelId);
    if (!model) throw new Error(`Unknown debug AI model: ${modelId}`);
    const shop = createAiShopState();
    shop.subscriptions[model.slot] = { ...shop.subscriptions[model.slot], modelId: model.id, active: true };
    return { ...createAiBuffs(shop)[0]!, id: id! };
  });
  return [
    {
      id: "debug-buff-phd-pressure",
      name: "读博压力",
      source: "转博",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: -1 },
    },
    {
      id: "debug-buff-learning",
      name: "持续学习",
      source: "不断学习",
      timing: "permanent",
      remainingMonths: null,
      actionEffects: { idea: { bonus: 1 } },
    },
    {
      id: "debug-buff-lover-study",
      name: "共同学习",
      source: "恋人学习",
      timing: "permanent",
      remainingMonths: null,
      actionEffects: {
        idea: { bonus: 1 },
        experiment: { bonus: 1 },
        writing: { bonus: 1 },
      },
    },
    {
      id: "debug-buff-lover-play",
      name: "约会余韵",
      source: "恋人玩耍",
      timing: "monthly",
      remainingMonths: 1,
      activeOperationSanDelta: -1,
    },
    ...aiBuffs,
    {
      id: "debug-buff-illness",
      name: "带病工作",
      source: "肚子虚弱",
      timing: "monthly",
      remainingMonths: null,
      activeOperationSanMultiplier: 1.5,
    },
    {
      id: "debug-buff-next-idea",
      name: "阅读收获",
      source: "看论文",
      timing: "next-action",
      remainingMonths: null,
      actionEffects: { idea: { bonus: 3 } },
    },
    {
      id: "debug-buff-next-experiment",
      name: "实验建议",
      source: "导师约谈",
      timing: "next-action",
      remainingMonths: null,
      actionEffects: { experiment: { bonus: 3 } },
    },
    {
      id: "debug-buff-next-writing",
      name: "合作启发",
      source: "同门合作",
      timing: "next-action",
      remainingMonths: null,
      actionEffects: { writing: { bonus: 3 } },
    },
    {
      id: "debug-buff-next-experiment-multiplier",
      name: "重装环境",
      source: "显卡故障",
      timing: "next-action",
      remainingMonths: null,
      actionEffects: { experiment: { multiplier: 0.25 } },
      description: "下次实验总分 ×0.25，完成一次实验后消失。",
    },
  ];
}

export const DEBUG_BUFF_IDS: readonly string[] = createDebugBuffs().map((buff) => buff.id);

export interface DebugButtonSpec {
  id: string;
  label: string;
}

export interface DebugButtonGroup {
  title: string;
  buttons: DebugButtonSpec[];
}

export const DEBUG_STAT_GROUPS: Array<{ statId: DebugStatId; label: string; deltas: number[] }> = [
  { statId: "san", label: "SAN", deltas: [-5, -1, 1, 5] },
  { statId: "research", label: "科研", deltas: [-5, -1, 1, 5] },
  { statId: "social", label: "社交", deltas: [-5, -1, 1, 5] },
  { statId: "favor", label: "好感", deltas: [-5, -1, 1, 5] },
  { statId: "money", label: "金币", deltas: [-10, -1, 1, 10] },
];

export const DEBUG_MONTH_DELTAS = [-12, -1, 1, 12] as const;

/** Manual cross-run audit checklist. Add an id here after the user confirms that the event has been checked. */
export const DEBUG_COMPLETED_EVENT_IDS = ["before-grad-school", "random-1"] as const;

export const DEBUG_EVENT_GROUPS: DebugButtonGroup[] = [
  {
    title: "固定事件",
    buttons: [
      { id: "scholarship", label: "国奖评选" },
      { id: "teachers-day", label: "教师节" },
      { id: "winter-vacation", label: "寒假" },
      { id: "summer-vacation", label: "暑假" },
      { id: "year-summary", label: "学年总结" },
      { id: "before-grad-school", label: "读研之始" },
      { id: "phd-choice", label: "转博抉择" },
      { id: "mentor-assign", label: "指导新生" },
    ],
  },
  {
    title: "随机事件",
    buttons: [
      { id: "random-1", label: "毕设辅导" },
      { id: "random-2", label: "审稿任务" },
      { id: "illness-stomach", label: "肚子虚弱" },
      { id: "illness-flu", label: "流感来袭" },
      { id: "illness-fever", label: "高烧不退" },
      { id: "random-4", label: "导师项目" },
      { id: "random-5", label: "导师约谈" },
      { id: "random-6", label: "组会汇报" },
      { id: "random-7", label: "组内团建" },
      { id: "random-8", label: "导师经费" },
      { id: "random-9", label: "不断学习" },
      { id: "random-10", label: "同门合作" },
      { id: "random-11", label: "师兄/师姐指导" },
      { id: "random-12", label: "署名风波" },
      { id: "random-13", label: "显卡故障" },
      { id: "random-14", label: "指导师弟/师妹" },
      { id: "random-15", label: "游戏放松" },
      { id: "random-16", label: "数据丢失" },
      { id: "random-17", label: "被抢发idea" },
      { id: "random-18", label: "新SOTA" },
    ],
  },
  {
    title: "开会相关",
    buttons: [
      { id: "ccig", label: "年会" },
      { id: "conference", label: "论文参会" },
      { id: "review-result", label: "论文结果" },
      { id: "thesis-progress", label: "论文推进" },
      { id: "joint-training-invite", label: "联合培养" },
      { id: "lover-beautiful", label: "活泼关系线" },
      { id: "lover-smart", label: "聪慧关系线" },
    ],
  },
  {
    title: "招聘相关",
    buttons: [
      { id: "career-internet", label: "互联网招聘" },
      { id: "career-state-owned", label: "央国企招聘" },
      { id: "career-civil-service", label: "公务员招聘" },
      { id: "career-academic", label: "教职招聘" },
      { id: "internship-invite", label: "实习邀请" },
    ],
  },
];

const DEBUG_EVENT_LABELS = DEBUG_EVENT_GROUPS
  .flatMap((group) => group.buttons)
  .reduce<Record<string, string>>((map, button) => {
    map[button.id] = button.label;
    return map;
  }, {});

const DEBUG_STAT_LABELS: Record<DebugStatId, string> = DEBUG_STAT_GROUPS.reduce<Record<DebugStatId, string>>(
  (map, group) => {
    map[group.statId] = group.label;
    return map;
  },
  {
    san: "SAN",
    research: "科研",
    social: "社交",
    favor: "好感",
    money: "金币",
  },
);

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMonthLabel(totalMonths: number, state: Pick<GameState, "degree">): string {
  const calendar = getCalendarForTotalMonths(totalMonths, state.degree);
  return calendar.month <= 0 ? `第${calendar.year}年入学前` : `第${calendar.year}年${calendar.month}月`;
}

function applyDebugStatChange(state: GameState, statId: DebugStatId, delta: number): GameState {
  const current = state.player[statId];
  let nextValue = current;

  switch (statId) {
    case "san":
      nextValue = clampSan(current + delta, state.sanCap);
      break;
    case "research":
      nextValue = clampResearchToCap(current + delta, state.researchCapacityState);
      break;
    case "social":
    case "favor":
      nextValue = Math.max(0, Math.min(20, current + delta));
      break;
    case "money":
      nextValue = Math.max(0, current + delta);
      break;
  }

  if (nextValue === current) {
    return pushLog(state, `测试调整：${DEBUG_STAT_LABELS[statId]}未变化（当前已到边界）。`);
  }

  const player = { ...state.player, [statId]: nextValue };
  return pushLog(
    {
      ...state,
      player,
      relationshipState: statId === "social"
        ? syncRelationshipState(state.relationshipState, player.social)
        : state.relationshipState,
    },
    `测试调整：${DEBUG_STAT_LABELS[statId]} ${formatSignedValue(nextValue - current)}（${current} → ${nextValue}）。`,
  );
}

function shiftDebugMonth(state: GameState, delta: number): GameState {
  const nextTotalMonths = Math.max(0, Math.min(state.maxMonths, state.totalMonths + delta));
  if (nextTotalMonths === state.totalMonths) {
    return pushLog(state, "测试跳月：已在当前时间边界，无需继续调整。");
  }

  const beforeLabel = formatMonthLabel(state.totalMonths, state);
  const afterLabel = formatMonthLabel(nextTotalMonths, state);
  const nextCalendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);

  return pushLog(
    {
      ...state,
      totalMonths: nextTotalMonths,
      year: nextCalendar.year,
      month: nextCalendar.month,
    },
    `测试跳月：${beforeLabel} → ${afterLabel}。仅调整时间轴，不补月结算。`,
  );
}

function buildConferenceDebugState(state: GameState) {
  return {
    favor: state.player.favor,
    research: state.player.research,
    social: state.player.social,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
    relationshipState: state.relationshipState,
    conferenceEncounterState: state.conferenceEncounterState,
    conferenceLocationSeed: state.conferenceLocationSeed,
    conferenceCareerState: state.conferenceCareerState,
    internshipState: state.internshipState,
    loverState: state.loverState,
  };
}

function collectConferenceDebugCandidates(state: GameState): Array<{ id: string; target: PaperTarget; submittedMonth: number; submittedYear: number; title: string; acceptType: PaperAcceptType }> {
  return [...state.papers, ...state.externalPublications]
    .filter((paper): paper is typeof paper & { target: PaperTarget; submittedMonth: number; submittedYear: number } =>
      paper.status === "published"
      && paper.conferenceHandled !== true
      && paper.target !== null
      && typeof paper.submittedMonth === "number"
      && typeof paper.submittedYear === "number"
    )
    .map((paper) => ({
      id: paper.id,
      target: paper.target,
      submittedMonth: paper.submittedMonth,
      submittedYear: paper.submittedYear,
      title: paper.title,
      acceptType: paper.publication?.acceptType ?? "Poster",
    }));
}

function triggerConferenceDebugEvent(state: GameState): GameState {
  let workingState = state;
  let candidates = collectConferenceDebugCandidates(workingState);
  if (candidates.length === 0) {
    const publicationIndex = workingState.papers.length + workingState.externalPublications.length;
    const paper = {
      ...createGrantedPublishedPaper(workingState.totalMonths, publicationIndex, {
        title: "测试录用论文",
        target: "C",
        acceptedScore: REVIEW_STABLE_SCORE_BY_TARGET.C,
      }, [...workingState.papers, ...workingState.externalPublications, ...(workingState.fellowPapers ?? [])]),
      id: `debug-conference-${workingState.totalMonths}-${publicationIndex + 1}`,
      submittedMonth: Math.max(1, workingState.month),
      submittedYear: Math.max(1, workingState.year),
      conferenceHandled: false,
    };
    workingState = {
      ...workingState,
      externalPublications: [...workingState.externalPublications, paper],
    };
    candidates = collectConferenceDebugCandidates(workingState);
  }

  const enqueueResult = enqueuePendingEvents(
    workingState,
    buildConferenceDecisionEventsForAcceptedPapers(candidates, buildConferenceDebugState(workingState)),
  );
  if (enqueueResult.queuedEvents.length === 0) {
    return pushLog(enqueueResult.nextState, "测试触发：论文参会 已在待办中。");
  }
  return enqueueResult.nextState;
}

function createDebugReviewPaper(state: GameState, paperIndex: number) {
  const target: PaperTarget = "C";
  const readyValue = REVIEW_STABLE_SCORE_BY_TARGET[target];
  const baseChunk = Math.floor(readyValue / 3);
  const remainder = readyValue - baseChunk * 3;
  const idea = baseChunk + (remainder > 0 ? 1 : 0);
  const experiment = baseChunk + (remainder > 1 ? 1 : 0);
  const writing = readyValue - idea - experiment;
  const submittedMonth = state.month > 0 ? state.month : 1;
  return {
    ...createDraftPaper(Math.max(1, state.totalMonths), paperIndex),
    id: `debug-review-${state.totalMonths}-${state.log.length}-${paperIndex + 1}`,
    title: `测试论文 ${paperIndex + 1}`,
    idea,
    experiment,
    writing,
    status: "reviewing" as const,
    target,
    reviewMonthsLeft: 0,
    submittedIdea: idea,
    submittedExperiment: experiment,
    submittedWriting: writing,
    submittedMonth,
    submittedYear: state.year,
    conferenceHandled: false,
    publication: null,
  };
}

function getDebugReviewPaperIndex(state: GameState): number {
  const reviewingIndex = state.papers.findIndex((paper) => paper.status === "reviewing");
  if (reviewingIndex >= 0) {
    return reviewingIndex;
  }
  if (state.papers.length < state.paperSlotsUnlocked) {
    return state.papers.length;
  }
  return state.papers.findIndex((paper) => paper.status !== "reviewing");
}

function triggerReviewResultDebugEvent(state: GameState): GameState {
  const paperIndex = getDebugReviewPaperIndex(state);
  if (paperIndex < 0) {
    return pushLog(state, "测试触发：论文结果 当前没有可用论文槽。");
  }

  let workingState = state;
  if (workingState.papers[paperIndex]?.status !== "reviewing") {
    const debugPaper = createDebugReviewPaper(workingState, paperIndex);
    const nextPapers = [...workingState.papers];
    if (paperIndex < nextPapers.length) {
      nextPapers[paperIndex] = debugPaper;
    } else {
      nextPapers.push(debugPaper);
    }
    workingState = {
      ...workingState,
      papers: nextPapers,
      selectedPaperId: debugPaper.id,
    };
  }

  if (!workingState.papers[paperIndex]) {
    return pushLog(workingState, "测试触发：论文结果 失败，测试论文未能写入。");
  }

  const reviewResolution = resolveDuePaperReviews(workingState);
  // Review resolution only calculates and queues the three-stage result event.
  // The paper is not published until the player confirms its PC decision; the
  // normal month pipeline will then schedule its conference flow after the
  // configured waiting period.
  return reviewResolution.state;
}

function markTriggeredEventForReplay(before: GameState, after: GameState, debugEventId: string): GameState {
  const previousIds = new Set(before.eventQueue.map((event) => event.id));
  return {
    ...after,
    eventQueue: after.eventQueue.map((event) => previousIds.has(event.id) ? event : {
      ...event,
      replayContext: {
        rootEvent: event.replayContext?.rootEvent ?? event,
        debugEventId,
      },
    }),
  };
}

function rebuildDebugReplayRootEvent(rootEvent: PendingEvent, state: GameState, debugEventId?: string): PendingEvent {
  const eventId = debugEventId ?? rootEvent.chainId;
  const serialMatch = /-n(\d+)(?:-|$)/u.exec(rootEvent.id);
  const replaySerial = serialMatch ? Number(serialMatch[1]) : rootEvent.randomReplay?.serial;
  const eventState = rootEvent.paperCompetitionTargetId
    ? { ...state, papers: state.papers.filter((paper) => paper.id === rootEvent.paperCompetitionTargetId) }
    : state;
  const rebuilt = buildDebugEvent(eventState, eventId, replaySerial)?.event;
  if (!rebuilt || rebuilt.stage !== "act1" || rebuilt.chainId !== rootEvent.chainId) {
    return rootEvent;
  }
  // Keep choice ids stable if the date changed while this event was pending.
  const stableRoot = rebaseGeneratedEventIds(rebuilt, rebuilt.id, rootEvent.id);
  return { ...stableRoot, paperCompetitionTargetId: rootEvent.paperCompetitionTargetId };
}

function replayDebugEventScene(state: GameState, targetIndex: number, choiceId?: string, eventId?: string): GameState {
  if (state.debugEventReplayEnabled !== true || !Number.isInteger(targetIndex) || targetIndex < 0) return state;
  const currentEvent = getCurrentEvent(state.eventQueue, eventId);
  const context = currentEvent?.replayContext;
  const history = currentEvent?.history;
  if (!currentEvent || !context || !history || targetIndex >= history.length) return state;

  const targetScene = history[targetIndex]?.replayEvent;
  if (!targetScene) return state;
  // No event effects are committed before final confirmation. Replacing the
  // pending scene discards its preview without touching the live game state.
  const baseState = state;
  let targetEvent = targetScene;
  let nextContext = context;
  if (targetScene.source === "random") {
    const rootEvent = rebuildDebugReplayRootEvent(context.rootEvent, baseState, context.debugEventId);
    targetEvent = rootEvent;
    for (const stage of history.slice(0, targetIndex)) {
      const choice = targetEvent.choices.find((item) => item.id === stage.selectedChoiceId);
      const followUp = choice?.effects.enqueueEvents?.find((event) => event.chainId === currentEvent.chainId);
      if (!followUp) return state;
      targetEvent = followUp;
    }
    nextContext = { ...context, rootEvent };
  }
  const replayedState: GameState = {
    ...baseState,
    eventQueue: baseState.eventQueue.map((event) => event.id !== currentEvent.id ? event : {
      ...targetEvent,
      history: history.slice(0, targetIndex),
      debugReplayable: true,
      debugRootEventId: context.rootEvent.id,
      replayContext: nextContext,
      queueOrder: currentEvent.queueOrder,
    }),
  };
  if (!choiceId) return replayedState;
  const event = replayedState.eventQueue.find((item) => item.id === targetEvent.id);
  if (!event || !event.choices.some((choice) => choice.id === choiceId)) return state;
  return applyQueuedEventEffects(replayedState, event, choiceId, {
    evaluateImmediateEndings: (nextState) => nextState,
    runPostQueuePipeline: (nextState) => nextState,
  });
}

function buildCareerEvent(state: GameState, eventId: string): PendingEvent | null {
  const careerTypeMap: Record<string, CareerType> = {
    "career-internet": "internet",
    "career-state-owned": "stateOwned",
    "career-civil-service": "civilService",
    "career-academic": "academic",
  };
  const careerType = careerTypeMap[eventId];
  return careerType ? createCareerEventForType(state, careerType) : null;
}

function attachDebugRandomReplay(event: PendingEvent, replay: NonNullable<PendingEvent["randomReplay"]>): PendingEvent {
  return {
    ...event,
    randomReplay: replay,
    choices: event.choices.map((choice) => ({
      ...choice,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents
          ? { enqueueEvents: choice.effects.enqueueEvents.map((followUp) => attachDebugRandomReplay(followUp, replay)) }
          : {}),
      },
    })),
  };
}

function buildDebugEvent(
  state: GameState,
  eventId: string,
  stableRandomSerial?: number,
): { nextState: GameState; event: PendingEvent | null } | null {
  switch (eventId) {
    case "scholarship":
      return { nextState: state, event: createScholarshipEvent(state, Math.random) };
    case "teachers-day":
      return { nextState: state, event: createTeachersDayEvent(state) };
    case "winter-vacation":
      return { nextState: state, event: createWinterVacationEvent(state) };
    case "summer-vacation":
      return { nextState: state, event: createSummerVacationEvent(state) };
    case "year-summary":
      return { nextState: state, event: createYearSummaryEvent(state) };
    case "ccig":
      return { nextState: state, event: createCcigEvent(state) };
    case "mentor-assign":
      return { nextState: state, event: createMentorAssignEvent(state) };
    case "illness-stomach":
      return { nextState: state, event: createIllnessRandomEvent(state, Math.random, "stomach") };
    case "illness-flu":
      return { nextState: state, event: createIllnessRandomEvent(state, Math.random, "flu") };
    case "illness-fever":
      return { nextState: state, event: createIllnessRandomEvent(state, Math.random, "fever") };
    case "before-grad-school":
      return { nextState: state, event: createBeforeGradSchoolAct1Event(state) };
    case "thesis-progress": {
      const thesisState = {
        ...state,
        thesis: {
          ...state.thesis,
          progress: Math.min(99, state.thesis.progress),
          started: true,
          completed: false,
          abandoned: false,
        },
      };
      return collectThesisEventForMonth(thesisState);
    }
    case "phd-choice":
      return { nextState: state, event: createPhdDecisionEvent(state, state.year >= 3 ? 3 : 2) };
    case "internship-invite":
      return { nextState: state, event: createInternshipInviteAct1(buildInternshipInviteContext(state)) };
    case "joint-training-invite":
      return { nextState: state, event: createJointTrainingAct1(buildJointTrainingContext(state)) };
    case "lover-beautiful":
    case "lover-smart": {
      const type = eventId === "lover-beautiful" ? "beautiful" : "smart";
      return {
        nextState: state,
        event: createLoverDevelopmentAct1(buildLoverDevelopmentContext({
          conferenceEncounterState: state.conferenceEncounterState,
          totalMonths: state.totalMonths,
          type,
          playerGender: getRoleDefinition(state.selectedRoleId).gender,
          canAddRelationship: canAddRelationship(state.relationshipState, "lover"),
        })),
      };
    }
    default: {
      if (eventId.startsWith("career-")) {
        return { nextState: state, event: buildCareerEvent(state, eventId) };
      }

      const randomMatch = /^random-(\d+)$/u.exec(eventId);
      if (randomMatch) {
        const randomId = Number(randomMatch[1]);
        if (Number.isInteger(randomId)) {
          let randomState = state;
          if (randomId === 16 && !hasRecoverableDraftPaper(randomState)) {
            const draft = {
              ...createDraftPaper(randomState.totalMonths, randomState.papers.length),
              id: `debug-draft-${randomState.totalMonths}-${randomState.papers.length + 1}`,
              title: "测试草稿",
              idea: 4,
              experiment: 3,
              writing: 2,
            };
            randomState = {
              ...randomState,
              papers: [...randomState.papers, draft],
              selectedPaperId: draft.id,
            };
          }
          // Debug events must not all use serial 0. The regular monthly
          // scheduler increments totalRandomEventCount before building an
          // event, while the debug panel intentionally leaves the live state
          // untouched. Use a throwaway random serial for generated profiles
          // and event copy, then keep the real state unchanged.
          const debugEventState = {
            ...randomState,
            totalRandomEventCount: stableRandomSerial ?? (
              randomState.totalRandomEventCount + 1
              + Math.floor(Math.random() * 0x1000000)
            ),
          };
          const randomRolls: number[] = [];
          const recordRoll = (): number => {
            const roll = Math.random();
            randomRolls.push(roll);
            return roll;
          };
          const built = createRandomEventById(randomId, debugEventState, recordRoll);
          const replay = {
            eventId: randomId,
            serial: debugEventState.totalRandomEventCount,
            rolls: randomRolls,
          };
          return {
            nextState: randomState,
            event: built.event
              ? attachDebugRandomReplay(built.event, replay)
              : null,
          };
        }
      }

      return null;
    }
  }
}

function triggerDebugEvent(state: GameState, eventId: string): GameState {
  const replayState = state;
  const randomMatch = /^random-(\d+)$/u.exec(eventId);
  const randomId = randomMatch ? Number(randomMatch[1]) : NaN;
  if (isPaperCompetitionEventId(randomId)) {
    const pendingState = rememberPendingPaperCompetitionEvent(replayState, randomId, replayState.totalRandomEventCount + 1);
    const triggeredState = activatePendingPaperCompetitionEvents(pendingState === replayState ? replayState : {
      ...pendingState,
      totalRandomEventCount: replayState.totalRandomEventCount + 1,
    });
    return markTriggeredEventForReplay(replayState, triggeredState, eventId);
  }
  if (eventId === "conference") {
    return markTriggeredEventForReplay(replayState, triggerConferenceDebugEvent(replayState), eventId);
  }
  if (eventId === "review-result") {
    return markTriggeredEventForReplay(replayState, triggerReviewResultDebugEvent(replayState), eventId);
  }

  const built = buildDebugEvent(replayState, eventId);
  const label = DEBUG_EVENT_LABELS[eventId] ?? eventId;

  if (!built) {
    return pushLog(replayState, `测试触发失败：未找到事件 ${label}。`);
  }

  if (!built.event) {
    return pushLog(built.nextState, `测试触发：${label} 当前状态下无法生成。`);
  }

  const enqueueResult = enqueuePendingEvents(built.nextState, [built.event]);
  if (enqueueResult.queuedEvents.length === 0) {
    return pushLog(enqueueResult.nextState, `测试触发：${label} 已在待办中。`);
  }

  return markTriggeredEventForReplay(replayState, enqueueResult.nextState, eventId);
}

function addDebugPublishedPaper(
  state: GameState,
  target: PaperTarget,
  authorship: "first" | "coauthor",
): GameState {
  const nonFirstAuthor = authorship === "coauthor";
  const publicationIndex = state.externalPublications.length;
  const submittedMonth = Math.floor(Math.random() * 12) + 1;
  const submittedYear = Math.max(1, state.year);
  const calendarYear = getAcademicCalendarYear(submittedYear, submittedMonth);
  const topic = createDraftPaper(state.totalMonths, publicationIndex, Math.random, calendarYear);
  const acceptTypes: PaperAcceptType[] = target === "A"
    ? ["Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"]
    : ["Poster", "Oral"];
  const acceptType = acceptTypes[Math.floor(Math.random() * acceptTypes.length)] ?? "Poster";
  const randomScore = () => 5 + Math.floor(Math.random() * 36);
  const idea = randomScore();
  const experiment = randomScore();
  const writing = randomScore();
  const acceptedScore = idea + experiment + writing;
  const conference = getConferenceInfo(submittedMonth, target, submittedYear);
  const paper = attachPaperPublication({
    ...topic,
    id: `debug-paper-${state.totalMonths}-${publicationIndex + 1}`,
    idea,
    experiment,
    writing,
    status: "published",
    target,
    journalTarget: null,
    reviewMonthsLeft: 0,
    submittedIdea: idea,
    submittedExperiment: experiment,
    submittedWriting: writing,
    submittedMonth,
    submittedYear,
    conferenceHandled: false,
    conferenceAvailableAtTotalMonths: state.totalMonths + 3,
    lastReview: null,
    nonFirstAuthor,
    topicId: topic.topicId,
    topicLabel: topic.topicLabel,
    heatMultiplier: topic.heatMultiplier,
    prepublicationDecayRate: topic.prepublicationDecayRate,
  }, 1, acceptType, conference.influence);
  const publication = paper.publication ? {
    ...paper.publication,
    citations: 0,
    effectiveScore: acceptedScore,
    monthsSincePublish: 0,
  } : null;
  const randomizedPaper = recordPaperAcceptances([{ ...paper, publication }], state.totalMonths,
    [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])])[0]!;
  const scoreGain = nonFirstAuthor ? 0 : SCORE_BY_TARGET[target];
  const citationGain = publication?.citations ?? 0;

  const citationHistoryByYear = { ...state.citationHistoryByYear };
  const citationYear = getAcademicCalendarYear(submittedYear, submittedMonth);
  if (citationGain > 0) citationHistoryByYear[citationYear] = (citationHistoryByYear[citationYear] ?? 0) + citationGain;
  return pushLog({
    ...state,
    externalPublications: [...state.externalPublications, randomizedPaper],
    totalResearchScore: state.totalResearchScore + scoreGain,
    totalCitations: state.totalCitations + citationGain,
    citationHistoryByYear,
  }, `测试论文：${randomizedPaper.title}｜${conference.name} ${conference.year}｜${target} 类 ${acceptType}${scoreGain > 0 ? `｜科研分 +${scoreGain}` : ""}`);
}

function addDebugPublishedJournalPaper(
  state: GameState,
  journalTarget: JournalTarget,
  authorship: "first" | "coauthor",
): GameState {
  const nonFirstAuthor = authorship === "coauthor";
  const publicationIndex = state.externalPublications.length;
  const submittedMonth = Math.floor(Math.random() * 12) + 1;
  const submittedYear = Math.max(1, state.year);
  const calendarYear = getAcademicCalendarYear(submittedYear, submittedMonth);
  const topic = createDraftPaper(state.totalMonths, publicationIndex, Math.random, calendarYear);
  const journal = getJournalDefinition(journalTarget);
  const acceptedScore = journal.acceptanceScore + 30 + Math.floor(Math.random() * 36);
  const baseScore = Math.floor(acceptedScore / 3);
  const remainder = acceptedScore - baseScore * 3;
  const idea = baseScore + (remainder > 0 ? 1 : 0);
  const experiment = baseScore + (remainder > 1 ? 1 : 0);
  const writing = baseScore;
  const paper = attachPaperPublication({
    ...topic,
    id: `debug-journal-${state.totalMonths}-${publicationIndex + 1}`,
    idea,
    experiment,
    writing,
    status: "published",
    target: null,
    journalTarget,
    reviewMonthsLeft: 0,
    submittedIdea: idea,
    submittedExperiment: experiment,
    submittedWriting: writing,
    submittedMonth,
    submittedYear,
    conferenceHandled: true,
    lastReview: null,
    nonFirstAuthor,
  }, 1, undefined, journal.citationInfluence);
  const publication = paper.publication ? {
    ...paper.publication,
    journalTarget,
    citations: 0,
    monthsSincePublish: 0,
  } : null;
  const randomizedPaper = recordPaperAcceptances([{ ...paper, publication }], state.totalMonths,
    [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])])[0]!;
  const citationGain = publication?.citations ?? 0;
  const researchScoreGain = nonFirstAuthor ? 0 : journal.researchScore;
  const citationHistoryByYear = { ...state.citationHistoryByYear };
  const citationYear = getAcademicCalendarYear(submittedYear, submittedMonth);
  if (citationGain > 0) citationHistoryByYear[citationYear] = (citationHistoryByYear[citationYear] ?? 0) + citationGain;
  const authorshipLabel = nonFirstAuthor ? "合作" : "一作";
  return pushLog({
    ...state,
    externalPublications: [...state.externalPublications, randomizedPaper],
    totalResearchScore: state.totalResearchScore + researchScoreGain,
    totalCitations: state.totalCitations + citationGain,
    citationHistoryByYear,
  }, `测试论文：${randomizedPaper.title}｜${journal.name}｜${authorshipLabel}`);
}

function addAllDebugBuffs(state: GameState): GameState {
  const debugBuffs = addOrReplaceBuffs([], createDebugBuffs());
  const isDebugBuff = (buff: Buff) => buff.id.startsWith("debug-buff-") || buff.id.startsWith("ai-debug-");
  const existingDebugBuffs = state.buffs.filter(isDebugBuff);
  const signature = (buff: Buff | undefined) => JSON.stringify(buff, (_key, value) => (
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value
  ));
  const hasAllDebugBuffs = existingDebugBuffs.length === debugBuffs.length
    && debugBuffs.every((buff) => signature(existingDebugBuffs.find((existing) => existing.id === buff.id)) === signature(buff));
  const entitlements = { ...state.shopState.entitlements };
  for (const key of Object.keys(entitlements) as Array<keyof typeof entitlements>) {
    entitlements[key] = Math.max(1, entitlements[key]);
  }
  const giftCoupons = Math.max(1, state.loverProgressState.giftCoupons ?? 0);
  const hasAllEntitlements = Object.keys(entitlements).every((key) => (
    entitlements[key as keyof typeof entitlements] === state.shopState.entitlements[key as keyof typeof entitlements]
  )) && giftCoupons === state.loverProgressState.giftCoupons;
  if (hasAllDebugBuffs && hasAllEntitlements) return state;
  return {
    ...state,
    buffs: addOrReplaceBuffs(state.buffs.filter((buff) => !isDebugBuff(buff)), debugBuffs),
    shopState: { ...state.shopState, entitlements },
    loverProgressState: { ...state.loverProgressState, giftCoupons },
  };
}

function addDebugRelationship(state: GameState, type: DebugRelationshipType): GameState {
  if (type === "lover") {
    if (state.loverState.active || state.loverProgressState.active || state.relationshipState.loverCount > 0) {
      return pushLog(state, "测试：已有恋人，未重复添加");
    }
    return pushLog({
      ...state,
      relationshipState: { ...state.relationshipState, loverCount: 1 },
      loverState: {
        ...activateLover("smart", state.totalMonths, getRoleDefinition(state.selectedRoleId).gender),
        name: pickRandomAdvisorName(),
      },
      loverProgressState: createLoverProgressState("smart"),
    }, "测试：已新增恋人，不触发恋爱奖励");
  }

  if (state.fellowProgressState.length >= 4) {
    return pushLog(state, "测试：已有 4 位同学，未继续添加");
  }
  const seed = Math.floor(Math.random() * 0x100000000);
  const usedNames = [
    ...state.fellowProgressState.map((fellow) => getFellowName(fellow)),
    state.selectedAdvisorName ?? "",
    state.loverState.name ?? "",
  ];
  const profile = createCustomFellowProgressProfile({
    ...createGeneratedFellowProfileAddition(type, seed, undefined, usedNames, Math.random),
    startTotalMonths: state.totalMonths,
    usedNames,
  });
  const countKey = ({ senior: "seniorCount", junior: "juniorCount", peer: "peerCount" } as const)[type];
  return pushLog({
    ...state,
    fellowProgressState: [...state.fellowProgressState, profile],
    relationshipState: {
      ...state.relationshipState,
      [countKey]: state.relationshipState[countKey] + 1,
      occupiedSlots: state.relationshipState.occupiedSlots + 1,
      unlockedSlots: Math.max(state.relationshipState.unlockedSlots, state.fellowProgressState.length + 2),
    },
  }, `测试：已新增${getFellowRoleLabel(type, profile.gender)}${profile.name ?? ""}`);
}

export function dispatchDebugAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
): GameState | null {
  if (state.phase !== "playing") {
    switch (actionId) {
      case "debug-adjust-stat":
      case "debug-add-paper":
      case "debug-add-relationship":
      case "debug-shift-month":
      case "debug-trigger-event":
      case "debug-replay-event":
      case "debug-toggle-event-replay":
      case "debug-adjust-action-points":
      case "debug-add-all-buffs":
        return pushLog(state, "开始本轮后才能使用测试工具。");
      default:
        return null;
    }
  }

  switch (actionId) {
    case "debug-toggle-event-replay":
      if (typeof payload.debugEventReplayEnabled !== "boolean") return state;
      return { ...state, debugEventReplayEnabled: payload.debugEventReplayEnabled };
    case "debug-adjust-action-points": {
      if (typeof payload.delta !== "number" || !Number.isInteger(payload.delta) || payload.delta === 0) return state;
      const currentLimit = state.actionState.limit;
      const nextLimit = Math.max(0, currentLimit + payload.delta);
      if (nextLimit === currentLimit) return state;
      const nextUsed = Math.min(state.actionState.used, nextLimit);
      return {
        ...state,
        actionState: { ...state.actionState, limit: nextLimit, used: nextUsed },
      };
    }
    case "debug-adjust-stat":
      if (!payload.debugStatId || typeof payload.delta !== "number" || !Number.isInteger(payload.delta) || payload.delta === 0) {
        return state;
      }
      return applyDebugStatChange(state, payload.debugStatId, payload.delta);
    case "debug-add-paper":
      if (payload.debugPaperAuthorship && payload.debugJournalTarget) {
        return addDebugPublishedJournalPaper(state, payload.debugJournalTarget, payload.debugPaperAuthorship);
      }
      return payload.debugPaperTarget && payload.debugPaperAuthorship
        ? addDebugPublishedPaper(state, payload.debugPaperTarget, payload.debugPaperAuthorship)
        : state;
    case "debug-shift-month":
      if (typeof payload.delta !== "number" || !Number.isInteger(payload.delta) || payload.delta === 0) {
        return state;
      }
      return shiftDebugMonth(state, payload.delta);
    case "debug-add-relationship":
      return payload.debugRelationshipType && DEBUG_RELATIONSHIP_TYPES.includes(payload.debugRelationshipType)
        ? addDebugRelationship(state, payload.debugRelationshipType)
        : state;
    case "debug-trigger-event":
      return payload.eventId ? triggerDebugEvent(state, payload.eventId) : state;
    case "debug-replay-event":
      return typeof payload.eventHistoryIndex === "number"
        ? replayDebugEventScene(state, payload.eventHistoryIndex, payload.eventChoiceId, payload.eventId)
        : state;
    case "debug-add-all-buffs":
      return addAllDebugBuffs(state);
    default:
      return null;
  }
}
