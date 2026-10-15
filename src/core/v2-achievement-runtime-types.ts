import type { AchievementCollectionProgress, GameState } from "./v2-types";

/** Evidence collected from committed gameplay; rewards are deferred until the ending. */
export interface AchievementRunProgress {
  satisfied: string[];
  counters: Record<string, number>;
  sets: Record<string, string[]>;
  peaks: Record<string, number>;
  minima: Record<string, number>;
  collections: AchievementCollectionProgress;
}

export function createAchievementRunProgress(): AchievementRunProgress {
  return { satisfied: [], counters: {}, sets: {}, peaks: {}, minima: {},
    collections: { buffs: [], products: [], conferences: [], locations: [], directions: [] } };
}

export function recordAchievementCounter(state: GameState, key: string, amount: number): GameState {
  if (!Number.isFinite(amount) || amount <= 0) return state;
  const run = state.achievementProgress ?? createAchievementRunProgress();
  return { ...state, achievementProgress: { ...run, counters: { ...run.counters, [key]: (run.counters[key] ?? 0) + amount } } };
}

export function recordAchievementFact(state: GameState, id: string): GameState {
  const run = state.achievementProgress ?? createAchievementRunProgress();
  if (run.satisfied.includes(id)) return state;
  return { ...state, achievementProgress: { ...run, satisfied: [...run.satisfied, id] } };
}

/** Sample real attributes, before reactions may immediately reset them. */
export function recordAchievementStats(state: GameState): GameState {
  const run = state.achievementProgress ?? createAchievementRunProgress();
  const peaks = { ...run.peaks };
  const minima = { ...run.minima };
  const values: Record<string, number> = {
    ...state.player, "san-cap": state.sanCap,
    "research-cap": state.researchCapacityState.baseCap + state.researchCapacityState.jointTrainingCitationCapBonus + state.researchCapacityState.otherCapBonus,
    "attribute-spread": Math.max(state.player.research, state.player.social, state.player.favor) - Math.min(state.player.research, state.player.social, state.player.favor),
  };
  if (state.degree === "master") for (const stat of ["research", "social", "favor"] as const) values[`master:${stat}`] = state.player[stat];
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) continue;
    peaks[key] = Math.max(peaks[key] ?? -Infinity, value);
    minima[key] = Math.min(minima[key] ?? Infinity, value);
  }
  return { ...state, achievementProgress: { ...run, peaks, minima } };
}

/** Initial SAN capacity is not an increase; only gameplay mutations call this. */
export function recordAchievementSanCapGain(state: GameState, gain: number): GameState {
  return recordAchievementStats(recordAchievementCounter(state, "san-cap-gain", gain));
}

export function recordAchievementAction(state: GameState): GameState {
  const next = recordAchievementCounter(state, `actions:${state.totalMonths}`, 1);
  const run = next.achievementProgress!;
  return { ...next, achievementProgress: { ...run, peaks: { ...run.peaks,
    "monthly-actions": Math.max(run.peaks["monthly-actions"] ?? 0, run.counters[`actions:${state.totalMonths}`] ?? 0),
  } } };
}
