import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { settleAcademicYearAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { COLLECTION_REQUIREMENTS } from "../src/core/v2-achievement-collections";
import { loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import type { GameState } from "../src/core/v2-types";

const timestamp = "2026-10-18T12:00:00.000Z";

function completedYear(): GameState {
  const state = createStartedGameState("rewinder");
  // Settlement consumes only the confirmed-completion marker; archive content
  // validation belongs to the academic archive module and store transaction.
  Object.assign(state.rewinderState!, { academic: { startYear: 1, completed: { year: 1 } } });
  return { ...state, year: 1, month: 12, totalMonths: 12,
    achievementProgress: createAchievementRunProgress(), totalResearchScore: 1000 };
}

describe("rewinder academic achievement settlement", () => {
  it("settles real retained attributes without awarding the research score or recording an ending", () => {
    const account = createDefaultAccountProfile();
    const state = completedYear();
    state.player.research = 30;
    const before = structuredClone(state);
    const result = settleAcademicYearAchievements(account, state, timestamp);
    expect(result.state.phase).toBe("playing");
    expect(result.state.ending).toBeNull();
    expect(result.state.runAchievementIds).toEqual(["global:breakthrough-ii"]);
    expect(result.experienceForCurrentRole).toBe(5);
    expect(result.account.roleProgress.rewinder.exp).toBe(5);
    expect(result.account.roleProgress.rewinder.playedRuns).toBe(0);
    expect(result.account.roleProgress.rewinder.completedRuns).toBe(0);
    expect(result.account.lastRunExperience).toBeUndefined();
    expect(state).toEqual(before);
    expect(result.state.achievementProgress).toEqual(before.achievementProgress);
    expect(result.account.achievementUnlockedByRole?.["global:breakthrough-ii"]).toEqual({ rewinder: timestamp });
  });

  it("keeps the normal role restrictions and rejects stale ending-only facts", () => {
    const state = completedYear();
    state.internshipCount = 3;
    state.achievementProgress!.satisfied = ["global:slow-research", "global:ending-quit", "unlock:rich-reversed",
      "global:three-internships", "global:career-apex-academic"];
    const result = settleAcademicYearAchievements(createDefaultAccountProfile(), state, timestamp);
    expect(result.state.runAchievementIds).toEqual(["global:career-apex-academic"]);
    expect(result.account.achievementRewardedIds).toEqual(["global:career-apex-academic"]);
    expect(result.account.roleProgress["rich-reversed"].unlocked).toBe(false);
  });

  it("settles cross-run collections and pays the account reward only once after reload", () => {
    const state = completedYear();
    const requirements = COLLECTION_REQUIREMENTS.products.map(item => item.id);
    const account = createDefaultAccountProfile();
    account.achievementCollectionProgress = { ...createAchievementRunProgress().collections, products: requirements.slice(0, -1) };
    state.achievementProgress!.collections.products = requirements.slice(-1);
    const first = settleAcademicYearAchievements(account, state, timestamp);
    expect(first.state.runAchievementIds).toEqual(["global:product-collector"]);
    expect(first.account.achievementExperienceMultipliers?.rewinder).toBe(0.2);
    expect(first.experienceForCurrentRole).toBe(0);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    saveAccountProfile(first.account, storage);
    const again = settleAcademicYearAchievements(loadAccountProfile(storage).account, state, timestamp);
    expect(again.account.achievementExperienceMultipliers?.rewinder).toBe(0.2);
    expect(again.state.runAchievementIds).toEqual([]);
    expect(again.account.roleProgress.rewinder.playedRuns).toBe(0);
  });

  it("requires a confirmed academic archive and never settles failures or graduates through this route", () => {
    const account = createDefaultAccountProfile();
    const absent = createStartedGameState("rewinder");
    const pending = completedYear();
    Object.assign(pending.rewinderState!, { academic: { startYear: 1, pending: { year: 1 } } });
    const examples: GameState[] = [absent, pending, { ...completedYear(), selectedRoleId: "normal" },
      { ...completedYear(), phase: "finished", ending: "phd" }, { ...completedYear(), phase: "finished", ending: "burnout" }];
    for (const state of examples) {
      state.achievementProgress = { ...createAchievementRunProgress(), satisfied: ["global:breakthrough-ii"] };
      expect(settleAcademicYearAchievements(account, state)).toEqual({ account, state, experienceForCurrentRole: 0 });
    }
  });

  it("preserves normal ending settlements and refuses annual states in the ending route", () => {
    const account = createDefaultAccountProfile();
    const state = completedYear();
    state.achievementProgress!.satisfied = ["global:breakthrough-ii"];
    expect(settleRunAchievements(account, state)).toEqual({ account, state, experienceForCurrentRole: 0 });
    const ending = { ...state, phase: "finished" as const, ending: "quit" as const };
    const settled = settleRunAchievements(account, ending, timestamp);
    expect(settled.state.runAchievementIds).toEqual(["global:breakthrough-ii"]);
    expect(settled.experienceForCurrentRole).toBe(5);
  });
});
