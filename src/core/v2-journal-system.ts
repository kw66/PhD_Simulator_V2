import { consumeNextPublicationBuffs, getPublicationBuffEffect } from "./v2-buffs";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { attachPaperPublication } from "./v2-publication-rules";
import { getInitialJournalScore, getJournalRevisionScore } from "./v2-journal-score";
import type { GameState, JournalTarget, Paper } from "./v2-types";

export { getJournalRevisionScore } from "./v2-journal-score";

export interface JournalDefinition {
  id: JournalTarget;
  name: string;
  submissionScore: number;
  acceptanceScore: number;
  /** Fixed factor used in the venue-influence zone. */
  citationInfluence: number;
}

export const JOURNAL_DEFINITIONS: Readonly<Record<JournalTarget, JournalDefinition>> = {
  nature: {
    id: "nature",
    name: "Nature",
    submissionScore: 150,
    acceptanceScore: 500,
    citationInfluence: 0.5,
  },
  nmi: {
    id: "nmi",
    name: "子刊NMI",
    submissionScore: 100,
    acceptanceScore: 250,
    citationInfluence: 0.5,
  },
  pami: {
    id: "pami",
    name: "顶刊PAMI",
    submissionScore: 75,
    acceptanceScore: 125,
    citationInfluence: 0.5,
  },
};

export function getJournalDefinition(target: JournalTarget): JournalDefinition {
  return JOURNAL_DEFINITIONS[target];
}

export function getJournalScore(paper: Pick<Paper, "idea" | "experiment" | "writing">): number {
  return getInitialJournalScore(paper);
}

export function getJournalSubmissionFailure(
  paper: Paper | null | undefined,
  journalTarget: JournalTarget,
): string | null {
  if (!paper) return "请先新建一篇论文";
  if (paper.status !== "draft") return paper.status === "journal-reviewing" ? "论文正在期刊修改中" : "这篇论文当前不能投稿";
  const journal = getJournalDefinition(journalTarget);
  const score = getJournalScore(paper);
  return score >= journal.submissionScore ? null : `期刊分不足，需要 ${journal.submissionScore}`;
}

function isJournalEditable(paper: Paper): boolean {
  return paper.status === "draft" || paper.status === "journal-reviewing";
}

function selectNextEditablePaper(state: GameState, papers: readonly Paper[]): string | null {
  const selected = papers.find((paper) => paper.id === state.selectedPaperId && isJournalEditable(paper));
  return selected?.id ?? papers.find(isJournalEditable)?.id ?? null;
}

export function submitJournalPaper(
  state: GameState,
  paperId: string,
  journalTarget: JournalTarget,
): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  const paper = paperIndex >= 0 ? state.papers[paperIndex] : null;
  if (!paper) return pushNoOpLog(state, "投稿期刊：没有找到这篇论文");
  if (paper.status !== "draft") return pushNoOpLog(state, "投稿期刊：这篇论文当前不能投稿");

  const journal = getJournalDefinition(journalTarget);
  const score = getJournalScore(paper);
  if (score < journal.submissionScore) {
    return pushNoOpLog(state, `投稿期刊：${journal.name}需要期刊分达到 ${journal.submissionScore}，当前 ${score}`);
  }

  const submittedPaper: Paper = {
    ...paper,
    status: "journal-reviewing",
    target: null,
    journalTarget,
    reviewMonthsLeft: 0,
    submittedIdea: paper.idea,
    submittedExperiment: paper.experiment,
    submittedWriting: paper.writing,
    submittedMonth: state.month,
    submittedYear: state.year,
    conferenceHandled: false,
    publication: null,
    lastReview: null,
  };
  const papers = [...state.papers];
  papers[paperIndex] = submittedPaper;
  const nextState = pushLog(
    { ...state, papers, selectedPaperId: paper.id },
    `投稿期刊：${paper.title} 已送审${journal.name}，当前期刊分 ${score}，达到 ${journal.submissionScore} 分送审线后进入持续修改`,
  );
  return resolveReadyJournalPapers(nextState).state;
}

export interface JournalResolution {
  state: GameState;
  logs: string[];
  acceptedPaperIds: string[];
}

export function resolveReadyJournalPapers(state: GameState): JournalResolution {
  if (state.phase !== "playing") return { state, logs: [], acceptedPaperIds: [] };

  let nextState = { ...state, buffs: [...state.buffs] };
  const logs: string[] = [];
  const acceptedPaperIds: string[] = [];
  const activePapers: Paper[] = [];
  const publishedPapers = [...state.externalPublications];

  for (const paper of state.papers) {
    if (paper.status !== "journal-reviewing" || !paper.journalTarget) {
      activePapers.push(paper);
      continue;
    }

    const journal = getJournalDefinition(paper.journalTarget);
    const score = getJournalRevisionScore(paper);
    if (score < journal.acceptanceScore) {
      activePapers.push(paper);
      continue;
    }

    const publicationEffect = getPublicationBuffEffect(nextState.buffs);
    const citationPenaltyMultiplier = paper.citationDebuffMultiplierOnPublish ?? 1;
    const promotionMultiplier = publicationEffect.nextPromotionMultiplier;
    const acceptedPaper = {
      ...paper,
      status: "published" as const,
      reviewMonthsLeft: 0,
    };
    const publishedPaper = attachPaperPublication(
      acceptedPaper,
      citationPenaltyMultiplier,
      undefined,
      journal.citationInfluence,
      promotionMultiplier,
    );
    if (publishedPaper.publication) {
      publishedPaper.publication.journalTarget = journal.id;
    }
    publishedPapers.push(publishedPaper);
    nextState = consumeNextPublicationBuffs(nextState);
    acceptedPaperIds.push(paper.id);
    logs.push(`${paper.title} 已达到${journal.name}达标分 ${journal.acceptanceScore}，正式发表`);
  }

  const resolvedState = {
    ...nextState,
    papers: activePapers,
    externalPublications: publishedPapers,
    selectedPaperId: selectNextEditablePaper(state, activePapers),
  };
  let loggedState = resolvedState;
  for (const log of logs) loggedState = pushLog(loggedState, `期刊结果：${log}`);
  return { state: loggedState, logs, acceptedPaperIds };
}
