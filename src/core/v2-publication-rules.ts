import type { Buff, GameState, GrantedPublicationEffect, JournalTarget, Paper, PaperPublicationState, PaperPromotionState } from "./v2-types";
import { getActualSanChange, getSanConsumptionCost } from "./v2-sanity-rules";
import { getJournalRevisionScore } from "./v2-journal-score";

export const HIGHLY_CITED_CITATION_FACTOR = 200;

export function recordPaperAcceptances(papers: readonly Paper[], totalMonths: number, history: readonly Paper[]): Paper[] {
  let order = [...history, ...papers].reduce((highest, paper) => paper.acceptedTotalMonths === totalMonths
    ? Math.max(highest, paper.acceptedOrder ?? 0) : highest, 0);
  const ordered = papers.map((paper, index) => ({ paper, slot: paper.paperSlotIndex ?? index }))
    .sort((left, right) => left.slot - right.slot);
  const recorded = new Map(ordered.map(({ paper }) => [paper.id,
    paper.acceptedTotalMonths !== undefined && paper.acceptedOrder !== undefined
      ? paper : { ...paper, acceptedTotalMonths: totalMonths, acceptedOrder: ++order },
  ]));
  return papers.map((paper) => recorded.get(paper.id)!);
}

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

export function getPaperPromotionCost(promotion: keyof PaperPromotionState, context: readonly Buff[] | Pick<GameState, "buffs" | "month" | "eventSupport"> = []): number {
  if (promotion === "quantum") return 0;
  const cost = promotion === "arxiv" ? 2 : promotion === "github" ? 4 : 3;
  return "buffs" in context
    ? Math.abs(getActualSanChange(-cost, context.month, context.eventSupport, context.buffs))
    : getSanConsumptionCost(cost, context);
}

export function getPaperPromotionMoneyCost(promotion: keyof PaperPromotionState): number {
  return promotion === "quantum" ? 5 : 0;
}

export function getPaperPromotionMultiplierBonus(promotion: keyof PaperPromotionState): number {
  if (promotion === "xiaohongshu" || promotion === "quantum") return 0.25;
  return 0;
}

export function createGrantedPublishedPaper(
  totalMonths: number,
  existingPublicationCount: number,
  grant: GrantedPublicationEffect,
  acceptanceHistory?: readonly Paper[],
): Paper {
  const acceptedScore = Math.max(0, Math.floor(grant.acceptedScore));
  const baseScore = Math.floor(acceptedScore / 3);
  const remainder = acceptedScore - baseScore * 3;
  const idea = baseScore + (remainder > 0 ? 1 : 0);
  const experiment = baseScore + (remainder > 1 ? 1 : 0);
  const writing = baseScore;

  const paper: Paper = {
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
  return acceptanceHistory
    ? recordPaperAcceptances([paper], totalMonths, acceptanceHistory)[0]!
    : { ...paper, acceptedTotalMonths: totalMonths, acceptedOrder: existingPublicationCount + 1 };
}

