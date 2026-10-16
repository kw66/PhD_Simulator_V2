import { getConferenceInfo } from "./v2-conference-catalog";
import { getJournalScore } from "./v2-journal-system";
import type { GameState, Paper } from "./v2-types";
import { capturePaperDiagnostics, captureResearchContext } from "./v2-paper-diagnostics";

/** Branch-local evidence. Never enqueue it for upload until explicit settlement. */
export interface PendingRunStatistic {
  kind: "conference" | "journal" | "thesis";
  fingerprint: string;
  payload: Record<string, unknown>;
}

export function getStatisticsRunKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

function journalRecord(paper: Paper): Record<string, unknown> | null {
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  const submittedAt = paper.submittedYear && paper.submittedMonth ? (paper.submittedYear - 1) * 12 + paper.submittedMonth : null;
  const acceptedAt = paper.acceptedTotalMonths;
  if (paper.status !== "published" || paper.nonFirstAuthor === true || (paper.leadAuthorId && paper.leadAuthorId !== "player")
    || !journal || submittedAt === null || acceptedAt === undefined || acceptedAt < submittedAt) return null;
  return { p_rule_version: "v2-journal-20261012", p_journal: journal, p_score: getJournalScore(paper), p_months: acceptedAt - submittedAt };
}

/** Called on real game transitions, before persisting current/monthly saves. */
export function collectRunStatistics(before: GameState, after: GameState): GameState {
  if (before === after || before.phase !== "playing" || after.phase === "setup"
    || getStatisticsRunKey(before) !== getStatisticsRunKey(after)) return after;
  let capturedSubmission = false;
  const papers = after.papers.map((paper) => {
    const prior = before.papers.find((entry) => entry.id === paper.id);
    if (!prior || prior.status !== "draft" || !["reviewing", "journal-reviewing"].includes(paper.status)) return paper;
    capturedSubmission = true;
    return { ...paper, researchDiagnostics: { ...paper.researchDiagnostics, submission: captureResearchContext(before) } };
  });
  if (capturedSubmission) after = { ...after, papers };
  const records = [...(after.pendingRunStatistics ?? [])];
  const append = (kind: PendingRunStatistic["kind"], fingerprint: string, payload: Record<string, unknown>): void => {
    if (!records.some((row) => row.kind === kind && row.fingerprint === fingerprint)) records.push({ kind, fingerprint, payload });
  };
  for (const event of before.eventQueue) {
    if (event.source !== "review" || event.stage !== "result" || event.paperReviewPresentation?.kind !== "decision"
      || after.eventQueue.some((remaining) => remaining.id === event.id)) continue;
    const settlement = event.choices.find((choice) => choice.id === "confirm-review-result")?.effects.paperReviewSettlement;
    if (!settlement) continue;
    const paper = before.papers.find((entry) => entry.id === settlement.paperId);
    if (!paper || paper.status !== "reviewing" || paper.journalTarget || !paper.target
      || !paper.submittedMonth || !paper.submittedYear || paper.target !== settlement.target) continue;
    const settled = [...after.papers, ...after.externalPublications].find((entry) => entry.id === paper.id);
    if (!settled || settled.lastReview?.accepted !== settlement.accepted
      || settled.lastReview.totalReviewScore !== settlement.totalReviewScore
      || (settlement.accepted ? settled.status !== "published" || settled.publication?.acceptType !== settlement.acceptType
        : settled.status !== "draft" || settled.rejectionCount !== (paper.rejectionCount ?? 0) + 1)) continue;
    const conference = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    append("conference", JSON.stringify([paper.id, paper.createdTotalMonths, paper.submittedMonth, paper.submittedYear, paper.rejectionCount ?? 0]),
      { p_rule_version: "v2-review-20261009", p_conference_name: conference.name, p_conference_year: conference.year,
        p_target: paper.target, p_accepted: settlement.accepted, p_accept_type: settlement.acceptType, p_score: settlement.submittedScore,
        p_context: capturePaperDiagnostics(before, paper, true) });
  }
  const priorIds = new Set(before.externalPublications.map((paper) => paper.id));
  for (const paper of after.externalPublications) {
    if (priorIds.has(paper.id)) continue;
    const payload = journalRecord(paper);
    if (payload) append("journal", JSON.stringify([paper.id, paper.createdTotalMonths]), { ...payload, p_context: capturePaperDiagnostics(before, paper) });
  }
  if (!before.thesis.reviewResolved && after.thesis.reviewResolved) {
    const event = before.eventQueue.find((entry) => entry.source === "thesis" && entry.stage === "result"
      && entry.thesisReviewPresentation?.stage === "decision");
    const review = event?.thesisReviewPresentation?.review;
    if (event && review && !after.eventQueue.some((entry) => entry.id === event.id)
      && after.thesis.review?.degree === review.degree && after.thesis.review?.submitted === review.submitted
      && after.thesis.review?.passed === review.passed && after.thesis.review?.excellent === review.excellent) {
      append("thesis", review.degree, { p_rule_version: "v2-thesis-20261013", p_degree: review.degree,
        p_submitted: review.submitted, p_passed: review.passed, p_excellent: review.excellent });
    }
  }
  return records.length === (after.pendingRunStatistics?.length ?? 0) ? after : { ...after, pendingRunStatistics: records };
}
