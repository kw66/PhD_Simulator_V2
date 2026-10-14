import type { GameState, Paper, PaperActionType, PaperCollaborationEffect, PaperEffectUpdate } from "./v2-types";
import { getRoleTalentLevel } from "./v2-role-talent-state";

const SCORE_FIELDS = ["idea", "experiment", "writing"] as const;

/** Only help received by the player is amplified; preserve fractional input until final scoring. */
export function getRoleCollaborationScore(state: GameState, source: "advisor" | "fellow", amount: number): number {
  const talentId = source === "advisor" ? "mentor-insight" : "collective-wisdom";
  const expectedRole = source === "advisor" ? "teacher-child" : "social";
  const level = state.selectedRoleId === expectedRole ? getRoleTalentLevel(state, talentId) : 0;
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount * (1 + 0.5 * level))) : 0;
}

function normalizeScore(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
}

function scaleCollaboratorScores(paper: Paper, field: PaperActionType, previousTotal: number, nextTotal: number): Paper["collaborators"] {
  const collaborators = paper.collaborators;
  if (!collaborators?.length) return collaborators;
  const values = collaborators.map((collaborator) => normalizeScore(collaborator.contributionScores?.[field]));
  const attributed = values.reduce((sum, value) => sum + value, 0);
  if (attributed === 0) return collaborators;
  const target = previousTotal > 0 ? Math.min(nextTotal, Math.round(attributed * nextTotal / previousTotal)) : 0;
  const shares = values.map((value) => value * target / attributed);
  const adjusted = shares.map(Math.floor);
  const remainderOrder = shares.map((share, index) => ({ index, fraction: share - adjusted[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let left = target - adjusted.reduce((sum, value) => sum + value, 0); left > 0; left--) {
    adjusted[remainderOrder[left - 1]!.index]!++;
  }
  return collaborators.map((collaborator, index) => collaborator.contributionScores?.[field] === undefined
    ? collaborator
    : { ...collaborator, contributionScores: { ...collaborator.contributionScores, [field]: adjusted[index] } });
}

export function getPaperScoreBreakdown(paper: Paper, field: PaperActionType): {
  own: number;
  collaboration: number;
  total: number;
} {
  const total = normalizeScore(paper[field]);
  const collaboration = Math.min(total, normalizeScore(paper.collaborationScores?.[field]));
  return { own: total - collaboration, collaboration, total };
}

export function setPaperOwnScore(paper: Paper, field: PaperActionType, score: number): Paper {
  return { ...paper, [field]: normalizeScore(score) + getPaperScoreBreakdown(paper, field).collaboration };
}

export function setPaperTotalScore(paper: Paper, field: PaperActionType, score: number): Paper {
  const total = normalizeScore(score);
  if (!paper.collaborationScores) return { ...paper, [field]: total };
  const previous = getPaperScoreBreakdown(paper, field);
  const difference = Math.abs(total - previous.total);
  const exactShare = previous.total > 0 ? difference * previous.collaboration / previous.total : 0;
  const lowerShare = Math.floor(exactShare);
  const collaborationChange = lowerShare + (exactShare - lowerShare > 0.5 ? 1 : 0);
  const collaboration = total >= previous.total
    ? previous.collaboration + collaborationChange
    : previous.collaboration - collaborationChange;
  return {
    ...paper,
    [field]: total,
    collaborationScores: { ...paper.collaborationScores, [field]: Math.max(0, Math.min(total, collaboration)) },
    collaborators: scaleCollaboratorScores(paper, field, previous.collaboration, Math.max(0, Math.min(total, collaboration))),
  };
}

export function setPaperTotalScores(paper: Paper, scores: Partial<Record<PaperActionType, number>>): Paper {
  let nextPaper = paper;
  for (const field of SCORE_FIELDS) {
    if (scores[field] !== undefined) nextPaper = setPaperTotalScore(nextPaper, field, scores[field]!);
  }
  return nextPaper;
}

export function applyPaperEffectUpdates(paper: Paper, updates: PaperEffectUpdate[]): Paper {
  let nextPaper = paper;
  for (const update of updates) {
    if (update.id !== paper.id) continue;
    const { idea, experiment, writing, ...metadata } = update;
    nextPaper = { ...setPaperTotalScores(nextPaper, { idea, experiment, writing }), ...metadata };
  }
  return nextPaper;
}

export function addPaperCollaboration(paper: Paper, effect: PaperCollaborationEffect): Paper {
  if (paper.id !== effect.paperId || paper.nonFirstAuthor === true
    || (paper.status !== "draft" && paper.status !== "journal-reviewing")) return paper;
  const id = effect.collaborator?.id?.trim();
  const name = effect.collaborator?.name?.trim();
  if (!id || !name) return paper;

  let nextPaper = paper;
  for (const field of SCORE_FIELDS) {
    const gain = normalizeScore(effect.scores[field]);
    if (gain === 0) continue;
    const previous = getPaperScoreBreakdown(nextPaper, field);
    if (!Number.isSafeInteger(previous.total + gain)) return paper;
    nextPaper = {
      ...nextPaper,
      [field]: previous.total + gain,
      collaborationScores: { ...nextPaper.collaborationScores, [field]: previous.collaboration + gain },
    };
  }
  if (nextPaper === paper) return paper;
  const collaborators = paper.collaborators ?? [];
  const previous = collaborators.find((collaborator) => collaborator.id === id);
  const contributionScores = { ...previous?.contributionScores };
  for (const field of SCORE_FIELDS) {
    const gain = normalizeScore(effect.scores[field]);
    if (gain > 0) contributionScores[field] = normalizeScore(contributionScores[field]) + gain;
  }
  const contributor = { id, name: previous?.name ?? name, contributionScores };
  return {
    ...nextPaper,
    collaborators: previous
      ? collaborators.map((collaborator) => collaborator.id === id ? contributor : collaborator)
      : [...collaborators, contributor],
  };
}
