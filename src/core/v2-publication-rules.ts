import type { GrantedPublicationEffect, JournalTarget, Paper, PaperPublicationState, PaperPromotionState } from "./v2-types";
import { getJournalRevisionScore } from "./v2-journal-score";

export const HIGHLY_CITED_CITATION_FACTOR = 200;

export function getHighlyCitedThreshold(heatMultiplier: number): number {
  return Math.ceil(Math.max(0, heatMultiplier) * HIGHLY_CITED_CITATION_FACTOR);
}

export function getAcceptedPaperScore(paper: Pick<Paper, "idea" | "experiment" | "writing" | "submittedIdea" | "submittedExperiment" | "submittedWriting"> & { journalTarget?: JournalTarget | null }): number {
  if (paper.journalTarget) {
    return getJournalRevisionScore(paper);
  }
  const idea = paper.submittedIdea ?? paper.idea;
  const experiment = paper.submittedExperiment ?? paper.experiment;
  const writing = paper.submittedWriting ?? paper.writing;
  return idea + experiment + writing;
}

function createPaperPublicationState(
  acceptedScore: number,
  citationPenaltyMultiplier = 1,
  influence?: number,
  promotionMultiplier = 1,
  heatMultiplier = 1,
): PaperPublicationState {
  return {
    citations: 0,
    effectiveScore: Math.max(0, acceptedScore),
    citationDebuffMultiplier: Number.isFinite(citationPenaltyMultiplier) && citationPenaltyMultiplier >= 0 ? citationPenaltyMultiplier : 1,
    promotionMultiplier: Number.isFinite(promotionMultiplier) && promotionMultiplier >= 0 ? promotionMultiplier : 1,
    highlyCitedThreshold: getHighlyCitedThreshold(heatMultiplier),
    ...(Number.isFinite(influence) && (influence ?? 0) >= 0 ? { influence } : {}),
  };
}

export function attachPaperPublication(
  paper: Paper,
  citationPenaltyMultiplier = 1,
  acceptType?: PaperPublicationState["acceptType"],
  influence?: number,
  promotionMultiplier = 1,
): Paper {
  return {
    ...paper,
    publication: {
      ...createPaperPublicationState(getAcceptedPaperScore(paper), citationPenaltyMultiplier, influence, promotionMultiplier, paper.heatMultiplier),
      ...(paper.journalTarget ? { journalTarget: paper.journalTarget } : {}),
      ...(acceptType ? { acceptType } : {}),
    },
  };
}

export function getPaperPromotionCost(promotion: keyof PaperPromotionState): number {
  if (promotion === "arxiv") return 2;
  if (promotion === "github") return 4;
  return 3;
}

export function getPaperPromotionMultiplierBonus(promotion: keyof PaperPromotionState): number {
  if (promotion === "xiaohongshu") return 0.25;
  return 0;
}

export function createGrantedPublishedPaper(
  totalMonths: number,
  existingPublicationCount: number,
  grant: GrantedPublicationEffect,
): Paper {
  const acceptedScore = Math.max(0, Math.floor(grant.acceptedScore));
  const baseScore = Math.floor(acceptedScore / 3);
  const remainder = acceptedScore - baseScore * 3;
  const idea = baseScore + (remainder > 0 ? 1 : 0);
  const experiment = baseScore + (remainder > 1 ? 1 : 0);
  const writing = baseScore;

  return {
    id: `granted-paper-${totalMonths}-${existingPublicationCount + 1}`,
    title: grant.title?.trim() || `赠送论文 ${existingPublicationCount + 1}`,
    topicId: "collaboration",
    topicLabel: "合作研究",
    heatMultiplier: 1,
    prepublicationDecayRate: 0.1,
    idea,
    experiment,
    writing,
    status: "published",
    target: grant.target,
    reviewMonthsLeft: 0,
    submittedIdea: idea,
    submittedExperiment: experiment,
    submittedWriting: writing,
    publication: createPaperPublicationState(acceptedScore, grant.citationDebuffMultiplier),
    nonFirstAuthor: grant.nonFirstAuthor === true,
    ...(grant.leadAuthorName?.trim() ? { leadAuthorName: grant.leadAuthorName.trim() } : {}),
  };
}

