import { getConferenceInfo } from "./v2-conference-catalog";
import { getPaperConferenceTripId } from "./v2-conference-identity";
import { getJournalDefinition } from "./v2-journal-system";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { roundMoney } from "./v2-money";
import { recordLabFinance } from "./v2-lab-finance-ledger";
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

export function getConferenceRegistrationFee(paper: Paper): number {
  return isConferencePaper(paper) ? CONFERENCE_REGISTRATION_FEE : 0;
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
    nextState = recordLabFinance(nextState, "journal-fee", -fee);
    nextState = recordFellowPublicationCost(nextState, paper.leadAuthorId, "journal", fee);
  }
  return nextState;
}

function resolveConferenceRegistrationFees(state: GameState, paperIds: readonly string[] | undefined, recordLogs: boolean): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  const paid = new Set(state.advisorProgressState.paidConferenceRegistrationPaperIds ?? []);
  const selected = paperIds ? new Set(paperIds) : null;
  let nextState = state;
  for (const paper of getPublishedPapers(state)) {
    if (paid.has(paper.id) || (selected && !selected.has(paper.id))) continue;
    const fee = getConferenceRegistrationFee(paper);
    if (fee === 0) continue;
    const venue = getConferenceInfo(paper.submittedMonth!, paper.target!, paper.submittedYear!);
    paid.add(paper.id);
    nextState = { ...nextState, advisorProgressState: {
      ...nextState.advisorProgressState,
      funding: roundMoney(nextState.advisorProgressState.funding - fee),
      paidConferenceRegistrationPaperIds: [...paid],
    } };
    nextState = recordLabFinance(nextState, "conference-registration", -fee);
    if (recordLogs) nextState = pushMilestoneLog(nextState,
      `${paper.leadAuthorName ?? "你"}的《${paper.title}》：${venue.name} ${venue.year}录用注册费，科研经费 -${fee}（导师已支付）。`, "conference-registration-fee");
    if (isFellowPaper(paper)) nextState = recordFellowPublicationCost(nextState, paper.leadAuthorId, "registration", fee);
  }
  return nextState;
}

export function projectConferenceRegistrationFees(state: GameState, paperIds?: readonly string[]): GameState {
  return resolveConferenceRegistrationFees(state, paperIds, false);
}

export function settleConferenceRegistrationFees(state: GameState, paperIds?: readonly string[]): GameState {
  return resolveConferenceRegistrationFees(state, paperIds, true);
}

export function settleFellowConferenceFees(state: GameState): GameState {
  if (state.phase !== "playing" || !state.selectedAdvisorName) return state;
  let nextState = state;
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
