import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import { getJournalDefinition } from "./v2-journal-system";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { enqueueEventQueueItem } from "./v2-event-queue";
import { createJournalFeeEvent, JOURNAL_PUBLICATION_FEES } from "./v2-journal-fee-events";
import type { GameState, Paper } from "./v2-types";

export { JOURNAL_PUBLICATION_FEES } from "./v2-journal-fee-events";
export const CONFERENCE_TRAVEL_FEES = { domestic: 1, asia: 3, west: 5 } as const;

function getPublishedPapers(state: GameState): Paper[] {
  return [...new Map([...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .filter((paper) => paper.status === "published").map((paper) => [paper.id, paper])).values()];
}

export function settleJournalPublicationFees(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  let nextState = state;
  const paid = new Set(state.advisorProgressState.paidJournalPaperIds ?? []);
  for (const paper of getPublishedPapers(state)) {
    const journal = paper.journalTarget ?? paper.publication?.journalTarget;
    if (!journal || paid.has(paper.id) || paper.leadAuthorId?.startsWith("lover")
      || ((!paper.leadAuthorId || paper.leadAuthorId === "player") && paper.nonFirstAuthor)) continue;
    if (!paper.leadAuthorId || paper.leadAuthorId === "player") {
      const event = createJournalFeeEvent(nextState, paper.id);
      if (event) nextState = enqueueEventQueueItem(nextState, event);
      continue;
    }
    if (!state.selectedAdvisorName) continue;
    paid.add(paper.id);
    const cost = JOURNAL_PUBLICATION_FEES[journal];
    nextState = pushMilestoneLog({ ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState, funding: Math.max(0, nextState.advisorProgressState.funding - cost),
      paidJournalPaperIds: [...paid],
    } }, `${paper.leadAuthorName ?? "你"}发表《${paper.title}》：${getJournalDefinition(journal).name}版面费，科研经费 -${cost}。`, "journal-fee");
  }
  return nextState;
}

export function settleFellowConferenceFees(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = state;
  const paid = new Set(state.advisorProgressState.paidFellowConferencePaperIds ?? []);
  const trips = new Set(state.advisorProgressState.paidFellowConferenceTrips ?? []);
  const handled = new Set<string>();
  for (const paper of getPublishedPapers(state)) {
    if (!paper.leadAuthorId || paper.leadAuthorId.startsWith("lover") || !paper.target
      || paper.journalTarget || paper.publication?.journalTarget || paper.conferenceHandled !== false
      || (paper.conferenceAvailableAtTotalMonths ?? Infinity) > state.totalMonths || paid.has(paper.id)
      || paper.submittedMonth == null || paper.submittedYear == null) continue;
    const venue = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const location = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear, state.conferenceLocationSeed);
    const trip = `${paper.leadAuthorId}:${venue.name}:${venue.year}:${location.city}`;
    const travel = trips.has(trip) ? 0 : CONFERENCE_TRAVEL_FEES[location.region];
    trips.add(trip);
    paid.add(paper.id);
    handled.add(paper.id);
    nextState = pushMilestoneLog({ ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState, funding: Math.max(0, nextState.advisorProgressState.funding - 1 - travel),
      paidFellowConferencePaperIds: [...paid], paidFellowConferenceTrips: [...trips],
    } }, `${paper.leadAuthorName ?? "同学"}参加${venue.name} ${venue.year}：《${paper.title}》注册费1，差旅费${travel}，科研经费 -${1 + travel}。`, "fellow-conference-fee");
  }
  if (!handled.size) return nextState;
  const update = (paper: Paper): Paper => handled.has(paper.id) ? { ...paper, conferenceHandled: true } : paper;
  return { ...nextState, papers: nextState.papers.map(update), externalPublications: nextState.externalPublications.map(update),
    fellowPapers: nextState.fellowPapers?.map(update) };
}

export function getPendingFellowConferenceFees(state: GameState): number {
  const trips = new Set(state.advisorProgressState.paidFellowConferenceTrips ?? []);
  return getPublishedPapers(state).reduce((total, paper) => {
    if (!paper.leadAuthorId || paper.leadAuthorId.startsWith("lover") || !paper.target
      || paper.journalTarget || paper.conferenceHandled !== false || paper.submittedMonth == null || paper.submittedYear == null) return total;
    const venue = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const location = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear, state.conferenceLocationSeed);
    const trip = `${paper.leadAuthorId}:${venue.name}:${venue.year}:${location.city}`;
    const cost = 1 + (trips.has(trip) ? 0 : CONFERENCE_TRAVEL_FEES[location.region]);
    trips.add(trip);
    return total + cost;
  }, 0);
}
