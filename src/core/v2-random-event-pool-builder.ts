import type { PendingPaperCompetitionEvent } from "./v2-paper-competition";

export interface CandidateEventContext {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  social: number;
  research?: number;
  publishedPaperCount?: number;
  hasRecoverableDraftPaper?: boolean;
  hasAuthorshipEligibleDraftPaper?: boolean;
  pendingPaperCompetitionEvents?: PendingPaperCompetitionEvent[];
  excludedCategories?: readonly RandomEventCategory[];
}

export interface CandidateEventBuildResult {
  candidateEventIds: number[];
}

const DISEASE_EVENT_ID = 3;

export type RandomEventCategory = "punishment" | "reward" | "guidance" | "balance";

// User-confirmed buckets: punishment 12/13/16/17/18, reward 7/8/9/15,
// guidance 1/10/11/14, and balance 2/4/5/6.
const RANDOM_EVENT_CATEGORIES: Readonly<Record<number, RandomEventCategory>> = {
  1: "guidance",
  2: "balance",
  4: "balance",
  5: "balance",
  6: "balance",
  7: "reward",
  8: "reward",
  9: "reward",
  10: "guidance",
  11: "guidance",
  12: "punishment",
  13: "punishment",
  14: "guidance",
  15: "reward",
  16: "punishment",
  17: "punishment",
  18: "punishment",
};

export function getRandomEventCategory(eventId: number): RandomEventCategory | null {
  return RANDOM_EVENT_CATEGORIES[eventId] ?? null;
}

function uniqueEventIds(eventIds: number[]): number[] {
  const seen = new Set<number>();
  const nextIds: number[] = [];

  for (const eventId of eventIds) {
    if (!Number.isFinite(eventId) || seen.has(eventId)) {
      continue;
    }

    seen.add(eventId);
    nextIds.push(eventId);
  }

  return nextIds;
}

export function buildCandidateEventIds(params: {
  context: CandidateEventContext;
  socialUnlockEventId?: number;
}): CandidateEventBuildResult {
  const { context } = params;
  const pendingIds = new Set<number>((context.pendingPaperCompetitionEvents ?? []).map((event) => event.eventId));
  const candidateEventIds = context.availableRandomEvents.filter((eventId) => (
    eventId !== DISEASE_EVENT_ID
    && !pendingIds.has(eventId)
    && !context.usedRandomEvents.includes(eventId)
  ));
  const excludedCategories = new Set(context.excludedCategories ?? []);
  const alternateCategoryCandidates = excludedCategories.size === 0
    ? candidateEventIds
    : candidateEventIds.filter((eventId) => {
      const category = getRandomEventCategory(eventId);
      return category === null || !excludedCategories.has(category);
    });

  return {
    candidateEventIds: uniqueEventIds(alternateCategoryCandidates.length > 0 ? alternateCategoryCandidates : candidateEventIds),
  };
}

export function buildWeightedPool(params: {
  candidateEventIds: number[];
  baseWeightRepeat: number;
}): number[] {
  const { candidateEventIds, baseWeightRepeat } = params;
  const weightedPool: number[] = [];

  for (const eventId of candidateEventIds) {
    for (let index = 0; index < baseWeightRepeat; index += 1) {
      weightedPool.push(eventId);
    }
  }

  return weightedPool;
}
