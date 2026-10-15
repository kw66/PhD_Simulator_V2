import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import {
  createMemoryRunSaveAdapter,
  createRunSaveRepository,
  MAX_RUN_MONTH_SAVES,
  RUN_SAVE_JOURNAL_PREFIX,
  validateRunSaveRecord,
} from "../src/core/v2-run-saves";
import type { RoleId } from "../src/core/v2-types";

function state(month: number, role: RoleId = "normal") {
  const value = createStartedGameState(role);
  value.totalMonths = month;
  value.year = Math.floor(month / 12) + 1;
  value.month = month % 12;
  return value;
}
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("per-role run save repository", () => {
  it("keeps latest and immutable month snapshots separately per role", async () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter(), now: () => "2026-10-16T00:00:00.000Z", createRunId: () => "run-a" });
    await repository.ready();
    repository.commit(state(0), { monthStart: true });
    repository.commit(state(1), { monthStart: true });
    repository.commit(state(1));
    const record = repository.get("normal")!;
    expect(record.latest.totalMonths).toBe(1);
    expect(record.months.map(item => item.totalMonths)).toEqual([0, 1]);
    expect(record.months.find(item => item.totalMonths === 1)!.state.totalMonths).toBe(1);
    expect(validateRunSaveRecord(record)).toBe(true);
    expect(repository.list("normal").map(item => item.kind)).toEqual(["latest", "month", "month"]);
    expect(repository.get("rich")).toBeUndefined();
  });

  it("rewinding truncates future months and keeps the same random-bearing state", () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter(), createRunId: () => "run-a" });
    repository.commit(state(0), { monthStart: true });
    repository.commit(state(1), { monthStart: true });
    repository.commit(state(2), { monthStart: true });
    const restored = repository.rewind("normal", "month:1")!;
    expect(restored.latest.totalMonths).toBe(1);
    expect(restored.latest.state.randomState).toEqual(restored.months.find(item => item.totalMonths === 1)!.state.randomState);
    expect(restored.months.map(item => item.totalMonths)).toEqual([0, 1]);
  });

  it("retains a debug flag for the whole run and enforces the 70-month limit", () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter(), createRunId: () => "run-a" });
    repository.commit(state(0), { monthStart: true, debugUsed: true });
    for (let month = 1; month <= MAX_RUN_MONTH_SAVES + 10; month += 1) repository.commit(state(month), { monthStart: true });
    const record = repository.get("normal")!;
    expect(record.debugUsed).toBe(true);
    expect(record.months).toHaveLength(MAX_RUN_MONTH_SAVES);
    expect(record.months[0]?.totalMonths).toBe(11);
  });

  it("clear removes only the selected role's record", () => {
    const repository = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter(), createRunId: () => "run-a" });
    repository.commit(state(1));
    repository.commit(state(1, "rich"));
    repository.clear("normal");
    expect(repository.get("normal")).toBeUndefined();
    expect(repository.get("rich")).toBeDefined();
  });

  it("persists records through the adapter and restores them in a new repository", async () => {
    const adapter = createMemoryRunSaveAdapter();
    const first = createRunSaveRepository({ storage: null, adapter, createRunId: () => "run-persist" });
    first.commit(state(4), { monthStart: true });
    await first.flush();
    const second = createRunSaveRepository({ storage: null, adapter });
    await second.ready();
    expect(second.get("normal")?.latest.state.totalMonths).toBe(4);
    expect(second.get("normal")?.runId).toBe("run-persist");
  });

  it("recovers the immediate-close journal, pending months and rewind cutoff", async () => {
    const disk = createMemoryRunSaveAdapter();
    const journal = storage();
    let blocked = false;
    const adapter = { load: () => disk.load(), write: async (...args: Parameters<typeof disk.write>) => {
      if (blocked) throw new Error("interrupted disk");
      await disk.write(...args);
    } };
    const first = createRunSaveRepository({ storage: journal, adapter, createRunId: () => "run-a" });
    await first.ready();
    first.commit(state(0), { monthStart: true });
    first.commit(state(1), { monthStart: true });
    first.commit(state(2), { monthStart: true });
    await first.flush();
    blocked = true;
    first.rewind("normal", "month:1");
    first.commit({ ...state(1), playerName: "回溯后" });
    await first.flush();
    blocked = false;
    const recovered = createRunSaveRepository({ storage: journal, adapter });
    await recovered.ready();
    await recovered.flush();
    expect(recovered.get("normal")?.latest.state.playerName).toBe("回溯后");
    expect(recovered.get("normal")?.months.map(month => month.totalMonths)).toEqual([0, 1]);
    expect(journal.getItem(`${RUN_SAVE_JOURNAL_PREFIX}normal`)).toBe("null");
  });

  it("preserves unsaved new months and clear tombstones until durable acknowledgement", async () => {
    const disk = createMemoryRunSaveAdapter();
    const journal = storage();
    const failed = { load: () => disk.load(), write: async () => { throw new Error("offline"); } };
    const first = createRunSaveRepository({ storage: journal, adapter: failed, createRunId: () => "run-a" });
    first.commit(state(0), { monthStart: true });
    first.commit(state(1), { monthStart: true });
    await first.flush();
    const recovered = createRunSaveRepository({ storage: journal, adapter: disk });
    await recovered.ready();
    await recovered.flush();
    expect(recovered.get("normal")?.months.map(month => month.totalMonths)).toEqual([0, 1]);
    const clearing = createRunSaveRepository({ storage: journal, adapter: failed });
    await clearing.ready();
    clearing.clear("normal");
    await clearing.flush();
    const final = createRunSaveRepository({ storage: journal, adapter: disk });
    await final.ready();
    await final.flush();
    expect(final.get("normal")).toBeUndefined();
    expect(await disk.load()).toEqual([]);
  });

  it("retries a failed write once on flush and reports quota failure without dropping the in-memory save", async () => {
    let attempts = 0;
    const errors: string[] = [];
    const repository = createRunSaveRepository({ storage: null,
      adapter: { load: async () => [], write: async () => { attempts += 1; throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); } },
      onError: error => errors.push(error.kind) });
    repository.commit(state(2), { monthStart: true });
    await repository.flush();
    expect(attempts).toBe(2);
    expect(errors).toEqual(["quota", "quota"]);
    expect(repository.get("normal")?.latest.totalMonths).toBe(2);
  });

  it("rejects damaged RNG snapshots and does not let external mutations corrupt monthly checkpoints", async () => {
    const adapter = createMemoryRunSaveAdapter();
    const repository = createRunSaveRepository({ storage: null, adapter });
    const saved = repository.commit(state(1), { monthStart: true });
    expect(() => { saved.months[0]!.state.player.money = 999; }).toThrow();
    saved.latest.state.player.money = 999;
    expect(repository.get("normal")?.latest.state.player.money).not.toBe(999);
    const damaged = structuredClone(saved);
    damaged.latest.state.randomState = { seed: -1, cursor: 0 };
    expect(validateRunSaveRecord(damaged)).toBe(false);
    const errors: string[] = [];
    const load = createRunSaveRepository({ storage: null,
      adapter: { load: async () => [damaged], write: async () => {} }, onError: error => errors.push(error.kind) });
    await load.ready();
    expect(load.get("normal")).toBeUndefined();
    expect(errors).toEqual(["corrupt"]);
  });
});
