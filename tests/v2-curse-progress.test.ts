import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { ACCOUNT_LOBBY_STORAGE_KEY, ACCOUNT_STORAGE_KEY, loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { getSelectedCurseDifficulty, getUnlockedCurseDifficulty, selectCurseDifficulty, settleCurseDifficultyProgress } from "../src/core/v2-curse-progress";
import { CURSED_ROLE_IDS, type CurseDifficulty } from "../src/core/v2-curse-system";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { observeAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { createStore } from "../src/core/v2-store";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { replayStateDigest } from "../src/core/v2-run-replay";
import type { RoleId } from "../src/core/v2-types";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
function account() {
  const value = createDefaultAccountProfile();
  for (const roleId of CURSED_ROLE_IDS) value.roleProgress[roleId].unlocked = true;
  return value;
}
function ending(roleId: RoleId, difficulty: CurseDifficulty, phd = true) {
  const state = createStartedGameState(roleId);
  return observeAchievements(state, { ...state, phase: "finished", ending: phd ? "phd" : "master",
    curseState: { difficulty, debt: 0, lastSettledTotalMonths: 1 } });
}

describe("curse account progression", () => {
  it.each(CURSED_ROLE_IDS)("unlocks %s ranks independently and only in order", roleId => {
    let profile = account();
    expect(getUnlockedCurseDifficulty(profile, roleId)).toBe(1);
    expect(selectCurseDifficulty(profile, roleId, 2)).toBe(profile);
    expect(settleCurseDifficultyProgress(profile, ending(roleId, 2))).toBe(profile);
    expect(settleCurseDifficultyProgress(profile, ending(roleId, 1, false))).toBe(profile);
    for (const rank of [1, 2, 3] as const) {
      profile = settleCurseDifficultyProgress(profile, ending(roleId, rank));
      expect(getUnlockedCurseDifficulty(profile, roleId)).toBe(rank + 1);
    }
    const completed = profile;
    expect(settleCurseDifficultyProgress(profile, ending(roleId, 4))).toBe(completed);
    expect(settleCurseDifficultyProgress(profile, ending(roleId, 1))).toBe(completed);
    for (const other of CURSED_ROLE_IDS.filter(id => id !== roleId)) expect(getUnlockedCurseDifficulty(profile, other)).toBe(1);
  });

  it("persists rank and selection in the current account envelope and rejects malformed rank data", () => {
    let profile = account();
    profile.curseDifficultyUnlocked = { "cursed-frail": 3 };
    profile = selectCurseDifficulty(profile, "cursed-frail", 2);
    const storage = memoryStorage();
    saveAccountProfile(profile, storage);
    expect(getUnlockedCurseDifficulty(loadAccountProfile(storage).account, "cursed-frail")).toBe(3);
    expect(getSelectedCurseDifficulty(loadAccountProfile(storage).account, "cursed-frail")).toBe(2);
    const raw = JSON.parse(storage.getItem(ACCOUNT_STORAGE_KEY)!);
    const lobby = JSON.parse(raw.records[ACCOUNT_LOBBY_STORAGE_KEY]);
    lobby.curseDifficultyUnlocked = { "cursed-frail": 8, normal: 4, "cursed-debt": 2 };
    lobby.curseDifficultyByRole = { "cursed-frail": 4, "cursed-debt": 3, normal: 4 };
    raw.records[ACCOUNT_LOBBY_STORAGE_KEY] = JSON.stringify(lobby);
    storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(raw));
    const loaded = loadAccountProfile(storage).account;
    expect(loaded.curseDifficultyUnlocked).toEqual({ "cursed-debt": 2 });
    expect(loaded.curseDifficultyByRole).toEqual({ "cursed-frail": 1, "cursed-debt": 2 });
  });

  it.each(CURSED_ROLE_IDS)("awards the %s hell achievement once to all roles", roleId => {
    const profile = account();
    const id = `${roleId}:curse-hell-phd`;
    for (const difficulty of [1, 2, 3] as const) expect(ending(roleId, difficulty).achievementProgress?.satisfied).not.toContain(id);
    expect(ending(roleId, 4, false).achievementProgress?.satisfied).not.toContain(id);
    const state = ending(roleId, 4);
    expect(state.achievementProgress?.satisfied).toContain(id);
    const settled = settleRunAchievements(profile, state);
    expect(Object.values(settled.account.achievementTalentPoints!)).toEqual(Object.keys(profile.roleProgress).map(() => 1));
    expect(settleRunAchievements(settled.account, state).account.achievementTalentPoints).toEqual(settled.account.achievementTalentPoints);
  });

  it("delays difficulty unlock until formal settlement, keeps previews and debug runs out", async () => {
    const storage = memoryStorage();
    saveAccountProfile(account(), storage);
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    store.dispatch("start-game", { roleId: "cursed-frail" });
    // An explicit trusted checkpoint isolates finalization wiring from full six-year simulation.
    const state = { ...ending("cursed-frail", 1), randomState: structuredClone(store.getState().randomState) };
    const record = saves.get("cursed-frail")!;
    const replay = structuredClone(record.replay!);
    replay.checkpoints.at(-1)!.digest = replayStateDigest(state);
    saves.commit(state, { runId: record.runId, replay });
    expect(store.loadRunSave("latest")).toBe(true);
    expect(getUnlockedCurseDifficulty(store.getLobbyState(), "cursed-frail")).toBe(1);
    store.dispatch("settle-and-return");
    expect(getUnlockedCurseDifficulty(store.getLobbyState(), "cursed-frail")).toBe(2);
    expect(getUnlockedCurseDifficulty(loadAccountProfile(storage).account, "cursed-frail")).toBe(2);
    store.dispatch("reset-game");
    store.selectCurseDifficulty("cursed-frail", 2);
    // The next challenge begins only after the explicit start, and remains
    // excluded from progression when its ending is generated by debug tools.
    store.dispatch("start-game", { roleId: "cursed-frail" });
    store.dispatch("debug-trigger-ending", { eventId: "phd" });
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("settle-and-return");
    expect(getUnlockedCurseDifficulty(store.getLobbyState(), "cursed-frail")).toBe(2);
    expect(getUnlockedCurseDifficulty(loadAccountProfile(storage).account, "cursed-frail")).toBe(2);
  });
});
