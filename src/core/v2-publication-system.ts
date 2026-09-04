import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { combineEffectMultipliers } from "./v2-numeric-modifiers";
import {
  consumeNextPublicationBuffs,
  getPublicationBuffEffect,
} from "./v2-buffs";
import { getReviewStrictnessMultiplier, resolvePaperReview } from "./v2-paper-rules";
import { attachPaperPublication } from "./v2-publication-rules";
import { enqueueEventQueueItem } from "./v2-event-queue";
import type { GameState, Paper, PaperAcceptType, PaperReviewSettlement, PaperTarget, PendingEvent } from "./v2-types";
import { applyTierResist } from "./v2-sanity-rules";
import { getJournalDefinition } from "./v2-journal-system";

const DEFAULT_TARGET_INFLUENCE: Record<PaperTarget, number> = { A: 1.1, B: 0.6, C: 0.3 };
export const CITATION_SETTLEMENT_INTERVAL_MONTHS = 1;
export const CITATION_BASE_RATE = 0.05;
export const PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS = 4;
export const PUBLISHED_SCORE_DECAY_RATE = 0.1;

function getPaperVenueInfluence(paper: Paper): number {
  const journalTarget = paper.journalTarget ?? paper.publication?.journalTarget;
  if (journalTarget) return getJournalDefinition(journalTarget).citationInfluence;
  if (
    paper.target
    && typeof paper.submittedMonth === "number"
    && paper.submittedMonth >= 1
    && typeof paper.submittedYear === "number"
    && paper.submittedYear >= 1
  ) {
    return getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear).influence;
  }
  return paper.target ? DEFAULT_TARGET_INFLUENCE[paper.target] : 1;
}

const PUBLICATION_REWARDS: Record<PaperTarget, Record<PaperAcceptType, { san: number; favor: number }>> = {
  A: {
    Poster: { san: 6, favor: 2 },
    Spotlight: { san: 6, favor: 2 },
    Oral: { san: 8, favor: 3 },
    "Best Paper Candidate": { san: 12, favor: 4 },
    "Best Paper": { san: 12, favor: 4 },
  },
  B: {
    Poster: { san: 3, favor: 1 },
    Spotlight: { san: 3, favor: 1 },
    Oral: { san: 4, favor: 1 },
    "Best Paper Candidate": { san: 5, favor: 2 },
    "Best Paper": { san: 5, favor: 2 },
  },
  C: {
    Poster: { san: 2, favor: 0 },
    Spotlight: { san: 2, favor: 0 },
    Oral: { san: 2, favor: 0 },
    "Best Paper Candidate": { san: 3, favor: 1 },
    "Best Paper": { san: 3, favor: 1 },
  },
};

const PAPER_GRADE_RANK: Record<PaperTarget, number> = { C: 1, B: 2, A: 3 };
const PAPER_ACCEPT_TYPE_RANK: Record<PaperAcceptType, number> = {
  Poster: 1,
  Spotlight: 1,
  Oral: 2,
  "Best Paper Candidate": 3,
  "Best Paper": 3,
};

function getPublicationRank(paper: Paper): number {
  if (!paper.target) return 0;
  return getResultRank(paper.target, paper.publication?.acceptType ?? "Poster");
}

function getResultRank(target: PaperTarget, acceptType: PaperAcceptType): number {
  return PAPER_GRADE_RANK[target] * 10 + PAPER_ACCEPT_TYPE_RANK[acceptType];
}

function countRewardReduction(state: GameState, target: PaperTarget, acceptType: PaperAcceptType): number {
  const currentRank = getResultRank(target, acceptType);
  return [...state.papers, ...state.externalPublications].filter((paper) => (
    paper.status === "published"
      && paper.nonFirstAuthor !== true
      && getPublicationRank(paper) >= currentRank
  )).length;
}

function getReviewResultText(settlement: PaperReviewSettlement): string {
  return settlement.accepted
    ? `论文被${settlement.target}类会议接收为${settlement.acceptType ?? "Poster"}`
    : "论文这次没有通过，回到草稿继续修改";
}

function getReviewerLines(settlement: PaperReviewSettlement): string[] {
  return settlement.reports.map((report, index) => {
    const decision = report.decision === "Accept" ? "接收" : report.decision === "Borderline" ? "边缘" : "拒稿";
    const feedback = report.comment ? `：${report.comment}` : "";
    const improvementItems = [
      ...(report.improvements?.idea ? [`idea +${report.improvements.idea}`] : []),
      ...(report.improvements?.experiment ? [`实验 +${report.improvements.experiment}`] : []),
      ...(report.improvements?.writing ? [`写作 +${report.improvements.writing}`] : []),
      ...(report.improvementAction && report.improvementAmount
        ? [`${report.improvementAction === "idea" ? "idea" : report.improvementAction === "experiment" ? "实验" : "写作"} +${report.improvementAmount}`]
        : []),
    ];
    const improvement = improvementItems.length > 0 ? `，修改建议${improvementItems.join("、")}` : "";
    const san = report.sanChange ? `，确认后 SAN ${report.sanChange > 0 ? "+" : ""}${report.sanChange}` : "";
    return `**审稿人${index + 1} · ${report.reviewer}**：${decision}，有效分 ${report.effectiveScore}${feedback}${improvement}${san}`;
  });
}

function getReviewRewardText(settlement: PaperReviewSettlement): string {
  const sanText = settlement.reviewerSanChange !== 0
    ? `；审稿影响 SAN ${settlement.reviewerSanChange > 0 ? "+" : ""}${settlement.reviewerSanChange}`
    : "";
  if (!settlement.accepted) {
    return `论文退回草稿；审稿反馈转为对应修改分数${sanText}`;
  }
  return `科研分 +${settlement.scoreGain}；SAN +${settlement.sanReward}；导师好感 +${settlement.favorReward}${sanText}`;
}

/**
 * A forced month advance discards blocking events without applying their
 * choices.  Review-result chains therefore need to release the paper back to
 * an editable draft; otherwise the paper would remain stuck in `reviewing`
 * and the same result would be queued again on every subsequent month.
 */
function createReviewDiscardUpdate(paper: Paper) {
  return {
    id: paper.id,
    status: "draft" as const,
    target: null,
    reviewMonthsLeft: 0,
    submittedIdea: null,
    submittedExperiment: null,
    submittedWriting: null,
    submittedMonth: null,
    submittedYear: null,
    conferenceHandled: false,
    publication: null,
    lastReview: null,
  };
}

/**
 * Review outcomes are calculated before the event is queued. The three stages
 * below only reveal that immutable settlement and apply it on the final click.
 */
export function createPaperReviewResultEvent(paper: Paper, settlement: PaperReviewSettlement): PendingEvent {
  const conference = paper.target && typeof paper.submittedMonth === "number" && typeof paper.submittedYear === "number"
    ? getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear)
    : null;
  const resultText = getReviewResultText(settlement);
  const reviewerLines = getReviewerLines(settlement);
  const rewardText = getReviewRewardText(settlement);
  const chainId = `paper-review-result-${paper.id}`;
  const resultDescription = [
    `PC 最终决定：${resultText}。`,
    `总评 ${settlement.totalReviewScore >= 0 ? "+" : ""}${settlement.totalReviewScore}。`,
    ...(settlement.borderlineChance !== null
      ? [`边缘录用概率 ${(settlement.borderlineChance * 100).toFixed(1)}%。`]
      : []),
    ...(settlement.rewardReductionCount > 0
      ? [`此前已有 ${settlement.rewardReductionCount} 篇同级或更高等级论文，本次接收奖励按累计成果递减。`]
      : []),
    "机制结算",
    rewardText,
  ].join("\n\n");

  const reviewerEvent: PendingEvent = {
    id: `paper-review-result-${paper.id}-reviewers`,
    title: "论文结果 ➜ 你的三个审稿人",
    description: [
      "三份审稿意见陆续回来，有人盯新颖性，有人盯实验，也有人更看重论文整体。",
      ...reviewerLines,
      "看完这些意见，接下来就等 PC 做最后决定。",
    ].join("\n\n"),
    source: "review",
    blocking: true,
    deadlineMonths: 0,
    chainId,
    stage: "act2",
    paperReviewPresentation: {
      kind: "reviewers",
      paperTitle: paper.title,
      reports: settlement.reports,
    },
    discardPaperUpdates: [createReviewDiscardUpdate(paper)],
    choices: [{
      id: "continue-to-pc",
      label: "继续",
      outcome: "查看 PC 最终决定。",
      effects: {
        enqueueEvents: [{
          id: `paper-review-result-${paper.id}-pc`,
          title: "论文结果 ➜ 你的三个审稿人 ➜ PC 最终决定",
          description: resultDescription,
          source: "review",
          blocking: true,
          deadlineMonths: 0,
          chainId,
          stage: "result",
          paperReviewPresentation: {
            kind: "decision",
            paperTitle: paper.title,
            target: settlement.target,
            accepted: settlement.accepted,
            acceptType: settlement.acceptType,
            resultText,
            totalReviewScore: settlement.totalReviewScore,
            borderlineChance: settlement.borderlineChance,
            rewardReductionCount: settlement.rewardReductionCount,
            rewardText,
          },
          discardPaperUpdates: [createReviewDiscardUpdate(paper)],
          choices: [{
            id: "confirm-review-result",
            label: "确认结果",
            outcome: resultText,
            effects: { paperReviewSettlement: settlement },
          }],
          completionLog: settlement.accepted
            ? `${resultText}；科研分 +${settlement.scoreGain}；SAN +${settlement.sanReward}；导师好感 +${settlement.favorReward}${settlement.reviewerSanChange !== 0 ? `；审稿影响 SAN ${settlement.reviewerSanChange > 0 ? "+" : ""}${settlement.reviewerSanChange}` : ""}`
            : `${resultText}；审稿反馈已转为修改方向${settlement.reviewerSanChange !== 0 ? `；审稿影响 SAN ${settlement.reviewerSanChange > 0 ? "+" : ""}${settlement.reviewerSanChange}` : ""}`,
        }],
      },
    }],
  };

  return {
    id: `paper-review-result-${paper.id}`,
    title: "论文结果",
    description: [
      `《${paper.title}》的审稿结果出来了。${conference ? `投稿至 ${conference.name} ${conference.year}。` : ""}`,
      `本年会议概况：会议影响力 ${settlement.venueInfluence.toFixed(2)}，审稿标准 ×${settlement.reviewStrictnessMultiplier.toFixed(2)}。`,
      `投稿时总分 ${settlement.submittedScore}，等了几个月，这篇论文终于轮到审稿。`,
      "先看看这届会议的整体口径，再读具体审稿意见。",
    ].join("\n"),
    source: "review",
    blocking: true,
    deadlineMonths: 0,
    chainId,
    stage: "act1",
    paperReviewPresentation: {
      kind: "overview",
      paperTitle: paper.title,
      target: settlement.target,
      conferenceName: conference?.name ?? `${settlement.target}类会议`,
      conferenceYear: conference?.year ?? paper.submittedYear ?? 1,
      venueInfluence: settlement.venueInfluence,
      reviewStrictnessMultiplier: settlement.reviewStrictnessMultiplier,
      submittedScore: settlement.submittedScore,
    },
    discardPaperUpdates: [createReviewDiscardUpdate(paper)],
    choices: [{
      id: "continue-to-reviewers",
      label: "继续",
      outcome: "查看三位审稿人的意见。",
      effects: { enqueueEvents: [reviewerEvent] },
    }],
  };
}

export function advancePaperReviewDeadlines(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const papers = state.papers.map((paper) => {
    if (paper.status !== "reviewing") return paper;
    return {
      ...paper,
      reviewMonthsLeft: Math.max(0, paper.reviewMonthsLeft - 1),
    };
  });
  return { ...state, papers };
}

export interface PaperReviewResolution {
  state: GameState;
  logs: string[];
  acceptedPaperIds: string[];
}

function clearReviewFields(paper: Paper): Paper {
  return {
    ...paper,
    target: null,
    reviewMonthsLeft: 0,
    submittedIdea: null,
    submittedExperiment: null,
    submittedWriting: null,
    submittedMonth: null,
    submittedYear: null,
    conferenceHandled: false,
  };
}

/** Apply the result only after the player confirms the review-result event. */
export function applyPaperReviewSettlement(state: GameState, settlement: PaperReviewSettlement): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === settlement.paperId);
  if (paperIndex < 0) return state;
  const paper = state.papers[paperIndex]!;
  const reviewResult = {
    reports: settlement.reports,
    totalReviewScore: settlement.totalReviewScore,
    accepted: settlement.accepted,
    borderlineChance: settlement.borderlineChance,
  };

  if (!settlement.accepted) {
    const feedbackIdea = settlement.reports
      .reduce((total, report) => total
        + (report.improvements?.idea ?? 0)
        + (report.improvementAction === "idea" ? report.improvementAmount ?? 0 : 0), 0);
    const feedbackExperiment = settlement.reports
      .reduce((total, report) => total
        + (report.improvements?.experiment ?? 0)
        + (report.improvementAction === "experiment" ? report.improvementAmount ?? 0 : 0), 0);
    const feedbackWriting = settlement.reports
      .reduce((total, report) => total + (report.improvements?.writing ?? 0), 0);
    const rejectedPaper: Paper = {
      ...clearReviewFields(paper),
      status: "draft",
      publication: null,
      lastReview: reviewResult,
      idea: paper.idea + feedbackIdea,
      experiment: paper.experiment + feedbackExperiment,
      writing: paper.writing + feedbackWriting,
    };
    const papers = [...state.papers];
    papers[paperIndex] = rejectedPaper;
    return {
      ...state,
      papers,
      selectedPaperId: rejectedPaper.id,
      player: {
        ...state.player,
        san: Math.min(state.sanCap, state.player.san + settlement.reviewerSanChange),
      },
    };
  }

  const publicationEffect = getPublicationBuffEffect(state.buffs);
  const citationPenaltyMultiplier = paper.citationDebuffMultiplierOnPublish ?? 1;
  const promotionMultiplier = publicationEffect.nextPromotionMultiplier;
  const acceptedPaper = attachPaperPublication({
    ...paper,
    status: "published",
    reviewMonthsLeft: 0,
    lastReview: reviewResult,
    conferenceHandled: false,
    conferenceAvailableAtTotalMonths: state.totalMonths + 3,
  }, citationPenaltyMultiplier, settlement.acceptType ?? "Poster", settlement.venueInfluence, promotionMultiplier);
  const papers = state.papers.filter((entry) => entry.id !== paper.id);
  const publishedPapers = [...state.externalPublications, acceptedPaper];
  const nextState = consumeNextPublicationBuffs({
    ...state,
    papers,
    externalPublications: publishedPapers,
    selectedPaperId: papers.find((entry) => entry.status === "draft" || entry.status === "journal-reviewing")?.id ?? null,
    totalResearchScore: state.totalResearchScore + settlement.scoreGain,
    player: {
      ...state.player,
      san: Math.min(state.sanCap, state.player.san + settlement.sanReward + settlement.reviewerSanChange),
      favor: Math.min(20, state.player.favor + settlement.favorReward),
    },
  });
  return nextState;
}

export function resolveDuePaperReviews(
  state: GameState,
  random: () => number = Math.random,
): PaperReviewResolution {
  if (state.phase !== "playing") return { state, logs: [], acceptedPaperIds: [] };

  let nextState = { ...state, buffs: [...state.buffs] };
  const logs: string[] = [];
  const acceptedPaperIds: string[] = [];
  const reviewEvents: PendingEvent[] = [];
  const pendingAcceptedRanks: number[] = [];
  const activePapers: Paper[] = [];
  for (const paper of state.papers) {
    if (paper.status !== "reviewing" || paper.reviewMonthsLeft > 0) {
      activePapers.push(paper);
      continue;
    }

    const resolved = resolvePaperReview(paper, random);
    activePapers.push(paper);
    const accepted = resolved.nextPaper.status === "published";
    const acceptType = resolved.acceptType ?? "Poster";
    if (accepted) acceptedPaperIds.push(paper.id);
    const reward = accepted && paper.target ? PUBLICATION_REWARDS[paper.target][acceptType] : { san: 0, favor: 0 };
    const resultRank = paper.target ? getResultRank(paper.target, acceptType) : 0;
    const rewardReductionCount = accepted && paper.target
      ? countRewardReduction(state, paper.target, acceptType)
        + pendingAcceptedRanks.filter((rank) => rank >= resultRank).length
      : 0;
    if (accepted) pendingAcceptedRanks.push(resultRank);
    const reducedSanReward = accepted ? Math.max(1, reward.san - rewardReductionCount) : 0;
    const reducedFavorReward = accepted ? Math.max(0, reward.favor - Math.floor(rewardReductionCount / 2)) : 0;
    // Keep the reward as an additive effect until confirmation.  Clamping it
    // before combining reviewer SAN changes would incorrectly discard a
    // positive reward whenever a hostile reviewer also applies SAN damage.
    const sanReward = accepted ? reducedSanReward : 0;
    const favorResult = accepted
      ? applyTierResist(reducedFavorReward, state.player.favor, random)
      : { effectiveChange: 0 };
    const reviewerSanChange = resolved.nextPaper.lastReview?.reports
      .reduce((total, report) => total + (report.sanChange ?? 0), 0) ?? 0;
    const settlement: PaperReviewSettlement = {
      paperId: paper.id,
      target: paper.target!,
      accepted,
      acceptType: accepted ? acceptType : null,
      submittedScore: (paper.submittedIdea ?? paper.idea) + (paper.submittedExperiment ?? paper.experiment) + (paper.submittedWriting ?? paper.writing),
      totalReviewScore: resolved.nextPaper.lastReview?.totalReviewScore ?? 0,
      borderlineChance: resolved.nextPaper.lastReview?.borderlineChance ?? null,
      venueInfluence: getPaperVenueInfluence(paper),
      reviewStrictnessMultiplier: getReviewStrictnessMultiplier(paper.target!, getPaperVenueInfluence(paper)),
      scoreGain: accepted ? resolved.scoreGain : 0,
      baseSanReward: accepted ? reward.san : 0,
      baseFavorReward: accepted ? reward.favor : 0,
      rewardReductionCount,
      sanReward,
      favorReward: favorResult.effectiveChange,
      reviewerSanChange,
      reports: resolved.nextPaper.lastReview?.reports ?? [],
    };
    const reviewEvent = createPaperReviewResultEvent(paper, settlement);
    reviewEvents.push(reviewEvent);
  }

  const selectedPaperId = activePapers.some((paper) => paper.id === state.selectedPaperId)
    ? state.selectedPaperId
    : activePapers[0]?.id ?? null;
  nextState = {
    ...nextState,
    papers: activePapers,
    selectedPaperId,
  };
  for (const event of reviewEvents) {
    nextState = enqueueEventQueueItem(nextState, event);
  }
  return { state: nextState, logs, acceptedPaperIds };
}

function getPaperCitationDebuffMultiplier(state: GameState, paper: Paper): number {
  if (paper.nonFirstAuthor === true) return 1;
  const effect = getPublicationBuffEffect(state.buffs);
  return combineEffectMultipliers([
    paper.publication?.citationDebuffMultiplier ?? 1,
    effect.citationDebuffMultiplier,
  ]);
}

/** Citation visibility earned by the conference presentation itself. */
export function getPaperConferencePromotionMultiplier(acceptType: PaperAcceptType | undefined): number {
  if (acceptType === "Best Paper" || acceptType === "Best Paper Candidate") return 5;
  if (acceptType === "Oral") return 1.5;
  return 1;
}

export interface PaperCitationMultiplierBreakdown {
  heat: number;
  influence: number;
  promotion: number;
  citationDebuff: number;
  total: number;
}

export function getPaperCitationMultiplierBreakdown(
  state: GameState,
  paper: Paper,
): PaperCitationMultiplierBreakdown {
  const heat = paper.heatMultiplier;
  const influence = paper.publication?.influence ?? getPaperVenueInfluence(paper);
  const conferencePromotionReady = paper.target === null || paper.conferenceHandled === true;
  const promotion = combineEffectMultipliers([
    conferencePromotionReady
      ? getPaperConferencePromotionMultiplier(paper.publication?.acceptType)
      : 1,
    conferencePromotionReady ? paper.publication?.promotionMultiplier ?? 1 : 1,
    conferencePromotionReady && paper.publication?.promotions?.xiaohongshu === true ? 1.25 : 1,
  ]);
  const citationDebuff = getPaperCitationDebuffMultiplier(state, paper);
  return {
    heat,
    influence,
    promotion,
    citationDebuff,
    total: heat * influence * promotion * citationDebuff,
  };
}

/**
 * Complete citation multiplier apart from the base conversion (effective score
 * is converted at 0.05 citations per point). This is also the value shown in
 * the成果 panel so the UI and settlement share one definition.
 */
export function getPaperCitationMultiplier(state: GameState, paper: Paper): number {
  return getPaperCitationMultiplierBreakdown(state, paper).total;
}

export interface CitationSettlement {
  state: GameState;
  changes: Array<{ title: string; amount: number }>;
}

export function settlePublishedPaperCitations(
  state: GameState,
  externalPublications: Paper[] = state.externalPublications,
  skipPaperIds: ReadonlySet<string> = new Set(),
): CitationSettlement {
  if (state.phase !== "playing") return { state, changes: [] };
  const papers = state.papers.map((paper) => ({ ...paper, publication: paper.publication ? { ...paper.publication, promotions: paper.publication.promotions ? { ...paper.publication.promotions } : undefined } : paper.publication }));
  const external = externalPublications.map((paper) => ({ ...paper, publication: paper.publication ? { ...paper.publication, promotions: paper.publication.promotions ? { ...paper.publication.promotions } : undefined } : paper.publication }));
  const changes: Array<{ title: string; amount: number }> = [];
  let totalCitations = state.totalCitations;
  const citationHistoryByYear = { ...state.citationHistoryByYear };
  const settle = (paper: Paper): Paper => {
    if (paper.status !== "published" || (!paper.target && !paper.journalTarget && !paper.publication?.journalTarget)) return paper;
    if (skipPaperIds.has(paper.id)) return paper;
    const publication = paper.publication ?? attachPaperPublication(paper).publication;
    if (!publication) return paper;
    const monthsSincePublish = (publication.monthsSincePublish ?? 0) + 1;
    const effectiveScoreBefore = Math.max(0, publication.effectiveScore);
    const shouldSettleCitations = monthsSincePublish % CITATION_SETTLEMENT_INTERVAL_MONTHS === 0;
    const shouldDecay = monthsSincePublish % PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS === 0;
    const baseGrowth = shouldSettleCitations
      ? effectiveScoreBefore * CITATION_BASE_RATE * getPaperCitationMultiplier(state, paper)
      : 0;
    const decay = shouldDecay ? Math.ceil(effectiveScoreBefore * PUBLISHED_SCORE_DECAY_RATE) : 0;
    const effectiveScore = Math.max(0, effectiveScoreBefore - decay);
    // Conference papers stay invisible until the attendance flow is handled.
    // arXiv is an explicit early-exposure path; journals and already-public
    // imported papers do not need the conference gate.
    const conferenceExposurePending = paper.target !== null
      && publication.preprintExposed !== true
      && paper.conferenceHandled === false;
    const delayedExposureMultiplier = conferenceExposurePending
      ? 0
      : 1;
    const growth = delayedExposureMultiplier === 0
      ? 0
      : baseGrowth;
    const accumulated = growth + (publication.pendingCitationFraction ?? 0);
    const amount = Math.max(0, Math.floor(accumulated));
    const pendingCitationFraction = accumulated - amount;
    if (amount > 0) {
      totalCitations += amount;
      const year = getAcademicCalendarYear(state.year, state.month);
      citationHistoryByYear[year] = (citationHistoryByYear[year] ?? 0) + amount;
      changes.push({ title: paper.title, amount });
    }
    return {
      ...paper,
      publication: {
        ...publication,
        citations: publication.citations + amount,
        effectiveScore,
        monthsSincePublish,
        pendingCitationFraction,
      },
    };
  };

  return {
    state: { ...state, papers: papers.map(settle), externalPublications: external.map(settle), totalCitations, citationHistoryByYear },
    changes,
  };
}
