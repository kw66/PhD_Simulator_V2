import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import {
  ACCOUNT_STORAGE_KEY,
  ACCOUNT_LOBBY_STORAGE_KEY,
  loadAccountProfile,
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
    expect(envelope.records[ACCOUNT_LOBBY_STORAGE_KEY]).toBeDefined();
  });

  it("falls back to old split keys until the first canonical save", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal = { ...account.roleProgress.normal, level: 1, exp: 3 };
    const source = storage();
    // Build a legacy shaped record through the canonical writer, then expose its records as split keys.
    saveAccountProfile(account, source);
    const envelope = JSON.parse(source.value(ACCOUNT_STORAGE_KEY)!);
    const legacy = storage(envelope.records);
    const loaded = loadAccountProfile(legacy);
    expect(loaded.account.roleProgress.normal).toMatchObject({ level: 1, exp: 3 });
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
