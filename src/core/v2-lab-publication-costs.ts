import { getConferenceInfo } from "./v2-conference-catalog";
import { getPaperConferenceTripId } from "./v2-conference-identity";
import { getJournalDefinition } from "./v2-journal-system";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { roundMoney } from "./v2-money";
import { CONFERENCE_REGISTRATION_FEE, JOURNAL_PUBLICATION_FEES } from "./v2-publication-fees";
import { createJournalFeeEvent } from "./v2-journal-fee-events";
import { enqueueEventQueueItem } from "./v2-event-queue";
import type { GameState, Paper } from "./v2-types";

export { CONFERENCE_TRAVEL_FEES, JOURNAL_PUBLICATION_FEES } from "./v2-publication-fees";

function getPublishedPapers(state: GameState): Paper[] {
  return [...new Map([...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .filter((paper) => paper.status === "published").map((paper) => [paper.id, paper])).values()];
}

function hasLabPublicationResponsibility(paper: Paper): boolean {
  if (paper.leadAuthorId?.startsWith("lover")) return false;
  return Boolean(paper.leadAuthorId && paper.leadAuthorId !== "player") || !paper.nonFirstAuthor;
}

function isFellowPaper(paper: Paper): boolean {
  return Boolean(paper.leadAuthorId && paper.leadAuthorId !== "player" && !paper.leadAuthorId.startsWith("lover"));
}

function isConferencePaper(paper: Paper): boolean {
  return hasLabPublicationResponsibility(paper) && Boolean(paper.target)
    && !paper.journalTarget && !paper.publication?.journalTarget
    && paper.submittedMonth != null && paper.submittedYear != null;
}

function recordFellowPublicationCost(state: GameState, fellowId: string | undefined, kind: "registration" | "journal" | "sharedTravel", cost: number): GameState {
  if (!fellowId || cost <= 0 || !state.fellowProgressState.some((profile) => profile.id === fellowId)) return state;
  return { ...state, fellowProgressState: state.fellowProgressState.map((profile) => {
    if (profile.id !== fellowId) return profile;
    const previous = profile.monthlyPublicationCosts?.totalMonths === state.totalMonths ? profile.monthlyPublicationCosts
      : { totalMonths: state.totalMonths, registration: 0, journal: 0, sharedTravel: 0 };
    return { ...profile, monthlyPublicationCosts: { ...previous, [kind]: roundMoney(previous[kind] + cost) } };
  }) };
}

export function settleJournalPublicationFees(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  let nextState = state;
  const paid = new Set(state.advisorProgressState.paidJournalPaperIds ?? []);
  for (const paper of getPublishedPapers(state)) {
    if (nextState.advisorProgressState.funding < 0) break;
    const journal = paper.journalTarget ?? paper.publication?.journalTarget;
    if (!journal || paid.has(paper.id) || !hasLabPublicationResponsibility(paper)) continue;
    if (!isFellowPaper(paper)) {
      if (!nextState.eventQueue.some((event) => event.journalFeePreview?.paperId === paper.id)) {
        const event = createJournalFeeEvent(nextState, paper);
        if (event) nextState = enqueueEventQueueItem(nextState, event);
      }
      continue;
    }
    if (!state.selectedAdvisorName) continue;
    paid.add(paper.id);
    const fee = JOURNAL_PUBLICATION_FEES[journal];
    nextState = pushMilestoneLog({ ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState,
      funding: roundMoney(nextState.advisorProgressState.funding - fee),
      paidJournalPaperIds: [...paid],
    } }, `${paper.leadAuthorName ?? "你"}的《${paper.title}》：${getJournalDefinition(journal).name}版面费，科研经费 -${fee}。`, "journal-fee");
    nextState = recordFellowPublicationCost(nextState, paper.leadAuthorId, "journal", fee);
  }
  return nextState;
}

export function settleConferenceRegistrationFees(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  const paid = new Set(state.advisorProgressState.paidConferenceRegistrationPaperIds ?? []);
  const groups = new Map<string, Paper[]>();
  for (const paper of getPublishedPapers(state)) {
    if (!isConferencePaper(paper) || !isFellowPaper(paper) || paid.has(paper.id)
      || (paper.conferenceAvailableAtTotalMonths ?? Infinity) > state.totalMonths) continue;
    const trip = getPaperConferenceTripId(paper, state.conferenceLocationSeed)!;
    groups.set(trip, [...(groups.get(trip) ?? []), paper]);
  }
  let nextState = state;
  for (const papers of groups.values()) {
    if (nextState.advisorProgressState.funding < 0) break;
    const paper = papers[0]!;
    const venue = getConferenceInfo(paper.submittedMonth!, paper.target!, paper.submittedYear!);
    const fee = papers.length * CONFERENCE_REGISTRATION_FEE;
    for (const entry of papers) paid.add(entry.id);
    nextState = pushMilestoneLog({ ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState,
      funding: roundMoney(nextState.advisorProgressState.funding - fee),
      paidConferenceRegistrationPaperIds: [...paid],
    } }, `${venue.name} ${venue.year}同学论文已安排会外联系人代贴（${papers.length}篇）：科研经费 -${fee}。`, "conference-registration-fee");
    for (const entry of papers) nextState = recordFellowPublicationCost(nextState, entry.leadAuthorId, "registration", CONFERENCE_REGISTRATION_FEE);
  }
  return nextState;
}

export function settleFellowConferenceFees(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = settleConferenceRegistrationFees(state);
  const paid = new Set(state.advisorProgressState.paidFellowConferencePaperIds ?? []);
  const trips = new Set(state.advisorProgressState.paidFellowConferenceTrips ?? []);
  const handled = new Set<string>();
  const groups = new Map<string, Paper[]>();
  for (const paper of getPublishedPapers(nextState)) {
    if (!isConferencePaper(paper) || !paper.leadAuthorId || paper.leadAuthorId === "player"
      || paper.conferenceHandled !== false || paid.has(paper.id)
      || (paper.conferenceAvailableAtTotalMonths ?? Infinity) > state.totalMonths) continue;
    const trip = getPaperConferenceTripId(paper, state.conferenceLocationSeed)!;
    groups.set(trip, [...(groups.get(trip) ?? []), paper]);
  }
  for (const [trip, papers] of groups) {
    if (nextState.advisorProgressState.funding < 0) break;
    trips.add(trip);
    for (const entry of papers) { paid.add(entry.id); handled.add(entry.id); }
    nextState = { ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState,
      paidFellowConferencePaperIds: [...paid], paidFellowConferenceTrips: [...trips],
    } };
  }
  if (!handled.size) return nextState;
  const update = (paper: Paper): Paper => handled.has(paper.id)
    ? { ...paper, conferenceHandled: true, conferenceHandledAtTotalMonths: state.totalMonths } : paper;
  return { ...nextState, papers: nextState.papers.map(update), externalPublications: nextState.externalPublications.map(update),
    fellowPapers: nextState.fellowPapers?.map(update) };
}
