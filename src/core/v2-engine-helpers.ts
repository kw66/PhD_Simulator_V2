import { MAX_SAN } from "./v2-content";
import type { GameLogEntry, GameState, PlayerStats } from "./v2-types";

const TRANSIENT_UI_HINT_LOGS = new Set([
  "必须先处理待办事件。",
  "当前必须先处理待办事件。",
  "本月行动次数已用尽。",
  "入学后开放。",
]);

export function createLogEntry(
  totalMonths: number,
  text: string,
  metadata: Pick<GameLogEntry, "eventHistoryId"> = {},
): GameLogEntry {
  return {
    id: `${totalMonths}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: totalMonths,
    text,
    ...metadata,
  };
}

export function isTransientUiHintLog(text: string): boolean {
  return TRANSIENT_UI_HINT_LOGS.has(text.trim());
}

export function pushLog(
  state: GameState,
  text: string,
  metadata: Pick<GameLogEntry, "eventHistoryId"> = {},
): GameState {
  const normalizedText = text.trim();
  if (!normalizedText || isTransientUiHintLog(normalizedText)) {
    return state;
  }

  return {
    ...state,
    log: [createLogEntry(state.totalMonths, normalizedText, metadata), ...state.log],
  };
}

/** Records the first useful failure while collapsing repeated clicks on the same no-op. */
export function pushNoOpLog(state: GameState, text: string): GameState {
  const normalizedText = text.trim();
  if (!normalizedText || isTransientUiHintLog(normalizedText)) return state;
  if (state.log.some((entry) => entry.month === state.totalMonths && entry.text === normalizedText)) {
    return state;
  }
  return pushLog(state, normalizedText);
}

export function clampSan(value: number, sanCap = MAX_SAN): number {
  return Math.max(0, Math.min(sanCap, value));
}

export function clonePlayer(player: PlayerStats): PlayerStats {
  return { ...player };
}
