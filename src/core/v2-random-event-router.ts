import { createCampusRandomEventById } from "./v2-random-events-campus";
import { createCoreProgressRandomEventById } from "./v2-random-events-core-progress";
import { createAdvisorLabRandomEventById } from "./v2-random-events-lab-advisor";
import { createMentoringLabRandomEventById } from "./v2-random-events-lab-mentoring";
import { createRelationshipRandomEventById } from "./v2-random-events-relationships";
import { isPaperCompetitionEventId } from "./v2-paper-competition";
import { createPaperCompetitionRandomEvent } from "./v2-random-events-paper-competition";
import { createRandomEventSkeleton, hasRecoverableDraftPaper } from "./v2-random-events-core-shared";
import { getPublishedPaperCount } from "./v2-publication-rules";
import { getPaperCompetitionCandidates } from "./v2-paper-competition";
import { LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD } from "./v2-lab-projects";
import type { RandomRollProvider } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

function appendFellowCapacityHint(event: PendingEvent): PendingEvent {
  const hint = "小提示：可先关闭事件，去人际栏停止合作腾出位置，再回来确认；结果会按当前空位更新。";
  const full = (event.stage === "act2" || event.stage === "result")
    && (event.description.includes("人际栏已满")
      || event.choices.some((choice) => choice.outcome.includes("条件：人际栏已满")));
  const description = !full ? event.description
    : event.description.includes("机制结算")
      ? event.description.replace("机制结算", `${hint}\n\n机制结算`)
      : `${event.description}\n\n${hint}`;
  return {
    ...event,
    description,
    choices: event.choices.map((choice) => choice.effects.enqueueEvents ? {
      ...choice,
      effects: { ...choice.effects, enqueueEvents: choice.effects.enqueueEvents.map(appendFellowCapacityHint) },
    } : choice),
  };
}

function appendRandomEventAppearanceCondition(
  eventId: number,
  event: PendingEvent,
): PendingEvent {
  if (eventId === 10 || eventId === 11 || eventId === 14) event = appendFellowCapacityHint(event);
  const condition = getRandomEventAppearanceCondition(eventId);
  if (!condition || event.stage !== "act1" || /(?:备注|小提示)：出现条件：/u.test(event.description)) {
    return event;
  }

  return {
    ...event,
    description: `${event.description}\n\n备注：出现条件：${condition}`,
  };
}

export function getRandomEventAppearanceCondition(eventId: number): string | null {
  switch (eventId) {
    case 8:
      return "科研经费 > 20";
    case 10:
      return "社交能力 ≥ 6";
    case 11:
      return "科研能力 ≥ 6";
    case 12:
    case 16:
      return "存在分数非 0 且未投稿的论文";
    case 14:
      return "已发表至少 1 篇一作论文";
    case 17:
      return "存在一作论文，且 idea 分数 > 0（草稿或审稿中）";
    case 18:
      return "存在一作论文，且实验分数 > 0（草稿或审稿中）";
    default:
      return null;
  }
}

export function createRandomEventById(
  eventId: number,
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent | null } {
  if (isPaperCompetitionEventId(eventId)) {
    const event = createPaperCompetitionRandomEvent(eventId, state, getRoll);
    return { nextState: state, event: event ? appendRandomEventAppearanceCondition(eventId, event) : null };
  }

  // Each category module maps its own event ids; ids never overlap.
  const categorizedEvent = createMentoringLabRandomEventById(eventId, state, getRoll)
    ?? createAdvisorLabRandomEventById(eventId, state, getRoll)
    ?? createRelationshipRandomEventById(eventId, state, getRoll)
    ?? createCampusRandomEventById(eventId, state, getRoll);
  if (categorizedEvent) {
    return { nextState: state, event: appendRandomEventAppearanceCondition(eventId, categorizedEvent) };
  }

  const progressEvent = createCoreProgressRandomEventById(eventId, state, getRoll);
  if (progressEvent) {
    return {
      nextState: progressEvent.nextState,
      event: progressEvent.event
        ? appendRandomEventAppearanceCondition(eventId, progressEvent.event)
        : null,
    };
  }

  return { nextState: state, event: createRandomEventSkeleton(eventId, state) };
}

export function isRandomEventEligible(state: GameState, eventId: number): boolean {
  switch (eventId) {
    case 8:
      return state.advisorProgressState.funding > LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD;
    case 10:
      return state.player.social >= 6;
    case 11:
      return state.player.research >= 6;
    case 12:
      return state.papers.some((paper) => paper.status === "draft" && paper.idea + paper.experiment + paper.writing > 0);
    case 14:
      return getPublishedPaperCount(state) > 0;
    case 16:
      return hasRecoverableDraftPaper(state);
    case 17:
    case 18:
      return getPaperCompetitionCandidates(state, eventId).length > 0;
    default:
      return true;
  }
}
