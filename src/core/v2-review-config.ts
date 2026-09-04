import type { PaperReviewerType, PaperTarget } from "./v2-types";

export const REVIEW_BASE_THRESHOLDS: Record<PaperTarget, Record<PaperReviewerType, { reject: number; borderline: number }>> = {
  A: {
    novelty: { reject: 50, borderline: 80 },
    experiment: { reject: 50, borderline: 80 },
    normal: { reject: 50, borderline: 80 },
    gpt: { reject: 40, borderline: 90 },
    expert: { reject: 50, borderline: 80 },
    kind: { reject: 40, borderline: 60 },
    strict: { reject: 70, borderline: 100 },
    hostile: { reject: 70, borderline: 100 },
  },
  B: {
    novelty: { reject: 30, borderline: 50 },
    experiment: { reject: 30, borderline: 50 },
    normal: { reject: 30, borderline: 50 },
    gpt: { reject: 25, borderline: 60 },
    expert: { reject: 30, borderline: 50 },
    kind: { reject: 25, borderline: 40 },
    strict: { reject: 40, borderline: 60 },
    hostile: { reject: 40, borderline: 60 },
  },
  C: {
    novelty: { reject: 15, borderline: 30 },
    experiment: { reject: 15, borderline: 30 },
    normal: { reject: 15, borderline: 30 },
    gpt: { reject: 15, borderline: 40 },
    expert: { reject: 15, borderline: 30 },
    kind: { reject: 10, borderline: 20 },
    strict: { reject: 20, borderline: 40 },
    hostile: { reject: 20, borderline: 40 },
  },
};

export const REVIEWER_BASE_WEIGHTS: ReadonlyArray<readonly [PaperReviewerType, number]> = [
  ["novelty", 0.1],
  ["experiment", 0.1],
  ["normal", 0.3],
  ["gpt", 0.1],
  ["expert", 0.1],
  ["kind", 0.1],
  ["strict", 0.1],
  ["hostile", 0.1],
];

export const REVIEWER_ANNUAL_WEIGHT_DELTAS: ReadonlyArray<readonly [PaperReviewerType, number]> = [
  ["novelty", 0.01],
  ["experiment", 0.01],
  ["normal", -0.05],
  ["gpt", 0.04],
  ["expert", -0.01],
  ["kind", -0.01],
  ["strict", 0.01],
  ["hostile", 0],
];

export const REVIEWER_WEIGHTS = REVIEWER_BASE_WEIGHTS;

export const REVIEW_TARGET_AVERAGE_INFLUENCE: Record<PaperTarget, number> = {
  A: 1.2,
  B: 0.65,
  C: 0.3,
};

const BORDERLINE_BASE_CONFIG: Record<PaperTarget, { baseRate: number; scoreBaseline: number; scoreRange: number }> = {
  A: { baseRate: 0.5, scoreBaseline: 65, scoreRange: 30 },
  B: { baseRate: 0.6, scoreBaseline: 45, scoreRange: 25 },
  C: { baseRate: 0.8, scoreBaseline: 28, scoreRange: 20 },
};

export function getReviewerWeights(academicYear = 1): ReadonlyArray<readonly [PaperReviewerType, number]> {
  const yearsElapsed = Math.max(0, Math.floor(Number.isFinite(academicYear) ? academicYear : 1) - 1);
  if (yearsElapsed === 0) return REVIEWER_BASE_WEIGHTS;
  const deltas = new Map(REVIEWER_ANNUAL_WEIGHT_DELTAS);
  const raw = REVIEWER_BASE_WEIGHTS.map(([type, weight]) => [
    type,
    Math.max(0, weight + (deltas.get(type) ?? 0) * yearsElapsed),
  ] as const);
  const total = raw.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return REVIEWER_BASE_WEIGHTS;
  return raw.map(([type, weight]) => [type, Number((weight / total).toFixed(12))] as const);
}

export function getReviewStrictnessMultiplier(target: PaperTarget, influence: number): number {
  const baseline = REVIEW_TARGET_AVERAGE_INFLUENCE[target];
  if (!Number.isFinite(influence) || baseline <= 0) return 1;
  return influence / baseline;
}

export function getReviewThresholds(
  target: PaperTarget,
  influence: number,
): Record<PaperReviewerType, { reject: number; borderline: number }> {
  const factor = getReviewStrictnessMultiplier(target, influence);
  return Object.fromEntries(
    Object.entries(REVIEW_BASE_THRESHOLDS[target]).map(([type, threshold]) => [
      type,
      {
        reject: Math.max(1, Math.round(threshold.reject * factor)),
        borderline: Math.max(
          Math.round(threshold.reject * factor) + 1,
          Math.round(threshold.borderline * factor),
        ),
      },
    ]),
  ) as Record<PaperReviewerType, { reject: number; borderline: number }>;
}

export function getBorderlineAcceptChance(
  target: PaperTarget,
  submittedScore: number,
  totalReviewScore: -1 | 0 | 1,
): number {
  const config = BORDERLINE_BASE_CONFIG[target];
  let baseRate = config.baseRate;
  if (totalReviewScore === 1) baseRate += 0.15;
  if (totalReviewScore === -1) baseRate -= 0.15;
  const normalizedScore = (submittedScore - config.scoreBaseline) / config.scoreRange;
  const scoreModifier = (2 / (1 + Math.exp(-normalizedScore)) - 1) * 0.12;
  const adjustedBase = Math.max(0.08, Math.min(0.98, baseRate + scoreModifier));
  if (totalReviewScore === 1) return 1 - 0.25 * (1 - adjustedBase);
  if (totalReviewScore === -1) return 0.25 * adjustedBase;
  return adjustedBase;
}
