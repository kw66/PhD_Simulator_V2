import { loadOrCreateAccountProfile, saveAccountProfile } from "./v2-account-persistence";
import { applyFinishedRunToAccountProfile, changeLobbyRolePage, changeRoleAchievementPage, isRoleOwned, selectLobbyRole } from "./v2-account";
import { dispatchDebugAction } from "./v2-debug-tools";
import { createInitialState, dispatchAction } from "./v2-engine";
import { clearPersistedState, deleteManualState, listManualSaveSummaries, loadManualState, loadPersistedState, saveManualState, savePersistedState } from "./v2-persistence";
import type { DispatchPayload, GameActionId, GameLogEntry, GameState } from "./v2-types";

type Listener = (state: GameState) => void;

function consumeSetupEntryFlag(): boolean {
  if (typeof window === "undefined" || typeof window.location?.search !== "string") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const shouldForceSetup = params.get("start") === "setup";
  if (!shouldForceSetup) {
    return false;
  }

  params.delete("start");
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname ?? ""}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash ?? ""}`;
  if (typeof window.history?.replaceState === "function") {
    window.history.replaceState(window.history.state, "", nextUrl || "/");
  }

  return true;
}

function createLogEntry(state: GameState, text: string): GameLogEntry {
  return {
    id: `${state.totalMonths}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: state.totalMonths,
    text,
  };
}

function syncSetupSelection(state: GameState, selectedLobbyRoleId: DispatchPayload["roleId"]): GameState {
  if (state.phase !== "setup") {
    return state;
  }

  return {
    ...state,
    setupSelectedRoleId: selectedLobbyRoleId ?? state.setupSelectedRoleId ?? state.selectedRoleId,
  };
}

function withManualSaveSummaries(state: GameState): GameState {
  return {
    ...state,
    manualSaveSummaries: listManualSaveSummaries(),
  };
}

function appendLog(state: GameState, text: string): GameState {
  return {
    ...withManualSaveSummaries(state),
    log: [createLogEntry(state, text), ...state.log].slice(0, 24),
  };
}

export function createStore() {
  if (consumeSetupEntryFlag()) {
    clearPersistedState();
  }

  let accountProfile = loadOrCreateAccountProfile();
  let state = withManualSaveSummaries(syncSetupSelection(loadPersistedState() ?? createInitialState(), accountProfile.selectedLobbyRoleId));
  const listeners = new Set<Listener>();

  function commit(nextState: GameState, nextAccountProfile = accountProfile): void {
    accountProfile = nextAccountProfile;
    state = withManualSaveSummaries(syncSetupSelection(nextState, accountProfile.selectedLobbyRoleId));
    savePersistedState(state);
    saveAccountProfile(accountProfile);
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState(): GameState {
      return state;
    },
    getAccountProfile() {
      return accountProfile;
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    dispatch(actionId: GameActionId, payload: DispatchPayload = {}): void {
      if (actionId === "select-role" && payload.roleId) {
        if (state.phase === "setup" && payload.roleId === accountProfile.selectedLobbyRoleId) {
          return;
        }

        const nextAccountProfile = selectLobbyRole(accountProfile, payload.roleId);
        const nextState = dispatchAction(state, actionId, payload);
        commit(nextState, nextAccountProfile);
        return;
      }

      if (actionId === "change-lobby-role-page") {
        const nextAccountProfile = changeLobbyRolePage(accountProfile, payload.delta ?? 0);
        commit(state, nextAccountProfile);
        return;
      }

      if (actionId === "change-role-achievement-page") {
        const nextAccountProfile = changeRoleAchievementPage(accountProfile, payload.delta ?? 0);
        commit(state, nextAccountProfile);
        return;
      }

      if (actionId === "save-manual") {
        const slot = payload.manualSlot;
        if (!slot) return;
        saveManualState(slot, state);
        commit(appendLog(state, `已保存到手动槽 ${slot}。`));
        return;
      }

      if (actionId === "load-manual") {
        const slot = payload.manualSlot;
        if (!slot) return;
        const loadedState = loadManualState(slot);
        if (!loadedState) {
          commit(appendLog(state, `手动槽 ${slot} 为空，无法读档。`));
          return;
        }
        const nextState = appendLog(loadedState, `已从手动槽 ${slot} 读档。`);
        commit(nextState);
        return;
      }

      if (actionId === "delete-manual") {
        const slot = payload.manualSlot;
        if (!slot) return;
        deleteManualState(slot);
        commit(appendLog(state, `已删除手动槽 ${slot}。`));
        return;
      }

      if (actionId === "reset-game") {
        const nextAccountProfile = applyFinishedRunToAccountProfile(accountProfile, state);
        const nextState = dispatchAction(state, actionId, payload);
        clearPersistedState();
        commit(nextState, nextAccountProfile);
        return;
      }

      if (actionId === "start-game") {
        const nextRoleId = payload.roleId ?? accountProfile.selectedLobbyRoleId;
        if (!isRoleOwned(accountProfile, nextRoleId)) {
          commit(appendLog(state, "该角色尚未解锁。"));
          return;
        }

        const nextState = dispatchAction(state, actionId, {
          ...payload,
          roleId: nextRoleId,
        });
        commit(nextState);
        return;
      }

      const debugState = dispatchDebugAction(state, actionId, payload);
      if (debugState !== null) {
        commit(debugState);
        return;
      }

      const nextState = dispatchAction(state, actionId, payload);
      commit(nextState);
    },
  };
}

export type GameStore = ReturnType<typeof createStore>;
