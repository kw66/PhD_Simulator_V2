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
import { achievementRecordsChanged, loadRoleAchievementRecords, recordNewAchievementDates, saveRoleAchievementRecords } from "./v2-achievement-records";
import { awardRoleExperience, getNextRoleLevelExperience, MAX_ROLE_LEVEL } from "./v2-role-experience";
import type { AccountProfile, DispatchPayload, GameActionId, GameState, RoleId } from "./v2-types";

type Listener = (state: GameState) => void;
type ExperienceStorage = Pick<Storage, "getItem" | "setItem">;
const ROLE_EXPERIENCE_STORAGE_KEY = "phd_simulator_v2_role_experience_v1";

function getBrowserStorage(): ExperienceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadRoleExperience(account: AccountProfile, storage: ExperienceStorage | null): AccountProfile {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ROLE_EXPERIENCE_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("roles" in saved) || !saved.roles || typeof saved.roles !== "object") return account;

    const roles = saved.roles as Record<string, unknown>;
    const roleProgress = { ...account.roleProgress };
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const value = roles[roleId];
      if (!value || typeof value !== "object") continue;
      const { level, exp } = value as Record<string, unknown>;
      if (!Number.isSafeInteger(level) || !Number.isSafeInteger(exp)
        || (level as number) < 0 || (level as number) > MAX_ROLE_LEVEL || (exp as number) < 0) continue;
      const nextLevelExp = getNextRoleLevelExperience(level as number);
      if (nextLevelExp !== null && (exp as number) >= nextLevelExp) continue;
      roleProgress[roleId] = { ...roleProgress[roleId], level: level as number, exp: exp as number };
    }
    return { ...account, roleProgress };
  } catch {
    return account;
  }
}

function saveRoleExperience(account: AccountProfile, storage: ExperienceStorage | null): void {
  try {
    storage?.setItem(ROLE_EXPERIENCE_STORAGE_KEY, JSON.stringify({
      version: 1,
      roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [
        roleId, { level: progress.level, exp: progress.exp },
      ])),
    }));
  } catch {
    // Progress remains available for the current session when browser storage is unavailable.
  }
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

export function createStore(options: { storage?: ExperienceStorage | null } = {}) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  let accountProfile = loadRoleAchievementRecords(loadRoleExperience(createDefaultAccountProfile(), storage), storage);
  let state = syncSetupSelection(createInitialState(), accountProfile.selectedLobbyRoleId);
  let runUsedDebugPanel = false;
  const listeners = new Set<Listener>();

  function commit(nextState: GameState, nextAccountProfile = accountProfile): void {
    if (state.phase === "playing" && nextState.phase === "finished") {
      const roleId = nextState.selectedRoleId;
      const previousProgress = nextAccountProfile.roleProgress[roleId];
      if (runUsedDebugPanel) {
        nextAccountProfile = {
          ...nextAccountProfile,
          lastRunExperience: {
            roleId,
            gained: 0,
            previousLevel: previousProgress.level,
            level: previousProgress.level,
            exp: previousProgress.exp,
            disqualifiedByDebug: true,
          },
        };
      } else {
        const award = awardRoleExperience(previousProgress, nextState.totalResearchScore);
        nextAccountProfile = {
          ...nextAccountProfile,
          roleProgress: { ...nextAccountProfile.roleProgress, [roleId]: award.progress },
          lastRunExperience: {
            roleId,
            gained: award.gained,
            previousLevel: previousProgress.level,
            level: award.progress.level,
            exp: award.progress.exp,
          },
        };
        saveRoleExperience(nextAccountProfile, storage);
      }
    }
    nextAccountProfile = recordNewAchievementDates(accountProfile, nextAccountProfile);
    if (achievementRecordsChanged(accountProfile, nextAccountProfile)) saveRoleAchievementRecords(nextAccountProfile, storage);
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
    markCurrentRunAsDebugged(): void {
      if (state.phase === "playing") runUsedDebugPanel = true;
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
        runUsedDebugPanel = false;
        commit(nextState);
        return;
      }

      if (actionId === "restart-game") {
        const nextState = dispatchAction({ ...createInitialState(), blockLinearEvents: state.blockLinearEvents }, "start-game", {
          roleId: state.selectedRoleId,
        });
        runUsedDebugPanel = false;
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
        if (state.phase === "setup" && nextState.phase === "playing") runUsedDebugPanel = false;
        commit(nextState);
        return;
      }

      const nextState = dispatchAction(state, actionId, payload);
      commit(nextState);
    },
  };
}
