import type { GrantedPublicationEffect, Paper, PaperPublicationState, PublicationEffectsState } from "./v2-types";

export function createPublicationEffectsState(): PublicationEffectsState {
  return {
    nextCitationMultipliers: [],
    citationPenaltyMultiplier: 1,
  };
}

export function queueNextPublicationCitationMultiplier(
  current: PublicationEffectsState,
  multiplier?: number,
): PublicationEffectsState {
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) {
    return {
      nextCitationMultipliers: [...current.nextCitationMultipliers],
      citationPenaltyMultiplier: current.citationPenaltyMultiplier,
    };
  }

  return {
    nextCitationMultipliers: [...current.nextCitationMultipliers, multiplier],
    citationPenaltyMultiplier: current.citationPenaltyMultiplier,
  };
}

export function applyPublicationPenaltyMultiplier(
  current: PublicationEffectsState,
  multiplier?: number,
): PublicationEffectsState {
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier <= 0 || multiplier === 1) {
    return {
      nextCitationMultipliers: [...current.nextCitationMultipliers],
      citationPenaltyMultiplier: current.citationPenaltyMultiplier,
    };
  }

  return {
    nextCitationMultipliers: [...current.nextCitationMultipliers],
    citationPenaltyMultiplier: Math.max(0, current.citationPenaltyMultiplier * multiplier),
  };
}

export function consumeNextPublicationCitationMultiplier(
  current: PublicationEffectsState,
): { nextState: PublicationEffectsState; multiplier: number } {
  const [firstMultiplier, ...remainingMultipliers] = current.nextCitationMultipliers;
  return {
    nextState: {
      nextCitationMultipliers: remainingMultipliers,
      citationPenaltyMultiplier: current.citationPenaltyMultiplier,
    },
    multiplier: typeof firstMultiplier === "number" && Number.isFinite(firstMultiplier) && firstMultiplier > 0 ? firstMultiplier : 1,
  };
}

export function getAcceptedPaperScore(paper: Pick<Paper, "idea" | "experiment" | "writing" | "submittedIdea" | "submittedExperiment" | "submittedWriting">): number {
  const idea = paper.submittedIdea ?? paper.idea;
  const experiment = paper.submittedExperiment ?? paper.experiment;
  const writing = paper.submittedWriting ?? paper.writing;
  return idea + experiment + writing;
}

export function createPaperPublicationState(acceptedScore: number, citationMultiplier = 1): PaperPublicationState {
  return {
    citations: 0,
    monthsSincePublication: 0,
    pendingCitationFraction: 0,
    effectiveScore: Math.max(0, acceptedScore),
    citationMultiplier: Number.isFinite(citationMultiplier) && citationMultiplier > 0 ? citationMultiplier : 1,
  };
}

export function attachPaperPublication(paper: Paper, citationMultiplier = 1): Paper {
  return {
    ...paper,
    publication: createPaperPublicationState(getAcceptedPaperScore(paper), citationMultiplier),
  };
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
    idea,
    experiment,
    writing,
    status: "published",
    target: grant.target,
    reviewMonthsLeft: 0,
    submittedIdea: idea,
    submittedExperiment: experiment,
    submittedWriting: writing,
    publication: createPaperPublicationState(acceptedScore, grant.citationMultiplier),
  };
}

function getSafePublicationState(paper: Paper): PaperPublicationState {
  const currentPublication = paper.publication;
  if (!currentPublication) {
    return createPaperPublicationState(getAcceptedPaperScore(paper));
  }

  return {
    citations: typeof currentPublication.citations === "number" ? currentPublication.citations : 0,
    monthsSincePublication: typeof currentPublication.monthsSincePublication === "number" ? currentPublication.monthsSincePublication : 0,
    pendingCitationFraction: typeof currentPublication.pendingCitationFraction === "number" ? currentPublication.pendingCitationFraction : 0,
    effectiveScore: typeof currentPublication.effectiveScore === "number" ? currentPublication.effectiveScore : 0,
    citationMultiplier: typeof currentPublication.citationMultiplier === "number" && currentPublication.citationMultiplier > 0 ? currentPublication.citationMultiplier : 1,
  };
}

export function advancePublishedPaperCitations(
  paper: Paper,
  citationPenaltyMultiplier = 1,
): { nextPaper: Paper; citationGain: number } {
  if (paper.status !== "published") {
    return { nextPaper: paper, citationGain: 0 };
  }

  const publication = getSafePublicationState(paper);
  const nextMonthsSincePublication = publication.monthsSincePublication + 1;
  const decay = Math.ceil(publication.effectiveScore * 0.05);
  const nextEffectiveScore = Math.max(0, publication.effectiveScore - decay);
  const totalGrowth = nextEffectiveScore * 0.1 * publication.citationMultiplier * Math.max(0, citationPenaltyMultiplier) + publication.pendingCitationFraction;
  const citationGain = Math.floor(totalGrowth);

  return {
    nextPaper: {
      ...paper,
      publication: {
        citations: publication.citations + citationGain,
        monthsSincePublication: nextMonthsSincePublication,
        pendingCitationFraction: totalGrowth - citationGain,
        effectiveScore: nextEffectiveScore,
        citationMultiplier: publication.citationMultiplier,
      },
    },
    citationGain,
  };
}
