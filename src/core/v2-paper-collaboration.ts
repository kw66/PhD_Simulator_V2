import type { Paper, PaperActionType, PaperCollaborationEffect, PaperEffectUpdate } from "./v2-types";

const SCORE_FIELDS = ["idea", "experiment", "writing"] as const;

function normalizeScore(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
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
  return {
    ...nextPaper,
    collaborators: collaborators.some((collaborator) => collaborator.id === id)
      ? collaborators
      : [...collaborators, { id, name }],
  };
}
