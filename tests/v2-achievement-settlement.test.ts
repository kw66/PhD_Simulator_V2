import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { observeAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { COLLECTION_REQUIREMENTS } from "../src/core/v2-achievement-collections";
import { createStore } from "../src/core/v2-store";
import { ACCOUNT_STORAGE_KEY, loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import type { GameState, RoleId } from "../src/core/v2-types";

const date1 = "2026-10-16T06:00:00.000Z";
const date2 = "2026-10-17T01:00:00.000Z";
function ending(role: RoleId, ids: string[]): GameState {
  return { ...createStartedGameState(role), phase: "finished", ending: "quit",
    achievementProgress: { ...createAchievementRunProgress(), satisfied: ids } };
}
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("achievement ending transaction", () => {
  it.each(["cursed-frail", "special-fading-genius", "special-finite-life", "cursed-debt"] as const)(
    "keeps %s curse achievement in preview and scopes its eventual reward to all roles", role => {
      const state = { ...ending(role, []), ending: "phd" as const };
      const observed = observeAchievements(createStartedGameState(role), state);
      const id = `${role}:curse-hell-phd`;
      expect(observed.achievementProgress?.satisfied).not.toContain(id);
      // Future difficulty evidence enters the same ending transaction as other achievements.
      const first = settleRunAchievements(createDefaultAccountProfile(), ending(role, [id]), date1);
      expect(first.account.achievementUnlockedByRole?.[id]).toEqual({ [role]: date1 });
      expect(Object.values(first.account.achievementTalentPoints!)).toHaveLength(Object.keys(first.account.roleProgress).length);
      expect(Object.values(first.account.achievementTalentPoints!).every(points => points === 1)).toBe(true);
      const repeated = settleRunAchievements(first.account, ending(role, [id]), date2);
      expect(repeated.account.achievementTalentPoints).toEqual(first.account.achievementTalentPoints);
      const wrong = settleRunAchievements(createDefaultAccountProfile(), ending("normal", [id]));
      expect(wrong.account.achievementTalentPoints).toEqual({});
    },
  );

  it("unlocks every curse role from truly ordinary without repeating its multiplier reward", () => {
    const curses: RoleId[] = ["cursed-frail", "special-fading-genius", "special-finite-life", "cursed-debt"];
    const original = createDefaultAccountProfile();
    const wrong = settleRunAchievements(original, ending("rich", ["normal:truly-ordinary"]), date1);
    expect(curses.every(id => !wrong.account.roleProgress[id].unlocked)).toBe(true);
    const first = settleRunAchievements(original, ending("normal", ["normal:truly-ordinary"]), date1);
    expect(curses.every(id => first.account.roleProgress[id].unlocked)).toBe(true);
    expect(curses.every(id => !original.roleProgress[id].unlocked)).toBe(true);
    expect(first.account.achievementExperienceMultipliers).toEqual({ normal: 1 });
    const repeated = settleRunAchievements(first.account, ending("normal", ["normal:truly-ordinary"]), date2);
    expect(repeated.account.achievementExperienceMultipliers).toEqual({ normal: 1 });
    expect(repeated.state.runAchievementIds).toEqual([]);
    // Simulate an account that completed the achievement before curse unlocks were added.
    const old = structuredClone(first.account);
    for (const id of curses) old.roleProgress[id].unlocked = false;
    const memory = storage();
    saveAccountProfile(old, memory);
    const loaded = loadAccountProfile(memory).account;
    expect(curses.every(id => loaded.roleProgress[id].unlocked)).toBe(true);
    expect(loaded.achievementExperienceMultipliers).toEqual({ normal: 1 });
    expect(loaded.achievementUnlockedByRole?.["normal:truly-ordinary"]).toEqual({ normal: date1 });
  });

  it("records each completing role once but pays the shared reward just once", () => {
    const first = settleRunAchievements(createDefaultAccountProfile(), ending("normal", ["global:paper-lover"]), date1);
    expect(first.account.roleProgress.normal.exp).toBe(5);
    expect(first.account.roleProgress.rich.exp).toBe(5);
    expect(first.account.achievementUnlockedByRole?.["global:paper-lover"]).toEqual({ normal: date1 });
    const second = settleRunAchievements(first.account, ending("rich", ["global:paper-lover"]), date2);
    expect(second.account.roleProgress.rich.exp).toBe(5);
    expect(second.account.achievementUnlockedByRole?.["global:paper-lover"]).toEqual({ normal: date1, rich: date2 });
    expect(second.state.runAchievementIds).toEqual(["global:paper-lover"]);
    const repeated = settleRunAchievements(second.account, ending("rich", ["global:paper-lover"]), date1);
    expect(repeated.state.runAchievementIds).toEqual([]);
    expect(repeated.account.achievementUnlockedByRole).toEqual(second.account.achievementUnlockedByRole);
    expect(repeated.account.roleProgress).toEqual(second.account.roleProgress);
  });

  it("limits scoped rewards and records to their eligible roles", () => {
    const wrong = settleRunAchievements(createDefaultAccountProfile(), ending("rich", ["normal:self-reliance", "unlock:genius-reversed"]));
    expect(wrong.account.achievementRewardedIds).toEqual([]);
    const right = settleRunAchievements(createDefaultAccountProfile(), ending("genius", ["unlock:genius-reversed"]));
    expect(right.account.roleProgress["genius-reversed"].unlocked).toBe(true);
    expect(right.account.achievementExperienceMultipliers).toEqual({ genius: 1 });
    expect(right.account.roleProgress.genius.exp).toBe(0);
  });

  it("combines cross-role collections, grants all roles 0.2 multiplier, and never regrants", () => {
    const half = Math.floor(COLLECTION_REQUIREMENTS.products.length / 2);
    const state = ending("normal", []);
    state.achievementProgress!.collections.products = COLLECTION_REQUIREMENTS.products.slice(0, half).map(item => item.id);
    const first = settleRunAchievements(createDefaultAccountProfile(), state);
    expect(first.account.achievementTalentPoints).toEqual({});
    const other = ending("rich", []);
    other.achievementProgress!.collections.products = COLLECTION_REQUIREMENTS.products.slice(half).map(item => item.id);
    const second = settleRunAchievements(first.account, other);
    expect(Object.values(second.account.achievementExperienceMultipliers!)).toHaveLength(Object.keys(second.account.roleProgress).length);
    expect(Object.values(second.account.achievementExperienceMultipliers!).every(value => value === 0.2)).toBe(true);
    expect(second.account.achievementTalentPoints).toEqual({});
    const third = settleRunAchievements(second.account, other);
    expect(third.account.achievementExperienceMultipliers).toEqual(second.account.achievementExperienceMultipliers);
    expect(third.state.runAchievementIds).toEqual([]);
  });

  it("uses the previous multiplier for simultaneous experience rewards", () => {
    const account = createDefaultAccountProfile();
    account.achievementExperienceMultipliers = { normal: 2 };
    const result = settleRunAchievements(account, ending("normal", ["normal:truly-ordinary", "normal:self-reliance"]));
    expect(result.experienceForCurrentRole).toBe(15);
    expect(result.account.achievementExperienceMultipliers?.normal).toBe(3);
    expect(result.account.roleProgress.normal.exp).toBe(15);
  });

  it("accumulates all five fractional rewards exactly and applies them to later experience", () => {
    const state = ending("normal", []);
    for (const key of Object.keys(COLLECTION_REQUIREMENTS) as (keyof typeof COLLECTION_REQUIREMENTS)[]) {
      state.achievementProgress!.collections[key] = COLLECTION_REQUIREMENTS[key].map(item => item.id);
    }
    const collected = settleRunAchievements(createDefaultAccountProfile(), state);
    expect(Object.values(collected.account.achievementExperienceMultipliers!).every(value => value === 1)).toBe(true);
    expect(collected.account.achievementTalentPoints).toEqual({});
    expect(collected.state.runAchievementIds).toHaveLength(5);
    const later = settleRunAchievements(collected.account, ending("normal", ["global:paper-lover"]));
    expect(later.experienceForCurrentRole).toBe(10);
    const repeated = settleRunAchievements(later.account, state);
    expect(repeated.account.achievementExperienceMultipliers).toEqual(later.account.achievementExperienceMultipliers);
    expect(repeated.state.runAchievementIds).toEqual([]);
  });

  it("removes legacy collector talent points before sanitizing saved allocations", async () => {
    const account = createDefaultAccountProfile();
    account.achievementRewardedIds = ["global:product-collector"];
    account.achievementTalentPoints = { normal: 1 };
    account.talentAllocation = { normal: { "first-month-drive": 1 } };
    const memory = storage();
    saveAccountProfile(account, memory);
    const envelope = JSON.parse(memory.getItem(ACCOUNT_STORAGE_KEY)!);
    const achievementsKey = Object.keys(envelope.records).find(key => key.includes("role_achievements"))!;
    const achievements = JSON.parse(envelope.records[achievementsKey]);
    delete achievements.collectorRewardVersion;
    envelope.records[achievementsKey] = JSON.stringify(achievements);
    memory.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(envelope));
    const loaded = createStore({ storage: memory });
    await loaded.ready();
    expect(loaded.getLobbyState().achievementTalentPoints?.normal).toBe(0);
    expect(loaded.getLobbyState().achievementExperienceMultipliers?.normal).toBe(0.2);
    expect(loaded.getLobbyState().talentAllocation?.normal).toBeUndefined();
  });

  it("persists collectors, role dates, one-time rewards and spendable bonus talent points", async () => {
    const account = settleRunAchievements(createDefaultAccountProfile(), ending("normal", ["normal:first-pot", "global:paper-lover"]), date1).account;
    account.achievementTalentPoints = { normal: 2 };
    account.achievementExperienceMultipliers = { normal: 2.2 };
    const memory = storage();
    saveAccountProfile(account, memory);
    expect(memory.getItem(ACCOUNT_STORAGE_KEY)).not.toBeNull();
    const loaded = createStore({ storage: memory });
    await loaded.ready();
    expect(loaded.getLobbyState().roleProgress.rich.unlocked).toBe(true);
    expect(loaded.getLobbyState().achievementUnlockedByRole).toEqual(account.achievementUnlockedByRole);
    expect(loaded.getLobbyState().achievementRewardedIds).toEqual(account.achievementRewardedIds);
    expect(loaded.getLobbyState().achievementTalentPoints).toEqual({ normal: 2 });
    expect(loaded.getLobbyState().achievementExperienceMultipliers).toEqual({ normal: 2.2 });
    expect(loaded.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    expect(loaded.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    expect(loaded.upgradeRoleTalent("normal", "first-month-drive")).toBe(false);
    loaded.dispatch("start-game", { roleId: "normal" });
    expect(loaded.getState().roleTalents?.levels["first-month-drive"]).toBe(2);
  });

  it("starts normal progression without loading former test-mode levels, unlocks or allocations", () => {
    const memory = storage();
    memory.setItem("phd_simulator_v2_role_experience_v1", JSON.stringify({ version: 1, roles: { normal: { level: 10, exp: 0 } } }));
    memory.setItem("phd_simulator_v2_role_achievements_v1", JSON.stringify({ version: 1, roles: { rich: { unlocked: true } } }));
    memory.setItem("phd_simulator_v2_role_talents_v1", JSON.stringify({ version: 1, roles: { normal: { "first-month-drive": 3 } } }));
    const store = createStore({ storage: memory });
    store.enableTalentTestMode();
    expect(store.getLobbyState().roleProgress.normal.level).toBe(0);
    expect(store.getLobbyState().roleProgress.rich.unlocked).toBe(false);
    expect(store.getLobbyState().talentAllocation).toEqual({});
  });

  it("tracks help pages actually opened once and does not count them in debug runs", () => {
    const store = createStore({ storage: null });
    store.dispatch("start-game", { roleId: "normal" });
    store.recordHelpPageRead("a", ["a", "b"]);
    store.recordHelpPageRead("a", ["a", "b"]);
    expect(store.getState().achievementProgress?.sets["help-pages"]).toEqual(["a"]);
    store.recordHelpPageRead("b", ["a", "b"]);
    store.dispatch("quit-game");
    expect(store.getLobbyState().achievementRewardedIds).not.toContain("global:help-collector");
    expect(store.getState().runAchievementIds).toContain("global:help-collector");
    store.dispatch("restart-game");
    expect(store.getLobbyState().achievementRewardedIds).toContain("global:help-collector");
    store.markCurrentRunAsDebugged();
    store.recordHelpPageRead("a", ["a"]);
    expect(store.getState().achievementProgress?.sets["help-pages"] ?? []).toEqual([]);
  });

  it("settles natural endings once and excludes an opened debug panel permanently", () => {
    const normal = createStore({ storage: null });
    normal.dispatch("start-game", { roleId: "normal" });
    normal.dispatch("quit-game");
    expect(normal.getLobbyState().achievementRewardedIds).not.toContain("global:ending-quit");
    expect(normal.getState().runAchievementIds).toContain("global:ending-quit");
    const recorded = structuredClone(normal.getLobbyState());
    normal.dispatch("quit-game");
    expect(normal.getLobbyState()).toEqual(recorded);
    normal.dispatch("restart-game");
    expect(normal.getLobbyState().achievementRewardedIds).toContain("global:ending-quit");
    const debug = createStore({ storage: null });
    debug.dispatch("start-game", { roleId: "normal" });
    debug.markCurrentRunAsDebugged();
    debug.dispatch("quit-game");
    expect(debug.getLobbyState().achievementRewardedIds).toEqual([]);
    expect(debug.getState().runAchievementIds ?? []).toEqual([]);
    expect(debug.getEndingExperienceAward()?.gained).toBe(0);
    expect(debug.getLobbyState().lastRunExperience).toBeUndefined();
    debug.dispatch("restart-game");
    expect(debug.getLobbyState().lastRunExperience?.gained).toBe(0);
    expect(debug.getLobbyState().achievementCollectionProgress).toEqual(createAchievementRunProgress().collections);
  });

  it("captures peak achievements before losses and pays only at the ending", () => {
    const before = createStartedGameState("normal");
    const high = observeAchievements(before, { ...before, player: { ...before.player, research: 25 } });
    const low = observeAchievements(high, { ...high, player: { ...high.player, research: 1 }, phase: "finished", ending: "quit" });
    const result = settleRunAchievements(createDefaultAccountProfile(), low);
    expect(result.account.achievementRewardedIds).toContain("upright:breakthrough-i");
  });
});
