import { buildConferenceDecisionEventsForAcceptedPapers } from "./v2-conference-events";
import { getPublishedPaperCount, pushLog } from "./v2-engine-helpers";
import { enqueueEventQueueItem } from "./v2-event-queue";
import { shouldMarkSlotPublishedA } from "./v2-paper-rules";
import { unlockMentoringRandomEvent } from "./v2-random-event-rules";
import type { AcceptedConferencePaper } from "./v2-engine-monthly-academic";
import type { GameState, Paper } from "./v2-types";

function maybeMarkSlotPublishedA(state: GameState, paper: Paper, slotIndex: number): GameState {
  if (!shouldMarkSlotPublishedA(paper)) return state;
  if (state.slotPublishedA[slotIndex]) return state;

  const slotPublishedA = [...state.slotPublishedA];
  slotPublishedA[slotIndex] = true;
  return pushLog(
    { ...state, slotPublishedA },
    `槽位 ${slotIndex + 1} 首次发表 A 类，已获得后续升级期刊槽资格。`,
  );
}

export function applyMonthPostAcademicEvents(
  state: GameState,
  nextPapers: GameState["papers"],
  acceptedConferencePapers: AcceptedConferencePaper[],
  publishedPaperCountBeforeAdvance: number,
): GameState {
  let nextState = state;

  nextPapers.forEach((paper, slotIndex) => {
    nextState = maybeMarkSlotPublishedA(nextState, paper, slotIndex);
  });

  for (const event of buildConferenceDecisionEventsForAcceptedPapers(acceptedConferencePapers, {
    favor: nextState.player.favor,
    research: nextState.player.research,
    social: nextState.player.social,
    shopState: nextState.shopState,
    eventSupport: nextState.eventSupport,
    eventCounters: nextState.eventCounters,
    relationshipState: nextState.relationshipState,
    conferenceEncounterState: nextState.conferenceEncounterState,
    conferenceCareerState: nextState.conferenceCareerState,
    internshipState: nextState.internshipState,
    loverState: nextState.loverState,
  })) {
    nextState = enqueueEventQueueItem(nextState, event);
    nextState = pushLog(nextState, `触发事件：${event.title}`);
  }

  const publishedPaperCountAfterAdvance = getPublishedPaperCount(nextPapers);
  const unlockedRandomEventState = publishedPaperCountBeforeAdvance === 0 && publishedPaperCountAfterAdvance > 0
    ? unlockMentoringRandomEvent(nextState)
    : nextState;
  if (!nextState.availableRandomEvents.includes(14) && unlockedRandomEventState.availableRandomEvents.includes(14)) {
    nextState = pushLog(
      { ...nextState, ...unlockedRandomEventState },
      "首次发表论文，已解锁随机事件 14（指导师弟 / 师妹）。",
    );
  }

  return nextState;
}

export function appendMonthAdvanceLogs(
  state: GameState,
  reviewLogs: string[],
  shopLogs: string[],
  coffeeLogs: string[],
  readingLogs: string[],
): GameState {
  let nextState = pushLog(state, `进入第 ${state.year} 年 ${state.month} 月。`);
  for (const line of reviewLogs) {
    nextState = pushLog(nextState, line);
  }
  for (const line of shopLogs) {
    nextState = pushLog(nextState, line);
  }
  for (const line of coffeeLogs) {
    nextState = pushLog(nextState, line);
  }
  for (const line of readingLogs) {
    nextState = pushLog(nextState, line);
  }
  return nextState;
}
