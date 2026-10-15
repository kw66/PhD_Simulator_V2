import { describe, expect, it } from "vitest";
import { achievementRecordsChanged, loadRoleAchievementRecords, recordNewAchievementDates, saveRoleAchievementRecords } from "../src/core/v2-achievement-records";
import { COLLECTION_REQUIREMENTS } from "../src/core/v2-achievement-collections";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

const FIRST = "2026-09-28T01:30:00.000Z";
const SECOND = "2026-10-15T13:00:00.000Z";
function memoryStorage(initial?: unknown) {
  let value = initial === undefined ? null : JSON.stringify(initial);
  return { getItem: (_key: string) => value, setItem: (_key: string, next: string) => { value = next; } };
}

describe("role achievement records", () => {
  it("records actual completion dates and preserves role ownership independently", () => {
    const before = createDefaultAccountProfile();
    const after = createDefaultAccountProfile();
    after.roleProgress.normal.unlockedAchievementIds = ["normal:first-pot"];
    after.roleProgress.rich.unlocked = true;
    const recorded = recordNewAchievementDates(before, after, FIRST);
    expect(recorded.achievementUnlockedAt).toEqual({ "normal:first-pot": FIRST });
    expect(recorded.achievementUnlockedByRole).toEqual({ "normal:first-pot": { normal: FIRST } });
    expect(recordNewAchievementDates(before, recorded, SECOND).achievementUnlockedAt).toEqual(recorded.achievementUnlockedAt);
    const storage = memoryStorage();
    saveRoleAchievementRecords(recorded, storage);
    const restored = loadRoleAchievementRecords(createDefaultAccountProfile(), storage);
    expect(restored.roleProgress.normal.unlockedAchievementIds).toEqual(["normal:first-pot"]);
    expect(restored.roleProgress.rich.unlocked).toBe(true);
    expect(restored.achievementUnlockedAt).toEqual(recorded.achievementUnlockedAt);
    expect(restored.achievementUnlockedByRole).toEqual(recorded.achievementUnlockedByRole);
  });

  it("does not invent dates from role ownership or previously completed undated achievements", () => {
    const before = createDefaultAccountProfile();
    const after = createDefaultAccountProfile();
    after.roleProgress["genius-reversed"].unlocked = true;
    expect(recordNewAchievementDates(before, after, FIRST).achievementUnlockedAt).toEqual({});
    after.roleProgress.normal.unlockedAchievementIds = ["normal:first-pot"];
    expect(recordNewAchievementDates(after, after, FIRST).achievementUnlockedAt).toEqual({});
    expect(recordNewAchievementDates(before, after, "bad-date")).toBe(after);
  });

  it("tracks shared achievement completions by role without replacing their first date", () => {
    const before = createDefaultAccountProfile();
    const first = createDefaultAccountProfile();
    first.roleProgress.normal.unlockedAchievementIds = ["global:deep-sleep"];
    const recorded = recordNewAchievementDates(before, first, FIRST);
    const second = { ...recorded, roleProgress: { ...recorded.roleProgress,
      rich: { ...recorded.roleProgress.rich, unlockedAchievementIds: ["global:deep-sleep"] } } };
    const both = recordNewAchievementDates(recorded, second, SECOND);
    expect(both.achievementUnlockedAt["global:deep-sleep"]).toBe(FIRST);
    expect(both.achievementUnlockedByRole?.["global:deep-sleep"]).toEqual({ normal: FIRST, rich: SECOND });
    expect(achievementRecordsChanged(recorded, both)).toBe(true);
    const storage = memoryStorage();
    saveRoleAchievementRecords(both, storage);
    const restored = loadRoleAchievementRecords(before, storage);
    expect(restored.achievementUnlockedByRole).toEqual(both.achievementUnlockedByRole);
    expect(restored.achievementUnlockedAt).toEqual(both.achievementUnlockedAt);
    expect(achievementRecordsChanged(both, restored)).toBe(false);
  });

  it("round trips reward deduplication, collection progress and per-role bonuses", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.unlockedAchievementIds = ["global:deep-sleep"];
    account.achievementUnlockedAt = { "global:deep-sleep": FIRST };
    account.achievementUnlockedByRole = { "global:deep-sleep": { normal: FIRST } };
    account.achievementRewardedIds = ["global:deep-sleep"];
    account.achievementExperienceMultipliers = { normal: 2, rich: 1 };
    account.achievementTalentPoints = { normal: 1, rich: 1 };
    account.achievementCollectionProgress = { buffs: [COLLECTION_REQUIREMENTS.buffs[0]!.id], products: [COLLECTION_REQUIREMENTS.products[0]!.id], conferences: [], locations: [], directions: [] };
    const storage = memoryStorage();
    saveRoleAchievementRecords(account, storage);
    const restored = loadRoleAchievementRecords(createDefaultAccountProfile(), storage);
    expect(restored.achievementRewardedIds).toEqual(account.achievementRewardedIds);
    expect(restored.achievementExperienceMultipliers).toEqual(account.achievementExperienceMultipliers);
    expect(restored.achievementTalentPoints).toEqual(account.achievementTalentPoints);
    expect(restored.achievementCollectionProgress).toEqual(account.achievementCollectionProgress);
  });

  it("filters unknown IDs, ineligible roles, invalid timestamps and malformed collections/bonuses", () => {
    const buff = COLLECTION_REQUIREMENTS.buffs[0]!.id;
    const saved = { version: 2,
      roles: { normal: { unlocked: false, unlockedAchievementIds: ["normal:first-pot", "normal:first-pot", "unknown", 42] },
        rich: { unlocked: true, unlockedAchievementIds: ["normal:first-pot"] },
        imaginary: { unlocked: true, unlockedAchievementIds: ["global:deep-sleep"] } },
      unlockedAt: { "normal:first-pot": FIRST, "unknown": FIRST, "global:deep-sleep": "nonsense" },
      unlockedByRole: { "normal:first-pot": { normal: FIRST, rich: SECOND, imaginary: SECOND },
        "global:deep-sleep": { rich: SECOND, normal: "yesterday", imaginary: FIRST }, "unknown": { normal: FIRST } },
      rewardedIds: ["global:deep-sleep", "global:deep-sleep", "unknown", 2],
      collectionProgress: { buffs: [buff, buff, "unknown", 42], products: "wrong", locations: {} },
      experienceMultipliers: { normal: 2, rich: -1, social: 1.5, genius: "3", imaginary: 9, toString: 10 },
      talentPoints: { normal: 1, rich: 0, social: null },
    };
    const restored = loadRoleAchievementRecords(createDefaultAccountProfile(), memoryStorage(saved));
    expect(restored.roleProgress.normal.unlocked).toBe(true);
    expect(restored.roleProgress.normal.unlockedAchievementIds).toEqual(["normal:first-pot"]);
    expect(restored.roleProgress.rich.unlockedAchievementIds).toEqual(["global:deep-sleep"]);
    expect(restored.achievementUnlockedAt).toEqual({ "normal:first-pot": FIRST });
    expect(restored.achievementUnlockedByRole).toEqual({ "normal:first-pot": { normal: FIRST }, "global:deep-sleep": { rich: SECOND } });
    expect(restored.achievementRewardedIds).toEqual(["global:deep-sleep"]);
    expect(restored.achievementCollectionProgress?.buffs).toEqual([buff]);
    expect(restored.achievementCollectionProgress?.products).toEqual([]);
    expect(restored.achievementExperienceMultipliers).toEqual({ normal: 2 });
    expect(restored.achievementTalentPoints).toEqual({ normal: 1, rich: 0 });
  });

  it("does not accept dates without completion evidence or infer achievements from owning targets", () => {
    const saved = { version: 2, roles: { "genius-reversed": { unlocked: true } },
      unlockedAt: { "unlock:genius-reversed": FIRST, "global:deep-sleep": FIRST }, unlockedByRole: {} };
    const restored = loadRoleAchievementRecords(createDefaultAccountProfile(), memoryStorage(saved));
    expect(restored.roleProgress["genius-reversed"].unlocked).toBe(true);
    expect(restored.achievementUnlockedAt).toEqual({});
    expect(restored.achievementUnlockedByRole).toEqual({});
  });

  it.each([null, [], { version: 2, roles: [] }, { version: 99, roles: {} }, { version: 2 }])("ignores invalid container %j", saved => {
    const account = createDefaultAccountProfile();
    expect(loadRoleAchievementRecords(account, memoryStorage(saved))).toBe(account);
  });

  it("tolerates storage failures without discarding in-memory data", () => {
    const account = createDefaultAccountProfile();
    const storage = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("disabled"); } };
    expect(loadRoleAchievementRecords(account, storage)).toBe(account);
    expect(() => saveRoleAchievementRecords(account, storage)).not.toThrow();
    expect(loadRoleAchievementRecords(account, null)).toBe(account);
  });
});
