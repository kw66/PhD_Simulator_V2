import {
  changeLobbyRolePage,
  changeRoleAchievementPage,
  createDefaultAccountProfile,
  isRoleOwned,
  selectLobbyRole,
  setDateDisplayMode,
} from "./v2-lobby";
import { createInitialState, dispatchAction } from "./v2-engine";
import { pushNoOpLog } from "./v2-engine-helpers";
import type { DispatchPayload, GameActionId, GameState } from "./v2-types";

type Listener = (state: GameState) => void;

function syncSetupSelection(state: GameState, selectedLobbyRoleId: DispatchPayload["roleId"]): GameState {
  if (state.phase !== "setup") {
    return state;
  }

  return {
    ...state,
    setupSelectedRoleId: selectedLobbyRoleId ?? state.setupSelectedRoleId ?? state.selectedRoleId,
  };
}

export function createStore() {
  let accountProfile = createDefaultAccountProfile();
  let state = syncSetupSelection(createInitialState(), accountProfile.selectedLobbyRoleId);
  const listeners = new Set<Listener>();

  function commit(nextState: GameState, nextAccountProfile = accountProfile): void {
    accountProfile = nextAccountProfile;
    state = syncSetupSelection(nextState, accountProfile.selectedLobbyRoleId);
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState(): GameState {
      return state;
    },
    getLobbyState() {
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

      if (actionId === "set-date-display-mode" && payload.dateDisplayMode) {
        const nextAccountProfile = setDateDisplayMode(accountProfile, payload.dateDisplayMode);
        commit(state, nextAccountProfile);
        return;
      }

      if (actionId === "reset-game") {
        const nextState = dispatchAction(state, actionId, payload);
        commit(nextState);
        return;
      }

      if (actionId === "restart-game") {
        const nextState = dispatchAction(createInitialState(), "start-game", {
          roleId: state.selectedRoleId,
        });
        commit(nextState);
        return;
      }

      if (actionId === "start-game") {
        const nextRoleId = payload.roleId ?? accountProfile.selectedLobbyRoleId;
        if (!isRoleOwned(accountProfile, nextRoleId)) {
          commit(pushNoOpLog(state, "该角色当前仅供展示。"));
          return;
        }

        const nextState = dispatchAction(state, actionId, {
          ...payload,
          roleId: nextRoleId,
        });
        commit(nextState);
        return;
      }

      const nextState = dispatchAction(state, actionId, payload);
      commit(nextState);
    },
  };
}
