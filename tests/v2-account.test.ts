import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyFinishedRunToAccountProfile,
  changeLobbyRolePage,
  buildLobbySelectedRoleViewModel,
  createDefaultAccountProfile,
  getLobbyRolePageItems,
  getLobbyRolePageRows,
  isRoleOwned,
  normalizeAccountProfile,
  selectLobbyRole,
} from "../src/core/v2-account";
import { createInitialState } from "../src/core/v2-engine";
import {
  clearAccountProfile,
  loadAccountProfile,
  loadOrCreateAccountProfile,
  saveAccountProfile,
} from "../src/core/v2-account-persistence";
import type { Paper } from "../src/core/v2-types";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

declare global {
  interface Window {
    localStorage: Storage;
  }
}

const originalWindow = globalThis.window;

beforeEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new MemoryStorage() } as unknown as Window,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("v2 account profile", () => {
  function createPublishedPaper(
    id: string,
    target: "A" | "B" | "C",
    acceptedScore: number,
    citations: number,
  ): Paper {
    return {
      id,
      title: id,
      idea: acceptedScore,
      experiment: 0,
      writing: 0,
      status: "published",
      target,
      reviewMonthsLeft: 0,
      submittedIdea: acceptedScore,
      submittedExperiment: 0,
      submittedWriting: 0,
      publication: {
        citations,
        monthsSincePublication: 0,
        pendingCitationFraction: 0,
        effectiveScore: acceptedScore,
        citationMultiplier: 1,
      },
    };
  }

  it("creates a default profile with only normal owned", () => {
    const profile = createDefaultAccountProfile();

    expect(profile.ownedRoleIds).toEqual(["normal"]);
    expect(profile.selectedLobbyRoleId).toBe("normal");
    expect(isRoleOwned(profile, "normal")).toBe(true);
    expect(isRoleOwned(profile, "genius")).toBe(false);
    expect(profile.roleProgress.normal.historyBest.researchScore).toBe(0);
  });

  it("builds a selected role view model from account data", () => {
    const profile = selectLobbyRole(createDefaultAccountProfile(), "teacher-child-reversed");
    const viewModel = buildLobbySelectedRoleViewModel(profile, "teacher-child-reversed");

    expect(viewModel.role.id).toBe("teacher-child-reversed");
    expect(viewModel.unlockState.owned).toBe(false);
    expect(viewModel.stats).toHaveLength(5);
    expect(viewModel.historyStats).toHaveLength(5);
    expect(viewModel.passives.length).toBeGreaterThanOrEqual(2);
  });

  it("roundtrips account persistence separately from run-state persistence", () => {
    const profile = selectLobbyRole(createDefaultAccountProfile(), "social");
    saveAccountProfile(profile);

    const loaded = loadAccountProfile();
    expect(loaded?.selectedLobbyRoleId).toBe("social");

    clearAccountProfile();
    expect(loadAccountProfile()).toBeNull();
  });

  it("normalizes malformed account payloads back to a safe default shape", () => {
    const loaded = normalizeAccountProfile({
      ownedRoleIds: ["genius"],
      selectedLobbyRoleId: "missing",
      metaCurrency: -5,
      roleProgress: {
        genius: {
          level: 3,
          exp: 20,
          expToNext: 0,
          availableStatPoints: 2,
          allocatedStats: { research: 4 },
          passiveLevels: { trait: 99 },
          unlocked: true,
        },
      },
    });

    expect(loaded?.ownedRoleIds).toContain("normal");
    expect(loaded?.selectedLobbyRoleId).toBe("normal");
    expect(loaded?.metaCurrency).toBe(0);
    expect(loaded?.roleProgress.genius.unlocked).toBe(true);
    expect(loaded?.roleProgress.genius.expToNext).toBeGreaterThan(0);
    expect(loaded?.roleProgress.genius.allocatedStats.research).toBe(4);
  });

  it("migrates the old starter profile so normal no longer stays at level 1", () => {
    const loaded = normalizeAccountProfile({
      ownedRoleIds: ["normal"],
      selectedLobbyRoleId: "normal",
      metaCurrency: 0,
      achievementProgress: { flags: {} },
      roleProgress: {
        normal: {
          level: 1,
          exp: 0,
          expToNext: 100,
          completedRuns: 0,
          achievementCount: 0,
          availableStatPoints: 0,
          allocatedStats: { san: 0, research: 0, social: 0, favor: 0, money: 0 },
          passiveLevels: { trait: 0, awakening: 0, "hidden-awaken": 0 },
          unlocked: true,
        },
      },
    });

    expect(loaded?.roleProgress.normal.level).toBe(0);
  });

  it("allows normal awakening tracks to normalize up to level 10", () => {
    const loaded = normalizeAccountProfile({
      ownedRoleIds: ["normal"],
      selectedLobbyRoleId: "normal",
      roleProgress: {
        normal: {
          passiveLevels: {
            awakening: 12,
            "hidden-awaken": 11,
          },
          unlocked: true,
        },
      },
    });

    expect(loaded?.roleProgress.normal.passiveLevels.awakening).toBe(10);
    expect(loaded?.roleProgress.normal.passiveLevels["hidden-awaken"]).toBe(10);
  });

  it("tracks per-role history bests from finished runs", () => {
    const profile = createDefaultAccountProfile();
    const firstFinished = {
      ...createInitialState(),
      phase: "finished" as const,
      selectedRoleId: "normal" as const,
      ending: "burnout" as const,
      totalResearchScore: 42,
      totalCitations: 18,
      papers: [
        createPublishedPaper("paper-a", "A", 36, 9),
        createPublishedPaper("paper-b", "B", 24, 5),
      ],
      externalPublications: [
        createPublishedPaper("paper-c", "A", 12, 2),
      ],
    };

    const secondFinished = {
      ...firstFinished,
      totalResearchScore: 38,
      totalCitations: 27,
      papers: [
        createPublishedPaper("paper-d", "C", 20, 14),
      ],
      externalPublications: [],
    };

    const firstResult = applyFinishedRunToAccountProfile(profile, firstFinished);
    expect(firstResult.roleProgress.normal.historyBest).toEqual({
      researchScore: 42,
      totalCitations: 18,
      natureCount: 2,
      representativeCitations: 9,
      representativeScore: 36,
    });

    const secondResult = applyFinishedRunToAccountProfile(firstResult, secondFinished);
    expect(secondResult.roleProgress.normal.historyBest).toEqual({
      researchScore: 42,
      totalCitations: 27,
      natureCount: 2,
      representativeCitations: 14,
      representativeScore: 36,
    });
  });

  it("tracks role achievement progress with history-high and best-single-run snapshots", () => {
    const profile = createDefaultAccountProfile();
    const firstFinished = {
      ...createInitialState(),
      phase: "finished" as const,
      selectedRoleId: "normal" as const,
      ending: "burnout" as const,
      player: {
        san: 20,
        research: 5,
        social: 6,
        favor: 4,
        money: 5,
      },
      totalResearchScore: 0,
      totalCitations: 0,
      papers: [],
      externalPublications: [],
    };
    const secondFinished = {
      ...createInitialState(),
      phase: "finished" as const,
      selectedRoleId: "normal" as const,
      ending: "master" as const,
      player: {
        san: 20,
        research: 6,
        social: 6,
        favor: 6,
        money: 6,
      },
      totalResearchScore: 2,
      totalCitations: 0,
      papers: [],
      externalPublications: [],
    };

    const firstResult = applyFinishedRunToAccountProfile(profile, firstFinished);
    const firstViewModel = buildLobbySelectedRoleViewModel(firstResult, "normal");
    const firstPot = firstViewModel.roleAchievements.find((achievement) => achievement.definition.id === "normal:first-pot");
    const allRounder = firstViewModel.roleAchievements.find((achievement) => achievement.definition.id === "normal:all-rounder");

    expect(firstPot?.progressLines).toEqual(["历史最高 5 / 30"]);
    expect(firstPot?.unlocked).toBe(false);
    expect(allRounder?.progressLines).toEqual([
      "最佳单局：科研 5/6 · 社交 6/6 · 好感 4/6 · 金币 5/6",
    ]);
    expect(allRounder?.unlocked).toBe(false);

    const secondResult = applyFinishedRunToAccountProfile(firstResult, secondFinished);
    const secondViewModel = buildLobbySelectedRoleViewModel(secondResult, "normal");
    const unlockedAllRounder = secondViewModel.roleAchievements.find((achievement) => achievement.definition.id === "normal:all-rounder");

    expect(secondResult.roleProgress.normal.unlockedAchievementIds).toContain("normal:all-rounder");
    expect(unlockedAllRounder?.progressLines).toEqual([
      "最佳单局：科研 6/6 · 社交 6/6 · 好感 6/6 · 金币 6/6",
    ]);
    expect(unlockedAllRounder?.unlocked).toBe(true);
  });

  it("tracks and unlocks the ergonomic-chair achievement for normal", () => {
    const profile = createDefaultAccountProfile();
    const finished = {
      ...createInitialState(),
      phase: "finished" as const,
      selectedRoleId: "normal" as const,
      ending: "burnout" as const,
      player: {
        san: 20,
        research: 1,
        social: 1,
        favor: 1,
        money: 1,
      },
      shopState: {
        ...createInitialState().shopState,
        chairOwned: true,
        chairUpgrade: "advanced" as const,
      },
      totalResearchScore: 0,
      totalCitations: 0,
      papers: [],
      externalPublications: [],
    };

    const result = applyFinishedRunToAccountProfile(profile, finished);
    const viewModel = buildLobbySelectedRoleViewModel(result, "normal");
    const chairAchievement = viewModel.roleAchievements.find((achievement) => achievement.definition.id === "normal:chair-upgrade");

    expect(result.roleProgress.normal.unlockedAchievementIds).toContain("normal:chair-upgrade");
    expect(chairAchievement?.progressLines).toEqual([
      "最佳单局：办公椅 1/1 · 工学椅 1/1",
    ]);
    expect(chairAchievement?.unlocked).toBe(true);
  });

  it("creates a fresh profile when no saved account exists", () => {
    const profile = loadOrCreateAccountProfile();
    expect(profile.selectedLobbyRoleId).toBe("normal");
  });

  it("pages the lobby role list in fixed chunks instead of scrolling through all roles", () => {
    const firstPage = createDefaultAccountProfile();
    const secondPage = changeLobbyRolePage(firstPage, 1);

    expect(getLobbyRolePageRows(firstPage)).toEqual([
      ["normal", "normal-reversed"],
      ["rich", "rich-reversed"],
      ["genius", "genius-reversed"],
      ["teacher-child", "teacher-child-reversed"],
      ["social", "social-reversed"],
    ]);
    expect(getLobbyRolePageItems(firstPage)).toEqual([
      "normal",
      "normal-reversed",
      "rich",
      "rich-reversed",
      "genius",
      "genius-reversed",
      "teacher-child",
      "teacher-child-reversed",
      "social",
      "social-reversed",
    ]);
    expect(secondPage.lobbyRolePage).toBe(1);
    expect(getLobbyRolePageRows(secondPage)).toEqual([
      ["chosen", "chosen-reversed"],
      ["research-captain", "rewinder"],
    ]);
    expect(getLobbyRolePageItems(secondPage)).toEqual([
      "chosen",
      "chosen-reversed",
      "research-captain",
      "rewinder",
    ]);
  });

  it("moves the selected role to the matching implicit column page", () => {
    const profile = selectLobbyRole(createDefaultAccountProfile(), "research-captain");

    expect(profile.selectedLobbyRoleId).toBe("research-captain");
    expect(profile.lobbyRolePage).toBe(1);
  });
});
