import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, getAchievementDisplayPages } from "../src/core/v2-lobby";
import { CAPTAIN_PREREQUISITE_ROLE_IDS, CAPTAIN_UNLOCK_ACHIEVEMENT_ID, reconcileAccountRoleUnlocks } from "../src/core/v2-account-role-unlocks";
import { loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { getAllAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { createStore } from "../src/core/v2-store";
import type { RoleId } from "../src/core/v2-types";

const date = "2026-10-17T06:00:00.000Z";
function accountWithRoles(except?: RoleId) {
  const account = createDefaultAccountProfile();
  for (const roleId of CAPTAIN_PREREQUISITE_ROLE_IDS) account.roleProgress[roleId].unlocked = roleId !== except;
  return account;
}
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("统御者 account unlock", () => {
  it.each(CAPTAIN_PREREQUISITE_ROLE_IDS)("requires the actual base role %s, not reversed substitutes", missing => {
    const account = accountWithRoles(missing);
    for (const [id, progress] of Object.entries(account.roleProgress)) if (id.endsWith("-reversed")) progress.unlocked = true;
    expect(reconcileAccountRoleUnlocks(account, date)).toBe(account);
    expect(account.roleProgress["research-captain"].unlocked).toBe(false);
  });

  it("restores already eligible accounts, preserves the date on reload, and adds no progression rewards", () => {
    const storage = memoryStorage();
    saveAccountProfile(accountWithRoles(), storage);
    const loaded = loadAccountProfile(storage).account;
    expect(loaded.roleProgress["research-captain"].unlocked).toBe(true);
    expect(loaded.achievementUnlockedAt[CAPTAIN_UNLOCK_ACHIEVEMENT_ID]).toBeDefined();
    expect(loaded.achievementExperienceMultipliers).toEqual({});
    expect(loaded.achievementTalentPoints).toEqual({});
    expect(Object.values(loaded.roleProgress).every(progress => progress.exp === 0 && progress.level === 0)).toBe(true);
    saveAccountProfile(loaded, storage);
    expect(loadAccountProfile(storage).account).toEqual(loaded);
    expect(reconcileAccountRoleUnlocks(loaded, date)).toBe(loaded);
    expect(createStore({ storage }).getLobbyState().roleProgress["research-captain"].unlocked).toBe(true);
  });

  it("unlocks immediately when settlement awards the sixth role and announces the account achievement once", () => {
    const state = { ...createStartedGameState("normal"), phase: "finished" as const, ending: "quit" as const,
      achievementProgress: { ...createAchievementRunProgress(), satisfied: ["normal:all-rounder"] } };
    const settled = settleRunAchievements(accountWithRoles("chosen"), state, date);
    expect(settled.account.roleProgress.chosen.unlocked).toBe(true);
    expect(settled.account.roleProgress["research-captain"].unlocked).toBe(true);
    expect(settled.state.runAchievementIds).toContain(CAPTAIN_UNLOCK_ACHIEVEMENT_ID);
    expect(settled.account.achievementUnlockedByRole?.[CAPTAIN_UNLOCK_ACHIEVEMENT_ID]).toEqual({ normal: date });
    expect(settled.experienceForCurrentRole).toBe(5);
    expect(settleRunAchievements(settled.account, state, date).state.runAchievementIds).not.toContain(CAPTAIN_UNLOCK_ACHIEVEMENT_ID);
  });

  it("does not trust a run claiming the unlock achievement without its prerequisites", () => {
    const state = { ...createStartedGameState("normal"), phase: "finished" as const, ending: "quit" as const,
      achievementProgress: { ...createAchievementRunProgress(), satisfied: [CAPTAIN_UNLOCK_ACHIEVEMENT_ID] } };
    const settled = settleRunAchievements(createDefaultAccountProfile(), state, date);
    expect(settled.account.roleProgress["research-captain"].unlocked).toBe(false);
    expect(settled.state.runAchievementIds).toEqual([]);
  });

  it("shows the unlock card first for the selected captain without ordinary graduation cards", () => {
    expect(getAchievementDisplayPages("research-captain")[0].achievements[0]).toMatchObject({
      id: CAPTAIN_UNLOCK_ACHIEVEMENT_ID, description: "解锁全部6个基础正位角色", rewardText: "解锁统御者角色",
    });
    expect(getAllAchievementDefinitions().filter(item => item.id.startsWith("research-captain:ending-"))).toHaveLength(0);
  });

  it("does not award the last base role or captain from a debug ending", () => {
    const storage = memoryStorage();
    saveAccountProfile(accountWithRoles("chosen"), storage);
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.getState().achievementProgress!.satisfied.push("normal:all-rounder");
    store.markCurrentRunAsDebugged();
    store.dispatch("debug-trigger-ending", { eventId: "phd" });
    expect(store.getState().phase).toBe("finished");
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.chosen.unlocked).toBe(false);
    expect(loadAccountProfile(storage).account.roleProgress["research-captain"].unlocked).toBe(false);
  });
});
