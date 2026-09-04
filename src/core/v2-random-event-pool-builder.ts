export interface CandidateEventContext {
  availableRandomEvents: number[];
  usedRandomEvents: number[];
  social: number;
  research?: number;
  publishedPaperCount?: number;
  hasRecoverableDraftPaper?: boolean;
}

export interface CandidateEventBuildResult {
  candidateEventIds: number[];
}

const DISEASE_EVENT_ID = 3;
const MENTORING_EVENT_ID = 14;

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
}): CandidateEventBuildResult {
  const { context, socialUnlockEventId } = params;
  let candidateEventIds = context.availableRandomEvents.filter((eventId) => (
    eventId !== DISEASE_EVENT_ID
    && (eventId !== 16 || context.hasRecoverableDraftPaper === true)
  ));

  if ((context.research ?? 0) >= 6 || context.social >= 6) {
    if (!candidateEventIds.includes(socialUnlockEventId) && !context.usedRandomEvents.includes(socialUnlockEventId)) {
      candidateEventIds.push(socialUnlockEventId);
    }
  }

  if ((context.publishedPaperCount ?? 0) > 0 && !candidateEventIds.includes(MENTORING_EVENT_ID) && !context.usedRandomEvents.includes(MENTORING_EVENT_ID)) {
    candidateEventIds.push(MENTORING_EVENT_ID);
  }

  if (context.hasRecoverableDraftPaper === true && !candidateEventIds.includes(16) && !context.usedRandomEvents.includes(16)) {
    candidateEventIds.push(16);
  }

  return {
    candidateEventIds: uniqueEventIds(candidateEventIds),
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
