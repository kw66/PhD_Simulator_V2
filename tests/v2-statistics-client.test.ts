import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatisticsClient, STATISTICS_MAX_BATCH_BYTES } from "../src/app/v2-statistics-client";

type Client = ReturnType<typeof createStatisticsClient>;
type Kind = "conference" | "journal" | "thesis";
type Row = { kind: Kind; payload: Record<string, unknown> & { p_id: string } };
const clients: Client[] = [];
const READ_RPC = "get_phd_simulator_v2_journal_stats";
const KEY = { p_rule_version: "v2-journal-20261012", p_journal: "pami" };
const SUMMARY = { acceptedCount: 12, meanScore: 146.5, meanMonths: 2.3 };
const CONFERENCE_SUMMARY = { submissions: 2, accepted: 1,
  counts: { Poster: 1, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
  means: { Reject: 60, Poster: 120, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null } };
const THESIS_SUMMARY = { submittedCount: 30, passedCount: 18, excellentCount: 3, notSubmittedCount: 4 };
const CONFERENCE_KEY = { p_rule_version: "v2-review-20261009", p_conference_name: "CVPR", p_conference_year: 2026, p_target: "A" };
const THESIS_KEY = { p_rule_version: "v2-thesis-20261013", p_degree: "master" };
const SNAPSHOT_RPC = "get_phd_simulator_v2_stats_snapshot";
const PAYLOADS = {
  conference: { p_rule_version: "v2-review-20261009", p_conference_name: "CVPR", p_conference_year: 2026,
    p_target: "A", p_accepted: true, p_accept_type: "Poster", p_score: 120 },
  journal: { ...KEY, p_score: 125, p_months: 2 },
  thesis: { p_rule_version: "v2-thesis-20261013", p_degree: "master", p_submitted: true,
    p_passed: true, p_excellent: false },
};

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
}

function parse(value: unknown): typeof SUMMARY {
  if (!value || typeof value !== "object" || !("acceptedCount" in value)
    || typeof value.acceptedCount !== "number") throw new Error("Invalid aggregate");
  const data = value as typeof SUMMARY;
  return { acceptedCount: data.acceptedCount, meanScore: data.meanScore, meanMonths: data.meanMonths };
}

function parseConference(value: unknown): typeof CONFERENCE_SUMMARY {
  if (!value || typeof value !== "object" || !("submissions" in value)) throw new Error("Invalid conference aggregate");
  return value as typeof CONFERENCE_SUMMARY;
}

function parseThesis(value: unknown): typeof THESIS_SUMMARY {
  if (!value || typeof value !== "object" || !("submittedCount" in value)) throw new Error("Invalid thesis aggregate");
  return value as typeof THESIS_SUMMARY;
}

function runSnapshot(acceptedCount = 12) {
  return { version: 1, epoch: DATA_EPOCH,
    conference: [{ name: "CVPR", year: 2026, target: "A", stats: CONFERENCE_SUMMARY }],
    journals: { pami: { ...SUMMARY, acceptedCount }, nmi: { acceptedCount: 0, meanScore: null, meanMonths: null },
      nature: { acceptedCount: 0, meanScore: null, meanMonths: null } },
    theses: { master: THESIS_SUMMARY, phd: { submittedCount: 0, passedCount: 0, excellentCount: 0, notSubmittedCount: 0 } },
  };
}

function backend() {
  const rows = new Map<string, Row>();
  const batches: Row[][] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
      const body = JSON.parse(String(init?.body)) as { p_records: Row[] };
      batches.push(body.p_records);
      for (const row of body.p_records) rows.set(row.payload.p_id, row);
      return Response.json(body.p_records.map((row) => row.payload.p_id));
    }
    return Response.json({ ...SUMMARY, epoch: DATA_EPOCH });
  });
  return { rows, batches, fetch };
}

function client(options: Parameters<typeof createStatisticsClient>[0]) {
  const result = createStatisticsClient(options);
  clients.push(result);
  return result;
}

function queue(target: Client, kind: Kind = "journal", fingerprint: string = kind, run = "run-1") {
  return target.enqueue(kind, run, fingerprint, PAYLOADS[kind]);
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T00:00:00Z")); });
afterEach(() => {
  for (const target of clients.splice(0)) target.dispose();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("shared statistics queue", () => {
  it("preserves each role's run snapshot across reloads and newer runs of other roles", async () => {
    const local = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(runSnapshot(12)));
    const original = client({ storage: local, fetch });
    await original.startRun('[123,"normal"]');
    expect(original.read(READ_RPC, KEY, parse).data?.acceptedCount).toBe(12);
    original.dispose();
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    fetch.mockImplementation(async () => Response.json(runSnapshot(99)));
    const resumed = client({ storage: local, fetch });
    await resumed.startRun('[123,"normal"]');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(resumed.read(READ_RPC, KEY, parse).data?.acceptedCount).toBe(12);
    for (let run = 1; run <= 45; run++) await resumed.startRun(JSON.stringify([run, "rich"]));
    resumed.dispose();
    const restored = client({ storage: local, fetch });
    await restored.startRun('[123,"normal"]');
    expect(restored.read(READ_RPC, KEY, parse).data?.acceptedCount).toBe(12);
    const snapshotData = JSON.parse(local.values.get("phd_simulator_v2_statistics_v2")!);
    expect(snapshotData.runSnapshots).toHaveLength(2);
    expect(snapshotData.runSnapshots.map((entry: [string, unknown]) => entry[0])).toContain('[45,"rich"]');
  });

  it("keeps the finalization outbox pending until its upload queue is durable", () => {
    const failing = client({ uploadEnabled: true, storage: { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } } });
    expect(queue(failing)).toBe(true);
    expect(failing.persistPending()).toBe(false);
    expect(client({ uploadEnabled: true, storage: null }).persistPending()).toBe(false);
    const local = storage();
    const healthy = client({ uploadEnabled: true, storage: local });
    queue(healthy);
    expect(healthy.persistPending()).toBe(true);
    expect(JSON.parse(local.values.get("phd_simulator_v2_statistics_v2")!).results).toHaveLength(1);
    expect(client({ uploadEnabled: false, storage: null }).persistPending()).toBe(true);
  });

  it("batches activity with paper results, preserving start counts while excluding debug endings", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    const run = '[123,"normal"]';
    const base = { p_day: "2026-11-17", p_run_key: run, p_role_id: "normal" };
    expect(stats.enqueue("activity", `activity-start:${run}`, "start", { ...base, p_event: "start" })).toBe(true);
    expect(stats.enqueue("activity", run, "finish", { ...base, p_event: "finish", p_ending: "phd" })).toBe(true);
    expect(queue(stats, "journal", "paper", run)).toBe(true);
    stats.markDebug(run);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    await restored.flush();
    expect(network.batches[0]).toHaveLength(1);
    expect(network.batches[0]![0]!.payload).toMatchObject({ p_event: "start", p_run_key: run });
    expect(restored.enqueue("activity", `activity-start:${run}`, "start", { ...base, p_event: "start" })).toBe(false);
  });

  it("reads lobby activity without disturbing the frozen paper snapshot", async () => {
    const activity = { games: 3, epoch: DATA_EPOCH };
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => Response.json(String(url).endsWith(SNAPSHOT_RPC) ? runSnapshot() : activity));
    const stats = client({ fetch, storage: storage() });
    await stats.startRun("run-1");
    const parseActivity = (value: unknown) => value as typeof activity;
    await stats.load("get_phd_simulator_v2_activity_stats", { p_day: "2026-10-13" }, parseActivity);
    expect(stats.read("get_phd_simulator_v2_activity_stats", { p_day: "2026-10-13" }, parseActivity).data).toEqual(activity);
    expect(stats.read(READ_RPC, KEY, parse).data).toEqual(SUMMARY);
    expect(fetch).toHaveBeenCalledTimes(2);
    await stats.load("get_phd_simulator_v2_activity_stats", { p_day: "2026-10-13" }, parseActivity);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes the obsolete zero-start activity cache while retaining the paper cache", async () => {
    const local = storage();
    const name = "get_phd_simulator_v2_activity_stats";
    const key = { p_day: "2026-10-13" };
    local.values.set("phd_simulator_v2_statistics_v2", JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: new Date().toISOString(), cache: [
      [JSON.stringify([name, key]), { data: { games: 0 }, fetchedAt: Date.now(), retryAt: 0 }],
      [JSON.stringify([SNAPSHOT_RPC, {}]), { data: runSnapshot(), fetchedAt: Date.now(), retryAt: 0 }],
    ] }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ games: 118, epoch: DATA_EPOCH }));
    const stats = client({ fetch, storage: local, uploadEnabled: false });
    const parseActivity = (value: unknown) => value as { games: number };
    expect(stats.read(name, key, parseActivity).data).toBeNull();
    await stats.load(name, key, parseActivity);
    await stats.startRun("run-1");
    await stats.load(name, key, parseActivity);
    expect(stats.read(name, key, parseActivity).data?.games).toBe(118);
    expect(stats.read(READ_RPC, KEY, parse).data).toEqual(SUMMARY);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed restored activity so it cannot poison unrelated pending results", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    const base = { p_event: "start", p_day: "2026-10-13", p_run_key: '[123,"normal"]', p_role_id: "normal" };
    expect(stats.enqueue("activity", "activity-start", "bad-day", { ...base, p_day: "2026-02-31" })).toBe(false);
    expect(stats.enqueue("activity", "activity-start", "bad-role", { ...base, p_role_id: "unknown" })).toBe(false);
    expect(stats.enqueue("activity", "activity-start", "bad-ending", { ...base, p_event: "finish", p_ending: "unknown" })).toBe(false);
    expect(queue(stats)).toBe(true);
    await stats.flush();
    expect(network.rows.size).toBe(1);
  });

  it.each([0, 1, 34, 70])("preserves actual settled month %s through reload and deduplicated retries", async (months) => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    const run = JSON.stringify([123, "normal"]);
    const finalId = crypto.randomUUID();
    const payload = { p_event: "finish", p_day: "2026-11-17", p_run_key: run, p_role_id: "normal",
      p_ending: "quit", p_total_months: months, p_degree: months > 34 ? "phd" : "master" };
    expect(stats.enqueue("activity", run, "finish", payload, finalId)).toBe(true);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    await restored.flush();
    expect([...network.rows.values()][0]!.payload).toMatchObject({ ...payload, p_finalized_run_id: finalId });
    expect(restored.enqueue("activity", run, "finish", payload, finalId)).toBe(false);
    expect(network.rows.size).toBe(1);
  });

  it.each([
    { p_total_months: -1 }, { p_total_months: 71 }, { p_total_months: 1.5 },
    { p_total_months: "7" }, { p_total_months: null }, { p_degree: undefined },
    { p_degree: "unknown" }, { p_total_months: undefined },
    { p_event: "start", p_ending: undefined }, { p_ending: "phd", p_degree: "master" },
  ])("rejects invalid settlement metadata without blocking other results: %j", async (override) => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    const run = JSON.stringify([123, "normal"]);
    expect(stats.enqueue("activity", run, "finish", { p_event: "finish", p_day: "2026-11-17",
      p_run_key: run, p_role_id: "normal", p_ending: "quit", p_total_months: 7, p_degree: "master", ...override }, crypto.randomUUID())).toBe(false);
    expect(queue(stats)).toBe(true);
    await stats.flush();
    expect(network.rows.size).toBe(1);
  });

  it("keeps historical finish months unknown instead of inventing zero", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    const run = JSON.stringify([123, "normal"]);
    expect(stats.enqueue("activity", run, "finish", { p_event: "finish", p_day: "2026-11-17",
      p_run_key: run, p_role_id: "normal", p_ending: "quit" })).toBe(true);
    await stats.flush();
    expect([...network.rows.values()][0]!.payload).not.toHaveProperty("p_total_months");
  });

  it("persists confirmations immediately and combines three statistic kinds into one delayed request", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    for (const kind of ["conference", "journal", "thesis"] as const) expect(queue(stats, kind)).toBe(true);
    expect(local.setItem).toHaveBeenCalled();
    expect(network.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(499);
    expect(network.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(network.batches[0]!.map((row) => row.kind)).toEqual(["conference", "journal", "thesis"]);
    expect(new Set(network.batches[0]!.map((row) => row.payload.p_id)).size).toBe(3);
    for (const row of network.batches[0]!) expect(row.payload.p_id).toMatch(/^[0-9a-f-]{36}$/);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not count repeated confirmations after an acknowledgement or reload", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    expect(queue(stats)).toBe(true);
    expect(queue(stats)).toBe(false);
    await stats.flush();
    expect(queue(stats)).toBe(false);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(queue(restored)).toBe(false);
    await restored.flush();
    expect(network.rows.size).toBe(1);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("restores a queued result before its initial upload without generating another UUID", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    queue(stats);
    const persisted = [...local.values.values()].join("");
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(queue(restored)).toBe(false);
    await restored.flush();
    const id = network.batches[0]![0]!.payload.p_id;
    expect(persisted).toContain(id);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a lost acknowledgement with the same UUID and preserves retry timing across reload", async () => {
    const network = backend();
    const normalFetch = network.fetch.getMockImplementation()!;
    network.fetch.mockImplementationOnce(async (input, init) => {
      await normalFetch(input, init);
      throw new Error("Connection lost after commit");
    });
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    queue(stats);
    await stats.flush();
    expect(network.rows.size).toBe(1);
    const firstId = network.batches[0]![0]!.payload.p_id;
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    await restored.flush();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(network.fetch).toHaveBeenCalledTimes(2);
    expect(network.batches[1]![0]!.payload.p_id).toBe(firstId);
    expect(network.rows.size).toBe(1);
  });

  it("backs off failed writes up to ten minutes without letting flush bypass the delay", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
    const stats = client({ fetch, storage: storage() });
    queue(stats);
    await stats.flush();
    let attempts = 1;
    for (const delay of [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]) {
      await stats.flush();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetch).toHaveBeenCalledTimes(attempts);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(++attempts);
    }
  });

  it("quarantines all server-rejected future activity while delivering the unchanged paper batch", async () => {
    // Local time is wrong too; comparing the payload to Date.now() cannot help.
    vi.setSystemTime(new Date("2030-10-13T00:00:00Z"));
    const local = storage();
    const batches: Array<{ kind: string; payload: Record<string, unknown> & { p_id: string } }[]> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const records = JSON.parse(String(init?.body)).p_records;
      batches.push(records);
      const invalid = records.filter((row: { kind: string }) => row.kind === "activity");
      return invalid.length ? Response.json({ code: "PT422", details: JSON.stringify({ reason: "activity-future-date",
        ids: invalid.map((row: { payload: { p_id: string } }) => row.payload.p_id) }) }, { status: 422 })
        : Response.json(records.map((row: { payload: { p_id: string } }) => row.payload.p_id));
    });
    const stats = client({ fetch, storage: local });
    const visit = { p_event: "visit", p_day: "2030-10-13", p_visitor_id: crypto.randomUUID() };
    expect(stats.enqueue("activity", "activity-visit", "visit-1", visit)).toBe(true);
    expect(stats.enqueue("activity", "activity-visit", "visit-2", visit)).toBe(true);
    queue(stats, "journal");
    queue(stats, "thesis");
    await stats.flush();
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual(batches[0]!.filter((row) => row.kind !== "activity"));
    const saved = JSON.parse(local.values.get("phd_simulator_v2_statistics_v2")!);
    expect(saved.results.filter(([, row]: [string, { rejected?: string }]) => row.rejected === "future-date")).toHaveLength(2);
    expect(saved.results.every(([, row]: [string, { payload?: unknown }]) => row.payload === undefined)).toBe(true);
    stats.dispose();
    const restored = client({ fetch, storage: local });
    expect(restored.enqueue("activity", "activity-visit", "visit-1", visit)).toBe(false);
    await vi.advanceTimersByTimeAsync(600_000);
    await restored.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("persists date rejection receipts before a failed paper retry and honors backoff after reload", async () => {
    const local = storage();
    const batches: Array<{ kind: string; payload: { p_id: string } }[]> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const records = JSON.parse(String(init?.body)).p_records;
      batches.push(records);
      if (batches.length === 1) return Response.json({ code: "PT422", details: JSON.stringify({ reason: "activity-future-date",
        ids: [records[0].payload.p_id] }) }, { status: 422 });
      if (batches.length === 2) throw new Error("Lost paper acknowledgement");
      return Response.json(records.map((row: { payload: { p_id: string } }) => row.payload.p_id));
    });
    const stats = client({ fetch, storage: local });
    stats.enqueue("activity", "activity-visit", "future", { p_event: "visit", p_day: "2030-10-13", p_visitor_id: crypto.randomUUID() });
    queue(stats, "journal");
    await stats.flush();
    stats.dispose();
    const restored = client({ fetch, storage: local });
    await restored.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches[2]).toEqual(batches[1]);
    expect(batches[2]!.map((row) => row.kind)).toEqual(["journal"]);
  });

  it("never discards a paper because of an unrelated date rejection", async () => {
    const local = storage();
    const network = backend();
    network.fetch.mockImplementationOnce(async (_url, init) => {
      const records = JSON.parse(String(init?.body)).p_records;
      return Response.json({ code: "PT422", details: JSON.stringify({ reason: "activity-future-date",
        ids: [records[0].payload.p_id] }) }, { status: 422 });
    });
    const stats = client({ fetch: network.fetch, storage: local });
    queue(stats, "journal");
    await stats.flush();
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.rows.size).toBe(1);
    expect(network.batches[0]![0]!.kind).toBe("journal");
  });

  it.each([false, true, null, {}, ["not-a-submitted-id"]])("retains the batch when acknowledgement is malformed or unrelated: %j", async (response) => {
    const network = backend();
    network.fetch.mockResolvedValueOnce(Response.json(response));
    const stats = client({ fetch: network.fetch, storage: storage() });
    queue(stats);
    await stats.flush();
    expect(network.rows.size).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.rows.size).toBe(1);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("acknowledges only returned IDs and retries the rest of a partially accepted batch", async () => {
    const network = backend();
    let original: Row[] = [];
    network.fetch.mockImplementationOnce(async (_input, init) => {
      original = JSON.parse(String(init?.body)).p_records as Row[];
      return Response.json([original[0]!.payload.p_id]);
    });
    const stats = client({ fetch: network.fetch, storage: storage() });
    queue(stats, "journal");
    queue(stats, "thesis");
    await stats.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.batches).toHaveLength(1);
    expect(network.batches[0]).toEqual([original[1]]);
    expect(queue(stats, "journal")).toBe(false);
    expect(queue(stats, "thesis")).toBe(false);
  });

  it("caps requests at fifty records and waits thirty seconds before the next batch", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    for (let index = 0; index < 51; index++) queue(stats, "journal", `paper-${index}`);
    await stats.flush();
    expect(network.batches.map((batch) => batch.length)).toEqual([50]);
    await stats.flush();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(network.batches.map((batch) => batch.length)).toEqual([50, 1]);
  });

  it("splits long successful runs by UTF-8 bytes and eventually sends their passing thesis and finish", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    const run = '[321,"normal"]';
    const finalizedRunId = crypto.randomUUID();
    const context = { version: 1, roleId: "normal", runKey: run, paperId: "paper", totalMonths: 65,
      scores: Object.fromEntries(["idea", "experiment", "writing"].map(key => [key, { own: 40, collaboration: 0, total: 40 }])),
      note: "论文".repeat(2200) };
    for (let index = 0; index < 8; index++) {
      expect(stats.enqueue("conference", run, `paper-${index}`, { ...PAYLOADS.conference, p_context: context }, finalizedRunId)).toBe(true);
    }
    expect(stats.enqueue("thesis", run, "master", PAYLOADS.thesis, finalizedRunId)).toBe(true);
    expect(stats.enqueue("activity", run, "finish", { p_event: "finish", p_ending: "phd", p_day: "2026-11-17",
      p_run_key: run, p_role_id: "normal" }, finalizedRunId)).toBe(true);
    await stats.flush();
    expect(network.rows.size).toBeLessThan(10);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(network.rows.size).toBe(10);
    expect(network.batches.length).toBeGreaterThan(1);
    for (const [, init] of network.fetch.mock.calls) {
      expect(new TextEncoder().encode(String(init?.body)).byteLength).toBeLessThanOrEqual(STATISTICS_MAX_BATCH_BYTES);
    }
    expect([...network.rows.values()].some(row => row.payload.p_passed === true)).toBe(true);
    expect([...network.rows.values()].some(row => row.payload.p_ending === "phd")).toBe(true);
  });

  it("upgrades legacy receipts to stable finalization identities without another raw result UUID", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    const stale = client({ fetch: network.fetch, storage: local });
    const run = '[444,"normal"]';
    const payload = { p_event: "finish", p_ending: "phd", p_day: "2026-11-17", p_run_key: run, p_role_id: "normal" };
    first.enqueue("activity", run, "finish", payload);
    await first.flush();
    const originalId = network.batches[0]![0]!.payload.p_id;
    const finalizedRunId = crypto.randomUUID();
    vi.setSystemTime(new Date("2026-11-18T00:00:00Z"));
    expect(stale.enqueue("activity", run, "finish", { ...payload, p_day: "2026-11-18" }, finalizedRunId)).toBe(true);
    expect(stale.persistPending()).toBe(true);
    await stale.flush();
    expect(network.batches[1]![0]!.payload).toMatchObject({ p_id: originalId, p_day: "2026-11-17",
      p_finalized_run_id: finalizedRunId, p_fingerprint: "finish", p_run_key: run });
    first.dispose(); stale.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.enqueue("activity", run, "finish", payload, finalizedRunId)).toBe(false);
    await restored.flush();
    expect(network.rows.size).toBe(1);
    expect(network.batches).toHaveLength(2);
  });

  it("preserves newly queued results during an in-flight batch and sends them later", async () => {
    const network = backend();
    let complete!: (response: Response) => void;
    let first: Row[] = [];
    network.fetch.mockImplementationOnce(async (_input, init) => {
      first = JSON.parse(String(init?.body)).p_records as Row[];
      return new Promise<Response>((resolve) => { complete = resolve; });
    });
    const stats = client({ fetch: network.fetch, storage: storage() });
    queue(stats, "conference");
    const pending = stats.flush();
    queue(stats, "journal");
    const simultaneousFlush = stats.flush();
    expect(network.fetch).toHaveBeenCalledTimes(1);
    complete(Response.json(first.map((row) => row.payload.p_id)));
    await Promise.all([pending, simultaneousFlush]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(network.batches[0]!.map((row) => row.kind)).toEqual(["journal"]);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("removes unsent debug-run results in every category, including after reload", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    queue(stats, "conference");
    queue(stats, "journal");
    queue(stats, "thesis", "clean-thesis", "run-2");
    stats.markDebug("run-1");
    expect(stats.isDebugRun("run-1")).toBe(true);
    expect(queue(stats, "thesis")).toBe(false);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.isDebugRun("run-1")).toBe(true);
    expect(queue(restored, "journal")).toBe(false);
    await restored.flush();
    expect(network.batches[0]!.map((row) => row.kind)).toEqual(["thesis"]);
  });

  it("restores a clean snapshot's qualification without reviving debug results or uploaded receipts", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    queue(stats, "conference", "uploaded");
    await stats.flush();
    queue(stats, "journal", "discarded-debug-branch");
    stats.markDebug("run-1");
    stats.markDebug("activity-start:run-1");
    expect(queue(stats, "thesis", "blocked-debug-branch")).toBe(false);
    stats.restoreRunQualification("run-1");
    expect(stats.isDebugRun("run-1")).toBe(false);
    expect(stats.isDebugRun("activity-start:run-1")).toBe(false);
    expect(queue(stats, "conference", "uploaded")).toBe(false);
    expect(queue(stats, "thesis", "clean-snapshot")).toBe(true);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.isDebugRun("run-1")).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    await restored.flush();
    expect(network.batches.flat().map((row) => row.kind)).toEqual(["conference", "thesis"]);
    expect(network.rows.size).toBe(2);
  });

  it("keeps a restored qualification newer than stale tab exclusions, then honors new debug use", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    first.markDebug("run-1");
    const stale = client({ fetch: network.fetch, storage: local });
    expect(stale.isDebugRun("run-1")).toBe(true);
    first.restoreRunQualification("run-1");
    expect(stale.persistPending()).toBe(true);
    expect(stale.isDebugRun("run-1")).toBe(false);
    expect(queue(stale, "journal", "clean")).toBe(true);
    stale.markDebug("run-1");
    expect(queue(first, "thesis", "debug-again")).toBe(false);
    first.restoreRunQualification("run-1");
    expect(queue(first, "conference", "clean-again")).toBe(true);
    await first.flush();
    expect(network.batches.flat().map((row) => row.kind)).toEqual(["conference"]);
  });

  it("makes no requests or storage mutations when disabled, even with pending saved results", async () => {
    const network = backend();
    const local = storage();
    const active = client({ fetch: network.fetch, storage: local });
    queue(active);
    active.dispose();
    local.setItem.mockClear();
    const stats = client({ fetch: network.fetch, storage: local, enabled: false });
    expect(queue(stats, "thesis")).toBe(false);
    stats.markDebug("run-1");
    await stats.flush();
    await stats.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "unavailable", data: null });
    expect(network.fetch).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("allows local statistics reads without uploading new or restored production records", async () => {
    const network = backend();
    const local = storage();
    const active = client({ fetch: network.fetch, storage: local });
    expect(queue(active)).toBe(true);
    active.dispose();
    const preview = client({ fetch: network.fetch, storage: local, uploadEnabled: false });
    expect(queue(preview, "thesis")).toBe(false);
    await preview.load(READ_RPC, KEY, parse);
    await preview.flush();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(preview.read(READ_RPC, KEY, parse).data).toEqual(SUMMARY);
    expect(network.batches).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    preview.dispose();
    await client({ fetch: network.fetch, storage: local }).flush();
    expect(network.rows.size).toBe(1);
  });

  it("expires old activity uploads and receipts while preserving paper results and the 30-day boundary", async () => {
    const network = backend();
    const local = storage();
    vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
    const old = client({ fetch: network.fetch, storage: local });
    const visit = { p_event: "visit", p_day: "2026-10-17", p_visitor_id: "f550d4f6-2d3d-454b-9a16-000000000001" };
    expect(old.enqueue("activity", "activity-visit", "acknowledged", visit)).toBe(true);
    await old.flush();
    expect(old.enqueue("activity", "activity-visit", "unsent", visit)).toBe(true);
    expect(queue(old)).toBe(true);
    old.dispose();
    network.batches.length = 0;
    vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.enqueue("activity", "activity-visit", "expired", visit)).toBe(false);
    expect(restored.enqueue("activity", "activity-visit", "boundary", { ...visit, p_day: "2026-10-18" })).toBe(true);
    await restored.flush();
    expect(network.batches[0]!.map((row) => row.kind)).toEqual(["journal", "activity"]);
    const saved = JSON.parse(local.values.get("phd_simulator_v2_statistics_v2")!);
    expect(saved.results.some(([, row]: [string, { activityDay?: string }]) => row.activityDay === "2026-10-17")).toBe(false);
  });

  it("stops scheduled background uploads when disposed", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    queue(stats);
    stats.dispose();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(network.fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed without a cryptographic UUID but tolerates unavailable storage", async () => {
    const network = backend();
    const local = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    const stats = client({ fetch: network.fetch, storage: local });
    const uuid = vi.spyOn(globalThis.crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("unavailable"); });
    expect(queue(stats)).toBe(false);
    expect(network.fetch).not.toHaveBeenCalled();
    uuid.mockRestore();
    expect(queue(stats)).toBe(true);
    await stats.flush();
    expect(network.rows.size).toBe(1);
  });
});

describe("shared statistics read cache", () => {
  it("reads only on demand, shares concurrent reads, and never reads following a write", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "loading", data: null });
    expect(network.fetch).not.toHaveBeenCalled();
    await Promise.all([stats.load(READ_RPC, KEY, parse), stats.load(READ_RPC, KEY, parse)]);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    queue(stats);
    await stats.flush();
    expect(network.fetch).toHaveBeenCalledTimes(2);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    await stats.load(READ_RPC, KEY, parse);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses a successful aggregate across refresh for ten minutes without polling", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    await stats.load(READ_RPC, KEY, parse);
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    await restored.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(599_999);
    await restored.load(READ_RPC, KEY, parse);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await restored.load(READ_RPC, KEY, parse);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps real cached numbers visible during refresh failures and backs off reads for a minute", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local });
    await stats.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(600_000);
    network.fetch.mockRejectedValueOnce(new Error("offline"));
    await stats.load(READ_RPC, KEY, parse);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    stats.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    await restored.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(59_999);
    await restored.load(READ_RPC, KEY, parse);
    expect(network.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await restored.load(READ_RPC, KEY, parse);
    expect(network.fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed responses without fabricated zeroes and retries only on a later load", async () => {
    const network = backend();
    const onChange = vi.fn();
    network.fetch.mockResolvedValueOnce(Response.json({}));
    const stats = client({ fetch: network.fetch, storage: storage(), onChange });
    await stats.load(READ_RPC, KEY, parse);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "unavailable", data: null });
    await stats.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await stats.load(READ_RPC, KEY, parse);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("separates cache entries by RPC and arguments and protects them from callers mutating a snapshot", async () => {
    const network = backend();
    const stats = client({ fetch: network.fetch, storage: storage() });
    await stats.load(READ_RPC, KEY, parse);
    const snapshot = stats.read(READ_RPC, KEY, parse);
    snapshot.data!.acceptedCount = 999;
    expect(stats.read(READ_RPC, KEY, parse).data!.acceptedCount).toBe(12);
    expect(stats.read(READ_RPC, { ...KEY, p_journal: "nature" }, parse).status).toBe("loading");
    expect(stats.read("other_stats", KEY, parse).status).toBe("loading");
  });
});

describe("statistics persistence across browser tabs", () => {
  it("restores both tabs' queued results after they close before uploading", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    const second = client({ fetch: network.fetch, storage: local });
    queue(first, "journal", "first-paper", "first-run");
    queue(second, "thesis", "second-thesis", "second-run");
    first.dispose();
    second.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    await restored.flush();
    expect(network.rows.size).toBe(2);
    expect(network.batches[0]!.map((row) => row.kind).sort()).toEqual(["journal", "thesis"]);
  });

  it("does not let another tab's cache write erase a pending result", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    const second = client({ fetch: network.fetch, storage: local });
    queue(first, "journal");
    await second.load(READ_RPC, KEY, parse);
    first.dispose();
    second.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    await restored.flush();
    expect(network.rows.size).toBe(1);
    expect(network.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not resurrect an old pending record after another tab acknowledges it", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    queue(first, "journal");
    const second = client({ fetch: network.fetch, storage: local });
    await second.flush();
    await first.load(READ_RPC, KEY, parse);
    await vi.advanceTimersByTimeAsync(60_000);
    await first.flush();
    first.dispose();
    second.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(queue(restored, "journal")).toBe(false);
    await restored.flush();
    expect(network.batches).toHaveLength(1);
    expect(network.rows.size).toBe(1);
  });

  it("preserves debug exclusions across tabs and removes that run's pending results everywhere", async () => {
    const network = backend();
    const local = storage();
    const first = client({ fetch: network.fetch, storage: local });
    const second = client({ fetch: network.fetch, storage: local });
    queue(first, "journal");
    queue(first, "thesis", "clean-thesis", "clean-run");
    second.markDebug("run-1");
    expect(queue(first, "conference")).toBe(false);
    await first.flush();
    expect(network.batches[0]!.map((row) => row.kind)).toEqual(["thesis"]);
    first.dispose();
    second.dispose();
    const restored = client({ fetch: network.fetch, storage: local });
    expect(restored.isDebugRun("run-1")).toBe(true);
    expect(queue(restored, "journal")).toBe(false);
  });
});

describe("one frozen statistics snapshot per game", () => {
  it("reads all categories once at game start and never requests individual results while playing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(runSnapshot()));
    const stats = client({ fetch, storage: storage() });
    await Promise.all([stats.startRun("run-1"), stats.startRun("run-1")]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toMatch(new RegExp(`/${SNAPSHOT_RPC}$`));
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({});
    await Promise.all([
      stats.load(READ_RPC, KEY, parse),
      stats.load("get_phd_simulator_v2_conference_stats", CONFERENCE_KEY, parseConference),
      stats.load("get_phd_simulator_v2_thesis_stats", THESIS_KEY, parseThesis),
    ]);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    expect(stats.read("get_phd_simulator_v2_conference_stats", CONFERENCE_KEY, parseConference))
      .toEqual({ status: "ready", data: CONFERENCE_SUMMARY });
    expect(stats.read("get_phd_simulator_v2_thesis_stats", THESIS_KEY, parseThesis))
      .toEqual({ status: "ready", data: THESIS_SUMMARY });
    await vi.advanceTimersByTimeAsync(3_600_000);
    await stats.load(READ_RPC, KEY, parse);
    await stats.startRun("run-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats conferences missing from a valid complete snapshot as genuine zero statistics", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(runSnapshot()));
    const stats = client({ fetch, storage: storage() });
    await stats.startRun("run-1");
    const key = { ...CONFERENCE_KEY, p_conference_name: "ICML" };
    await stats.load("get_phd_simulator_v2_conference_stats", key, parseConference);
    expect(stats.read("get_phd_simulator_v2_conference_stats", key, parseConference)).toEqual({ status: "ready", data: {
      submissions: 0, accepted: 0,
      counts: { Poster: 0, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
      means: { Reject: null, Poster: null, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null },
    } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reuses a snapshot across new games and page refresh within ten minutes, then fetches only for a new game", async () => {
    const local = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(runSnapshot()));
    const stats = client({ fetch, storage: local });
    await stats.startRun("run-1");
    await vi.advanceTimersByTimeAsync(100_000);
    await stats.startRun("run-2");
    expect(fetch).toHaveBeenCalledTimes(1);
    stats.dispose();
    const restored = client({ fetch, storage: local });
    await restored.startRun("run-3");
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500_000);
    await restored.startRun("run-3");
    await restored.load(READ_RPC, KEY, parse);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(Response.json(runSnapshot(15)));
    await restored.startRun("run-4");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(restored.read(READ_RPC, KEY, parse).data!.acceptedCount).toBe(15);
  });

  it("does not mutate or reread the current game snapshot after uploading results", async () => {
    const network = backend();
    network.fetch.mockResolvedValueOnce(Response.json(runSnapshot()));
    const stats = client({ fetch: network.fetch, storage: storage() });
    await stats.startRun("run-1");
    queue(stats);
    await stats.flush();
    await stats.load(READ_RPC, KEY, parse);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
    expect(network.fetch).toHaveBeenCalledTimes(2);
    expect(network.batches).toHaveLength(1);
  });

  it("keeps a failed startup unavailable for the whole game and retries only for the next game", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(runSnapshot()));
    fetch.mockRejectedValueOnce(new Error("offline"));
    const stats = client({ fetch, storage: storage() });
    await stats.startRun("run-1");
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "unavailable", data: null });
    await vi.advanceTimersByTimeAsync(3_600_000);
    await stats.startRun("run-1");
    await stats.load(READ_RPC, KEY, parse);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stats.read("get_phd_simulator_v2_conference_stats", CONFERENCE_KEY, parseConference))
      .toEqual({ status: "unavailable", data: null });
    await stats.startRun("run-2");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "ready", data: SUMMARY });
  });

  it.each([{}, { ...runSnapshot(), journals: {} }, { ...runSnapshot(), version: 999 }])(
    "does not infer empty conferences from an incomplete or invalid snapshot: %j", async (response) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(response));
      const stats = client({ fetch, storage: storage() });
      await stats.startRun("run-1");
      expect(stats.read("get_phd_simulator_v2_conference_stats", CONFERENCE_KEY, parseConference))
        .toEqual({ status: "unavailable", data: null });
      await stats.load(READ_RPC, KEY, parse);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("shares a pending snapshot across rapid restarts and notifies only the active game", async () => {
    let complete!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Promise<Response>((resolve) => { complete = resolve; }));
    const onChange = vi.fn();
    const stats = client({ fetch, storage: storage(), onChange });
    const first = stats.startRun("run-1");
    const second = stats.startRun("run-2");
    expect(fetch).toHaveBeenCalledTimes(1);
    complete(Response.json(runSnapshot(20)));
    await Promise.all([first, second]);
    expect(stats.read(READ_RPC, KEY, parse).data!.acceptedCount).toBe(20);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not request or persist snapshots when statistics are disabled", async () => {
    const network = backend();
    const local = storage();
    const stats = client({ fetch: network.fetch, storage: local, enabled: false });
    await stats.startRun("run-1");
    await stats.load(READ_RPC, KEY, parse);
    expect(stats.read(READ_RPC, KEY, parse)).toEqual({ status: "unavailable", data: null });
    expect(network.fetch).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });
});
