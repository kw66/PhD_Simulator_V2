import {
  cloneAchievementFlags,
  cloneEventCounters,
  cloneEventSupport,
} from "./v2-engine-helpers";
import { applyFixedEventResolution } from "./v2-fixed-events";
import {
  applyCareerAndPublicationChoiceEffects,
} from "./v2-engine-event-resolution-career-publication";
import { applyPaperUpdates } from "./v2-engine-event-resolution-papers";
import {
  applyPlayerAndThesisChoiceEffects,
} from "./v2-engine-event-resolution-player-thesis";
import {
  applySocialSystemChoiceEffects,
} from "./v2-engine-event-resolution-social-systems";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export interface ResolvedEventChoiceState {
  nextState: GameState;
  resolvedOutcome: string;
  resolvedEnqueueEvents: PendingEvent[];
}

export function applyChoiceEffectsToState(
  state: GameState,
  choice: EventChoice,
): ResolvedEventChoiceState {
  const { nextPlayer, nextSanCap, nextThesis } = applyPlayerAndThesisChoiceEffects(state, choice);
  const {
    careerProgress,
    careerAbandoned,
    bestCareerOffer,
    actionBonuses,
    persistentExtraActions,
    temporaryActionEffects,
    publicationEffects,
    externalPublications,
  } = applyCareerAndPublicationChoiceEffects(state, choice);
  const eventSupport = cloneEventSupport(state);
  const eventCounters = cloneEventCounters(state);
  const achievementFlags = cloneAchievementFlags(state);

  if (choice.effects.eventSupportUpdates) {
    Object.assign(eventSupport, choice.effects.eventSupportUpdates);
  }
  const {
    nextPlayer: resolvedPlayer,
    relationshipState,
    conferenceEncounterState,
    conferenceCareerState,
    internshipState,
    loverState,
    loverProgressState,
    fellowProgressState,
    researchCapacityState,
    advisorProgressState,
    jointTrainingState,
  } = applySocialSystemChoiceEffects(state, choice, nextPlayer, nextSanCap);

  if (choice.effects.counterDeltas) {
    for (const [key, value] of Object.entries(choice.effects.counterDeltas)) {
      const typedKey = key as keyof typeof eventCounters;
      eventCounters[typedKey] += value ?? 0;
    }
  }

  for (const achievementFlag of choice.effects.achievementFlags ?? []) {
    achievementFlags[achievementFlag] = true;
  }

  const nextPapers = applyPaperUpdates(state, choice);

  let nextState: GameState = {
    ...state,
    player: resolvedPlayer,
    sanCap: nextSanCap,
    totalResearchScore: state.totalResearchScore + (choice.effects.score ?? 0),
    papers: nextPapers,
    externalPublications,
    thesis: nextThesis,
    careerProgress,
    careerAbandoned,
    bestCareerOffer,
    actionBonuses,
    persistentExtraActions,
    temporaryActionEffects,
    publicationEffects,
    relationshipState,
    conferenceEncounterState,
    conferenceCareerState,
    internshipState,
    loverState,
    loverProgressState,
    fellowProgressState,
    researchCapacityState,
    advisorProgressState,
    jointTrainingState,
    eventSupport,
    eventCounters,
    achievementFlags,
    badmintonYear: choice.effects.setBadmintonYearToCurrent === true ? state.year : state.badmintonYear,
  };
  let resolvedOutcome = choice.outcome;
  let resolvedEnqueueEvents: PendingEvent[] = [];

  if (choice.effects.fixedEventResolution) {
    const resolutionResult = applyFixedEventResolution(nextState, choice.effects.fixedEventResolution);
    nextState = resolutionResult.nextState;
    resolvedOutcome = resolutionResult.outcome;
    resolvedEnqueueEvents = resolutionResult.enqueueEvents ?? [];
  }

  return {
    nextState,
    resolvedOutcome,
    resolvedEnqueueEvents,
  };
}
