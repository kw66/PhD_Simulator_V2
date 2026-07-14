import { buildConferenceDecisionEventsForAcceptedPapers } from "./v2-conference-events";
import type { CareerType } from "./v2-career-rules";
import { enqueuePendingEvents } from "./v2-event-enqueue";
import { clampSan, pushLog } from "./v2-engine-helpers";
import { createAdvisorSelectionAct1Event } from "./v2-fixed-events-advisor-selection";
import { createCcigEvent } from "./v2-fixed-events-ccig";
import { createMidtermMessageEvent } from "./v2-fixed-events-midterm";
import { createMentorAssignEvent } from "./v2-fixed-events-mentor-assign";
import { createScholarshipEvent } from "./v2-fixed-events-scholarship";
import { createSummerVacationEvent } from "./v2-fixed-events-summer";
import { createTeachersDayEvent } from "./v2-fixed-events-teachers-day";
import { createWinterVacationEvent } from "./v2-fixed-events-winter";
import { createYearSummaryEvent } from "./v2-fixed-events-year-summary";
import { createCareerEventForType } from "./v2-monthly-career-events";
import { collectThesisEventForMonth } from "./v2-monthly-thesis-events";
import { createDraftPaper, getSubmitReadyThreshold, resolvePaperReview, shouldMarkSlotPublishedA } from "./v2-paper-rules";
import { createPhdDecision, getCalendarForTotalMonths, getPhdDecisionRequirement } from "./v2-progression";
import { attachPaperPublication, consumeNextPublicationCitationMultiplier } from "./v2-publication-rules";
import { createRandomEventById } from "./v2-random-event-router";
import { clampResearchToCap } from "./v2-research-cap-system";
import type {
  DebugStatId,
  DispatchPayload,
  GameActionId,
  GameState,
  PaperTarget,
  PendingEvent,
} from "./v2-types";

export interface DebugButtonSpec {
  id: string;
  label: string;
}

export interface DebugButtonGroup {
  id: string;
  title: string;
  description: string;
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
export const DEBUG_PAPER_TARGETS: PaperTarget[] = ["C", "B", "A"];

export const DEBUG_EVENT_GROUPS: DebugButtonGroup[] = [
  {
    id: "fixed",
    title: "固定事件",
    description: "直接把高频固定剧情加入当前待办。",
    buttons: [
      { id: "scholarship", label: "国奖评选" },
      { id: "teachers-day", label: "教师节" },
      { id: "winter-vacation", label: "寒假" },
      { id: "summer-vacation", label: "暑假" },
      { id: "year-summary", label: "学年总结" },
      { id: "midterm-message", label: "留言" },
      { id: "ccig", label: "领域年会" },
    ],
  },
  {
    id: "academic",
    title: "学术流程",
    description: "用于论文参会、论文结果与毕业线流程测试。",
    buttons: [
      { id: "conference", label: "论文参会" },
      { id: "review-result", label: "论文结果" },
      { id: "thesis-progress", label: "论文推进" },
    ],
  },
  {
    id: "further-study",
    title: "升学剧情",
    description: "对齐旧版设置栏里的保研与转博入口。",
    buttons: [
      { id: "advisor-selection", label: "保研抉择" },
      { id: "phd-choice", label: "转博抉择" },
    ],
  },
  {
    id: "career",
    title: "就业招聘",
    description: "用于毕业去向线路的定向测试。",
    buttons: [
      { id: "career-internet", label: "互联网招聘" },
      { id: "career-state-owned", label: "央国企招聘" },
      { id: "career-civil-service", label: "公务员招聘" },
      { id: "career-academic", label: "教职招聘" },
    ],
  },
  {
    id: "random",
    title: "随机事件",
    description: "按旧版语义保留常用随机事件直达入口。",
    buttons: [
      { id: "random-1", label: "毕设辅导" },
      { id: "random-2", label: "帮忙审稿" },
      { id: "random-3", label: "疾病来袭" },
      { id: "random-4", label: "导师项目" },
      { id: "random-5", label: "导师约谈" },
      { id: "random-6", label: "组会汇报" },
      { id: "random-7", label: "实验室团建" },
      { id: "random-8", label: "导师经费" },
      { id: "random-9", label: "不断学习" },
      { id: "random-10", label: "同门合作" },
      { id: "random-11", label: "师兄/师姐指导" },
      { id: "random-12", label: "署名风波" },
      { id: "random-13", label: "服务器宕机" },
      { id: "random-14", label: "指导师弟/师妹" },
      { id: "random-15", label: "游戏放松" },
      { id: "random-16", label: "数据丢失" },
      { id: "mentor-assign", label: "指导新生" },
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

  return pushLog(
    {
      ...state,
      player: {
        ...state.player,
        [statId]: nextValue,
      },
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
      actionsRemaining: state.maxActionsPerMonth,
    },
    `测试跳月：${beforeLabel} → ${afterLabel}。仅调整时间轴并重置行动次数，不补月结算。`,
  );
}

function seedDebugPaper(state: GameState, target: PaperTarget): GameState {
  if (state.papers.length >= state.paperSlotsUnlocked) {
    return pushLog(state, `测试论文：已用满 ${state.paperSlotsUnlocked} 个论文槽，无法再放入 ${target} 类草稿。`);
  }

  const readyValue = getSubmitReadyThreshold(target);
  const baseChunk = Math.floor(readyValue / 3);
  const draft = createDraftPaper(state.totalMonths, state.papers.length);
  const paper = {
    ...draft,
    idea: baseChunk,
    experiment: baseChunk,
    writing: readyValue - baseChunk * 2,
  };

  return pushLog(
    {
      ...state,
      papers: [...state.papers, paper],
      selectedPaperId: paper.id,
    },
    `测试论文：已放入 ${paper.title}，当前可直接投稿 ${target} 类。`,
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
    conferenceCareerState: state.conferenceCareerState,
    internshipState: state.internshipState,
    loverState: state.loverState,
  };
}

function collectConferenceDebugCandidates(state: GameState): Array<{ id: string; target: PaperTarget; submittedMonth: number; submittedYear: number }> {
  return state.papers
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
    }));
}

function triggerConferenceDebugEvent(state: GameState): GameState {
  const candidates = collectConferenceDebugCandidates(state);
  if (candidates.length === 0) {
    return pushLog(state, "测试触发：论文参会 当前状态下无法生成。");
  }

  const enqueueResult = enqueuePendingEvents(
    state,
    buildConferenceDecisionEventsForAcceptedPapers(candidates, buildConferenceDebugState(state)),
  );
  if (enqueueResult.queuedEvents.length === 0) {
    return pushLog(enqueueResult.nextState, "测试触发：论文参会 已在待办中。");
  }
  return pushLog(enqueueResult.nextState, "测试触发：论文参会。");
}

function createDebugReviewPaper(state: GameState, paperIndex: number) {
  const target: PaperTarget = "C";
  const readyValue = getSubmitReadyThreshold(target);
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

function maybeMarkDebugSlotPublishedA(state: GameState, paperIndex: number): GameState {
  const paper = state.papers[paperIndex];
  if (!paper || !shouldMarkSlotPublishedA(paper) || state.slotPublishedA[paperIndex]) {
    return state;
  }
  const slotPublishedA = [...state.slotPublishedA];
  slotPublishedA[paperIndex] = true;
  return pushLog(
    { ...state, slotPublishedA },
    `槽位 ${paperIndex + 1} 首次发表 A 类，已获得后续升级期刊槽资格。`,
  );
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

  const currentPaper = workingState.papers[paperIndex];
  if (!currentPaper) {
    return pushLog(workingState, "测试触发：论文结果 失败，测试论文未能写入。");
  }

  const resolved = resolvePaperReview(
    { ...currentPaper, reviewMonthsLeft: 0 },
    workingState.player.research,
    workingState.selectedAdvisorId,
  );
  let publicationEffects = {
    nextCitationMultipliers: [...workingState.publicationEffects.nextCitationMultipliers],
    citationPenaltyMultiplier: workingState.publicationEffects.citationPenaltyMultiplier,
  };
  let nextPaper = resolved.nextPaper;

  if (nextPaper.status === "published") {
    const consumed = consumeNextPublicationCitationMultiplier(publicationEffects);
    publicationEffects = consumed.nextState;
    nextPaper = attachPaperPublication(nextPaper, consumed.multiplier);
  }

  const nextPapers = [...workingState.papers];
  nextPapers[paperIndex] = nextPaper;
  let nextState: GameState = {
    ...workingState,
    papers: nextPapers,
    selectedPaperId: nextPaper.id,
    totalResearchScore: workingState.totalResearchScore + resolved.scoreGain,
    publicationEffects,
  };
  nextState = pushLog(nextState, `测试触发：论文结果。${resolved.text}`);
  nextState = maybeMarkDebugSlotPublishedA(nextState, paperIndex);

  const acceptedCandidates = collectConferenceDebugCandidates(nextState).filter((paper) => paper.id === nextPaper.id);
  if (acceptedCandidates.length === 0) {
    return nextState;
  }

  const enqueueResult = enqueuePendingEvents(
    nextState,
    buildConferenceDecisionEventsForAcceptedPapers(acceptedCandidates, buildConferenceDebugState(nextState)),
  );
  if (enqueueResult.queuedEvents.length === 0) {
    return enqueueResult.nextState;
  }
  return pushLog(enqueueResult.nextState, "测试触发：论文结果已补入参会待办。");
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
    case "midterm-message":
      return { nextState: state, event: createMidtermMessageEvent(state) };
    case "ccig":
      return { nextState: state, event: createCcigEvent(state) };
    case "mentor-assign":
      return { nextState: state, event: createMentorAssignEvent(state, Math.random) };
    case "advisor-selection":
      return { nextState: state, event: createAdvisorSelectionAct1Event(state) };
    case "thesis-progress":
      return collectThesisEventForMonth(state);
    case "phd-choice": {
      if (state.pendingDecision) {
        return { nextState: state, event: null };
      }
      const year = state.year >= 3 ? 3 : 2;
      const requiredScore = getPhdDecisionRequirement(state.selectedAdvisorId, year) ?? Math.max(1, state.totalResearchScore);
      return {
        nextState: {
          ...state,
          pendingDecision: createPhdDecision(year, requiredScore),
        },
        event: null,
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
          return createRandomEventById(randomId, state, Math.random);
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

  if (eventId === "phd-choice") {
    return pushLog(built.nextState, `测试触发：${label}。`);
  }

  if (!built.event) {
    return pushLog(built.nextState, `测试触发：${label} 当前状态下无法生成。`);
  }

  const enqueueResult = enqueuePendingEvents(built.nextState, [built.event]);
  if (enqueueResult.queuedEvents.length === 0) {
    return pushLog(enqueueResult.nextState, `测试触发：${label} 已在待办中。`);
  }

  return pushLog(enqueueResult.nextState, `测试触发：${label}。`);
}

export function dispatchDebugAction(
  state: GameState,
  actionId: GameActionId,
  payload: DispatchPayload,
): GameState | null {
  if (state.phase !== "playing") {
    switch (actionId) {
      case "debug-adjust-stat":
      case "debug-shift-month":
      case "debug-trigger-event":
      case "debug-seed-paper":
        return pushLog(state, "开始本轮后才能使用测试工具。");
      default:
        return null;
    }
  }

  switch (actionId) {
    case "debug-adjust-stat":
      if (!payload.debugStatId || typeof payload.delta !== "number" || payload.delta === 0) {
        return state;
      }
      return applyDebugStatChange(state, payload.debugStatId, payload.delta);
    case "debug-shift-month":
      if (typeof payload.delta !== "number" || payload.delta === 0) {
        return state;
      }
      return shiftDebugMonth(state, payload.delta);
    case "debug-trigger-event":
      return payload.eventId ? triggerDebugEvent(state, payload.eventId) : state;
    case "debug-seed-paper":
      return payload.paperTarget ? seedDebugPaper(state, payload.paperTarget) : state;
    default:
      return null;
  }
}
