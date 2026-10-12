import { getAcademicCalendarYear } from "./v2-calendar";
import { generatePaperTopic } from "./v2-paper-topics";
import { getAcceptedPaperScore } from "./v2-publication-rules";
import { getActualSanChange } from "./v2-sanity-rules";
import type { Degree, GameState, Paper } from "./v2-types";

export interface ThesisResearchPoint {
  score: number;
  initialScore: number;
  supportPaperId: string | null;
  supportPaperTitle: string | null;
  lastAdvancedTotalMonths: number | null;
}

export interface ThesisReviewerReport {
  weights: number[];
  effectiveScore: number;
  grade: "A" | "B" | "C" | "D";
  score: number;
  comment: string;
}

export interface ThesisBlindReview {
  submitted: boolean;
  reason: string | null;
  reports: ThesisReviewerReport[];
  passed: boolean;
  excellent: boolean;
  degree: Degree;
  title: string;
  researchPoints: ThesisResearchPoint[];
}

export interface ThesisScoreHistoryEntry {
  totalMonths: number;
  pointScores: number[];
  title: string;
}

export interface ThesisState {
  degree: Degree | null;
  title: string;
  topicId: string | null;
  topicLabel: string;
  researchPoints: ThesisResearchPoint[];
  scoreHistory: ThesisScoreHistoryEntry[];
  usedSupportPaperIds: string[];
  review: ThesisBlindReview | null;
  reviewResolved: boolean;
}

export const THESIS_REVIEW_THRESHOLDS = {
  master: { C: 120, B: 200, A: 300 },
  phd: { C: 240, B: 360, A: 500 },
} as const;

export function createInitialThesisState(): ThesisState {
  return {
    degree: null, title: "", topicId: null, topicLabel: "", researchPoints: [], scoreHistory: [],
    usedSupportPaperIds: [], review: null, reviewResolved: false,
  };
}

export function getGraduationPreparationYear(degree: Degree): number {
  return degree === "master" ? 3 : 6;
}

export function isGraduationPreparationUnlocked(state: GameState): boolean {
  const year = getGraduationPreparationYear(state.degree);
  return state.year > year || (state.year === year && state.month >= 1);
}

function paperScore(paper: Paper): number {
  return getAcceptedPaperScore(paper);
}

function supportPapers(state: GameState): Paper[] {
  const papers = new Map<string, Paper>();
  for (const paper of [...state.papers, ...state.externalPublications]) {
    if (paper.status === "published" && !paper.nonFirstAuthor && !papers.has(paper.id)) {
      papers.set(paper.id, paper);
    }
  }
  return [...papers.values()].sort((left, right) => paperScore(right) - paperScore(left));
}

function clampRoll(random: () => number): number {
  const roll = random();
  return Number.isFinite(roll) ? Math.max(0, Math.min(0.999999, roll)) : 0;
}

function strongestSupportPapers(papers: Paper[], count: number): Paper[] {
  const byTopic = new Map<string, Paper[]>();
  for (const paper of papers) {
    const group = byTopic.get(paper.topicId) ?? [];
    if (group.length < count) group.push(paper);
    byTopic.set(paper.topicId, group);
  }
  return [...byTopic.values()].sort((left, right) =>
    right.reduce((sum, paper) => sum + paperScore(paper), 0)
    - left.reduce((sum, paper) => sum + paperScore(paper), 0),
  )[0] ?? [];
}

function thesisTitle(topicLabel: string, random: () => number): string {
  const directions = ["关键方法", "模型构建与优化", "方法设计与实验分析", "鲁棒性与泛化"];
  return `${topicLabel}的${directions[Math.floor(clampRoll(random) * directions.length)]}研究`;
}

function researchPointsFromPapers(papers: Paper[], count: number, previous: ThesisResearchPoint[] = []): ThesisResearchPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    score: papers[index] ? paperScore(papers[index]) : 0,
    initialScore: papers[index] ? paperScore(papers[index]) : 0,
    supportPaperId: papers[index]?.id ?? null,
    supportPaperTitle: papers[index]?.title ?? null,
    lastAdvancedTotalMonths: previous[index]?.lastAdvancedTotalMonths ?? null,
  }));
}

function initializeThesis(state: GameState, random: () => number): ThesisState {
  const count = state.degree === "master" ? 2 : 3;
  const chosen = strongestSupportPapers(supportPapers(state), count);
  const topic = chosen[0] ?? generatePaperTopic(getAcademicCalendarYear(state.year, state.month), random);
  const researchPoints = researchPointsFromPapers(chosen, count);
  const title = thesisTitle(topic.topicLabel, random);
  return {
    ...createInitialThesisState(),
    degree: state.degree,
    title,
    topicId: topic.topicId,
    topicLabel: topic.topicLabel,
    researchPoints,
    scoreHistory: [{ totalMonths: state.totalMonths, pointScores: researchPoints.map((point) => point.score), title }],
    usedSupportPaperIds: chosen.map((paper) => paper.id),
  };
}

function withScoreHistory(thesis: ThesisState, totalMonths: number): ThesisState {
  const pointScores = thesis.researchPoints.map((point) => point.score);
  const last = thesis.scoreHistory?.at(-1);
  if (last?.title === thesis.title && last.pointScores.length === pointScores.length
    && pointScores.every((score, index) => score === last.pointScores[index])) return thesis;
  return { ...thesis, scoreHistory: [...(thesis.scoreHistory ?? []), { totalMonths, pointScores, title: thesis.title }] };
}

export function syncThesisState(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || !isGraduationPreparationUnlocked(state) || state.thesis.review || state.thesis.reviewResolved) return state;
  if (state.thesis.degree === null) {
    return { ...state, thesis: initializeThesis(state, random) };
  }
  if (state.thesis.degree !== state.degree || state.year !== getGraduationPreparationYear(state.degree)
    || state.month < 1 || state.month > 8) return state;
  const researchPoints = state.thesis.researchPoints.map((point) => ({ ...point }));
  const used = new Set(state.thesis.usedSupportPaperIds);
  for (const point of researchPoints) {
    if (point.supportPaperId) used.add(point.supportPaperId);
  }
  let changed = used.size !== state.thesis.usedSupportPaperIds.length;
  const papers = supportPapers(state);
  for (const paper of papers) {
    if (paper.topicId !== state.thesis.topicId || used.has(paper.id)) continue;
    const weakest = researchPoints.reduce((best, point, index) =>
      point.score < researchPoints[best]!.score ? index : best, 0);
    const point = researchPoints[weakest];
    if (!point || paperScore(paper) <= point.score) continue;
    researchPoints[weakest] = {
      ...point, score: paperScore(paper), initialScore: paperScore(paper), supportPaperId: paper.id, supportPaperTitle: paper.title,
    };
    used.add(paper.id);
    changed = true;
  }
  const count = state.degree === "master" ? 2 : 3;
  const chosen = strongestSupportPapers(papers.filter((paper) => paper.topicId !== state.thesis.topicId), count);
  const topic = chosen[0];
  if (topic && chosen.reduce((sum, paper) => sum + paperScore(paper), 0)
    > researchPoints.reduce((sum, point) => sum + point.score, 0)) {
    for (const paper of chosen) used.add(paper.id);
    return {
      ...state,
      thesis: withScoreHistory({
        ...state.thesis, title: thesisTitle(topic.topicLabel, random), topicId: topic.topicId, topicLabel: topic.topicLabel,
        researchPoints: researchPointsFromPapers(chosen, count, researchPoints), usedSupportPaperIds: [...used],
      }, state.totalMonths),
    };
  }
  return changed ? {
    ...state, thesis: withScoreHistory({ ...state.thesis, researchPoints, usedSupportPaperIds: [...used] }, state.totalMonths),
  } : state;
}

export function getThesisAdvanceSanCost(state: GameState): number {
  return -getActualSanChange(-3, state.month, state.eventSupport, state.buffs);
}

export function getThesisAdvanceFailure(state: GameState, index: number): string | null {
  if (state.phase !== "playing") return "当前不能推进毕业论文";
  if (!isGraduationPreparationUnlocked(state) || state.thesis.degree !== state.degree) return "毕业论文尚未开放";
  if (state.thesis.review || state.thesis.reviewResolved || state.year !== getGraduationPreparationYear(state.degree)
    || state.month < 1 || state.month > 7) return "写作期已结束，毕业论文已封存";
  if (!Number.isInteger(index) || !state.thesis.researchPoints[index]) return "没有找到这个研究点";
  if (state.thesis.researchPoints[index]!.lastAdvancedTotalMonths === state.totalMonths) return "这个研究点本月已推进";
  return null;
}

export function advanceThesisResearchPoint(state: GameState, index: number): GameState {
  if (getThesisAdvanceFailure(state, index)) return state;
  const nextState = syncThesisState(state);
  return {
    ...nextState,
    player: { ...nextState.player, san: nextState.player.san - getThesisAdvanceSanCost(nextState) },
    thesis: withScoreHistory({
      ...nextState.thesis,
      researchPoints: nextState.thesis.researchPoints.map((point, pointIndex) => pointIndex === index ? {
        ...point, score: point.score + Math.floor(nextState.player.research), lastAdvancedTotalMonths: state.totalMonths,
      } : point),
    }, state.totalMonths),
  };
}

function sampleReport(degree: Degree, points: ThesisResearchPoint[], random: () => number): ThesisReviewerReport {
  let remaining = 0.6;
  const extras = points.map((_, index) => {
    const extra = index === points.length - 1 ? remaining : clampRoll(random) * remaining;
    remaining -= extra;
    return extra;
  });
  for (let index = extras.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(clampRoll(random) * (index + 1));
    [extras[index], extras[swapIndex]] = [extras[swapIndex]!, extras[index]!];
  }
  const weights = extras.map((extra) => (degree === "master" ? 1.2 : 0.8) + extra);
  const effectiveScore = Math.round(points.reduce((sum, point, index) => sum + point.score * weights[index]!, 0));
  const thresholds = THESIS_REVIEW_THRESHOLDS[degree];
  const grade = effectiveScore >= thresholds.A ? "A" : effectiveScore >= thresholds.B ? "B"
    : effectiveScore >= thresholds.C ? "C" : "D";
  const bands = { A: [90, 100], B: [75, 89], C: [60, 74], D: [0, 59] } as const;
  const [minimum, maximum] = bands[grade];
  const comments = {
    A: "研究内容扎实，各研究点形成了清晰的论证，达到优秀标准。",
    B: "研究工作达到学位论文要求，建议进一步完善细节。",
    C: "已有一定研究基础，但论证仍需补充，未达到本次盲审通过要求。",
    D: "研究工作与论证尚不充分，未达到本次盲审通过要求。",
  };
  return { weights, effectiveScore, grade, score: minimum + Math.floor(clampRoll(random) * (maximum - minimum + 1)), comment: comments[grade] };
}

export function prepareThesisBlindReview(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== "playing" || state.thesis.review || state.thesis.reviewResolved
    || state.year !== getGraduationPreparationYear(state.degree) || state.month < 8) return state;
  const nextState = syncThesisState(state, random);
  const thesis = withScoreHistory(nextState.thesis, state.totalMonths);
  const submitted = nextState.graduationScoreTarget !== null
    && nextState.totalResearchScore >= nextState.graduationScoreTarget;
  const researchPoints = thesis.researchPoints.map((point) => ({ ...point }));
  const reports = submitted ? Array.from({ length: state.degree === "master" ? 3 : 5 }, () =>
    sampleReport(state.degree, researchPoints, random)) : [];
  const review: ThesisBlindReview = {
    degree: state.degree, title: thesis.title, researchPoints,
    submitted,
    reason: submitted ? null : nextState.graduationScoreTarget === null
      ? "毕业科研分要求尚未确定，无法送审。" : `科研分 ${nextState.totalResearchScore} 未达到毕业要求 ${nextState.graduationScoreTarget}，无法送审。`,
    reports,
    passed: submitted && reports.every((report) => report.grade === "A" || report.grade === "B"),
    excellent: submitted && reports.every((report) => report.grade === "A"),
  };
  return { ...nextState, thesis: { ...thesis, review } };
}
