import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENT_STATS_STORAGE_KEY, createAchievementStats, getAchievementGlobalCompletion } from "../src/app/v2-achievement-stats";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import type { FinalizedRunRecord } from "../src/core/v2-account-storage";
import type { RoleId } from "../src/core/v2-types";

const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const PLAYER = "10000000-0000-4000-8000-000000000001";
const RUN = "20000000-0000-4000-8000-000000000001";
const controllers: ReturnType<typeof createAchievementStats>[] = [];
const snapshot = { version: 1, achievements: [{ id: "global:paper-lover", achievedPlayers: 2, eligiblePlayers: 5 }] };
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
function finalized(roleId: RoleId = "normal", ids: string[] = ["global:paper-lover"], runId = RUN): FinalizedRunRecord {
  return { runId, debugUsed: false, state: { ...createStartedGameState(roleId), phase: "finished", ending: "quit",
    runAchievementIds: ids, achievementProgress: createAchievementRunProgress() } };
}
function create(options: Parameters<typeof createAchievementStats>[0]) {
  const controller = createAchievementStats(options); controllers.push(controller); return controller;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-16T01:00:00Z")); });
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("global achievement statistics", () => {
  it("batch reads once per ten minutes and never performs IO from cards", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(snapshot));
    const change = vi.fn();
    const client = create({ fetch, storage: storage(), onChange: change });
    await Promise.all([client.load(), client.load()]);
    for (let i = 0; i < 100; i++) expect(getAchievementGlobalCompletion("global:paper-lover")).toEqual({ achievedPlayers: 2, eligiblePlayers: 5 });
    await client.load();
    expect(fetch).toHaveBeenCalledTimes(1); expect(change).toHaveBeenCalledTimes(1);
    expect(client.read("missing").data).toBeNull();
    vi.setSystemTime(Date.now() + 10 * 60_000); await client.load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("restores cached counts and retains stale counts during an offline read", async () => {
    const saved = storage();
    const first = create({ storage: saved, fetch: vi.fn(async () => Response.json(snapshot)) });
    await first.load(); first.dispose();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline"); });
    const second = create({ storage: saved, fetch });
    await second.load(); expect(fetch).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 600_001); await second.load(); await second.load();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.read("global:paper-lover").data?.eligiblePlayers).toBe(5);
  });

  it("rejects invalid server counts and retries no faster than one minute", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ version: 1, achievements: [{ id: "global:paper-lover", achievedPlayers: 6, eligiblePlayers: 5 }] }));
    const client = create({ fetch, storage: storage() });
    await client.load(); await client.load();
    expect(fetch).toHaveBeenCalledTimes(1); expect(client.read("global:paper-lover").data).toBeNull();
    vi.setSystemTime(Date.now() + 60_000); await client.load(); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("durably enqueues even zero achievements with the existing visitor identity", async () => {
    const saved = storage(); saved.setItem(VISITOR_KEY, PLAYER);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: saved, fetch });
    const record = finalized("rich", []);
    const rngBefore = JSON.stringify(record.state.randomState);
    expect(client.recordFinalizedRun(record)).toBe(true);
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toEqual([
      { p_player_id: PLAYER, p_run_id: RUN, p_role_id: "rich", p_achievement_ids: [] },
    ]);
    await client.flush();
    expect(JSON.stringify(record.state.randomState)).toBe(rngBefore);
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toEqual([]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ p_player_id: PLAYER, p_run_id: RUN });
  });

  it("sends canonical in-scope actual evidence and newly completed collectors once", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: storage(), fetch });
    const record = finalized("rich", ["global:product-collector", "normal:self-reliance", "garbage"]);
    record.state.achievementProgress!.satisfied = ["global:paper-lover", "global:paper-lover"];
    expect(client.recordFinalizedRun(record)).toBe(true);
    expect(client.recordFinalizedRun(record)).toBe(true);
    await client.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).p_achievement_ids).toEqual(["global:product-collector", "global:paper-lover"]);
  });

  it("keeps one player's identity across different role submissions", async () => {
    const saved = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: saved, fetch });
    client.recordFinalizedRun(finalized());
    client.recordFinalizedRun(finalized("rich", [], "20000000-0000-4000-8000-000000000002"));
    await client.flush();
    const payloads = fetch.mock.calls.map(call => JSON.parse(String(call[1]?.body)));
    expect(payloads[0].p_player_id).toBe(payloads[1].p_player_id);
    expect(payloads.map(row => row.p_role_id)).toEqual(["normal", "rich"]);
    expect(payloads[0].p_player_id).toBe(saved.getItem(VISITOR_KEY));
  });

  it("never enqueues debug, unfinalized, malformed, or upload-disabled runs", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: storage(), fetch });
    expect(client.recordFinalizedRun({ ...finalized(), debugUsed: true })).toBe(false);
    const playing = finalized(); playing.state.phase = "playing";
    expect(client.recordFinalizedRun(playing)).toBe(false);
    expect(client.recordFinalizedRun({ ...finalized(), runId: "bad" })).toBe(false);
    await client.flush(); expect(fetch).not.toHaveBeenCalled();
    const readOnly = create({ storage: storage(), fetch, uploadEnabled: false });
    expect(readOnly.recordFinalizedRun(finalized())).toBe(false);
  });

  it("retains failed uploads across reload and uses the same idempotency and player IDs", async () => {
    const saved = storage(); saved.setItem(VISITOR_KEY, PLAYER);
    const failingFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("lost ack"); });
    const first = create({ storage: saved, fetch: failingFetch });
    first.recordFinalizedRun(finalized()); await first.flush(); await first.flush();
    expect(failingFetch).toHaveBeenCalledTimes(1);
    first.dispose(); saved.setItem(VISITOR_KEY, "30000000-0000-4000-8000-000000000001");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const second = create({ storage: saved, fetch }); await second.flush();
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ p_player_id: PLAYER, p_run_id: RUN });
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toEqual([]);
  });

  it("does not acknowledge finalization if storage is unavailable or server does not confirm", async () => {
    const client = create({ storage: null, fetch: vi.fn() });
    expect(client.recordFinalizedRun(finalized())).toBe(false); expect(client.persistPending()).toBe(false);
    const saved = storage();
    const rejected = create({ storage: saved, fetch: vi.fn(async () => Response.json(false)) });
    rejected.recordFinalizedRun(finalized()); await rejected.flush();
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toHaveLength(1);
  });

  it("accepts zero-player snapshots without inventing a percentage", async () => {
    const client = create({ storage: storage(), fetch: vi.fn(async () => Response.json({ version: 1, achievements: [{ id: "global:paper-lover", achievedPlayers: 0, eligiblePlayers: 0 }] })) });
    await client.load(); expect(client.read("global:paper-lover")).toEqual({ status: "ready", data: { achievedPlayers: 0, eligiblePlayers: 0 } });
  });

  it("preserves another tab's offline outbox when an older page saves its cache or closes", async () => {
    const saved = storage(); saved.setItem(VISITOR_KEY, PLAYER);
    const fetch = vi.fn<typeof globalThis.fetch>(async input => Response.json(String(input).includes("get_") ? snapshot : true));
    const older = create({ storage: saved, fetch });
    const newer = create({ storage: saved, fetch });
    newer.recordFinalizedRun(finalized());
    await older.load(); older.dispose();
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toHaveLength(1);
    const restored = create({ storage: saved, fetch });
    await restored.flush();
    const uploads = fetch.mock.calls.filter(call => String(call[0]).includes("record_"));
    expect(uploads).toHaveLength(1);
    expect(JSON.parse(String(uploads[0][1]?.body)).p_run_id).toBe(RUN);
  });

  it("merges separate finalized runs and never resurrects acknowledged uploads from a stale tab", async () => {
    const saved = storage(); saved.setItem(VISITOR_KEY, PLAYER);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const first = create({ storage: saved, fetch });
    const second = create({ storage: saved, fetch });
    first.recordFinalizedRun(finalized());
    second.recordFinalizedRun(finalized("rich", [], "20000000-0000-4000-8000-000000000002"));
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toHaveLength(2);
    await first.flush();
    second.persistPending();
    await second.flush();
    expect(second.recordFinalizedRun(finalized())).toBe(true);
    await second.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(saved.getItem(ACHIEVEMENT_STATS_STORAGE_KEY)!).pending).toEqual([]);
    const restored = create({ storage: saved, fetch });
    expect(restored.recordFinalizedRun(finalized())).toBe(true);
    await restored.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
