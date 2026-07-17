import {
  tickAdvisorProgressForMonth,
} from "./v2-advisor-progress";
import {
  tickFellowProgressForMonth,
} from "./v2-fellow-progression";
import { applyLabTalentGrowth } from "./v2-lab-talent";
import {
  cloneAdvisorProgressState,
  cloneFellowProgressState,
  cloneJointTrainingState,
  cloneLoverProgressState,
} from "./v2-engine-helpers";
import {
  resolvePaperReview,
} from "./v2-paper-rules";
import {
  advancePublishedPaperCitations,
  attachPaperPublication,
  consumeNextPublicationCitationMultiplier,
} from "./v2-publication-rules";
import {
  reconcileJointTrainingCitationBonus,
} from "./v2-joint-training-system";
import {
  clampResearchToCap,
} from "./v2-research-cap-system";
import {
  tickLoverProgressForMonth,
} from "./v2-lover-progression";
import type {
  GameState,
  PaperTarget,
} from "./v2-types";

export interface AcceptedConferencePaper {
  id: string;
  target: PaperTarget;
  submittedMonth: number;
  submittedYear: number;
}

export interface MonthlyAcademicProgressResult {
  totalResearchScore: number;
  totalCitations: number;
  publicationEffects: GameState["publicationEffects"];
  nextPapers: GameState["papers"];
  nextExternalPublications: GameState["externalPublications"];
  acceptedConferencePapers: AcceptedConferencePaper[];
  researchCapacityState: GameState["researchCapacityState"];
  advisorProgressState: GameState["advisorProgressState"];
  loverProgressState: GameState["loverProgressState"];
  fellowProgressState: GameState["fellowProgressState"];
  jointTrainingState: GameState["jointTrainingState"];
  reviewLogs: string[];
}

export function resolveMonthlyAcademicProgress(params: {
  state: GameState;
  nextTotalMonths: number;
  nextPlayer: GameState["player"];
  relationshipState: GameState["relationshipState"];
  loverState: GameState["loverState"];
  researchCapacityState: GameState["researchCapacityState"];
  totalResearchScore: number;
  totalCitations: number;
  publicationEffects: GameState["publicationEffects"];
  reviewLogsStart: string[];
  monthlyRelationshipEffects: {
    sanDelta: number;
    citationDelta: number;
  };
}): MonthlyAcademicProgressResult {
  let totalResearchScore = params.totalResearchScore;
  let totalCitations = params.totalCitations;
  let publicationEffects: GameState["publicationEffects"] = {
    ...params.publicationEffects,
    nextCitationMultipliers: [...params.publicationEffects.nextCitationMultipliers],
  };
  let researchCapacityState = { ...params.researchCapacityState };
  let advisorProgressState = cloneAdvisorProgressState(params.state);
  let loverProgressState = cloneLoverProgressState(params.state);
  let fellowProgressState = cloneFellowProgressState(params.state);
  let jointTrainingState = cloneJointTrainingState(params.state);
  const acceptedConferencePapers: AcceptedConferencePaper[] = [];
  const reviewLogs = [...params.reviewLogsStart];

  let publicationCitationGain = 0;
  const citationAdvancedPapers = params.state.papers.map((paper) => {
    const resolvedCitation = advancePublishedPaperCitations(paper, publicationEffects.citationPenaltyMultiplier);
    totalCitations += resolvedCitation.citationGain;
    publicationCitationGain += resolvedCitation.citationGain;
    return resolvedCitation.nextPaper;
  });
  const nextExternalPublications = params.state.externalPublications.map((paper) => {
    const resolvedCitation = advancePublishedPaperCitations(paper, publicationEffects.citationPenaltyMultiplier);
    totalCitations += resolvedCitation.citationGain;
    publicationCitationGain += resolvedCitation.citationGain;
    return resolvedCitation.nextPaper;
  });

  const jointTrainingCitationSync = reconcileJointTrainingCitationBonus({
    active: params.state.conferenceEncounterState.bigBullCooperation,
    totalCitations,
    hasPublicationCitationGain: publicationCitationGain > 0,
    jointTrainingState,
    researchCapacityState,
  });
  jointTrainingState = jointTrainingCitationSync.jointTrainingState;
  researchCapacityState = jointTrainingCitationSync.researchCapacityState;
  params.nextPlayer.research = clampResearchToCap(params.nextPlayer.research, researchCapacityState);

  advisorProgressState = tickAdvisorProgressForMonth(advisorProgressState, params.nextPlayer.favor);
  loverProgressState = tickLoverProgressForMonth(loverProgressState);
  fellowProgressState = tickFellowProgressForMonth(fellowProgressState, params.nextPlayer.social);
  const labTalentGrowth = applyLabTalentGrowth({
    totalMonths: params.nextTotalMonths,
    playerResearch: params.nextPlayer.research,
    relationshipState: params.relationshipState,
    advisorProgressState,
    fellowProgressState,
    loverProgressState,
    loverState: params.loverState,
  });
  fellowProgressState = labTalentGrowth.fellowProgressState;
  loverProgressState = labTalentGrowth.loverProgressState;

  reviewLogs.push(...jointTrainingCitationSync.logs);
  reviewLogs.push(...labTalentGrowth.logs);
  if (params.relationshipState.mentorshipStacks > 0) {
    reviewLogs.push(`导师提携生效：SAN ${params.monthlyRelationshipEffects.sanDelta}，额外引用 +${params.monthlyRelationshipEffects.citationDelta}。`);
  }

  const nextPapers = citationAdvancedPapers.map((paper) => {
    if (paper.status !== "reviewing") return paper;

    const monthsLeft = paper.reviewMonthsLeft - 1;
    if (monthsLeft > 0) {
      reviewLogs.push(`${paper.title} 审稿中，还剩 ${monthsLeft} 个月。`);
      return { ...paper, reviewMonthsLeft: monthsLeft };
    }

    const resolved = resolvePaperReview({ ...paper, reviewMonthsLeft: 0 }, params.nextPlayer.research);
    totalResearchScore += resolved.scoreGain;
    reviewLogs.push(resolved.text);

    if (resolved.nextPaper.status !== "published") {
      return resolved.nextPaper;
    }

    const consumedCitationEffect = consumeNextPublicationCitationMultiplier(publicationEffects);
    publicationEffects = consumedCitationEffect.nextState;
    const publishedPaper = attachPaperPublication(resolved.nextPaper, consumedCitationEffect.multiplier);
    if (
      publishedPaper.target
      && typeof publishedPaper.submittedMonth === "number"
      && typeof publishedPaper.submittedYear === "number"
      && publishedPaper.conferenceHandled !== true
    ) {
      acceptedConferencePapers.push({
        id: publishedPaper.id,
        target: publishedPaper.target,
        submittedMonth: publishedPaper.submittedMonth,
        submittedYear: publishedPaper.submittedYear,
      });
    }
    return publishedPaper;
  });

  return {
    totalResearchScore,
    totalCitations,
    publicationEffects,
    nextPapers,
    nextExternalPublications,
    acceptedConferencePapers,
    researchCapacityState,
    advisorProgressState,
    loverProgressState,
    fellowProgressState,
    jointTrainingState,
    reviewLogs,
  };
}
