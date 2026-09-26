import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { combineEffectMultipliers } from "./v2-numeric-modifiers";
import {
  consumeNextPublicationBuffs,
  getPublicationBuffEffect,
} from "./v2-buffs";
import { getReviewStrictnessMultiplier, resolvePaperReview } from "./v2-paper-rules";
import { attachPaperPublication, getHighlyCitedThreshold, recordPaperAcceptances } from "./v2-publication-rules";
import { enqueueEventQueueItem } from "./v2-event-queue";
import type { GameState, Paper, PaperAcceptType, PaperReviewResult, PaperReviewSettlement, PaperTarget, PendingEvent } from "./v2-types";
import { getJournalDefinition } from "./v2-journal-system";
import { applyPublicationTalentRewards } from "./v2-publication-talent";
import { formatEventSanChange, getActualSanChange, getIllnessSanIncrease } from "./v2-sanity-rules";

const DEFAULT_TARGET_INFLUENCE: Record<PaperTarget, number> = { A: 1.1, B: 0.6, C: 0.3 };
export const CITATION_SETTLEMENT_INTERVAL_MONTHS = 1;
export const CITATION_BASE_RATE = 0.05;
export const PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS = 4;
export const PUBLISHED_SCORE_DECAY_RATE = 0.1;
export const CONFERENCE_PUBLICATION_DELAY_MONTHS = 3;

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
    const improvement = improvementItems.length > 0 ? `，拒稿后修改${improvementItems.join("、")}` : "";
    const san = report.sanChange ? `，确认后 ${formatEventSanChange(report.sanChange, report.illnessSanIncrease)}` : "";
    return `**审稿人${index + 1} · ${report.reviewer}**：${decision}，有效分 ${report.effectiveScore}${feedback}${improvement}${san}`;
  });
}

function getReviewRewardText(settlement: PaperReviewSettlement): string {
  const illnessIncrease = settlement.reports.reduce((sum, report) => sum + (report.illnessSanIncrease ?? 0), 0);
  const sanText = settlement.reviewerSanChange !== 0
    ? `；审稿影响 ${formatEventSanChange(settlement.reviewerSanChange, illnessIncrease)}`
    : "";
  if (!settlement.accepted) {
    const gains = ["idea", "experiment", "writing"].map((field) => {
      const amount = settlement.reports.reduce((sum, report) => sum
        + (report.improvements?.[field as "idea" | "experiment" | "writing"] ?? 0)
        + (report.improvementAction === field ? report.improvementAmount ?? 0 : 0), 0);
      return amount > 0 ? `${field === "idea" ? "idea" : field === "experiment" ? "实验" : "写作"}+${amount}` : "";
    }).filter(Boolean);
    return `论文退回草稿；${gains.length ? `修改反馈：${gains.join(" · ")}` : "本轮无分数提升"}${sanText}`;
  }
  return `科研分+${settlement.scoreGain}${sanText}`;
}

function resolveReviewerSan(state: GameState, settlement: PaperReviewSettlement): PaperReviewSettlement {
  const reports = settlement.reports.map((report) => {
    const baseSanChange = report.baseSanChange ?? report.sanChange;
    return baseSanChange === undefined ? report : {
      ...report,
      baseSanChange,
      sanChange: getActualSanChange(baseSanChange, state.month, state.eventSupport, state.buffs),
      illnessSanIncrease: getIllnessSanIncrease(baseSanChange, state.month, state.eventSupport, state.buffs),
    };
  });
  return { ...settlement, reports, reviewerSanChange: reports.reduce((sum, report) => sum + (report.sanChange ?? 0), 0) };
}

function getReviewResultDescription(settlement: PaperReviewSettlement): string {
  return [
    `PC 最终决定：${getReviewResultText(settlement)}。`,
    `总评 ${settlement.totalReviewScore >= 0 ? "+" : ""}${settlement.totalReviewScore}。`,
    ...(settlement.borderlineChance !== null
      ? [`边缘录用概率 ${(settlement.borderlineChance * 100).toFixed(1)}%。`] : []),
    "机制结算",
    getReviewRewardText(settlement),
  ].join("\n\n");
}

function getReviewerDescription(settlement: PaperReviewSettlement): string {
  return [
    "你先扫了一眼评分，又从头读起三份审稿意见。这篇改过不知多少遍的论文，到了别人眼里，会是什么样？",
    ...getReviewerLines(settlement),
    "三份意见翻完，你又看了一遍分数。接下来，就看 PC 的最终决定了。",
  ].join("\n\n");
}

function findReviewSettlement(event: PendingEvent): PaperReviewSettlement | undefined {
  for (const choice of event.choices) {
    if (choice.effects.paperReviewSettlement) return choice.effects.paperReviewSettlement;
    for (const followUp of choice.effects.enqueueEvents ?? []) {
      const settlement = findReviewSettlement(followUp);
      if (settlement) return settlement;
    }
  }
  return undefined;
}

export function refreshPaperReviewEvent<Event extends PendingEvent>(state: GameState, event: Event): Event {
  if (event.source !== "review" || !event.paperReviewPresentation) return event;
  const original = findReviewSettlement(event);
  if (!original) return event;
  const settlement = resolveReviewerSan(state, original);
  if (JSON.stringify(settlement) === JSON.stringify(original)) return event;
  const refresh = <Entry extends PendingEvent>(entry: Entry): Entry => {
    const presentation = entry.paperReviewPresentation;
    const result = presentation?.kind === "decision";
    const reviewers = presentation?.kind === "reviewers";
    return {
      ...entry,
      ...(result ? {
        description: getReviewResultDescription(settlement),
        completionLog: `${getReviewResultText(settlement)}；${getReviewRewardText(settlement)}`,
      } : reviewers ? { description: getReviewerDescription(settlement) } : {}),
      paperReviewPresentation: result ? { ...presentation, reports: settlement.reports, rewardText: getReviewRewardText(settlement) }
        : reviewers ? { ...presentation, reports: settlement.reports } : presentation,
      choices: entry.choices.map((choice) => ({ ...choice, effects: {
        ...choice.effects,
        ...(choice.effects.paperReviewSettlement ? { paperReviewSettlement: settlement } : {}),
        ...(choice.effects.enqueueEvents ? { enqueueEvents: choice.effects.enqueueEvents.map(refresh) } : {}),
      } })),
    };
  };
  return refresh(event);
}

export function refreshPaperReviewEvents(state: GameState): GameState {
  const eventQueue = state.eventQueue.map((event) => refreshPaperReviewEvent(state, event));
  return eventQueue.every((event, index) => event === state.eventQueue[index]) ? state : { ...state, eventQueue };
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
    acceptedTotalMonths: undefined,
    acceptedOrder: undefined,
    status: "draft" as const,
    target: null,
    reviewMonthsLeft: 0,
    submittedIdea: null,
    submittedExperiment: null,
    submittedWriting: null,
    submittedCollaborationScores: null,
    submittedMonth: null,
    submittedYear: null,
    conferenceHandled: false,
    publication: null,
    lastReview: null,
  };
}

/**
 * Review outcomes are calculated before the event is queued. The three stages
 * below reveal the fixed review decision; SAN costs follow current modifiers.
 */
export function createPaperReviewResultEvent(paper: Paper, settlement: PaperReviewSettlement): PendingEvent {
  const conference = paper.target && typeof paper.submittedMonth === "number" && typeof paper.submittedYear === "number"
    ? getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear)
    : null;
  const resultText = getReviewResultText(settlement);
  const rewardText = getReviewRewardText(settlement);
  const chainId = `paper-review-result-${paper.id}`;
  const resultDescription = getReviewResultDescription(settlement);

  const reviewerEvent: PendingEvent = {
    id: `paper-review-result-${paper.id}-reviewers`,
    title: "论文结果 ➜ 你的三个审稿人",
    description: getReviewerDescription(settlement),
    source: "review",
    blocking: true,
    deadlineMonths: 0,
    chainId,
    stage: "act2",
    paperReviewPresentation: {
      kind: "reviewers",
      paperTitle: paper.title,
      reports: settlement.reports,
      conferenceName: conference?.name,
      conferenceYear: conference?.year,
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
            rewardText,
            conferenceName: conference?.name,
            conferenceYear: conference?.year,
            reports: settlement.reports,
          },
          discardPaperUpdates: [createReviewDiscardUpdate(paper)],
          choices: [{
            id: "confirm-review-result",
            label: "确认结果",
            outcome: resultText,
            effects: { paperReviewSettlement: settlement },
          }],
          completionLog: `${resultText}；${rewardText}`,
        }],
      },
    }],
  };

  return {
    id: `paper-review-result-${paper.id}`,
    title: "论文结果",
    description: [
      `邮箱弹出审稿通知，你把手头的窗口切到一边。${conference ? `${conference.name} ${conference.year} 的结果终于到了。` : "审稿结果终于到了。"}`,
      `本年会议概况：会议影响力 ${settlement.venueInfluence.toFixed(2)}，审稿标准 ×${settlement.reviewStrictnessMultiplier.toFixed(2)}。`,
      `投稿时总分 ${settlement.submittedScore}。你点开邮件，先找了找查看审稿意见的入口。`,
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

export function advancePaperReviewDeadline(paper: Paper): Paper {
  if (paper.status !== "reviewing") return paper;
  return {
    ...paper,
    reviewMonthsLeft: Math.max(0, paper.reviewMonthsLeft - 1),
  };
}

export function advancePaperReviewDeadlines(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const papers = state.papers.map(advancePaperReviewDeadline);
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
    acceptedTotalMonths: undefined,
    acceptedOrder: undefined,
    target: null,
    reviewMonthsLeft: 0,
    submittedIdea: null,
    submittedExperiment: null,
    submittedWriting: null,
    submittedCollaborationScores: null,
    submittedMonth: null,
    submittedYear: null,
    conferenceHandled: false,
  };
}

export function applyRejectedPaperReview(paper: Paper, reviewResult: PaperReviewResult): Paper {
  const feedbackIdea = reviewResult.reports
    .reduce((total, report) => total
      + (report.improvements?.idea ?? 0)
      + (report.improvementAction === "idea" ? report.improvementAmount ?? 0 : 0), 0);
  const feedbackExperiment = reviewResult.reports
    .reduce((total, report) => total
      + (report.improvements?.experiment ?? 0)
      + (report.improvementAction === "experiment" ? report.improvementAmount ?? 0 : 0), 0);
  const feedbackWriting = reviewResult.reports
    .reduce((total, report) => total + (report.improvements?.writing ?? 0), 0);
  return {
    ...clearReviewFields(paper),
    status: "draft",
    publication: null,
    lastReview: reviewResult,
    rejectionCount: (paper.rejectionCount ?? 0) + 1,
    idea: paper.idea + feedbackIdea,
    experiment: paper.experiment + feedbackExperiment,
    writing: paper.writing + feedbackWriting,
  };
}

/** Apply the result only after the player confirms the review-result event. */
export function applyPaperReviewSettlement(state: GameState, settlement: PaperReviewSettlement): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === settlement.paperId);
  if (paperIndex < 0) return state;
  const paper = state.papers[paperIndex]!;
  settlement = resolveReviewerSan(state, settlement);
  const reviewResult = {
    reports: settlement.reports,
    totalReviewScore: settlement.totalReviewScore,
    accepted: settlement.accepted,
    borderlineChance: settlement.borderlineChance,
  };

  if (!settlement.accepted) {
    const rejectedPaper = applyRejectedPaperReview(paper, reviewResult);
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
    conferenceAvailableAtTotalMonths: state.totalMonths + CONFERENCE_PUBLICATION_DELAY_MONTHS,
  }, citationPenaltyMultiplier, settlement.acceptType ?? "Poster", settlement.venueInfluence, promotionMultiplier);
  const papers = state.papers.filter((entry) => entry.id !== paper.id);
  const publishedPapers = [...state.externalPublications, ...recordPaperAcceptances([acceptedPaper], state.totalMonths,
    [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])])];
  const nextState = consumeNextPublicationBuffs({
    ...state,
    papers,
    externalPublications: publishedPapers,
    selectedPaperId: papers.find((entry) => entry.status === "draft" || entry.status === "journal-reviewing")?.id ?? null,
    totalResearchScore: state.totalResearchScore + settlement.scoreGain,
    player: {
      ...state.player,
      san: Math.min(state.sanCap, state.player.san + settlement.reviewerSanChange),
    },
  });
  return applyPublicationTalentRewards(nextState);
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
  const activePapers: Paper[] = [];
  for (const paper of state.papers) {
    if (paper.status !== "reviewing" || paper.reviewMonthsLeft > 0) {
      activePapers.push(paper);
      continue;
    }

    const resolved = resolvePaperReview(paper, random);
    activePapers.push(paper);
    const accepted = resolved.nextPaper.status === "published";
    if (accepted) acceptedPaperIds.push(paper.id);
    const reports = (resolved.nextPaper.lastReview?.reports ?? []).map((report) => report.sanChange === undefined ? report : {
      ...report,
      baseSanChange: report.sanChange,
      sanChange: getActualSanChange(report.sanChange, state.month, state.eventSupport, state.buffs),
      illnessSanIncrease: getIllnessSanIncrease(report.sanChange, state.month, state.eventSupport, state.buffs),
    });
    const reviewerSanChange = reports.reduce((total, report) => total + (report.sanChange ?? 0), 0);
    const settlement: PaperReviewSettlement = {
      paperId: paper.id,
      target: paper.target!,
      accepted,
      acceptType: accepted ? resolved.acceptType ?? "Poster" : null,
      submittedScore: (paper.submittedIdea ?? paper.idea) + (paper.submittedExperiment ?? paper.experiment) + (paper.submittedWriting ?? paper.writing),
      totalReviewScore: resolved.nextPaper.lastReview?.totalReviewScore ?? 0,
      borderlineChance: resolved.nextPaper.lastReview?.borderlineChance ?? null,
      venueInfluence: getPaperVenueInfluence(paper),
      reviewStrictnessMultiplier: getReviewStrictnessMultiplier(paper.target!, getPaperVenueInfluence(paper)),
      scoreGain: accepted ? resolved.scoreGain : 0,
      reviewerSanChange,
      reports,
    };
    const reviewEvent = createPaperReviewResultEvent(paper, settlement);
    reviewEvents.push(reviewEvent);
  }

  const recordedPapers = new Map(recordPaperAcceptances(
    activePapers.filter((paper) => acceptedPaperIds.includes(paper.id)), state.totalMonths,
    [...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])],
  ).map((paper) => [paper.id, paper]));
  const selectedPaperId = activePapers.some((paper) => paper.id === state.selectedPaperId)
    ? state.selectedPaperId
    : activePapers[0]?.id ?? null;
  nextState = {
    ...nextState,
    papers: activePapers.map((paper) => recordedPapers.get(paper.id) ?? paper),
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
    conferencePromotionReady && paper.publication?.promotions?.quantum === true ? 1.25 : 1,
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

export function settlePaperCitationMonth(state: GameState, paper: Paper): { paper: Paper; amount: number } {
  if (state.phase !== "playing") return { paper, amount: 0 };
  if (paper.status !== "published" || (!paper.target && !paper.journalTarget && !paper.publication?.journalTarget)) {
    return { paper, amount: 0 };
  }
  const publication = paper.publication ?? attachPaperPublication(paper).publication;
  if (!publication) return { paper, amount: 0 };
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
  const nextCitations = publication.citations + amount;
  const highlyCitedThreshold = publication.highlyCitedThreshold
    ?? getHighlyCitedThreshold(paper.heatMultiplier);
  const highlyCited = publication.highlyCited === true
    || (monthsSincePublish >= 12 && nextCitations >= highlyCitedThreshold);
  return {
    paper: {
      ...paper,
      publication: {
        ...publication,
        citations: nextCitations,
        effectiveScore,
        monthsSincePublish,
        pendingCitationFraction,
        highlyCitedThreshold,
        highlyCited,
      },
    },
    amount,
  };
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
    if (skipPaperIds.has(paper.id)) return paper;
    const { paper: settledPaper, amount } = settlePaperCitationMonth(state, paper);
    if (amount > 0) {
      totalCitations += amount;
      const year = getAcademicCalendarYear(state.year, state.month);
      citationHistoryByYear[year] = (citationHistoryByYear[year] ?? 0) + amount;
      changes.push({ title: paper.title, amount });
    }
    return settledPaper;
  };

  const settledState = { ...state, papers: papers.map(settle), externalPublications: external.map(settle), totalCitations, citationHistoryByYear };
  return {
    state: applyPublicationTalentRewards(settledState),
    changes,
  };
}
