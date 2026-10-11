import type { GameState, SanHistoryEntry } from "./v2-types";

export function recordSanMonth(state: GameState): GameState {
  const entry = { totalMonths: state.totalMonths, san: state.player.san, sanCap: state.sanCap };
  const history = (state.sanHistory ?? []).filter((month) => month.totalMonths !== state.totalMonths);
  return { ...state, sanHistory: [...history, entry].sort((a, b) => a.totalMonths - b.totalMonths) };
}

export function getSanTimeline(state: GameState): SanHistoryEntry[] {
  return [
    ...(state.sanHistory ?? []).filter((entry) => entry.totalMonths < state.totalMonths),
    { totalMonths: state.totalMonths, san: state.player.san, sanCap: state.sanCap },
  ].sort((a, b) => a.totalMonths - b.totalMonths);
}
