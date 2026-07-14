export interface CandidateEventContext {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  social: number;
  year: number;
  month: number;
}

export interface CandidateEventBuildResult {
  candidateEventIds: number[];
  isFirstSemester: boolean;
  isCooperationMonth: boolean;
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
  socialUnlockEventId: number;
  cooperationEventIdSet: Set<number>;
  negativeEventIdSet: Set<number>;
}): CandidateEventBuildResult {
  const { context, socialUnlockEventId, cooperationEventIdSet, negativeEventIdSet } = params;
  let candidateEventIds = [...context.availableRandomEvents];

  if (context.social >= 6 && !candidateEventIds.includes(socialUnlockEventId) && !context.usedRandomEvents.includes(socialUnlockEventId)) {
    candidateEventIds.push(socialUnlockEventId);
  }

  const isCooperationMonth = context.month === 7;
  if (isCooperationMonth) {
    candidateEventIds = candidateEventIds.filter((eventId) => cooperationEventIdSet.has(eventId));
  }

  const isFirstSemester = context.year === 1 && context.month >= 1 && context.month <= 6;
  if (isFirstSemester) {
    candidateEventIds = candidateEventIds.filter((eventId) => !negativeEventIdSet.has(eventId));
  }

  return {
    candidateEventIds: uniqueEventIds(candidateEventIds),
    isFirstSemester,
    isCooperationMonth,
  };
}

export function buildWeightedPool(params: {
  candidateEventIds: number[];
  coldEventId: number;
  coldActualWeight: number;
  baseWeightRepeat: number;
}): number[] {
  const { candidateEventIds, coldEventId, coldActualWeight, baseWeightRepeat } = params;
  const weightedPool: number[] = [];

  for (const eventId of candidateEventIds) {
    if (eventId === coldEventId) {
      if (coldActualWeight <= 0) {
        continue;
      }

      const repeatCount = Math.round(coldActualWeight * baseWeightRepeat);
      for (let index = 0; index < repeatCount; index += 1) {
        weightedPool.push(eventId);
      }
      continue;
    }

    for (let index = 0; index < baseWeightRepeat; index += 1) {
      weightedPool.push(eventId);
    }
  }

  return weightedPool;
}
