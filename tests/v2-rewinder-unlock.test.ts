import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, getAchievementDisplayPages } from "../src/core/v2-lobby";
import { getAllAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { getRewinderAchievementCount, reconcileAccountRoleUnlocks, REWINDER_REQUIRED_ACHIEVEMENTS,
  REWINDER_UNLOCK_ACHIEVEMENT_ID } from "../src/core/v2-account-role-unlocks";
import { loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { createStore } from "../src/core/v2-store";
import type { AccountProfile, RoleId } from "../src/core/v2-types";

const date = "2026-10-17T06:00:00.000Z";
const later = "2026-10-18T06:00:00.000Z";
const sharedIds = getAllAchievementDefinitions().filter(item => item.id.startsWith("global:")
  && !item.id.endsWith("-collector")).slice(0, REWINDER_REQUIRED_ACHIEVEMENTS).map(item => item.id);
function complete(account: AccountProfile, id: string, role: RoleId = "normal") {
  account.roleProgress[role].unlockedAchievementIds.push(id);
  account.achievementUnlockedAt[id] = date;
  account.achievementUnlockedByRole = { ...account.achievementUnlockedByRole,
    [id]: { ...account.achievementUnlockedByRole?.[id], [role]: date } };
  account.achievementRewardedIds = [...new Set([...(account.achievementRewardedIds ?? []), id])];
}
function profile(count: number) {
  const account = createDefaultAccountProfile();
  for (const id of sharedIds.slice(0, count)) complete(account, id);
  return account;
}
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
function ending(satisfied: string[]) {
  return { ...createStartedGameState("normal"), phase: "finished" as const, ending: "quit" as const,
    achievementProgress: { ...createAchievementRunProgress(), satisfied } };
}

describe("轮回者 account milestone", () => {
  it("requires 24 distinct known achievements and excludes repeats, unknown IDs and its own milestone", () => {
    const account = profile(23);
    complete(account, sharedIds[0], "rich");
    complete(account, "unknown:achievement");
    complete(account, "special-dandan:ending-phd");
    expect(getRewinderAchievementCount(account)).toBe(23);
    expect(reconcileAccountRoleUnlocks(account, date).roleProgress.rewinder.unlocked).toBe(false);
    complete(account, sharedIds[23]);
    const unlocked = reconcileAccountRoleUnlocks(account, date);
    expect(unlocked.roleProgress.rewinder.unlocked).toBe(true);
    expect(getRewinderAchievementCount(unlocked)).toBe(24);
  });

  it("counts each role's separate graduation achievements", () => {
    const account = createDefaultAccountProfile();
    const graduation = getAllAchievementDefinitions().filter(item => /:ending-(master|phd)$/u.test(item.id));
    expect(graduation).toHaveLength(24);
    for (const item of graduation) complete(account, item.id, item.scope!.roleIds![0]);
    expect(getRewinderAchievementCount(account)).toBe(24);
    expect(reconcileAccountRoleUnlocks(account, date).roleProgress.rewinder.unlocked).toBe(true);
  });

  it("reconciles qualifying saved accounts without adding XP, multipliers or talent points", () => {
    const storage = memoryStorage();
    saveAccountProfile(profile(24), storage);
    const loaded = loadAccountProfile(storage).account;
    expect(loaded.roleProgress.rewinder.unlocked).toBe(true);
    expect(loaded.achievementUnlockedAt[REWINDER_UNLOCK_ACHIEVEMENT_ID]).toBeDefined();
    expect(loaded.achievementExperienceMultipliers).toEqual({});
    expect(loaded.achievementTalentPoints).toEqual({});
    expect(Object.values(loaded.roleProgress).every(item => item.level === 0 && item.exp === 0)).toBe(true);
    saveAccountProfile(loaded, storage);
    expect(loadAccountProfile(storage).account).toEqual(loaded);
    expect(reconcileAccountRoleUnlocks(loaded, later)).toBe(loaded);
  });

  it("announces the 24th completion once and ignores direct run claims before the threshold", () => {
    const before = profile(23);
    const claimed = settleRunAchievements(before, ending([REWINDER_UNLOCK_ACHIEVEMENT_ID]), date);
    expect(claimed.account.roleProgress.rewinder.unlocked).toBe(false);
    expect(claimed.state.runAchievementIds).toEqual([]);
    const state = ending([sharedIds[23], REWINDER_UNLOCK_ACHIEVEMENT_ID]);
    const settled = settleRunAchievements(before, state, date);
    expect(settled.account.roleProgress.rewinder.unlocked).toBe(true);
    expect(settled.state.runAchievementIds?.filter(id => id === REWINDER_UNLOCK_ACHIEVEMENT_ID)).toHaveLength(1);
    expect(settled.account.achievementUnlockedByRole?.[REWINDER_UNLOCK_ACHIEVEMENT_ID]).toEqual({ normal: date });
    expect(settled.experienceForCurrentRole).toBe(5);
    const repeated = settleRunAchievements(settled.account, state, later);
    expect(repeated.state.runAchievementIds).not.toContain(REWINDER_UNLOCK_ACHIEVEMENT_ID);
    expect(repeated.account.achievementUnlockedAt[REWINDER_UNLOCK_ACHIEVEMENT_ID]).toBe(date);
    expect(repeated.experienceForCurrentRole).toBe(0);
  });

  it("does not unlock from unfinished or debug runs", () => {
    const storage = memoryStorage();
    saveAccountProfile(profile(23), storage);
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.getState().achievementProgress!.satisfied.push(sharedIds[23]);
    expect(store.getLobbyState().roleProgress.rewinder.unlocked).toBe(false);
    store.markCurrentRunAsDebugged();
    store.dispatch("debug-trigger-ending", { eventId: "phd" });
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.rewinder.unlocked).toBe(false);
    expect(getRewinderAchievementCount(loadAccountProfile(storage).account)).toBe(23);
  });

  it("shows its unlock card first for rewinder without ordinary graduation cards", () => {
    expect(getAchievementDisplayPages("rewinder")[0].achievements[0]).toMatchObject({
      id: REWINDER_UNLOCK_ACHIEVEMENT_ID, title: "轮回者", description: "完成24个不同成就", rewardText: "解锁轮回者角色",
    });
    expect(getAllAchievementDefinitions().some(item => item.id.startsWith("rewinder:ending-"))).toBe(false);
  });
});
