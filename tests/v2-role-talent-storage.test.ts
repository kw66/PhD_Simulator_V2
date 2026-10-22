import { saveAccountProfile } from "../src/core/v2-account-storage";
import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getTalentPointBalance, getTalentUpgradeReason, isRoleTalentImplemented, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { loadRoleTalentAllocation, ROLE_TALENT_STORAGE_KEY, saveRoleTalentAllocation } from "../src/core/v2-role-talent-storage";
import { createStore } from "../src/core/v2-store";
import { getRoleOptions } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("role talent allocation", () => {
  it("unlocks gold power through either salary or investment, preserving old recording prerequisites", () => {
    expect(getTalentUpgradeReason("rich", 10, {}, "gold-power-alpha")).not.toBeNull();
    const allocations: Record<string, number>[] = [
      { heiress: 1, "knowledge-is-wealth": 1, "work-pays-off": 1 },
      { "red-envelope": 1, "wealth-growth": 1, "investment-savvy": 1 },
    ];
    for (const allocation of allocations) {
      expect(getTalentUpgradeReason("rich", 10, allocation, "gold-power-alpha")).toBeNull();
      const learned = { ...allocation, "gold-power-alpha": 1 };
      expect(sanitizeRoleTalentAllocation("rich", 10, learned)).toEqual(learned);
    }
    expect(withGameplayRuleset("20261022-r25", () => getTalentUpgradeReason("rich", 10,
      { "red-envelope": 1, "wealth-growth": 1, "investment-savvy": 1 }, "gold-power-alpha"))).not.toBeNull();
  });
  it("supports the rich funding and paper reward ranks and prices while preserving old replay budgets", () => {
    const allocation = { heiress: 1, "bring-funding": 5, "knowledge-is-wealth": 5 };
    expect(sanitizeRoleTalentAllocation("rich", 10, allocation)).toEqual(allocation);
    expect(getTalentPointBalance("rich", 10, allocation)).toBe(9);
    expect(getTalentUpgradeReason("rich", 10, allocation, "bring-funding")).toBe("已满级");
    expect(getTalentUpgradeReason("rich", 10, allocation, "knowledge-is-wealth")).toBe("已满级");
    expect(sanitizeRoleTalentAllocation("rich", 10, { ...allocation, "knowledge-is-wealth": 6 })).toEqual(allocation);
    withGameplayRuleset("20261022-r24", () => {
      const old = { ...allocation, "knowledge-is-wealth": 6 };
      expect(sanitizeRoleTalentAllocation("rich", 10, old)).toEqual(old);
      expect(getTalentPointBalance("rich", 10, old)).toBe(8);
    });
    withGameplayRuleset("20261022-r23", () => {
      const old = sanitizeRoleTalentAllocation("rich", 10, allocation);
      expect(old).toEqual({ heiress: 1, "bring-funding": 4, "knowledge-is-wealth": 5 });
      expect(getTalentPointBalance("rich", 10, old)).toBe(5);
    });
  });
  it("makes funding a root and gives cooperative papers an independent five-rank reward talent", () => {
    expect(getTalentUpgradeReason("rich", 10, {}, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("rich", 10, {}, "knowledge-is-wealth-beta")).not.toBeNull();
    expect(getTalentUpgradeReason("rich", 10, { "bring-funding": 1 }, "knowledge-is-wealth-beta")).toBeNull();
    expect(sanitizeRoleTalentAllocation("rich", 10, { "bring-funding": 1, "knowledge-is-wealth-beta": 6 }))
      .toEqual({ "bring-funding": 1, "knowledge-is-wealth-beta": 5 });
    expect(getTalentPointBalance("rich", 10, { "bring-funding": 1, "knowledge-is-wealth-beta": 5 })).toBe(14);
    expect(withGameplayRuleset("20261022-r24", () => getTalentUpgradeReason("rich", 10, {}, "bring-funding"))).not.toBeNull();
    expect(withGameplayRuleset("20261022-r24", () => sanitizeRoleTalentAllocation("rich", 10,
      { "bring-funding": 1, "knowledge-is-wealth-beta": 5 }))).toEqual({});
  });
  it("keeps r21 allocation prices and limits for old recordings while rebuilding the current tree", () => {
    const legacy = { "first-month-drive": 3, "self-determination": 12, diligence: 1, "burning-life-alpha": 1, burnout: 1 };
    const old = withGameplayRuleset("20261022-r21", () => sanitizeRoleTalentAllocation("normal", 10, legacy, 4));
    expect(old).toEqual(legacy);
    const current = sanitizeRoleTalentAllocation("normal", 10, legacy, 4);
    expect(current).toEqual({ ...legacy, "first-month-drive": 1, "self-determination": 10 });
    expect(getTalentPointBalance("normal", 10, current, 4)).toBe(7);
    expect(withGameplayRuleset("20261022-r21", () => getTalentPointBalance("normal", 10, old, 4))).toBe(2);
    expect(getTalentUpgradeReason("normal", 10, current, "burnout", 4)).toBeNull();
    expect(getTalentUpgradeReason("normal", 10, { ...current, burnout: 2 }, "burnout", 4)).toBe("已满级");
  });
  it("supports revised levels, prices and the separate fourth-tier resistance paths", () => {
    const normal = { "first-month-drive": 1, "self-determination": 10, breakthrough: 1 };
    expect(sanitizeRoleTalentAllocation("normal", 10, normal)).toEqual(normal);
    expect(getTalentPointBalance("normal", 10, normal)).toBe(6);
    expect(getTalentUpgradeReason("normal", 10, { ...normal, "self-determination": 9 }, "self-determination")).toBeNull();
    expect(getTalentUpgradeReason("normal", 10, normal, "self-determination")).toBe("已满级");
    const genius = { "innate-insight": 1, "thirst-for-knowledge": 1, "boundless-study": 1 };
    expect(getTalentUpgradeReason("genius", 10, genius, "academic-confidence")).toBeNull();
    expect(getTalentUpgradeReason("genius", 10, genius, "rise-together")).not.toBeNull();
    expect(getTalentUpgradeReason("genius", 10, { "proven-by-papers": 1 }, "rise-together")).toBeNull();
    const mentor = { "near-the-source": 1, "family-patronage": 1, "mentor-insight": 1, "mentor-expectations": 3 };
    expect(sanitizeRoleTalentAllocation("teacher-child", 10, mentor)).toEqual(mentor);
    const social = { "supporting-juniors": 1, "peer-camaraderie": 1, "senior-mentorship": 1, "overflow-social": 2 };
    expect(sanitizeRoleTalentAllocation("social", 10, social)).toEqual(social);
  });

  it("grants ten initial points plus one per level and unlocks a successor with one prerequisite level", () => {
    for (const { id } of getRoleOptions().filter(role => isRoleTalentImplemented(role.id))) {
      expect(getTalentPointBalance(id, 0, {})).toBe(10);
      expect(getTalentPointBalance(id, 1, {})).toBe(11);
      expect(getTalentPointBalance(id, 10, {}, 3)).toBe(23);
    }
    expect(getTalentPointBalance("normal", 2, { "first-month-drive": 1 })).toBe(10);
    expect(getTalentUpgradeReason("normal", 2, {}, "diligence")).not.toBeNull();
    expect(getTalentUpgradeReason("normal", 2, { "first-month-drive": 1 }, "diligence")).toBeNull();
    expect(getTalentUpgradeReason("normal", 1, { "first-month-drive": 1, "self-determination": 9 }, "diligence")).toBe("天赋点不足");
    expect(getTalentUpgradeReason("normal", 10, { "first-month-drive": 1 }, "first-month-drive")).toBe("已满级");
  });

  it("accepts either adjacent prerequisite and only previews unfinished roles", () => {
    expect(getTalentUpgradeReason("rich", 5, { heiress: 1 }, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("rich", 5, { "red-envelope": 1 }, "bring-funding")).toBeNull();
    expect(getTalentUpgradeReason("social", 10, {}, "natural-charisma")).toBeNull();
    expect(sanitizeRoleTalentAllocation("social", 10, { "natural-charisma": 5 })).toEqual({ "natural-charisma": 5 });
    expect(getTalentUpgradeReason("cursed-frail", 10, {}, "illness-surface")).toBe("该角色天赋暂未开放");
    expect(sanitizeRoleTalentAllocation("cursed-frail", 10, { "illness-surface": 1 })).toEqual({});
  });

  it("rejects foreign nodes, fractional levels, orphan successors and over-budget allocations", () => {
    expect(sanitizeRoleTalentAllocation("normal", 1, {
      "first-month-drive": 999, diligence: 10, heiress: 1, "burning-life-alpha": 1,
    })).toEqual({ "first-month-drive": 1, diligence: 9 });
    expect(sanitizeRoleTalentAllocation("normal", 10, { "first-month-drive": 0.5, diligence: 2, breakthrough: 1 })).toEqual({});
    expect(sanitizeRoleTalentAllocation("normal", 0, { "first-month-drive": 1 })).toEqual({ "first-month-drive": 1 });
    expect(sanitizeRoleTalentAllocation("normal", 10, null)).toEqual({});
  });

  it("persists separate role allocations and survives malformed or blocked storage", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 2;
    account.roleProgress.rich.level = 2;
    account.talentAllocation = { normal: { "first-month-drive": 1 }, rich: { heiress: 3 } };
    saveRoleTalentAllocation(account, storage);
    const loaded = loadRoleTalentAllocation(account, storage);
    expect(loaded.talentAllocation).toEqual(account.talentAllocation);
    loaded.talentAllocation!.normal!["first-month-drive"] = 0;
    expect(account.talentAllocation.normal!["first-month-drive"]).toBe(1);
    storage.setItem(ROLE_TALENT_STORAGE_KEY, "broken");
    expect(loadRoleTalentAllocation(account, storage).talentAllocation).toEqual({});
    expect(() => saveRoleTalentAllocation(account, { getItem: () => null, setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("keeps existing allocations while recalculating the larger low-level budget", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 3;
    account.achievementTalentPoints = { normal: 2 };
    account.talentAllocation = { normal: { "first-month-drive": 1, "self-determination": 5 } };
    saveRoleTalentAllocation(account, storage);
    const loaded = loadRoleTalentAllocation(account, storage);
    expect(loaded.talentAllocation).toEqual(account.talentAllocation);
    expect(getTalentPointBalance("normal", 3, loaded.talentAllocation!.normal!, loaded.achievementTalentPoints!.normal)).toBe(8);
  });

  it("lets a fresh player spend the starting budget but keeps locked roles uneditable", () => {
    const store = createStore({ storage: null });
    expect(store.getLobbyState().roleProgress.normal.level).toBe(0);
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    for (let point = 0; point < 8; point += 1) expect(store.upgradeRoleTalent("normal", "self-determination")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "self-determination")).toBe(false);
    expect(store.upgradeRoleTalent("rich", "heiress")).toBe(false);
    expect(store.getLobbyState().talentAllocation?.rich).toBeUndefined();
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, "self-determination": 8 });
    store.dispatch("quit-game");
    expect(store.isCurrentRunDisqualified()).toBe(false);
  });

  it("rejects prior-epoch talent allocations even when stored under the current key", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    storage.setItem(ROLE_TALENT_STORAGE_KEY, JSON.stringify({ version: 1, roles: { normal: { "first-month-drive": 6 } } }));
    expect(loadRoleTalentAllocation(account, storage).talentAllocation).toEqual({});
  });

  it("loads allocation after experience, persists setup edits and locks edits during a run", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 3;
    saveAccountProfile(account, storage);
    const store = createStore({ storage });
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "diligence")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "diligence")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(false);
    const refreshed = createStore({ storage });
    expect(refreshed.getLobbyState().talentAllocation?.normal).toEqual({ "first-month-drive": 1, diligence: 2 });
    refreshed.dispatch("start-game", { talentAllocation: { "first-month-drive": 99, diligence: 99 } });
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, diligence: 2 });
    expect(refreshed.upgradeRoleTalent("normal", "diligence")).toBe(false);
    expect(refreshed.resetRoleTalents("normal")).toBe(false);
    expect(refreshed.getState().roleTalents?.levels).not.toBe(refreshed.getLobbyState().talentAllocation?.normal);
    refreshed.dispatch("settle-and-return");
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 1, diligence: 2 });
    refreshed.dispatch("reset-game");
    expect(refreshed.resetRoleTalents("normal")).toBe(true);
    expect(createStore({ storage }).getLobbyState().talentAllocation?.normal).toBeUndefined();
  });
});
