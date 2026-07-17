import {
  ACCEPT_THRESHOLD_BY_TARGET,
  PAPER_SLOT_LIMIT,
  PAPER_SLOT_RESEARCH_THRESHOLDS,
  REVIEW_MONTHS_BY_TARGET,
  SCORE_BY_TARGET,
  SUBMIT_READY_THRESHOLD_BY_TARGET,
} from "./v2-content";
import type { GameState, Paper, PaperTarget } from "./v2-types";

export function getSelectedPaper(state: Pick<GameState, "papers" | "selectedPaperId">, paperId?: string): Paper | null {
  const targetId = paperId ?? state.selectedPaperId;
  return targetId ? state.papers.find((paper) => paper.id === targetId) ?? null : null;
}

export function createDraftPaper(totalMonths: number, existingPaperCount: number): Paper {
  return {
    id: `paper-${totalMonths}-${existingPaperCount + 1}`,
    title: `论文 ${existingPaperCount + 1}`,
    idea: 0,
    experiment: 0,
    writing: 0,
    status: "draft",
    target: null,
    reviewMonthsLeft: 0,
    submittedIdea: null,
    submittedExperiment: null,
    submittedWriting: null,
    submittedMonth: null,
    submittedYear: null,
    conferenceHandled: false,
    publication: null,
  };
}

export function getPaperEffortTotal(paper: Paper): number {
  return paper.idea + paper.experiment + paper.writing;
}

export function getSubmitReadyThreshold(target: PaperTarget): number {
  return SUBMIT_READY_THRESHOLD_BY_TARGET[target];
}

export function markPaperReviewing(paper: Paper, target: PaperTarget, submittedMonth: number, submittedYear: number): Paper {
  return {
    ...paper,
    status: "reviewing",
    target,
    reviewMonthsLeft: REVIEW_MONTHS_BY_TARGET[target],
    submittedIdea: paper.idea,
    submittedExperiment: paper.experiment,
    submittedWriting: paper.writing,
    submittedMonth,
    submittedYear,
    conferenceHandled: false,
  };
}

export function resolvePaperReview(
  paper: Paper,
  playerResearch: number,
): { nextPaper: Paper; scoreGain: number; text: string } {
  if (!paper.target) {
    return { nextPaper: paper, scoreGain: 0, text: `${paper.title} 缺少投稿目标。` };
  }

  const submittedIdea = paper.submittedIdea ?? paper.idea;
  const submittedExperiment = paper.submittedExperiment ?? paper.experiment;
  const submittedWriting = paper.submittedWriting ?? paper.writing;
  const quality = submittedIdea + submittedExperiment + submittedWriting + playerResearch;
  const accepted = quality >= ACCEPT_THRESHOLD_BY_TARGET[paper.target];

  if (accepted) {
    return {
      nextPaper: { ...paper, status: "published", reviewMonthsLeft: 0 },
      scoreGain: SCORE_BY_TARGET[paper.target],
      text: `${paper.title} 被 ${paper.target} 类接收，科研分 +${SCORE_BY_TARGET[paper.target]}。`,
    };
  }

  return {
    nextPaper: {
      ...paper,
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      writing: Math.max(0, paper.writing - 1),
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
      submittedMonth: null,
      submittedYear: null,
      conferenceHandled: false,
    },
    scoreGain: 0,
    text: `${paper.title} 审稿退回，写作 -1，继续修改。`,
  };
}

export function getUnlockedPaperSlotCount(research: number): number {
  const unlockedCount = PAPER_SLOT_RESEARCH_THRESHOLDS.filter((threshold) => research >= threshold).length;
  return Math.min(Math.max(unlockedCount, 1), PAPER_SLOT_LIMIT);
}

export function shouldMarkSlotPublishedA(paper: Paper): boolean {
  return paper.status === "published" && paper.target === "A";
}

export function getReviewMonths(target: PaperTarget): number {
  return REVIEW_MONTHS_BY_TARGET[target];
}
