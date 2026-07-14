import {
  clearPersistedState as clearPersistedStateFromStorage,
  deleteManualState as deleteManualStateFromStorage,
  getManualSlots as getManualSlotsFromStorage,
  listManualSaveSummaries as listManualSaveSummariesFromStorage,
  loadManualState as loadManualStateFromStorage,
  loadPersistedState as loadPersistedStateFromStorage,
  saveManualState as saveManualStateToStorage,
  savePersistedState as savePersistedStateToStorage,
} from "./v2-persistence-storage";
import { normalizeLoadedState } from "./v2-persistence-hydrate";
import type { GameState, ManualSaveSummary, ManualSlotId } from "./v2-types";

export { MANUAL_SLOT_COUNT } from "./v2-persistence-storage";

export function getManualSlots(): ManualSlotId[] {
  return getManualSlotsFromStorage();
}

export function loadPersistedState(): GameState | null {
  return loadPersistedStateFromStorage(normalizeLoadedState);
}

export function savePersistedState(state: GameState): void {
  savePersistedStateToStorage(state);
}

export function clearPersistedState(): void {
  clearPersistedStateFromStorage();
}

export function saveManualState(slot: ManualSlotId, state: GameState): void {
  saveManualStateToStorage(slot, state);
}

export function loadManualState(slot: ManualSlotId): GameState | null {
  return loadManualStateFromStorage(slot, normalizeLoadedState);
}

export function deleteManualState(slot: ManualSlotId): void {
  deleteManualStateFromStorage(slot);
}

export function listManualSaveSummaries(): ManualSaveSummary[] {
  return listManualSaveSummariesFromStorage(normalizeLoadedState);
}
