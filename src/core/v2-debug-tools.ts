import { buildConferenceDecisionEventsForAcceptedPapers } from "./v2-conference-events";
import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { SCORE_BY_TARGET } from "./v2-content";
import type { CareerType } from "./v2-career-rules";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { addOrReplaceBuffs } from "./v2-buffs";
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
import { getCalendarForTotalMonths, getRoleDefinition } from "./v2-progression";
import { attachPaperPublication, createGrantedPublishedPaper } from "./v2-publication-rules";
import { resolveDuePaperReviews } from "./v2-publication-system";
import { createRandomEventById } from "./v2-random-event-router";
import { createIllnessRandomEvent } from "./v2-random-events-core-health";
import { hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { clampResearchToCap } from "./v2-research-cap-system";
import { syncRelationshipState } from "./v2-relationship-rules";
import type {
  Buff,
  DebugStatId,
  DispatchPayload,
  GameActionId,
  GameState,
  PaperAcceptType,
  PaperTarget,
  PendingEvent,
} from "./v2-types";

/** Representative fixtures use the same source labels as their gameplay counterparts. */
export function createDebugBuffs(): Buff[] {
  return [
    {
      id: "debug-buff-base-recovery",
      name: "自动恢复",
      source: "基础规则",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: 1 },
    },
    {
      id: "debug-buff-strong-body",
      name: "强身健体",
      source: "羽毛球冠军",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: 1 },
    },
    {
      id: "debug-buff-phd-pressure",
      name: "读博压力",
      source: "转博",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: -1 },
    },
    {
      id: "debug-buff-advisor-salary",
      name: "导师工资",
      source: "导师待遇",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { money: 1 },
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
      id: "debug-buff-lover",
      name: "科研陪伴",
      source: "发展关系",
      timing: "permanent",
      remainingMonths: null,
      actionEffects: {
        idea: { extraActions: 1 },
        experiment: { extraActions: 1 },
        writing: { extraActions: 1 },
      },
    },
    {
      id: "debug-buff-citation-penalty",
      name: "引用受损",
      source: "人物影响",
      timing: "permanent",
      remainingMonths: null,
      publicationEffects: { citationDebuffMultiplier: 0.75 },
    },
    {
      id: "ai-debug-gpt",
      name: "GPT-5.6-sol",
      source: "商店 GPT-5.6-sol",
      timing: "monthly",
      remainingMonths: 1,
      actionEffects: {
        idea: { bonus: 6 },
        experiment: { bonus: 6 },
        writing: { bonus: 6 },
      },
    },
    {
      id: "ai-debug-claude",
      name: "Claude Fable 5",
      source: "商店 Claude Fable 5",
      timing: "monthly",
      remainingMonths: 1,
      paperPolishEffects: { idea: 4, experiment: 2, writing: 2 },
    },
    {
      id: "ai-debug-gemini",
      name: "Gemini 3",
      source: "商店 Gemini 3",
      timing: "monthly",
      remainingMonths: 1,
      actionEffects: {
        idea: { sanDelta: -1 },
        experiment: { sanDelta: -1 },
        writing: { sanDelta: -1 },
      },
      relationshipOperationSanDelta: -1,
    },
    {
      id: "ai-debug-deepseek",
      name: "DeepSeek-V4",
      source: "商店 DeepSeek-V4",
      timing: "monthly",
      remainingMonths: 1,
      actionEffects: {
        idea: { extraActions: 2 },
        experiment: { extraActions: 2 },
        writing: { extraActions: 2 },
      },
    },
    {
      id: "ai-debug-doubao",
      name: "豆包 Seed 4",
      source: "商店 豆包 Seed 4",
      timing: "monthly",
      remainingMonths: 1,
      actionEffects: {
        idea: { bonus: 2, sanDelta: 1 },
        experiment: { bonus: 2, sanDelta: 1 },
        writing: { bonus: 2, sanDelta: 1 },
      },
    },
    {
      id: "ai-debug-kimi-manual",
      name: "Kimi k1.5",
      source: "商店 Kimi k1.5",
      timing: "monthly",
      remainingMonths: 1,
      readingEffect: { sanDelta: -1, manualExtraReads: 1 },
    },
    {
      id: "ai-debug-kimi-auto",
      name: "Kimi K3",
      source: "商店 Kimi K3",
      timing: "monthly",
      remainingMonths: 1,
      readingEffect: { automaticReads: 1 },
    },
    {
      id: "debug-buff-illness",
      name: "带病工作",
      source: "肚子虚弱",
      timing: "monthly",
      remainingMonths: null,
      activeOperationSanMultiplier: 1.5,
    },
    {
      id: "debug-buff-mentoring",
      name: "长期带教",
      source: "指导师弟师妹",
      timing: "monthly",
      remainingMonths: null,
      monthlyStats: { san: -2 },
      scheduledPublication: {
        intervalMonths: 12,
        nonFirstAuthor: true,
        targetWeights: { A: 0.2, B: 0.3, C: 0.5 },
      },
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
      { id: "random-2", label: "帮忙审稿" },
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
      }),
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

function buildDebugEvent(state: GameState, eventId: string): { nextState: GameState; event: PendingEvent | null } | null {
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
          canAddRelationship: state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots,
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
          return createRandomEventById(randomId, randomState, Math.random);
        }
      }

      return null;
    }
  }
}

function triggerDebugEvent(state: GameState, eventId: string): GameState {
  if (eventId === "conference") {
    return triggerConferenceDebugEvent(state);
  }
  if (eventId === "review-result") {
    return triggerReviewResultDebugEvent(state);
  }

  const built = buildDebugEvent(state, eventId);
  const label = DEBUG_EVENT_LABELS[eventId] ?? eventId;

  if (!built) {
    return pushLog(state, `测试触发失败：未找到事件 ${label}。`);
  }

  if (!built.event) {
    return pushLog(built.nextState, `测试触发：${label} 当前状态下无法生成。`);
  }

  const enqueueResult = enqueuePendingEvents(built.nextState, [built.event]);
  if (enqueueResult.queuedEvents.length === 0) {
    return pushLog(enqueueResult.nextState, `测试触发：${label} 已在待办中。`);
  }

  return enqueueResult.nextState;
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
    citations: Math.floor(Math.random() * 21),
    effectiveScore: acceptedScore,
    monthsSincePublish: 0,
  } : null;
  const randomizedPaper = { ...paper, publication };
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

function addAllDebugBuffs(state: GameState): GameState {
  const debugBuffs = createDebugBuffs();
  const hasAllDebugBuffs = DEBUG_BUFF_IDS.every((id) => state.buffs.some((buff) => buff.id === id));
  if (hasAllDebugBuffs) return state;
  return pushLog(
    { ...state, buffs: addOrReplaceBuffs(state.buffs, debugBuffs) },
    "测试：已添加全部 buff。",
  );
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
      case "debug-shift-month":
      case "debug-trigger-event":
      case "debug-add-all-buffs":
        return pushLog(state, "开始本轮后才能使用测试工具。");
      default:
        return null;
    }
  }

  switch (actionId) {
    case "debug-adjust-stat":
      if (!payload.debugStatId || typeof payload.delta !== "number" || !Number.isInteger(payload.delta) || payload.delta === 0) {
        return state;
      }
      return applyDebugStatChange(state, payload.debugStatId, payload.delta);
    case "debug-add-paper":
      return payload.debugPaperTarget && payload.debugPaperAuthorship
        ? addDebugPublishedPaper(state, payload.debugPaperTarget, payload.debugPaperAuthorship)
        : state;
    case "debug-shift-month":
      if (typeof payload.delta !== "number" || !Number.isInteger(payload.delta) || payload.delta === 0) {
        return state;
      }
      return shiftDebugMonth(state, payload.delta);
    case "debug-trigger-event":
      return payload.eventId ? triggerDebugEvent(state, payload.eventId) : state;
    case "debug-add-all-buffs":
      return addAllDebugBuffs(state);
    default:
      return null;
  }
}
