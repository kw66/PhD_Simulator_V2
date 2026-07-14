import { syncDerivedAchievementFlags } from "./v2-achievements";
import {
  normalizeAchievementFlags,
  normalizeActionBonuses,
  normalizeBestCareerOffer,
  normalizeCoffeeState,
  normalizeConferenceCareerState,
  normalizeEventCounters,
  normalizeEventSupportState,
  normalizePersistentExtraActions,
  normalizePublicationEffects,
  normalizeRandomEventState,
  normalizeReadingState,
  normalizeShopState,
  normalizeTemporaryActionEffects,
} from "./v2-persistence-normalize-core";
import {
  normalizeAdvisorProgressState,
  normalizeFellowProgressState,
  normalizeLoverProgressState,
  normalizeRelationshipState,
} from "./v2-persistence-normalize-relationships";
import {
  normalizeConferenceEncounterState,
  normalizeInternshipState,
  normalizeJointTrainingState,
  normalizeLoverState,
  normalizeResearchCapacityState,
} from "./v2-persistence-normalize-life";
import { isObject } from "./v2-persistence-validate";
import type { GameState } from "./v2-types";

export function normalizeThesisState(value: Record<string, unknown>): GameState["thesis"] {
  return isObject(value.thesis)
    ? {
      progress: typeof value.thesis.progress === "number" ? value.thesis.progress : 0,
      started: value.thesis.started === true,
      completed: value.thesis.completed === true,
      abandoned: value.thesis.abandoned === true,
    }
    : { progress: 0, started: false, completed: false, abandoned: false };
}

export function normalizeCareerProgressState(value: Record<string, unknown>): GameState["careerProgress"] {
  return isObject(value.careerProgress)
    ? {
      internet: typeof value.careerProgress.internet === "number" ? value.careerProgress.internet : 0,
      stateOwned: typeof value.careerProgress.stateOwned === "number" ? value.careerProgress.stateOwned : 0,
      civilService: typeof value.careerProgress.civilService === "number" ? value.careerProgress.civilService : 0,
      academic: typeof value.careerProgress.academic === "number" ? value.careerProgress.academic : 0,
    }
    : { internet: 0, stateOwned: 0, civilService: 0, academic: 0 };
}

export function normalizeCareerAbandonedState(value: Record<string, unknown>): GameState["careerAbandoned"] {
  return isObject(value.careerAbandoned)
    ? {
      internet: value.careerAbandoned.internet === true,
      stateOwned: value.careerAbandoned.stateOwned === true,
      civilService: value.careerAbandoned.civilService === true,
      academic: value.careerAbandoned.academic === true,
    }
    : { internet: false, stateOwned: false, civilService: false, academic: false };
}

function getAchievementSyncInput(
  value: Record<string, unknown>,
  shopState: GameState["shopState"],
  coffeeState: GameState["coffeeState"],
  eventSupport: GameState["eventSupport"],
): {
  shopState: GameState["shopState"];
  coffeeState: GameState["coffeeState"];
  eventSupport: GameState["eventSupport"];
  papers: GameState["papers"];
} {
  return {
    shopState,
    coffeeState,
    eventSupport,
    papers: Array.isArray(value.papers)
      ? value.papers.filter((item): item is GameState["papers"][number] => (
        isObject(item)
        && typeof item.status === "string"
        && typeof item.idea === "number"
        && typeof item.experiment === "number"
        && typeof item.writing === "number"
      ))
      : [],
  };
}

export function buildNormalizedHydratedState(
  value: Record<string, unknown>,
): Pick<
  GameState,
  | "sanCap"
  | "totalCitations"
  | "externalPublications"
  | "availableRandomEvents"
  | "usedRandomEvents"
  | "coldWeight"
  | "badmintonYear"
  | "totalRandomEventCount"
  | "slotPublishedA"
  | "upgradedSlots"
  | "thesis"
  | "careerProgress"
  | "careerAbandoned"
  | "bestCareerOffer"
  | "shopState"
  | "coffeeState"
  | "readingState"
  | "actionBonuses"
  | "persistentExtraActions"
  | "temporaryActionEffects"
  | "publicationEffects"
  | "relationshipState"
  | "conferenceEncounterState"
  | "conferenceCareerState"
  | "internshipState"
  | "loverState"
  | "loverProgressState"
  | "fellowProgressState"
  | "researchCapacityState"
  | "advisorProgressState"
  | "jointTrainingState"
  | "eventSupport"
  | "eventCounters"
  | "achievementFlags"
  | "internshipCount"
  | "willTransferPhDYear3"
  | "isNatureExtensionYear"
> {
  const shopState = normalizeShopState(value);
  const coffeeState = normalizeCoffeeState(value);
  const eventSupport = normalizeEventSupportState(value);

  return {
    sanCap: typeof value.sanCap === "number" ? value.sanCap : 20,
    totalCitations: typeof value.totalCitations === "number" ? value.totalCitations : 0,
    externalPublications: Array.isArray(value.externalPublications) ? value.externalPublications as GameState["externalPublications"] : [],
    ...normalizeRandomEventState(value),
    slotPublishedA: Array.isArray(value.slotPublishedA) ? value.slotPublishedA : [false, false, false, false],
    upgradedSlots: Array.isArray(value.upgradedSlots) ? value.upgradedSlots : [false, false, false, false],
    thesis: normalizeThesisState(value),
    careerProgress: normalizeCareerProgressState(value),
    careerAbandoned: normalizeCareerAbandonedState(value),
    bestCareerOffer: normalizeBestCareerOffer(value.bestCareerOffer),
    shopState,
    coffeeState,
    readingState: normalizeReadingState(value),
    actionBonuses: normalizeActionBonuses(value),
    persistentExtraActions: normalizePersistentExtraActions(value),
    temporaryActionEffects: normalizeTemporaryActionEffects(value),
    publicationEffects: normalizePublicationEffects(value),
    relationshipState: normalizeRelationshipState(value),
    conferenceEncounterState: normalizeConferenceEncounterState(value),
    conferenceCareerState: normalizeConferenceCareerState(value),
    internshipState: normalizeInternshipState(value),
    loverState: normalizeLoverState(value),
    loverProgressState: normalizeLoverProgressState(value),
    fellowProgressState: normalizeFellowProgressState(value),
    researchCapacityState: normalizeResearchCapacityState(value),
    advisorProgressState: normalizeAdvisorProgressState(value),
    jointTrainingState: normalizeJointTrainingState(value),
    eventSupport,
    eventCounters: normalizeEventCounters(value),
    achievementFlags: syncDerivedAchievementFlags(
      normalizeAchievementFlags(value),
      getAchievementSyncInput(value, shopState, coffeeState, eventSupport),
    ),
    internshipCount: typeof value.internshipCount === "number" ? value.internshipCount : 0,
    willTransferPhDYear3: value.willTransferPhDYear3 === true,
    isNatureExtensionYear: value.isNatureExtensionYear === true,
  };
}
