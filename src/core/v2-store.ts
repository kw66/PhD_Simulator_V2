import {
  changeLobbyRolePage,
  changeRoleAchievementPage,
  isRoleOwned,
  selectLobbyRole,
  setDateDisplayMode,
} from "./v2-lobby";
import { createInitialState, dispatchAction } from "./v2-engine";
import { pushNoOpLog } from "./v2-engine-helpers";
import { settleRunAchievements, settleAcademicYearAchievements } from "./v2-achievement-runtime";
import { getAvailableAcademicYears, storeAcademicArchive } from "./v2-rewinder-academic";
import { settleCurseDifficultyProgress } from "./v2-curse-progress";
import { settleRewinderArchive } from "./v2-rewinder";
import { getNextRewinderCycleNumber } from "./v2-rewinder-cycle";
import { applyHelpRead, createRunReplay, replayStateDigest, verifyRunReplay, REPLAY_RULESET, type RunReplay, type ReplayAnchor } from "./v2-run-replay";
import { awardRoleExperience, MAX_ROLE_LEVEL } from "./v2-role-experience";
import { recordRoleResult, recordRoleStart } from "./v2-role-records";
import { getTalentUpgradeReason, isRoleTalentImplemented, sanitizeRoleTalentAllocation } from "./v2-role-talent-definitions";
import { ENABLE_LOCAL_PLAYGROUND } from "./v2-development-flags";
import { loadAccountProfile, saveAccountProfile, type ExperienceStorage, type FinalizedRunRecord } from "./v2-account-storage";
import { createRunSaveRepository, getSnapshotDebugUsed, RUN_SAVE_DATABASE_NAME, type RunSaveRepository } from "./v2-run-saves";
import { CURSED_ROLE_IDS } from "./v2-curse-system";
import { collectRunStatistics } from "./v2-run-statistics";
import { CAPTAIN_PREREQUISITE_ROLE_IDS } from "./v2-account-role-unlocks";
import { getSelectedCurseDifficulty, selectCurseDifficulty } from "./v2-curse-progress";
import type { AccountProfile, DispatchPayload, GameActionId, GameState, RoleId } from "./v2-types";

type Listener = (state: GameState) => void;

function getBrowserStorage(): ExperienceStorage | null {
  try {
    return window.localStorage;
  } catch (error) {
    if (typeof window === "undefined") return null;
    // Blocked browser storage must not be mistaken for intentional memory-only mode.
    return { getItem() { throw error; }, setItem() { throw error; } };
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

function applyLocalPlaygroundProgress(account: AccountProfile): AccountProfile {
  if (!ENABLE_LOCAL_PLAYGROUND) return account;
  const roleProgress = { ...account.roleProgress };
  for (const roleId of Object.keys(roleProgress) as RoleId[]) {
    roleProgress[roleId] = {
      ...roleProgress[roleId],
      unlocked: true,
      level: MAX_ROLE_LEVEL,
      exp: 0,
    };
  }
  const curseDifficultyUnlocked = { ...account.curseDifficultyUnlocked };
  for (const roleId of CURSED_ROLE_IDS) curseDifficultyUnlocked[roleId] = 4;
  return { ...account, roleProgress, curseDifficultyUnlocked };
}

export function createStore(options: { storage?: ExperienceStorage | null; saves?: RunSaveRepository } = {}) {
  const browserStorage = options.storage === undefined ? getBrowserStorage() : options.storage;
  // Keep test progression and crash-recovery journals apart from real accounts,
  // including when a production preview later uses the same browser origin.
  const storage: ExperienceStorage | null = browserStorage && ENABLE_LOCAL_PLAYGROUND ? {
    getItem: key => browserStorage.getItem(`local_playground:${key}`),
    setItem: (key, value) => browserStorage.setItem(`local_playground:${key}`, value),
  } : browserStorage;
  const loadedAccount = loadAccountProfile(storage);
  let accountProfile = applyLocalPlaygroundProgress(loadedAccount.account);
  let settledRuns = loadedAccount.settledRuns;
  let finalizedOutbox = loadedAccount.finalizedOutbox;
  let state = syncSetupSelection(createInitialState(), accountProfile.selectedLobbyRoleId);
  let runUsedDebugPanel = false;
  let currentRunId: string | null = null;
  let countedStartRole: RoleId | null = null;
  let replay: RunReplay | undefined;
  let replayAnchor: ReplayAnchor | undefined;
  let saveStatus = "";
  let readyComplete = !options.saves && (options.storage !== undefined || typeof window === "undefined");
  let readyPromise: Promise<void> | undefined;
  const listeners = new Set<Listener>();
  const finalizedListeners = new Set<(record: FinalizedRunRecord) => void>();
  const saves = options.saves ?? createRunSaveRepository({ storage,
    databaseName: ENABLE_LOCAL_PLAYGROUND ? `${RUN_SAVE_DATABASE_NAME}_local_playground` : undefined,
    onError(error) { saveStatus = error.message; queueMicrotask(() => notify()); },
  });
  let endingAward: AccountProfile["lastRunExperience"];

  function notify(): void { listeners.forEach(listener => listener(state)); }

  function persistAccount(next = accountProfile, ids = settledRuns, outbox = finalizedOutbox): boolean {
    try { saveAccountProfile(next, storage, ids, outbox); return true; }
    catch { saveStatus = "账户进度未能保存，请释放浏览器存储空间后重试；本局存档仍保留"; return false; }
  }

  function endingPreview(nextState: GameState): { account: AccountProfile; state: GameState } {
    if (nextState.phase !== "finished" || !nextState.ending) {
      endingAward = undefined;
      return { account: accountProfile, state: nextState };
    }
    const roleId = nextState.selectedRoleId;
    const previous = accountProfile.roleProgress[roleId];
    if (runUsedDebugPanel || replay?.failed) {
      endingAward = { roleId, gained: 0, previousLevel: previous.level, level: previous.level,
        exp: previous.exp, ...(runUsedDebugPanel ? { disqualifiedByDebug: true } : { disqualifiedByIntegrity: true }) };
      return { account: accountProfile, state: { ...nextState, runAchievementIds: [] } };
    }
    const settled = settleRunAchievements(accountProfile, nextState);
    const award = awardRoleExperience(settled.account.roleProgress[roleId], nextState.totalResearchScore,
      1 + (accountProfile.achievementExperienceMultipliers?.[roleId] ?? 0));
    endingAward = { roleId, gained: award.gained + settled.experienceForCurrentRole,
      previousLevel: previous.level, level: award.progress.level, exp: award.progress.exp };
    return { state: settled.state, account: recordRoleResult({ ...settled.account,
      roleProgress: { ...settled.account.roleProgress, [roleId]: award.progress }, lastRunExperience: endingAward }, nextState) };
  }

  function saveCurrent(monthStart = false): void {
    if (state.phase === "setup") return;
    if (!runUsedDebugPanel && (monthStart || state.phase === "finished")) checkReplay();
    // The debug month control may jump backwards without using the normal load UI.
    const futureMonths = saves.list(state.selectedRoleId).filter(save => save.kind === "month" && save.totalMonths > state.totalMonths);
    if (futureMonths.length && runUsedDebugPanel) {
      const earlier = saves.list(state.selectedRoleId).find(save => save.kind === "month" && save.totalMonths <= state.totalMonths);
      if (earlier) saves.rewind(state.selectedRoleId, earlier.id);
    }
    const record = saves.commit(state, { runId: currentRunId ?? undefined, debugUsed: runUsedDebugPanel, monthStart, replay });
    currentRunId = record.runId;
  }

  function checkReplay(): boolean {
    if (runUsedDebugPanel) return false;
    if (!replay || !replayAnchor) return false;
    const checked = verifyRunReplay(replay, replayAnchor, state);
    if (!checked) {
      saveStatus = `第${state.totalMonths}个月的操作检查未通过，本局可继续或回溯，但不结算经验、成就和后续统计`;
      return false;
    }
    replayAnchor = checked;
    return true;
  }

  function beginReplay(initial: GameState, next: GameState, payload: DispatchPayload): void {
    replay = createRunReplay(initial, next, payload);
    replayAnchor = { state: structuredClone(replay.initial), index: 0 };
    saveStatus = "";
  }

  function commit(nextState: GameState, nextAccountProfile = accountProfile, options: { newRun?: boolean; restored?: boolean } = {}): void {
    const previous = state;
    if (options.newRun) {
      nextAccountProfile = recordRoleStart(nextAccountProfile, createInitialState(), nextState);
      countedStartRole = nextState.selectedRoleId;
    }
    if (nextAccountProfile !== accountProfile) {
      persistAccount(nextAccountProfile);
      accountProfile = nextAccountProfile;
    }
    state = syncSetupSelection(nextState, accountProfile.selectedLobbyRoleId);
    if (state.phase === "finished" && !runUsedDebugPanel && !options.restored) checkReplay();
    if (state.phase === "finished") state = endingPreview(state).state;
    else endingAward = undefined;
    if (!options.restored && state.phase !== "setup" && (state !== previous || options.newRun)) {
      saveCurrent(!!options.newRun || (previous.phase === "playing" && state.totalMonths > previous.totalMonths));
    }
    notify();
  }

  function restore(roleId: RoleId, snapshotId = "latest"): boolean {
    const previousDebugUsed = saves.get(roleId)?.debugUsed ?? false;
    let record = snapshotId === "latest" ? saves.get(roleId) : saves.rewind(roleId, snapshotId);
    if (!record || record.runId === settledRuns[roleId]) return false;
    if (record.latest.debugUsed === undefined) {
      record = saves.commit(record.latest.state, { runId: record.runId,
        debugUsed: getSnapshotDebugUsed(record, record.latest), replay: record.replay });
    }
    currentRunId = record.runId;
    runUsedDebugPanel = record.debugUsed;
    if (previousDebugUsed && !runUsedDebugPanel) {
      const progress = accountProfile.roleProgress[roleId];
      accountProfile = { ...accountProfile, roleProgress: { ...accountProfile.roleProgress,
        [roleId]: { ...progress, startedRuns: progress.startedRuns + 1 } } };
      persistAccount();
    }
    countedStartRole = record.debugUsed ? null : roleId;
    replay = record.replay ? structuredClone(record.replay) : undefined;
    replayAnchor = undefined;
    if (replay && !record.debugUsed) {
      const point = replay.checkpoints.at(-1);
      const snapshot = point && [record.latest, ...record.months].find(item => item.replayIndex === point.index
        && replayStateDigest(item.state) === point.digest);
      if (snapshot && point) replayAnchor = { state: structuredClone(snapshot.state), index: point.index };
      else if (!point) replayAnchor = { state: structuredClone(replay.initial), index: 0 };
      else replay.failed ??= { totalMonths: record.latest.totalMonths, reason: "月度检查点损坏" };
      if (replayAnchor) verifyRunReplay(replay, replayAnchor, record.latest.state, false);
    }
    if (!replay) {
      // Current-epoch files without an operation record cannot grant rewards.
      replay = { version: 1, ruleset: REPLAY_RULESET, epoch: record.epoch, savedAt: record.savedAt,
        initial: { ...createInitialState(), randomState: record.latest.state.randomState },
        commands: [{ kind: "action", actionId: "start-game", payload: { roleId } }], checkpoints: [],
        failed: { totalMonths: record.latest.totalMonths, reason: "缺少操作记录" } };
    }
    if (replay.failed) saves.commit(record.latest.state, { runId: record.runId, debugUsed: record.debugUsed, replay });
    accountProfile = selectLobbyRole(accountProfile, roleId);
    if (!runUsedDebugPanel && !replay.failed) saveStatus = "";
    if (replay.failed && !runUsedDebugPanel) saveStatus = "存档操作检查未通过，本局不结算经验、成就和后续统计";
    commit(record.latest.state, accountProfile, { restored: true });
    return true;
  }

  function ready(): Promise<void> {
    return readyPromise ??= saves.ready().then(() => {
      for (const roleId of Object.keys(accountProfile.roleProgress) as RoleId[]) {
        const record = saves.get(roleId);
        if (record && settledRuns[roleId] === record.runId) saves.clear(roleId);
      }
      readyComplete = true;
      notify();
    });
  }

  function markCurrentRunAsDebugged(): void {
    if (state.phase === "setup" || runUsedDebugPanel) return;
    runUsedDebugPanel = true;
    if (countedStartRole) {
      const roleId = countedStartRole;
      const progress = accountProfile.roleProgress[roleId];
      accountProfile = { ...accountProfile, roleProgress: { ...accountProfile.roleProgress,
        [roleId]: { ...progress, startedRuns: Math.max(0, progress.startedRuns - 1) } } };
      countedStartRole = null;
      persistAccount();
    }
    if (state.phase === "finished") state = endingPreview(state).state;
    saveCurrent();
    notify();
  }

  function finalize(): boolean {
    if (state.phase !== "finished" || !state.ending || !currentRunId) return false;
    const roleId = state.selectedRoleId;
    if (settledRuns[roleId] === currentRunId) return false;
    if (!runUsedDebugPanel) checkReplay();
    const disqualified = runUsedDebugPanel || !!replay?.failed;
    const preview = endingPreview(state);
    const record: FinalizedRunRecord = { runId: currentRunId, state: preview.state, debugUsed: runUsedDebugPanel };
    const nextAccount = disqualified ? { ...accountProfile, lastRunExperience: endingAward }
      : settleRewinderArchive(settleCurseDifficultyProgress(preview.account, preview.state), preview.state);
    const nextIds = { ...settledRuns, [roleId]: currentRunId };
    const nextOutbox = disqualified ? finalizedOutbox : [...finalizedOutbox, record];
    if (!persistAccount(nextAccount, nextIds, nextOutbox)) { notify(); return false; }
    accountProfile = nextAccount;
    settledRuns = nextIds;
    finalizedOutbox = nextOutbox;
    saves.clear(roleId);
    if (!disqualified) finalizedListeners.forEach(listener => listener(structuredClone(record)));
    return true;
  }

  function finalizeAcademicYear(): boolean {
    const completed = state.rewinderState?.academic?.completed;
    if (state.phase !== "playing" || !completed || !currentRunId || state.selectedRoleId !== "rewinder") return false;
    if (settledRuns.rewinder === currentRunId) return false;
    const verified = !runUsedDebugPanel && checkReplay();
    let nextAccount = accountProfile;
    if (verified) {
      const settled = settleAcademicYearAchievements(accountProfile, state);
      const progress = settled.account.roleProgress.rewinder;
      nextAccount = { ...settled.account,
        rewinderAcademicArchive: storeAcademicArchive(accountProfile.rewinderAcademicArchive, completed),
        roleProgress: { ...settled.account.roleProgress, rewinder: { ...progress, playedRuns: progress.playedRuns + 1 } },
      };
    }
    const ids = { ...settledRuns, rewinder: currentRunId };
    if (!persistAccount(nextAccount, ids, finalizedOutbox)) { notify(); return false; }
    accountProfile = nextAccount;
    settledRuns = ids;
    saves.clear("rewinder");
    return true;
  }

  const api = {
    ready,
    isReady(): boolean { return readyComplete; },
    getSaveStatus(): string { return saveStatus; },
    getRunSaves(roleId = state.selectedRoleId) { return saves.list(roleId); },
    hasRoleSave(roleId: RoleId): boolean { return saves.list(roleId).length > 0; },
    getCurrentRunId(): string | null { return currentRunId; },
    getEndingExperienceAward() { return endingAward; },
    flushSaves(): Promise<void> { return saves.flush(); },
    loadRunSave(snapshotId: string): boolean { return state.phase !== "setup" && restore(state.selectedRoleId, snapshotId); },
    getFinalizedOutbox(): FinalizedRunRecord[] { return structuredClone(finalizedOutbox); },
    acknowledgeFinalizedRun(runId: string): void {
      const next = finalizedOutbox.filter(record => record.runId !== runId);
      if (persistAccount(accountProfile, settledRuns, next)) finalizedOutbox = next;
    },
    subscribeFinalized(listener: (record: FinalizedRunRecord) => void): () => void {
      finalizedListeners.add(listener);
      return () => finalizedListeners.delete(listener);
    },
    getState(): GameState {
      return state;
    },
    getLobbyState() {
      return accountProfile;
    },
    selectCurseDifficulty(roleId: RoleId, difficulty: number): boolean {
      if (state.phase !== "setup") return false;
      const next = selectCurseDifficulty(accountProfile, roleId, difficulty);
      if (next === accountProfile) return false;
      commit(state, next);
      return true;
    },
    recordHelpPageRead(id: string, requiredIds: readonly string[]): void {
      if (state.phase !== "playing" || runUsedDebugPanel || !requiredIds.includes(id)) return;
      const next = applyHelpRead(state, id, requiredIds);
      if (next === state) return;
      replay?.commands.push({ kind: "help", id, requiredIds: [...requiredIds] });
      state = next;
      saveCurrent();
    },
    upgradeRoleTalent(roleId: RoleId, talentId: string): boolean {
      if (state.phase !== "setup" || !isRoleOwned(accountProfile, roleId)) return false;
      const level = accountProfile.roleProgress[roleId].level;
      const allocation = sanitizeRoleTalentAllocation(roleId, level, accountProfile.talentAllocation?.[roleId], accountProfile.achievementTalentPoints?.[roleId] ?? 0);
      if (getTalentUpgradeReason(roleId, level, allocation, talentId, accountProfile.achievementTalentPoints?.[roleId] ?? 0) !== null) return false;
      const nextAccountProfile = {
        ...accountProfile,
        talentAllocation: { ...accountProfile.talentAllocation, [roleId]: { ...allocation, [talentId]: (allocation[talentId] ?? 0) + 1 } },
      };
      commit(state, nextAccountProfile);
      return true;
    },
    resetRoleTalents(roleId: RoleId): boolean {
      if (state.phase !== "setup" || !isRoleTalentImplemented(roleId)) return false;
      const talentAllocation = { ...accountProfile.talentAllocation };
      delete talentAllocation[roleId];
      const nextAccountProfile = { ...accountProfile, talentAllocation };
      commit(state, nextAccountProfile);
      return true;
    },
    markCurrentRunAsDebugged,
    isCurrentRunDebugged(): boolean {
      return runUsedDebugPanel;
    },
    isCurrentRunDisqualified(): boolean { return runUsedDebugPanel || !!replay?.failed; },
    getReplayStatus() { return { failed: replay?.failed, actionCount: replay?.commands.length ?? 0,
      verifiedThrough: replay?.checkpoints.at(-1)?.index ?? 0 }; },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    dispatch(actionId: GameActionId, payload: DispatchPayload = {}): void {
      if (actionId === "debug-trigger-ending" && state.phase !== "setup") markCurrentRunAsDebugged();
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

      if (actionId === "restart-game") return;

      if (actionId === "reset-game" || actionId === "settle-and-return") {
        if (actionId === "settle-and-return" && !finalize()) return;
        const nextState = dispatchAction(state, "reset-game", payload);
        runUsedDebugPanel = false;
        countedStartRole = null;
        currentRunId = null;
        replay = undefined; replayAnchor = undefined;
        commit(nextState);
        return;
      }

      if (actionId === "start-game") {
        if (state.phase !== "setup") return;
        if (!readyComplete) { void ready().then(() => api.dispatch(actionId, payload)); return; }
        const nextRoleId = payload.roleId ?? accountProfile.selectedLobbyRoleId;
        if (restore(nextRoleId)) return;
        if (!isRoleOwned(accountProfile, nextRoleId)) {
          commit(pushNoOpLog(state, "该角色当前仅供展示。"));
          return;
        }

        const startYear = payload.rewinderStartYear ?? 1;
        if (nextRoleId === "rewinder" && !getAvailableAcademicYears(accountProfile.rewinderAcademicArchive).includes(startYear)) return;

        const startPayload = {
          ...payload,
          roleId: nextRoleId,
          curseDifficulty: getSelectedCurseDifficulty(accountProfile, nextRoleId),
          captainTagLevels: Object.fromEntries(CAPTAIN_PREREQUISITE_ROLE_IDS.map(id => [id, accountProfile.roleProgress[id].level])),
          rewinderArchive: nextRoleId === "rewinder" ? accountProfile.rewinderArchive : undefined,
          rewinderCycleNumber: nextRoleId === "rewinder" ? getNextRewinderCycleNumber(accountProfile) : undefined,
          rewinderAcademicArchive: nextRoleId === "rewinder" ? accountProfile.rewinderAcademicArchive : undefined,
          rewinderStartYear: nextRoleId === "rewinder" ? startYear : undefined,
          talentAllocation: sanitizeRoleTalentAllocation(nextRoleId, accountProfile.roleProgress[nextRoleId].level, accountProfile.talentAllocation?.[nextRoleId], accountProfile.achievementTalentPoints?.[nextRoleId] ?? 0),
          bonusTalentPoints: accountProfile.achievementTalentPoints?.[nextRoleId] ?? 0,
        };
        const nextState = dispatchAction(state, actionId, startPayload);
        if (nextState === state) return;
        beginReplay(state, nextState, startPayload);
        currentRunId = null;
        runUsedDebugPanel = false;
        commit(nextState, accountProfile, { newRun: true });
        return;
      }

      if (actionId.startsWith("debug-") || actionId === "force-next-month") markCurrentRunAsDebugged();
      const nextState = collectRunStatistics(state, dispatchAction(state, actionId, payload));
      if (state.phase === "playing" && nextState !== state && !runUsedDebugPanel) {
        replay?.commands.push({ kind: "action", actionId, payload: structuredClone(payload), ruleset: REPLAY_RULESET });
      }
      commit(nextState);
      if (actionId === "confirm-rewinder-archive" && finalizeAcademicYear()) {
        const setup = dispatchAction(state, "reset-game");
        runUsedDebugPanel = false;
        countedStartRole = null;
        currentRunId = null;
        replay = undefined;
        replayAnchor = undefined;
        commit(setup);
      }
    },
  };
  return api;
}
