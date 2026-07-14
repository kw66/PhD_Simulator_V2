import { updateBestCareerOffer } from "./v2-career-rules";
import {
  cloneActionBonuses,
  cloneCareerAbandoned,
  cloneCareerProgress,
  clonePersistentExtraActions,
  clonePublicationEffects,
  cloneTemporaryActionEffects,
  getTotalPublishedPaperCount,
} from "./v2-engine-helpers";
import {
  applyPublicationPenaltyMultiplier,
  createGrantedPublishedPaper,
  queueNextPublicationCitationMultiplier,
} from "./v2-publication-rules";
import { applyTemporaryActionEffectUpdates } from "./v2-temporary-action-rules";
import type { EventChoice, GameState } from "./v2-types";

export interface CareerPublicationResolution {
  careerProgress: GameState["careerProgress"];
  careerAbandoned: GameState["careerAbandoned"];
  bestCareerOffer: GameState["bestCareerOffer"];
  actionBonuses: GameState["actionBonuses"];
  persistentExtraActions: GameState["persistentExtraActions"];
  temporaryActionEffects: GameState["temporaryActionEffects"];
  publicationEffects: GameState["publicationEffects"];
  externalPublications: GameState["externalPublications"];
}

export function applyCareerAndPublicationChoiceEffects(
  state: GameState,
  choice: EventChoice,
): CareerPublicationResolution {
  const careerProgress = cloneCareerProgress(state);
  const careerAbandoned = cloneCareerAbandoned(state);
  const actionBonuses = cloneActionBonuses(state);
  const persistentExtraActions = clonePersistentExtraActions(state);
  const temporaryActionEffects = cloneTemporaryActionEffects(state);
  const publicationEffects = clonePublicationEffects(state);
  const externalPublications = [...state.externalPublications];
  let bestCareerOffer = state.bestCareerOffer;

  const careerType = choice.effects.careerType;
  if (careerType) {
    if (choice.effects.abandonCareer === true) {
      careerAbandoned[careerType] = true;
    } else {
      const careerProgressGain = choice.effects.careerProgress ?? 0;
      careerProgress[careerType] += careerProgressGain;
      if (careerProgressGain > 0) {
        bestCareerOffer = updateBestCareerOffer(bestCareerOffer, careerType, careerProgress[careerType]);
      }
    }
  }

  actionBonuses.idea += choice.effects.ideaBonus ?? 0;
  actionBonuses.experiment += choice.effects.experimentBonus ?? 0;
  actionBonuses.writing += choice.effects.writingBonus ?? 0;

  if (choice.effects.persistentExtraActionDeltas) {
    persistentExtraActions.idea += choice.effects.persistentExtraActionDeltas.idea ?? 0;
    persistentExtraActions.experiment += choice.effects.persistentExtraActionDeltas.experiment ?? 0;
    persistentExtraActions.writing += choice.effects.persistentExtraActionDeltas.writing ?? 0;
  }

  const nextTemporaryActionEffects = applyTemporaryActionEffectUpdates(
    temporaryActionEffects,
    choice.effects.temporaryActionEffectUpdates,
  );
  const nextPublicationEffects = queueNextPublicationCitationMultiplier(
    publicationEffects,
    choice.effects.nextPublicationCitationMultiplier,
  );
  const resolvedPublicationEffects = applyPublicationPenaltyMultiplier(
    nextPublicationEffects,
    choice.effects.publicationPenaltyMultiplier,
  );

  if (choice.effects.grantedPublication) {
    externalPublications.push(
      createGrantedPublishedPaper(
        state.totalMonths,
        getTotalPublishedPaperCount(state),
        choice.effects.grantedPublication,
      ),
    );
  }

  return {
    careerProgress,
    careerAbandoned,
    bestCareerOffer,
    actionBonuses,
    persistentExtraActions,
    temporaryActionEffects: nextTemporaryActionEffects,
    publicationEffects: resolvedPublicationEffects,
    externalPublications,
  };
}
