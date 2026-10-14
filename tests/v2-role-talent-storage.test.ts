import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getTalentPointBalance, getTalentUpgradeReason, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import { loadRoleTalentAllocation, ROLE_TALENT_STORAGE_KEY, saveRoleTalentAllocation } from "../src/core/v2-role-talent-storage";
import { createStore } from "../src/core/v2-store";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("role talent allocation", () => {
  it("uses the actual role level and unlocks a successor with one prerequisite level", () => {
    expect(getTalentPointBalance("normal", 0, {})).toBe(0);
    expect(getTalentPointBalance("normal", 2, { "first-month-drive": 1 })).toBe(3);
    expect(getTalentUpgradeReason("normal", 2, {}, "diligence")).not.toBeNull();
    expect(getTalentUpgradeReason("normal", 2, { "first-month-drive": 1 }, "diligence")).toBeNull();
    expect(getTalentUpgradeReason("normal", 1, { "first-month-drive": 2 }, "diligence")).toBe("天赋点不足");
    expect(getTalentUpgradeReason("normal", 10, { "first-month-drive": 3 }, "first-month-drive")).toBe("已满级");
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
    })).toEqual({ "first-month-drive": 2 });
    expect(sanitizeRoleTalentAllocation("normal", 10, { "first-month-drive": 0.5, diligence: 2, breakthrough: 1 })).toEqual({});
    expect(sanitizeRoleTalentAllocation("normal", 0, { "first-month-drive": 1 })).toEqual({});
    expect(sanitizeRoleTalentAllocation("normal", 10, null)).toEqual({});
  });

  it("persists separate role allocations and survives malformed or blocked storage", () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 2;
    account.roleProgress.rich.level = 2;
    account.talentAllocation = { normal: { "first-month-drive": 2 }, rich: { heiress: 3 } };
    saveRoleTalentAllocation(account, storage);
    const loaded = loadRoleTalentAllocation(account, storage);
    expect(loaded.talentAllocation).toEqual(account.talentAllocation);
    loaded.talentAllocation!.normal!["first-month-drive"] = 1;
    expect(account.talentAllocation.normal!["first-month-drive"]).toBe(2);
    storage.setItem(ROLE_TALENT_STORAGE_KEY, "broken");
    expect(loadRoleTalentAllocation(account, storage).talentAllocation).toEqual({});
    expect(() => saveRoleTalentAllocation(account, { getItem: () => null, setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("loads allocation after experience, persists setup edits and locks edits during a run", () => {
    const storage = memoryStorage();
    storage.setItem("phd_simulator_v2_role_experience_v1", JSON.stringify({ version: 1, roles: { normal: { level: 3, exp: 0 } } }));
    const store = createStore({ storage });
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "diligence")).toBe(true);
    expect(store.upgradeRoleTalent("normal", "first-month-drive")).toBe(true);
    const refreshed = createStore({ storage });
    expect(refreshed.getLobbyState().talentAllocation?.normal).toEqual({ "first-month-drive": 2, diligence: 1 });
    refreshed.dispatch("start-game", { talentAllocation: { "first-month-drive": 99, diligence: 99 } });
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 2, diligence: 1 });
    expect(refreshed.upgradeRoleTalent("normal", "diligence")).toBe(false);
    expect(refreshed.resetRoleTalents("normal")).toBe(false);
    expect(refreshed.getState().roleTalents?.levels).not.toBe(refreshed.getLobbyState().talentAllocation?.normal);
    refreshed.dispatch("restart-game");
    expect(refreshed.getState().roleTalents?.levels).toEqual({ "first-month-drive": 2, diligence: 1 });
    refreshed.dispatch("reset-game");
    expect(refreshed.resetRoleTalents("normal")).toBe(true);
    expect(createStore({ storage }).getLobbyState().talentAllocation?.normal).toBeUndefined();
  });
});
