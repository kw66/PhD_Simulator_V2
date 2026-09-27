import { describe, expect, it } from "vitest";

import {
  loadRoleAchievementRecords,
  recordNewAchievementDates,
  saveRoleAchievementRecords,
} from "../src/core/v2-achievement-records";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

describe("role achievement records", () => {
  it("records the first unlock date and restores both achievements and owned roles", () => {
    const before = createDefaultAccountProfile();
    const newlyUnlocked = createDefaultAccountProfile();
    newlyUnlocked.roleProgress.normal.unlockedAchievementIds = ["normal:first-pot"];
    newlyUnlocked.roleProgress.rich.unlocked = true;

    const timestamp = "2026-09-28T01:30:00.000Z";
    const recorded = recordNewAchievementDates(before, newlyUnlocked, timestamp);
    expect(recorded.achievementUnlockedAt).toEqual({
      "normal:first-pot": timestamp,
      "unlock:rich": timestamp,
    });
    expect(recordNewAchievementDates(before, recorded, "2026-10-01T00:00:00.000Z").achievementUnlockedAt)
      .toEqual(recorded.achievementUnlockedAt);

    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    saveRoleAchievementRecords(recorded, storage);
    const restored = loadRoleAchievementRecords(createDefaultAccountProfile(), storage);
    expect(restored.roleProgress.normal.unlockedAchievementIds).toEqual(["normal:first-pot"]);
    expect(restored.roleProgress.rich.unlocked).toBe(true);
    expect(restored.achievementUnlockedAt).toEqual(recorded.achievementUnlockedAt);
  });

  it("does not invent dates for already unlocked achievements", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["normal:first-pot"];
    expect(recordNewAchievementDates(account, account).achievementUnlockedAt).toEqual({});
  });
});
