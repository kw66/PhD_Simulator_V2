import {
  PAPER_SLOT_LIMIT,
  PAPER_SLOT_RESEARCH_THRESHOLDS,
  SCORE_BY_TARGET,
} from "./v2-content";
import { getAcademicCalendarYear } from "./v2-calendar";
import { getConferenceInfo } from "./v2-conference-catalog";
import { pushLog, pushNoOpLog } from "./v2-engine-helpers";
import { getJournalDefinition } from "./v2-journal-system";
import { generatePaperTopic } from "./v2-paper-topics";
import {
  getBorderlineAcceptChance,
  getReviewerWeights,
  getReviewStrictnessMultiplier,
  getReviewThresholds,
  REVIEW_TARGET_AVERAGE_INFLUENCE,
} from "./v2-review-config";
export {
  getReviewerWeights,
  getReviewStrictnessMultiplier,
  getReviewThresholds,
  REVIEW_BASE_THRESHOLDS,
  REVIEWER_ANNUAL_WEIGHT_DELTAS,
  REVIEWER_BASE_WEIGHTS,
  REVIEWER_WEIGHTS,
  REVIEW_TARGET_AVERAGE_INFLUENCE,
} from "./v2-review-config";
import type {
  GameState,
  Paper,
  PaperReviewerType,
  PaperReviewerFocus,
  PaperReviewerReport,
  PaperAcceptType,
  PaperTarget,
} from "./v2-types";

export const PAPER_REVIEW_MONTHS = 3;

export const REVIEW_STABLE_SCORE_BY_TARGET: Record<PaperTarget, number> = {
  C: 20,
  B: 40,
  A: 70,
};

export const ACCEPT_TYPE_SCORE_BY_TARGET: Record<PaperTarget, {
  spotlight?: number;
  oral: number;
  candidate?: number;
  bestPaper: number;
}> = {
  C: { oral: 35, bestPaper: 50 },
  B: { oral: 55, bestPaper: 80 },
  A: { spotlight: 80, oral: 90, candidate: 110, bestPaper: 125 },
};

export const REVIEWER_DEFINITIONS: ReadonlyArray<{ type: PaperReviewerType; name: string; focus: PaperReviewerFocus }> = [
  { type: "novelty", name: "新颖性审稿人", focus: "idea" },
  { type: "experiment", name: "实验审稿人", focus: "experiment" },
  { type: "normal", name: "普通审稿人", focus: "balanced" },
  { type: "gpt", name: "LLM审稿人", focus: "balanced" },
  { type: "expert", name: "资深审稿人", focus: "balanced" },
  { type: "kind", name: "心软审稿人", focus: "balanced" },
  { type: "strict", name: "严格审稿人", focus: "weakness" },
  { type: "hostile", name: "恶意审稿人", focus: "weakness" },
];

const REVIEWER_COMMENTS: Record<PaperReviewerType, { Accept: string; Borderline: string; Reject: string }> = {
  novelty: {
    Accept: "方法和动机讲得清楚，创新点也站得住",
    Borderline: "方法有意思，但和已有工作的差别还需要说透",
    Reject: "核心方法与已有工作差别不够清楚，缺少新颖性支撑",
  },
  experiment: {
    Accept: "对比和消融比较完整，实验能支持主要结论",
    Borderline: "实验有结果，但关键对比还不够充分",
    Reject: "缺少与相关方法的关键对比，实验不足以支撑结论",
  },
  normal: {
    Accept: "工作完整，贡献和实验基本对应",
    Borderline: "方向有价值，但实验和表达还可以再扎实一些",
    Reject: "现有结果还不足以支撑主要结论",
  },
  expert: {
    Accept: "亮点抓得准，最重要的两项已经做得很扎实",
    Borderline: "主要优点已经有了，再把关键部分打磨一下会更完整",
    Reject: "核心优点还没有充分展现，建议先把最重要的两项补起来",
  },
  gpt: {
    Accept: "结构清晰，方法与结果能够相互印证",
    Borderline: "可以看出贡献，但仍有若干关键细节需要澄清",
    Reject: "论文的论证链条还不够闭合",
  },
  kind: {
    Accept: "主要亮点很突出，工作整体完成得不错",
    Borderline: "亮点是有的，几个细节补上就更稳了",
    Reject: "目前还有明显缺口，但主要方向仍然值得继续做",
  },
  strict: {
    Accept: "最弱的部分也经得起检查，整体比较可靠",
    Borderline: "短板仍然影响整体可信度，需要进一步补强",
    Reject: "最弱的两项拖住了整体表现，当前版本还不够稳",
  },
  hostile: {
    Accept: "SOTA 对比、局限性和新颖性说明都交代得比较完整",
    Borderline: "还有关键要求没有满足，论文说服力不足",
    Reject: "没有清楚证明 SOTA、局限性或新颖性，当前版本很难接受",
  },
};

export function createDraftPaper(
  totalMonths: number,
  existingPaperCount: number,
  random: () => number = Math.random,
  calendarYear = 2023,
): Paper {
  const topic = generatePaperTopic(calendarYear, random);
  return {
    id: `paper-${totalMonths}-${existingPaperCount + 1}`,
    ...topic,
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
    citationDebuffMultiplierOnPublish: 1,
    lastReview: null,
  };
}

function isZeroProgressDraft(paper: Paper): boolean {
  return paper.status === "draft" && paper.idea === 0 && paper.experiment === 0 && paper.writing === 0;
}

export function rerollPaperTopic(
  state: GameState,
  paperId: string,
  random: () => number = Math.random,
): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  const paper = paperIndex >= 0 ? state.papers[paperIndex] : null;
  if (!paper || !isZeroProgressDraft(paper)) return state;
  const topic = generatePaperTopic(getAcademicCalendarYear(state.year, state.month), random);
  return {
    ...state,
    papers: state.papers.map((entry, index) => index === paperIndex ? { ...entry, ...topic } : entry),
    selectedPaperId: paper.id,
  };
}

export function discardDraftPaper(state: GameState, paperId: string): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  const paper = paperIndex >= 0 ? state.papers[paperIndex] : null;
  if (!paper || paper.status !== "draft") {
    return paper?.status === "journal-reviewing"
      ? pushNoOpLog(state, `丢弃：${paper.title} 正在期刊修改中，请使用撤稿`)
      : state;
  }
  const papers = state.papers.filter((entry) => entry.id !== paperId);
  const nextSelectedPaperId = state.selectedPaperId === paperId
    ? papers.find((entry) => entry.status === "draft" || entry.status === "journal-reviewing")?.id ?? null
    : state.selectedPaperId;
  return pushLog({ ...state, papers, selectedPaperId: nextSelectedPaperId }, `丢弃论文：${paper.title}`);
}

function decayPrepublicationScore(score: number, decayRate: number): number {
  if (score <= 1) return score;
  const decay = Math.max(1, Math.floor(score * decayRate));
  return Math.max(1, score - decay);
}

export function applyPrepublicationPaperDecay(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const changes: string[] = [];
  const papers = state.papers.map((paper) => {
    if (paper.status === "published" || paper.status === "journal-reviewing") return paper;
    const nextIdea = decayPrepublicationScore(paper.idea, paper.prepublicationDecayRate);
    const nextExperiment = decayPrepublicationScore(paper.experiment, paper.prepublicationDecayRate);
    const nextWriting = decayPrepublicationScore(paper.writing, paper.prepublicationDecayRate);
    const paperChanges = [
      ...(nextIdea < paper.idea ? [`idea -${paper.idea - nextIdea}`] : []),
      ...(nextExperiment < paper.experiment ? [`实验 -${paper.experiment - nextExperiment}`] : []),
      ...(nextWriting < paper.writing ? [`写作 -${paper.writing - nextWriting}`] : []),
    ];
    if (paperChanges.length > 0) changes.push(`${paper.title}：${paperChanges.join("、")}`);
    return { ...paper, idea: nextIdea, experiment: nextExperiment, writing: nextWriting };
  });
  const nextState = { ...state, papers };
  return changes.length > 0
    ? pushLog(nextState, `论文时效：${changes.join("｜")}`)
    : nextState;
}

export function getPaperSubmissionFailure(
  paper: Paper | null | undefined,
  _target: PaperTarget,
): string | null {
  if (!paper) return "没有找到这篇论文";
  if (paper.status !== "draft") return "这篇论文当前不能投稿";
  if (paper.idea <= 0 || paper.experiment <= 0 || paper.writing <= 0) {
    return "idea、实验和写作都要有分数";
  }
  return null;
}

export function submitPaper(
  state: GameState,
  paperId: string,
  target: PaperTarget,
): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  const paper = paperIndex >= 0 ? state.papers[paperIndex] : null;
  const failure = getPaperSubmissionFailure(paper, target);
  if (failure) return pushNoOpLog(state, `投稿：${failure}`);
  if (!paper || paperIndex < 0) return state;

  const submittedScore = paper.idea + paper.experiment + paper.writing;
  const submittedPaper: Paper = {
    ...paper,
    status: "reviewing",
    target,
    reviewMonthsLeft: PAPER_REVIEW_MONTHS,
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
  const nextSelectedPaperId = papers.find((entry) => entry.status === "draft")?.id ?? null;
  return pushLog(
    {
      ...state,
      papers,
      selectedPaperId: nextSelectedPaperId,
    },
    `投稿：${paper.title} 已投 ${target} 类会议，总分 ${submittedScore}，进入 ${PAPER_REVIEW_MONTHS} 个月审稿期`,
  );
}

export function withdrawPaper(state: GameState, paperId: string): GameState {
  if (state.phase !== "playing") return state;
  const paperIndex = state.papers.findIndex((paper) => paper.id === paperId);
  const paper = paperIndex >= 0 ? state.papers[paperIndex] : null;
  if (!paper) return pushNoOpLog(state, "撤稿：没有找到这篇论文");
  if (paper.status === "journal-reviewing") {
    const journalName = paper.journalTarget ? getJournalDefinition(paper.journalTarget).name : "期刊";
    const restoredPaper: Paper = {
      ...paper,
      idea: paper.submittedIdea ?? paper.idea,
      experiment: paper.submittedExperiment ?? paper.experiment,
      writing: paper.submittedWriting ?? paper.writing,
      status: "draft",
      target: null,
      journalTarget: null,
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
    const papers = [...state.papers];
    papers[paperIndex] = restoredPaper;
    const restoredScore = restoredPaper.idea + restoredPaper.experiment + restoredPaper.writing;
    return pushLog(
      { ...state, papers, selectedPaperId: restoredPaper.id },
      `撤稿：${paper.title} 已从${journalName}撤回，恢复投稿时分数 ${restoredScore}`,
    );
  }
  if (paper.status !== "reviewing") return pushNoOpLog(state, `撤稿：${paper.title} 当前不在审稿中`);

  const target = paper.target;
  const withdrawnPaper: Paper = {
    ...paper,
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
    lastReview: null,
  };
  const papers = [...state.papers];
  papers[paperIndex] = withdrawnPaper;
  return pushLog(
    { ...state, papers, selectedPaperId: paper.id },
    `撤稿：${paper.title} 已从 ${target ?? "原"} 类会议撤回，论文进度保留`,
  );
}

function clampRandomRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999, value));
}

function getPaperReviewInfluence(paper: Paper): number {
  if (paper.target && typeof paper.submittedMonth === "number" && typeof paper.submittedYear === "number") {
    return getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear).influence;
  }
  return paper.target === "A" ? 1.1 : paper.target === "B" ? 0.6 : 0.3;
}

export function getReviewerEffectiveScore(
  reviewerType: PaperReviewerType,
  idea: number,
  experiment: number,
  writing: number,
  random: () => number,
): number {
  const values = [idea, experiment, writing];
  if (reviewerType === "novelty") return Math.round(idea * 2 + experiment * 0.5 + writing * 0.5);
  if (reviewerType === "experiment") return Math.round(idea * 0.5 + experiment * 2 + writing * 0.5);
  if (reviewerType === "expert") {
    const sorted = [...values].sort((left, right) => left - right);
    return Math.round((sorted[1] ?? 0) * 1.5 + (sorted[2] ?? 0) * 1.5);
  }
  if (reviewerType === "kind") return Math.round(Math.max(...values, 0) * 3);
  if (reviewerType === "strict") {
    const sorted = [...values].sort((left, right) => left - right);
    return Math.round((sorted[0] ?? 0) * 1.5 + (sorted[1] ?? 0) * 1.5);
  }
  if (reviewerType === "hostile") return Math.round(Math.min(idea, experiment, writing) * 3);

  const splitWeight = (): [number, number, number] => {
    const total = reviewerType === "gpt" ? 2.4 : 0.6;
    const first = clampRandomRoll(random()) * total;
    const second = clampRandomRoll(random()) * (total - first);
    const extras = [first, second, total - first - second];
    for (let index = extras.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(clampRandomRoll(random()) * (index + 1));
      [extras[index], extras[swapIndex]] = [extras[swapIndex]!, extras[index]!];
    }
    const base = reviewerType === "gpt" ? 0.2 : 0.8;
    return [base + extras[0]!, base + extras[1]!, base + extras[2]!];
  };
  const [ideaWeight, experimentWeight, writingWeight] = splitWeight();
  return Math.round(idea * ideaWeight + experiment * experimentWeight + writing * writingWeight);
}

function getStrictReviewerImprovements(
  idea: number,
  experiment: number,
  writing: number,
): Partial<Record<"idea" | "experiment" | "writing", number>> {
  const values = [
    { action: "idea" as const, value: idea, order: 0 },
    { action: "experiment" as const, value: experiment, order: 1 },
    { action: "writing" as const, value: writing, order: 2 },
  ].sort((left, right) => left.value - right.value || left.order - right.order);
  return { [values[0]!.action]: 3, [values[1]!.action]: 3 };
}

function getReviewDecision(
  effectiveScore: number,
  target: PaperTarget,
  reviewerType: PaperReviewerType,
  influence: number,
): Pick<PaperReviewerReport, "decision" | "reviewScore"> {
  const threshold = getReviewThresholds(target, influence)[reviewerType];
  if (effectiveScore < threshold.reject) {
    return { decision: "Reject", reviewScore: -1 };
  }
  if (effectiveScore < threshold.borderline) {
    return { decision: "Borderline", reviewScore: 0 };
  }
  return { decision: "Accept", reviewScore: 1 };
}

function createReviewerReport(
  target: PaperTarget,
  idea: number,
  experiment: number,
  writing: number,
  random: () => number,
  influence: number,
  academicYear: number,
): PaperReviewerReport {
  const reviewerRoll = clampRandomRoll(random());
  let cumulative = 0;
  const reviewerType = getReviewerWeights(academicYear).find(([_type, weight]) => {
    cumulative += weight;
    return reviewerRoll < cumulative;
  })?.[0] ?? "hostile";
  const reviewer = REVIEWER_DEFINITIONS.find((entry) => entry.type === reviewerType) ?? REVIEWER_DEFINITIONS[0]!;
  const effectiveScore = getReviewerEffectiveScore(reviewer.type, idea, experiment, writing, random);
  const { decision, reviewScore } = getReviewDecision(effectiveScore, target, reviewer.type, influence);
  const improvementAction = reviewer.type === "novelty"
    ? "idea"
    : reviewer.type === "experiment"
      ? "experiment"
      : reviewer.type === "expert"
        ? "idea"
        : undefined;
  const improvementAmount = reviewer.type === "novelty"
    ? 5
    : reviewer.type === "experiment"
      ? 5
      : reviewer.type === "expert"
        ? 10
        : undefined;
  const improvements = reviewer.type === "normal"
    ? { idea: 2, experiment: 2, writing: 2 }
    : reviewer.type === "strict"
      ? getStrictReviewerImprovements(idea, experiment, writing)
      : undefined;
  const sanChange = reviewer.type === "kind" ? 1 : reviewer.type === "hostile" ? -2 : undefined;
  return {
    reviewer: reviewer.name,
    reviewerType: reviewer.type,
    focus: reviewer.focus,
    effectiveScore,
    decision,
    reviewScore,
    comment: REVIEWER_COMMENTS[reviewer.type][decision],
    ...(improvementAction && improvementAmount !== undefined ? { improvementAction, improvementAmount } : {}),
    ...(improvements ? { improvements } : {}),
    ...(sanChange !== undefined ? { sanChange } : {}),
  };
}

export function getAcceptanceTypeThresholds(
  target: PaperTarget,
  influence = REVIEW_TARGET_AVERAGE_INFLUENCE[target],
): { spotlight?: number; oral: number; candidate?: number; bestPaper: number } {
  const factor = getReviewStrictnessMultiplier(target, influence);
  const base = ACCEPT_TYPE_SCORE_BY_TARGET[target];
  return {
    ...(base.spotlight !== undefined ? { spotlight: Math.max(1, Math.round(base.spotlight * factor)) } : {}),
    oral: Math.max(1, Math.round(base.oral * factor)),
    ...(base.candidate !== undefined ? { candidate: Math.max(1, Math.round(base.candidate * factor)) } : {}),
    bestPaper: Math.max(1, Math.round(base.bestPaper * factor)),
  };
}

export function getAcceptanceType(
  target: PaperTarget,
  submittedScore: number,
  random: () => number,
  influence = REVIEW_TARGET_AVERAGE_INFLUENCE[target],
): PaperAcceptType {
  const thresholds = getAcceptanceTypeThresholds(target, influence);
  if (target === "A") {
    if (submittedScore >= thresholds.bestPaper) {
      const chance = Math.min(0.35, 0.05 + (submittedScore - thresholds.bestPaper) * 0.02);
      if (clampRandomRoll(random()) < chance) return "Best Paper";
    }
    if (thresholds.candidate !== undefined && submittedScore >= thresholds.candidate) {
      const chance = Math.min(0.3, 0.08 + (submittedScore - thresholds.candidate) * 0.025);
      if (clampRandomRoll(random()) < chance) return "Best Paper Candidate";
    }
  }
  if (submittedScore >= thresholds.oral) {
    const chance = Math.min(0.4, 0.15 + (submittedScore - thresholds.oral) * 0.03);
    if (clampRandomRoll(random()) < chance) return "Oral";
  }
  if (target === "A" && thresholds.spotlight !== undefined && submittedScore >= thresholds.spotlight) {
    const spotlightChance = Math.min(0.18, 0.06 + (submittedScore - thresholds.spotlight) * 0.015);
    if (clampRandomRoll(random()) < spotlightChance) return "Spotlight";
  }
  return "Poster";
}

function formatReviewScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

export function resolvePaperReview(
  paper: Paper,
  random: () => number = Math.random,
): {
  nextPaper: Paper;
  scoreGain: number;
  acceptType: PaperAcceptType | null;
  text: string;
} {
  if (!paper.target) {
    return { nextPaper: paper, scoreGain: 0, acceptType: null, text: `${paper.title} 缺少投稿目标` };
  }

  const submittedIdea = paper.submittedIdea ?? paper.idea;
  const submittedExperiment = paper.submittedExperiment ?? paper.experiment;
  const submittedWriting = paper.submittedWriting ?? paper.writing;
  const reviewInfluence = getPaperReviewInfluence(paper);
  const reports = Array.from({ length: 3 }, () => createReviewerReport(
    paper.target!,
    submittedIdea,
    submittedExperiment,
    submittedWriting,
    random,
    reviewInfluence,
    paper.submittedYear ?? 1,
  ));
  const totalReviewScore = reports.reduce((total, report) => total + report.reviewScore, 0);
  const borderlineChance = totalReviewScore >= 2 || totalReviewScore <= -2
    ? null
    : getBorderlineAcceptChance(
      paper.target,
      submittedIdea + submittedExperiment + submittedWriting,
      totalReviewScore as -1 | 0 | 1,
    );
  const accepted = totalReviewScore >= 2
    || (totalReviewScore > -2 && totalReviewScore < 2 && clampRandomRoll(random()) < (borderlineChance ?? 0));
  const lastReview = { reports, totalReviewScore, accepted, borderlineChance };
  const reviewerText = reports
    .map((report) => `${report.reviewer}${formatReviewScore(report.reviewScore)}`)
    .join("、");

  if (accepted) {
    const submittedScore = submittedIdea + submittedExperiment + submittedWriting;
    const acceptType = getAcceptanceType(paper.target, submittedScore, random, reviewInfluence);
    return {
      nextPaper: { ...paper, status: "published", reviewMonthsLeft: 0, lastReview },
      scoreGain: SCORE_BY_TARGET[paper.target],
      acceptType,
      text: `${paper.title} 被 ${paper.target} 类接收为 ${acceptType}（${reviewerText}；总评${formatReviewScore(totalReviewScore)}）`,
    };
  }

  return {
    nextPaper: {
      ...paper,
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
      submittedMonth: null,
      submittedYear: null,
      conferenceHandled: false,
      lastReview,
    },
    scoreGain: 0,
    acceptType: null,
    text: `${paper.title} 审稿退回（${reviewerText}；总评${formatReviewScore(totalReviewScore)}）；可以继续修改`,
  };
}

export function getUnlockedPaperSlotCount(research: number): number {
  const unlockedCount = PAPER_SLOT_RESEARCH_THRESHOLDS.filter((threshold) => research >= threshold).length;
  return Math.min(Math.max(unlockedCount, 1), PAPER_SLOT_LIMIT);
}

export function getAvailablePaperSlotCount(
  state: Pick<GameState, "paperSlotsUnlocked"> & { player: Pick<GameState["player"], "research"> },
): number {
  return Math.min(
    PAPER_SLOT_LIMIT,
    Math.max(state.paperSlotsUnlocked, getUnlockedPaperSlotCount(state.player.research)),
  );
}

/**
 * Resolve active papers to workstation slots while keeping older saves, which
 * predate paperSlotIndex, aligned by their existing array order.
 */
export function getWorkstationPaperSlotMap(papers: readonly Paper[]): Map<number, Paper> {
  const papersBySlot = new Map<number, Paper>();
  const mappedPaperIds = new Set<string>();

  for (const paper of papers) {
    const slotIndex = paper.paperSlotIndex;
    if (
      Number.isInteger(slotIndex)
      && slotIndex !== undefined
      && slotIndex >= 0
      && slotIndex < PAPER_SLOT_LIMIT
      && !papersBySlot.has(slotIndex)
    ) {
      papersBySlot.set(slotIndex, paper);
      mappedPaperIds.add(paper.id);
    }
  }

  let fallbackSlotIndex = 0;
  for (const paper of papers) {
    if (mappedPaperIds.has(paper.id)) continue;
    while (fallbackSlotIndex < PAPER_SLOT_LIMIT && papersBySlot.has(fallbackSlotIndex)) {
      fallbackSlotIndex += 1;
    }
    if (fallbackSlotIndex >= PAPER_SLOT_LIMIT) break;
    papersBySlot.set(fallbackSlotIndex, paper);
    mappedPaperIds.add(paper.id);
    fallbackSlotIndex += 1;
  }

  return papersBySlot;
}
