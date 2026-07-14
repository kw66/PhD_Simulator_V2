import type { GameState, ManualSaveSummary, ManualSlotId } from "./v2-types";

const AUTOSAVE_KEY = "vibe2_v2_autosave";
const MANUAL_SLOT_PREFIX = "vibe2_v2_manual_slot_";
export const MANUAL_SLOT_COUNT = 3;
const MANUAL_SLOTS: ManualSlotId[] = [1, 2, 3];

interface ManualSaveRecord {
  savedAt: string;
  state: GameState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getManualSlotKey(slot: ManualSlotId): string {
  return `${MANUAL_SLOT_PREFIX}${slot}`;
}

function clonePersistableState(state: GameState): GameState {
  return { ...state, manualSaveSummaries: [] };
}

function buildSummary(slot: ManualSlotId, savedAt: string, state: GameState): ManualSaveSummary {
  return {
    slot,
    savedAt,
    degree: state.degree,
    year: state.year,
    month: state.month,
    totalMonths: state.totalMonths,
    totalResearchScore: state.totalResearchScore,
    selectedRoleId: state.selectedRoleId,
    selectedAdvisorId: state.selectedAdvisorId,
    ending: state.ending,
  };
}

export function getManualSlots(): ManualSlotId[] {
  return [...MANUAL_SLOTS];
}

export function loadPersistedState(
  normalizeLoadedState: (value: unknown) => GameState | null,
): GameState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeLoadedState(parsed);
  } catch {
    return null;
  }
}

export function savePersistedState(state: GameState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(clonePersistableState(state)));
  } catch {
    // 忽略持久化失败，避免影响主流程
  }
}

export function clearPersistedState(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // 忽略清理失败
  }
}

export function saveManualState(slot: ManualSlotId, state: GameState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const record: ManualSaveRecord = {
      savedAt: new Date().toISOString(),
      state: clonePersistableState(state),
    };
    window.localStorage.setItem(getManualSlotKey(slot), JSON.stringify(record));
  } catch {
    // 忽略失败
  }
}

export function loadManualState(
  slot: ManualSlotId,
  normalizeLoadedState: (value: unknown) => GameState | null,
): GameState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getManualSlotKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || typeof parsed.savedAt !== "string") return null;
    return normalizeLoadedState(parsed.state);
  } catch {
    return null;
  }
}

export function deleteManualState(slot: ManualSlotId): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(getManualSlotKey(slot));
  } catch {
    // 忽略失败
  }
}

export function listManualSaveSummaries(
  normalizeLoadedState: (value: unknown) => GameState | null,
): ManualSaveSummary[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const summaries: ManualSaveSummary[] = [];
  for (const slot of MANUAL_SLOTS) {
    try {
      const raw = window.localStorage.getItem(getManualSlotKey(slot));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed) || typeof parsed.savedAt !== "string") continue;
      const state = normalizeLoadedState(parsed.state);
      if (!state) continue;
      summaries.push(buildSummary(slot, parsed.savedAt, state));
    } catch {
      // 忽略单槽异常
    }
  }
  return summaries.sort((a, b) => a.slot - b.slot);
}
