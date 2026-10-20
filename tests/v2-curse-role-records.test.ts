import { describe, expect, it } from "vitest";
import { loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { getSelectedCurseDifficulty } from "../src/core/v2-curse-progress";
import { CURSED_ROLE_IDS, type CurseDifficulty } from "../src/core/v2-curse-system";
import { DATA_EPOCH, DATA_EPOCH_STARTED_AT } from "../src/core/v2-data-epoch";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { buildLobbySelectedRoleViewModel, createDefaultAccountProfile } from "../src/core/v2-lobby";
import {
  getLegacyCurseRoleHistoryBest, getRoleHistoryBest, loadRoleRecords,
  recordRoleResult, ROLE_RECORDS_STORAGE_KEY, saveRoleRecords,
} from "../src/core/v2-role-records";
import type { GameState, RoleId } from "../src/core/v2-types";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function finished(roleId: RoleId, difficulty: CurseDifficulty, score: number, citations: number): GameState {
  return { ...createStartedGameState(roleId, {}, 0, difficulty), phase: "finished", ending: "quit",
    totalResearchScore: score, totalCitations: citations };
}

describe("personal cursed history by challenge", () => {
  it("switches both lobby history pages to the selected difficulty without changing stored history", () => {
    let account = createDefaultAccountProfile();
    const roleId = "cursed-frail";
    account.curseDifficultyUnlocked = { [roleId]: 4 };
    account = recordRoleResult(account, { ...finished(roleId, 1, 100, 200), player: { ...finished(roleId, 1, 100, 200).player, research: 40 } });
    account = recordRoleResult(account, { ...finished(roleId, 4, 10, 20), player: { ...finished(roleId, 4, 10, 20).player, research: 12 } });
    account.curseDifficultyByRole = { [roleId]: 1 };
    const easy = buildLobbySelectedRoleViewModel(account, roleId);
    expect(easy.historyLabel).toBe("历史 · 简单");
    expect(easy.historyStats.find(stat => stat.id === "research-score")?.value).toBe("100");
    expect(easy.progress.historyBest.research).toBe(40);
    account.curseDifficultyByRole = { [roleId]: 4 };
    const hell = buildLobbySelectedRoleViewModel(account, roleId);
    expect(hell.historyLabel).toBe("历史 · 地狱");
    expect(hell.historyStats.find(stat => stat.id === "research-score")?.value).toBe("10");
    expect(hell.progress.historyBest.research).toBe(12);
    expect(account.roleProgress[roleId].historyBest.researchScore).toBe(0);
  });

  it.each(CURSED_ROLE_IDS)("keeps %s four challenges independent and merges each field within its own challenge", roleId => {
    let account = createDefaultAccountProfile();
    account.curseDifficultyUnlocked = { [roleId]: 4 };
    account.curseDifficultyByRole = { [roleId]: 4 };
    for (const difficulty of [1, 2, 3, 4] as const) {
      account = recordRoleResult(account, finished(roleId, difficulty, 100 / difficulty, difficulty * 10));
    }
    account = recordRoleResult(account, finished(roleId, 2, 25, 80));
    expect(account.roleProgress[roleId]).toMatchObject({ playedRuns: 5, completedRuns: 0 });
    expect(account.roleProgress[roleId].historyBest.researchScore).toBe(0);
    expect(getLegacyCurseRoleHistoryBest(account, roleId)).toBeNull();
    expect(getRoleHistoryBest(account, roleId)).toMatchObject({ researchScore: 25, totalCitations: 40 });
    expect(getRoleHistoryBest(account, roleId, 1)).toMatchObject({ researchScore: 100, totalCitations: 10 });
    expect(getRoleHistoryBest(account, roleId, 2)).toMatchObject({ researchScore: 50, totalCitations: 80 });
    expect(getRoleHistoryBest(account, roleId, 3)).toMatchObject({ researchScore: 100 / 3, totalCitations: 30 });
    expect(getRoleHistoryBest(account, roleId, 4)).toMatchObject({ researchScore: 25, totalCitations: 40 });
    // Settlement's difficulty is taken from the run, not the current lobby selection.
    expect(getSelectedCurseDifficulty(account, roleId)).toBe(4);
    const target = storage();
    saveAccountProfile(account, target);
    const loaded = loadAccountProfile(target).account;
    expect(loaded.roleProgress[roleId].historyBestByCurseDifficulty).toEqual(account.roleProgress[roleId].historyBestByCurseDifficulty);
    expect(getRoleHistoryBest(loaded, roleId)).toEqual(getRoleHistoryBest(account, roleId));
  });

  it("retains unknown historical difficulty without seeding any challenge from the old maximum", () => {
    const target = storage();
    target.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: DATA_EPOCH_STARTED_AT,
      roles: { "cursed-frail": { playedRuns: 2, completedRuns: 1,
        historyBest: { researchScore: 500, totalCitations: 2000 } } } }));
    let account = loadRoleRecords(createDefaultAccountProfile(), target);
    expect(getLegacyCurseRoleHistoryBest(account, "cursed-frail")).toMatchObject({ researchScore: 500, totalCitations: 2000 });
    for (const difficulty of [1, 2, 3, 4] as const) {
      expect(getRoleHistoryBest(account, "cursed-frail", difficulty)).toMatchObject({ researchScore: 0, totalCitations: 0 });
    }
    account.roleProgress["cursed-frail"].startedRuns += 1;
    account = recordRoleResult(account, finished("cursed-frail", 2, 20, 30));
    expect(getRoleHistoryBest(account, "cursed-frail", 2)).toMatchObject({ researchScore: 20, totalCitations: 30 });
    expect(getLegacyCurseRoleHistoryBest(account, "cursed-frail")).toMatchObject({ researchScore: 500, totalCitations: 2000 });
    saveRoleRecords(account, target);
    const restored = loadRoleRecords(createDefaultAccountProfile(), target);
    expect(restored.roleProgress["cursed-frail"]).toEqual(account.roleProgress["cursed-frail"]);
  });

  it("keeps a finalized run lacking trustworthy difficulty unscoped and ignores unfinished results", () => {
    const state = finished("cursed-debt", 3, 15, 30);
    const account = createDefaultAccountProfile();
    expect(recordRoleResult(account, { ...state, phase: "playing" })).toBe(account);
    const settled = recordRoleResult(account, { ...state, curseState: undefined });
    expect(settled.roleProgress["cursed-debt"].historyBestByCurseDifficulty).toBeUndefined();
    expect(getLegacyCurseRoleHistoryBest(settled, "cursed-debt")).toMatchObject({ researchScore: 15, totalCitations: 30 });
    expect(getRoleHistoryBest(settled, "cursed-debt", 1).researchScore).toBe(0);
  });

  it("validates each saved challenge and discards challenges from non-cursed roles", () => {
    const target = storage();
    const historyBestByCurseDifficulty = {
      1: { researchScore: 20, hIndex: -1, natureCount: 1.5, money: -10, social: "9" },
      2: { totalCitations: 200, sanCap: 30 },
      3: [], 4: null, 5: { researchScore: 500 },
    };
    target.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: DATA_EPOCH_STARTED_AT,
      roles: {
        "cursed-debt": { playedRuns: 2, completedRuns: 1, historyBestByCurseDifficulty },
        normal: { playedRuns: 1, completedRuns: 0, historyBest: { researchScore: 7 }, historyBestByCurseDifficulty },
      } }));
    const loaded = loadRoleRecords(createDefaultAccountProfile(), target);
    expect(Object.keys(loaded.roleProgress["cursed-debt"].historyBestByCurseDifficulty!)).toEqual(["1", "2"]);
    expect(getRoleHistoryBest(loaded, "cursed-debt", 1)).toMatchObject({ researchScore: 20, hIndex: 0, natureCount: 0, money: 0, social: 0 });
    expect(getRoleHistoryBest(loaded, "cursed-debt", 2)).toMatchObject({ totalCitations: 200, sanCap: 30 });
    expect(loaded.roleProgress.normal.historyBestByCurseDifficulty).toBeUndefined();
    const normal = recordRoleResult(loaded, finished("normal", 4, 10, 40));
    expect(getRoleHistoryBest(normal, "normal", 4)).toMatchObject({ researchScore: 10, totalCitations: 40 });
    expect(normal.roleProgress.normal.historyBestByCurseDifficulty).toBeUndefined();
    expect(getLegacyCurseRoleHistoryBest(normal, "normal")).toBeNull();
  });
});
