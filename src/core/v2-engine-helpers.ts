import { syncDerivedAchievementFlags } from "./v2-achievements";
import { MAX_LOG_ENTRIES, MAX_SAN } from "./v2-content";
import type { GameLogEntry, GameState, Paper, PlayerStats } from "./v2-types";

const TRANSIENT_UI_HINT_LOGS = new Set([
  "必须先处理待办事件。",
  "必须先处理转博抉择。",
  "当前必须先处理待办事件。",
  "当前必须先处理转博投择。",
  "当前必须先处理待办事件或关键抉择。",
  "本月行动次数已用尽。",
  "入学后开放。",
]);

export function createLogEntry(totalMonths: number, text: string): GameLogEntry {
  return {
    id: `${totalMonths}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: totalMonths,
    text,
  };
}

export function isTransientUiHintLog(text: string): boolean {
  return TRANSIENT_UI_HINT_LOGS.has(text.trim());
}

export function pushLog(state: GameState, text: string): GameState {
  const achievementFlags = syncDerivedAchievementFlags(state.achievementFlags, state);
  const normalizedText = text.trim();
  if (isTransientUiHintLog(normalizedText)) {
    return {
      ...state,
      achievementFlags,
    };
  }

  return {
    ...state,
    achievementFlags,
    log: [createLogEntry(state.totalMonths, normalizedText), ...state.log].slice(0, MAX_LOG_ENTRIES),
  };
}

export function clampSan(value: number, sanCap = MAX_SAN): number {
  return Math.max(0, Math.min(sanCap, value));
}

export function clonePlayer(player: PlayerStats): PlayerStats {
  return { ...player };
}

export function cloneCareerProgress(state: GameState): GameState["careerProgress"] {
  return { ...state.careerProgress };
}

export function cloneCareerAbandoned(state: GameState): GameState["careerAbandoned"] {
  return { ...state.careerAbandoned };
}

export function cloneActionBonuses(state: GameState): GameState["actionBonuses"] {
  return { ...state.actionBonuses };
}

export function clonePersistentExtraActions(state: GameState): GameState["persistentExtraActions"] {
  return { ...state.persistentExtraActions };
}

export function cloneTemporaryActionEffects(state: GameState): GameState["temporaryActionEffects"] {
  return {
    idea: { ...state.temporaryActionEffects.idea },
    experiment: { ...state.temporaryActionEffects.experiment },
    writing: { ...state.temporaryActionEffects.writing },
  };
}

export function cloneConferenceEncounterState(state: GameState): GameState["conferenceEncounterState"] {
  return { ...state.conferenceEncounterState };
}

export function cloneConferenceCareerState(state: GameState): GameState["conferenceCareerState"] {
  return { ...state.conferenceCareerState };
}

export function cloneInternshipState(state: GameState): GameState["internshipState"] {
  return { ...state.internshipState };
}

export function cloneLoverState(state: GameState): GameState["loverState"] {
  return { ...state.loverState };
}

export function cloneLoverProgressState(state: GameState): GameState["loverProgressState"] {
  return { ...state.loverProgressState };
}

export function cloneFellowProgressState(state: GameState): GameState["fellowProgressState"] {
  return state.fellowProgressState.map((profile) => ({ ...profile }));
}

export function cloneResearchCapacityState(state: GameState): GameState["researchCapacityState"] {
  return { ...state.researchCapacityState };
}

export function cloneAdvisorProgressState(state: GameState): GameState["advisorProgressState"] {
  return { ...state.advisorProgressState };
}

export function cloneJointTrainingState(state: GameState): GameState["jointTrainingState"] {
  return { ...state.jointTrainingState };
}

export function clonePublicationEffects(state: GameState): GameState["publicationEffects"] {
  return {
    nextCitationMultipliers: [...state.publicationEffects.nextCitationMultipliers],
    citationPenaltyMultiplier: state.publicationEffects.citationPenaltyMultiplier,
  };
}

export function cloneRelationshipState(state: GameState): GameState["relationshipState"] {
  return { ...state.relationshipState };
}

export function cloneEventSupport(state: GameState): GameState["eventSupport"] {
  return { ...state.eventSupport };
}

export function cloneEventCounters(state: GameState): GameState["eventCounters"] {
  return { ...state.eventCounters };
}

export function cloneAchievementFlags(state: GameState): GameState["achievementFlags"] {
  return { ...state.achievementFlags };
}

export function getPublishedPaperCount(papers: Paper[]): number {
  return papers.filter((paper) => paper.status === "published").length;
}

export function getTotalPublishedPaperCount(state: Pick<GameState, "papers" | "externalPublications">): number {
  return getPublishedPaperCount(state.papers) + getPublishedPaperCount(state.externalPublications);
}

export function clearDraftPaperProgress(papers: Paper[]): Paper[] {
  return papers.map((paper) => {
    if (paper.status !== "draft") {
      return paper;
    }

    return {
      ...paper,
      idea: 0,
      experiment: 0,
      writing: 0,
    };
  });
}
