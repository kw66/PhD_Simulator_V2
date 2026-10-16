import { DATA_EPOCH, DATA_EPOCH_STARTED_AT } from "../src/core/v2-data-epoch";
import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import {
  ACCOUNT_STORAGE_KEY,
  ACCOUNT_LOBBY_STORAGE_KEY,
  loadAccountProfile,
  loadRoleExperience,
  ROLE_EXPERIENCE_STORAGE_KEY,
  saveAccountProfile,
} from "../src/core/v2-account-storage";
import type { RoleId } from "../src/core/v2-types";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes += 1; values.set(key, value); },
    value: (key: string) => values.get(key),
    writes: () => writes,
  };
}

describe("canonical account storage", () => {
  it("round trips all account records and metadata in one write", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "rich";
    account.dateDisplayMode = "academic";
    account.roleProgress.normal = { ...account.roleProgress.normal, level: 2, exp: 10 };
    const outboxState = { ...createStartedGameState("normal"), phase: "finished" as const };
    const target = storage();
    saveAccountProfile(account, target, { normal: "run-1" }, [{ runId: "run-1", state: outboxState, debugUsed: false }]);
    expect(target.writes()).toBe(1);
    expect(target.value(ACCOUNT_LOBBY_STORAGE_KEY)).toBeUndefined();
    const loaded = loadAccountProfile(target);
    expect(loaded.account.selectedLobbyRoleId).toBe("rich");
    expect(loaded.account.dateDisplayMode).toBe("academic");
    expect(loaded.account.roleProgress.normal).toMatchObject({ level: 2, exp: 10 });
    expect(loaded.settledRuns).toEqual({ normal: "run-1" });
    expect(loaded.finalizedOutbox.map(item => item.runId)).toEqual(["run-1"]);
    const envelope = JSON.parse(target.value(ACCOUNT_STORAGE_KEY)!);
    expect(envelope.version).toBe(1);
    expect(envelope.epoch).toBe(DATA_EPOCH);
    expect(Date.parse(envelope.savedAt)).toBeGreaterThanOrEqual(Date.parse(DATA_EPOCH_STARTED_AT));
    expect(envelope.records[ACCOUNT_LOBBY_STORAGE_KEY]).toBeDefined();
  });

  it("never imports split keys even when they were written by the current serializers", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal = { ...account.roleProgress.normal, level: 1, exp: 3 };
    const source = storage();
    // Build a legacy shaped record through the canonical writer, then expose its records as split keys.
    saveAccountProfile(account, source);
    const envelope = JSON.parse(source.value(ACCOUNT_STORAGE_KEY)!);
    const legacy = storage(envelope.records);
    const loaded = loadAccountProfile(legacy);
    expect(loaded.account).toEqual(createDefaultAccountProfile());
  });

  it.each(["missing epoch", "wrong epoch", "old date", "invalid date"])("invalidates all account data with %s", reason => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    account.roleProgress.rich.unlocked = true;
    account.talentAllocation = { normal: { "first-month-drive": 1 } };
    account.achievementCollectionProgress = { buffs: ["fake"], products: [], conferences: [], locations: [], directions: [] };
    account.achievementTalentPoints = { normal: 5 };
    const target = storage();
    const state = { ...createStartedGameState("normal"), phase: "finished" as const };
    saveAccountProfile(account, target, { normal: "old-settlement" }, [{ runId: "old-outbox", state, debugUsed: false }]);
    const envelope = JSON.parse(target.value(ACCOUNT_STORAGE_KEY)!);
    if (reason === "missing epoch") delete envelope.epoch;
    if (reason === "wrong epoch") envelope.epoch = "former-test-build";
    if (reason === "old date") envelope.savedAt = "2026-10-16T05:25:28.999Z";
    if (reason === "invalid date") envelope.savedAt = "bad-date";
    target.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(envelope));
    const loaded = loadAccountProfile(target);
    expect(loaded).toEqual({ account: createDefaultAccountProfile(), settledRuns: {}, finalizedOutbox: [] });
  });

  it("ignores former canonical and direct storage keys without importing rewards", () => {
    const target = storage({
      phd_simulator_v2_account_v1: JSON.stringify({ version: 1, records: {}, settledRuns: { normal: "old-run" } }),
      phd_simulator_v2_role_experience_v2: JSON.stringify({ version: 1, roles: { normal: { level: 10, exp: 0 } } }),
      phd_simulator_v2_role_achievements_v2: JSON.stringify({ version: 2, roles: { rich: { unlocked: true } } }),
      phd_simulator_v2_role_talents_v2: JSON.stringify({ version: 1, roles: { normal: { "first-month-drive": 6 } } }),
    });
    expect(loadAccountProfile(target)).toEqual({ account: createDefaultAccountProfile(), settledRuns: {}, finalizedOutbox: [] });
  });

  it("rejects former direct experience values stored under the new key", () => {
    const account = createDefaultAccountProfile();
    const target = storage({ [ROLE_EXPERIENCE_STORAGE_KEY]: JSON.stringify({ version: 1, roles: { normal: { level: 10, exp: 0 } } }) });
    expect(loadRoleExperience(account, target)).toBe(account);
  });

  it("does not persist invalid settled roles or unfinished outbox states", () => {
    const target = storage();
    const state = createStartedGameState("normal");
    saveAccountProfile(createDefaultAccountProfile(), target, { nope: "bad", normal: "" } as Partial<Record<RoleId, string>>, [
      { runId: "unfinished", state, debugUsed: false },
    ]);
    const loaded = loadAccountProfile(target);
    expect(loaded.settledRuns).toEqual({});
    expect(loaded.finalizedOutbox).toEqual([]);
  });

  it("propagates a failed canonical write", () => {
    expect(() => saveAccountProfile(createDefaultAccountProfile(), {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
    })).toThrow("quota");
  });

  it("persists UUID settlement markers and never drops unacknowledged outbox runs", () => {
    const target = storage();
    const runId = "dcd549f1-b4c0-47bc-8c6c-dd44d96c2f37";
    const state = { ...createStartedGameState("normal"), phase: "finished" as const };
    const outbox = Array.from({ length: 12 }, (_, i) => ({ runId: `${runId}-${i}`, state, debugUsed: false }));
    saveAccountProfile(createDefaultAccountProfile(), target, { normal: runId }, outbox);
    const loaded = loadAccountProfile(target);
    expect(loaded.settledRuns.normal).toBe(runId);
    expect(loaded.finalizedOutbox.map(item => item.runId)).toEqual(outbox.map(item => item.runId));
  });

  it("opens with defaults when storage reads are unavailable", () => {
    const loaded = loadAccountProfile({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined });
    expect(loaded.account).toEqual(createDefaultAccountProfile());
    expect(loaded.settledRuns).toEqual({});
    expect(loaded.finalizedOutbox).toEqual([]);
  });

  it("does not resurrect stale legacy values when the canonical envelope is damaged", () => {
    const target = storage({
      [ACCOUNT_STORAGE_KEY]: "broken",
      phd_simulator_v2_role_experience_v2: JSON.stringify({ version: 1, roles: { normal: { level: 10, exp: 99 } } }),
    });
    expect(loadAccountProfile(target).account.roleProgress.normal.level).toBe(0);
  });

  it("keeps null storage explicitly usable as an in-memory profile", () => {
    expect(() => saveAccountProfile(createDefaultAccountProfile(), null)).not.toThrow();
    expect(loadAccountProfile(null).account).toEqual(createDefaultAccountProfile());
  });
});
