import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVisitStats } from "../src/app/v2-visit-stats";
import { createStatisticsClient } from "../src/app/v2-statistics-client";
import { replayStateDigest } from "../src/core/v2-run-replay";
import { createRunSaveRepository } from "../src/core/v2-run-saves";
import { createStore } from "../src/core/v2-store";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import { withPassingThesisReview } from "./helpers/v2-thesis-fixtures";

const DAY = "2026-10-17";
const TODAY = Date.parse(`${DAY}T12:00:00+08:00`);
const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const controllers: ReturnType<typeof createVisitStats>[] = [];
const clients: ReturnType<typeof createStatisticsClient>[] = [];
type Activity = { p_id: string; p_event: "visit" | "start" | "finish"; p_day: string;
  p_visitor_id?: string; p_run_key?: string; p_role_id?: string; p_ending?: string };

function createStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function createBackend() {
  const rows = new Map<string, Activity>();
  let loseAck = false;
  let failRead = false;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    expect(String(input)).toMatch(/^https:\/\/rffmgeacueokudwreyeb\.supabase\.co\/rest\/v1\/rpc\//);
    const payload = JSON.parse(String(init?.body));
    if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
      const records = payload.p_records as { kind: string; payload: Activity }[];
      for (const row of records) {
        expect(row.kind).toBe("activity");
        const key = row.payload.p_event === "visit" ? row.payload.p_id : `${row.payload.p_event}:${row.payload.p_run_key}`;
        if (!rows.has(key)) rows.set(key, row.payload);
      }
      if (loseAck) { loseAck = false; throw new Error("Lost acknowledgement after commit"); }
      return Response.json(records.map((record) => record.payload.p_id));
    }
    expect(String(input)).toMatch(/\/get_phd_simulator_v2_activity_stats$/);
    if (failRead) throw new Error("Offline");
    const data = [...rows.values()];
    const visits = data.filter((row) => row.p_event === "visit");
    const starts = data.filter((row) => row.p_event === "start");
    const roles: Record<string, { games: number; finished: number; clears: number; phd: number }> = {};
    for (const row of data.filter((entry) => entry.p_event !== "visit")) {
      const role = roles[row.p_role_id!] ??= { games: 0, finished: 0, clears: 0, phd: 0 };
      if (row.p_event === "start") role.games++;
      else { role.finished++; if (["master", "phd"].includes(row.p_ending!)) role.clears++; if (row.p_ending === "phd") role.phd++; }
    }
    return Response.json({ version: 2, epoch: DATA_EPOCH, day: payload.p_day, views: visits.length, todayViews: visits.filter((row) => row.p_day === payload.p_day).length,
      visitors: new Set(visits.map((row) => row.p_visitor_id)).size,
      todayVisitors: new Set(visits.filter((row) => row.p_day === payload.p_day).map((row) => row.p_visitor_id)).size,
      games: starts.length, todayGames: starts.filter((row) => row.p_day === payload.p_day).length, roles });
  });
  return { rows, fetch, loseNextAck: () => { loseAck = true; }, failReads: () => { failRead = true; } };
}

function create(options: Parameters<typeof createVisitStats>[0]) {
  const result = createVisitStats(options);
  controllers.push(result);
  return result;
}
function shared(options: Parameters<typeof createStatisticsClient>[0]) {
  const result = createStatisticsClient(options);
  clients.push(result);
  return result;
}
function fakeRoot() {
  const cells = new Map<string, { textContent: string }>();
  const root = { querySelectorAll: (selector: string) => {
    const cell = cells.get(selector) ?? { textContent: "" };
    cells.set(selector, cell);
    return [cell];
  } } as unknown as ParentNode;
  return { root, cells };
}
function summary(overrides: Record<string, unknown> = {}) {
  return { version: 2, epoch: DATA_EPOCH, day: DAY, views: 20, todayViews: 3, visitors: 10, todayVisitors: 2, games: 8, todayGames: 1,
    roles: { normal: { games: 8, finished: 4, clears: 3, phd: 2 } }, ...overrides };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TODAY); });
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  clients.splice(0).forEach((client) => client.dispose());
  vi.clearAllTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("kwgame activity statistics", () => {
  it("replaces an older activity read still in flight when the start upload completes", async () => {
    const backend = createBackend();
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage: createStorage() });
    await stats.load();
    await vi.advanceTimersByTimeAsync(600_001);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    backend.fetch.mockImplementationOnce(async () => {
      await gate;
      return Response.json(summary({ games: 0, todayGames: 0,
        roles: { normal: { games: 0, finished: 0, clears: 0, phd: 0 } } }));
    });
    const oldRead = stats.load();
    const tracking = stats.trackGamePhase("playing", {
      roleId: "normal", ending: null, runKey: JSON.stringify([92, "normal"]),
    });
    const upload = stats.flush();
    await vi.waitFor(() => expect([...backend.rows.values()].some(row => row.p_event === "start")).toBe(true));
    release();
    await Promise.all([oldRead, tracking, upload]);
    expect(stats.getRoleDisplayValues("normal")["global-played-runs"]).toBe("1");
    expect(backend.fetch.mock.calls.filter(([url]) => String(url).includes("/get_"))).toHaveLength(3);
  });

  it.each([false, true])("refreshes a cached zero after an unfinished start is acknowledged (shared client=%s)", async (useSharedClient) => {
    const backend = createBackend();
    const storage = createStorage();
    const client = useSharedClient ? shared({ fetch: backend.fetch, storage }) : undefined;
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage, client });
    await stats.load();
    expect(stats.getRoleDisplayValues("normal")["global-played-runs"]).toBe("0");
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([91, "normal"]) };
    await stats.trackGamePhase("playing", run);
    await stats.trackGamePhase("setup");
    // The start shares the batch throttle with the page visit; the old cached
    // value must update on acknowledgement, without waiting ten minutes or ending.
    await vi.advanceTimersByTimeAsync(30_000);
    await stats.flush();
    expect(stats.getDisplayValues().games).toBe("1（1）");
    expect(stats.getRoleDisplayValues("normal")).toEqual({ "global-completed-runs": "0", "global-played-runs": "1", "phd-rate": "--" });
    expect([...backend.rows.values()].filter(row => row.p_event === "finish")).toHaveLength(0);
    expect(backend.fetch.mock.calls.filter(([url]) => String(url).includes("/get_"))).toHaveLength(2);
    // Continuing the same save, rendering and returning home neither count nor read again.
    await stats.trackGamePhase("playing", run);
    await stats.trackGamePhase("setup");
    await vi.advanceTimersByTimeAsync(30_000);
    await stats.flush();
    expect(stats.getRoleDisplayValues("normal")["global-played-runs"]).toBe("1");
    expect(backend.fetch.mock.calls.filter(([url]) => String(url).includes("/get_"))).toHaveLength(2);
    await stats.trackGamePhase("finished", { ...run, ending: "master", finalized: true });
    await stats.flush();
    expect(stats.getRoleDisplayValues("normal")).toEqual({ "global-completed-runs": "1", "global-played-runs": "1", "phd-rate": "0.0%" });
  });

  it.each([undefined, 1])("replaces a fresh zero-start cache with obsolete response version %s, even under the current cache key", async (version) => {
    const storage = createStorage();
    const key = JSON.stringify(["get_phd_simulator_v2_activity_stats", { p_day: DAY }, "activity-20261016-monthly-replay-v1"]);
    storage.setItem("phd_simulator_v2_statistics_v1", JSON.stringify({ version: 1, cache: [[key, {
      fetchedAt: Date.now(), retryAt: 0,
      data: summary({ version, games: 0, todayGames: 0, roles: { normal: { games: 0, finished: 55, clears: 8, phd: 7 } } }),
    }]] }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(summary({ games: 118, todayGames: 3,
      roles: { normal: { games: 55, finished: 55, clears: 8, phd: 7 } } })));
    const stats = create({ recordVisit: false, storage, fetch });
    expect(stats.getRoleDisplayValues("normal")["global-played-runs"]).toBe("--");
    await stats.load();
    expect(stats.getDisplayValues().games).toBe("118（3）");
    expect(stats.getRoleDisplayValues("normal")).toEqual({ "global-completed-runs": "8", "global-played-runs": "55", "phd-rate": "12.7%" });
    stats.dispose();
    const restored = create({ recordVisit: false, storage, fetch });
    await restored.load();
    expect(restored.getRoleDisplayValues("normal")["global-played-runs"]).toBe("55");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect an obsolete zero cache or lose read backoff when its replacement fails", async () => {
    const storage = createStorage();
    const key = JSON.stringify(["get_phd_simulator_v2_activity_stats", { p_day: DAY }, "activity-20261016-monthly-replay-v1"]);
    storage.setItem("phd_simulator_v2_statistics_v1", JSON.stringify({ version: 1, cache: [[key, {
      fetchedAt: Date.now(), retryAt: 0, data: summary({ version: undefined, games: 0, todayGames: 0 }),
    }]] }));
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new Error("Offline"))
      .mockImplementation(async () => Response.json(summary()));
    const stats = create({ recordVisit: false, storage, fetch });
    await stats.load();
    expect(stats.getDisplayValues().games).toBe("--（--）");
    stats.dispose();
    const restored = create({ recordVisit: false, storage, fetch });
    await restored.load();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(restored.getDisplayValues().games).toBe("--（--）");
    await vi.advanceTimersByTimeAsync(60_000);
    await restored.load();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(restored.getDisplayValues().games).toBe("8（1）");
  });

  it("records one page visit through a batch and reads all activity counts in one request", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage });
    expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）", games: "--（--）" });
    await Promise.all([stats.load(), stats.load(), stats.load()]);
    expect(backend.fetch).toHaveBeenCalledTimes(2);
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "0（0）" });
    const visit = [...backend.rows.values()][0]!;
    expect(visit).toMatchObject({ p_event: "visit", p_day: DAY, p_visitor_id: storage.getItem(VISITOR_KEY) });
    expect(Object.keys(visit).sort()).toEqual(["p_day", "p_event", "p_id", "p_visitor_id"]);
    expect(visit.p_visitor_id).toMatch(/^[0-9a-f-]{36}$/);
    await stats.load();
    expect(backend.fetch).toHaveBeenCalledTimes(2);
  });

  it("counts reloads as visits while keeping a stable device identity and cached aggregate", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const options = { recordVisit: true, fetch: backend.fetch, storage };
    const first = create(options);
    await first.load();
    first.dispose();
    const reloaded = create(options);
    await reloaded.load();
    expect(reloaded.getDisplayValues().views).toBe("1（1）");
    await vi.advanceTimersByTimeAsync(30_000);
    const visits = [...backend.rows.values()];
    expect(visits).toHaveLength(2);
    expect(new Set(visits.map((row) => row.p_visitor_id)).size).toBe(1);
    expect(new Set(visits.map((row) => row.p_id)).size).toBe(2);
    expect(backend.fetch.mock.calls.filter(([url]) => String(url).includes("/get_"))).toHaveLength(1);
    const anotherBrowser = create({ ...options, storage: createStorage() });
    await anotherBrowser.load();
    expect(anotherBrowser.getDisplayValues()).toEqual({ visitors: "2（2）", views: "3（3）", games: "0（0）" });
  });

  it("serializes first-time device identity creation across simultaneous tabs before uploading visits", async () => {
    let release!: () => void;
    let pending: Promise<unknown> = new Promise<void>((resolve) => { release = resolve; });
    const request = vi.fn((_name: string, callback: () => string) => {
      const result = pending.then(callback);
      pending = result;
      return result;
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const backend = createBackend();
    const local = createStorage();
    const setItem = vi.spyOn(local, "setItem");
    const options = { recordVisit: true, fetch: backend.fetch, storage: local };
    const first = create(options);
    const second = create(options);
    const loading = [first.load(), second.load()];
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([name]) => name)).toEqual([`${VISITOR_KEY}_lock`, `${VISITOR_KEY}_lock`]);
    expect(local.getItem(VISITOR_KEY)).toBeNull();
    expect(backend.fetch).not.toHaveBeenCalled();
    release();
    await Promise.all(loading);
    await vi.advanceTimersByTimeAsync(30_000);
    const visits = [...backend.rows.values()];
    expect(visits).toHaveLength(2);
    expect(new Set(visits.map((row) => row.p_id)).size).toBe(2);
    expect(new Set(visits.map((row) => row.p_visitor_id)).size).toBe(1);
    expect(setItem.mock.calls.filter(([key]) => key === VISITOR_KEY)).toHaveLength(1);
  });

  it("retries a lost visit acknowledgement after reload using the original record UUID", async () => {
    const backend = createBackend();
    const storage = createStorage();
    backend.loseNextAck();
    const first = create({ recordVisit: true, fetch: backend.fetch, storage });
    await first.load();
    const original = [...backend.rows.values()][0]!.p_id;
    first.dispose();
    const restored = shared({ fetch: backend.fetch, storage });
    await restored.flush();
    expect(backend.rows.size).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...backend.rows.values()].map((row) => row.p_id)).toEqual([original]);
    const batches = backend.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"));
    expect(batches).toHaveLength(2);
    expect(JSON.parse(String(batches[1]![1]?.body)).p_records[0].payload.p_id).toBe(original);
  });

  it("counts starts immediately, persists run deduplication, and counts unfinished runs as played", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage });
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([1, "normal"]) };
    await stats.trackGamePhase("playing", run);
    await stats.trackGamePhase("playing", run);
    await stats.flush();
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start"]);
    stats.dispose();
    const restored = create({ recordVisit: true, fetch: backend.fetch, storage });
    await restored.trackGamePhase("playing", run);
    await restored.flush();
    await restored.trackGamePhase("setup");
    await restored.trackGamePhase("playing", { ...run, runKey: JSON.stringify([2, "normal"]) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start", "start"]);
    await vi.advanceTimersByTimeAsync(600_000);
    const readOnly = create({ recordVisit: false, fetch: backend.fetch, storage });
    await readOnly.load();
    expect(readOnly.getDisplayValues().games).toBe("2（2）");
    expect(readOnly.getRoleDisplayValues("normal")).toEqual({ "global-completed-runs": "0", "global-played-runs": "2", "phd-rate": "--" });
  });

  it.each(["burnout", "poor", "expelled", "isolated", "overthinking", "delay", "quit", "master", "phd"] as const)(
    "records the real %s ending once through store updates", async (ending) => {
      const backend = createBackend();
      const stats = create({ recordVisit: true, storage: createStorage(), fetch: backend.fetch });
      const saves = createRunSaveRepository({ storage: null });
      const store = createStore({ storage: null, saves });
      await store.ready();
      const transitions: Promise<void>[] = [];
      store.subscribe((state) => transitions.push(stats.trackGamePhase(state.phase, {
        roleId: state.selectedRoleId, ending: state.ending, runKey: JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]),
        disqualifiedByDebug: store.getLobbyState().lastRunExperience?.disqualifiedByDebug,
      })));
      store.subscribeFinalized(({ state, debugUsed }) => transitions.push(stats.trackGamePhase(state.phase, {
        roleId: state.selectedRoleId, ending: state.ending, runKey: JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]),
        disqualifiedByDebug: debugUsed, finalized: true,
      })));
      store.dispatch("start-game", { roleId: "normal" });
      const state = store.getState();
      state.eventQueue = [];
      state.totalMonths = 1;
      state.month = 1;
      if (ending === "burnout") state.player.san = -1;
      if (ending === "poor") state.player.money = -1;
      if (ending === "expelled") state.player.favor = -1;
      if (ending === "isolated") state.player.social = -1;
      if (ending === "overthinking") state.player.research = -1;
      if (["master", "phd", "delay"].includes(ending)) {
        state.degree = ending === "phd" ? "phd" : "master";
        state.maxMonths = getMonthLimitByDegree(state.degree);
        state.totalMonths = state.maxMonths;
        Object.assign(state, getCalendarForTotalMonths(state.totalMonths, state.degree));
        state.graduationScoreTarget = ending === "phd" ? 7 : 1;
        state.totalResearchScore = ending === "delay" ? 0 : state.graduationScoreTarget;
        state.thesis = withPassingThesisReview(state).thesis;
      }
      const replay = structuredClone(saves.get("normal")!.replay!);
      replay.checkpoints.at(-1)!.digest = replayStateDigest(state);
      saves.commit(state, { runId: store.getCurrentRunId()!, replay });
      store.loadRunSave("latest");
      store.dispatch(ending === "quit" ? "quit-game" : "next-month");
      expect(store.getState()).toMatchObject({ phase: "finished", ending });
      store.dispatch("set-date-display-mode", { dateDisplayMode: "calendar" });
      store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      store.dispatch("next-month");
      store.dispatch("reset-game");
      await Promise.all(transitions);
      expect([...backend.rows.values()].some((row) => row.p_event === "finish")).toBe(false);
      store.dispatch("start-game", { roleId: "normal" });
      expect(store.getState().phase).toBe("finished");
      store.dispatch("settle-and-return");
      await Promise.all(transitions);
      await stats.flush();
      expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start", "finish"]);
      expect([...backend.rows.values()][1]).toMatchObject({ p_ending: ending, p_role_id: "normal", p_day: DAY });
      expect(backend.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"))).toHaveLength(1);
    },
  );

  it("excludes debug starts and endings even if the panel is later closed", async () => {
    const backend = createBackend();
    const client = shared({ fetch: backend.fetch, storage: createStorage() });
    const stats = create({ recordVisit: true, client });
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([3, "normal"]) };
    await stats.trackGamePhase("playing", run);
    client.markDebug(run.runKey);
    await stats.trackGamePhase("finished", { ...run, ending: "phd", disqualifiedByDebug: true });
    await stats.flush();
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual([]);
    const resumed = create({ recordVisit: true, client });
    await resumed.trackGamePhase("playing", run);
    await resumed.trackGamePhase("finished", { ...run, ending: "phd", finalized: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual([]);
  });

  it("preserves uploaded starts but blocks later debug counts and does not taint the next clean run", async () => {
    const backend = createBackend();
    const client = shared({ fetch: backend.fetch, storage: createStorage() });
    const stats = create({ recordVisit: true, client });
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([31, "normal"]) };
    await stats.trackGamePhase("playing", run);
    await stats.flush();
    expect([...backend.rows.values()].map(row => row.p_event)).toEqual(["start"]);
    await stats.trackGamePhase("playing", { ...run, disqualifiedByDebug: true });
    await stats.trackGamePhase("finished", { ...run, ending: "phd", disqualifiedByDebug: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...backend.rows.values()].map(row => row.p_event)).toEqual(["start"]);
    await stats.trackGamePhase("setup");
    const clean = { ...run, runKey: JSON.stringify([32, "normal"]) };
    await stats.trackGamePhase("playing", clean);
    await stats.trackGamePhase("finished", { ...clean, ending: "master", finalized: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...backend.rows.values()].map(row => row.p_event)).toEqual(["start", "start", "finish"]);
  });

  it("does not finalize on the ending page or returning home, and can settle a restored ending once", async () => {
    const backend = createBackend();
    const local = createStorage();
    const stats = create({ recordVisit: true, storage: local, fetch: backend.fetch });
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([9001, "normal"]) };
    await stats.trackGamePhase("playing", run);
    await stats.trackGamePhase("finished", { ...run, ending: "phd" });
    await stats.trackGamePhase("setup");
    await stats.flush();
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start"]);
    stats.dispose();
    const resumed = create({ recordVisit: true, storage: local, fetch: backend.fetch });
    await resumed.trackGamePhase("finished", { ...run, ending: "phd" });
    await resumed.flush();
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start"]);
    await resumed.trackGamePhase("finished", { ...run, ending: "phd", finalized: true });
    await resumed.trackGamePhase("finished", { ...run, ending: "phd", finalized: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await resumed.flush();
    expect([...backend.rows.values()].map((row) => row.p_event)).toEqual(["start", "finish"]);
  });

  it("does not count missing run identities or a finished state without an active game", async () => {
    const backend = createBackend();
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage: createStorage() });
    await stats.trackGamePhase("finished", { roleId: "normal", ending: "phd", runKey: JSON.stringify([4, "normal"]) });
    await stats.trackGamePhase("playing", { roleId: "normal", ending: null });
    await stats.trackGamePhase("finished", { roleId: "normal", ending: "phd" });
    await stats.flush();
    expect(backend.rows.size).toBe(0);
  });

  it("computes doctoral graduation rate from finished runs, including migrated history", async () => {
    const backend = createBackend();
    backend.fetch.mockResolvedValue(Response.json(summary({ roles: {
      normal: { games: 20, finished: 20, clears: 12, phd: 5 }, rich: { games: 3, finished: 0, clears: 0, phd: 0 },
    } })));
    const stats = create({ recordVisit: false, fetch: backend.fetch, storage: createStorage() });
    await stats.load();
    expect(stats.getRoleDisplayValues("normal")).toEqual({ "global-completed-runs": "12", "global-played-runs": "20", "phd-rate": "25.0%" });
    expect(stats.getRoleDisplayValues("rich")["phd-rate"]).toBe("--");
    expect(stats.getRoleDisplayValues("chosen")).toEqual({ "global-completed-runs": "0", "global-played-runs": "0", "phd-rate": "--" });
    const { root, cells } = fakeRoot();
    stats.render(root);
    expect(cells.get('[data-role-stat="global-played-runs"][data-role-id="normal"]')?.textContent).toBe("20");
    expect(cells.get('[data-role-stat="phd-rate"][data-role-id="normal"]')?.textContent).toBe("25.0%");
  });

  it("does not read from rendering or normal actions, and refreshes at a later phase boundary", async () => {
    const backend = createBackend();
    const stats = create({ recordVisit: false, fetch: backend.fetch, storage: createStorage() });
    await stats.load();
    const run = { roleId: "normal" as const, ending: null, runKey: JSON.stringify([5, "normal"]) };
    await stats.trackGamePhase("playing", run);
    const { root } = fakeRoot();
    for (let i = 0; i < 20; i++) { stats.render(root); await stats.trackGamePhase("playing", run); }
    await vi.advanceTimersByTimeAsync(600_001);
    stats.render(root);
    await stats.trackGamePhase("playing", run);
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    await stats.trackGamePhase("finished", { ...run, ending: "master", finalized: true });
    expect(backend.fetch).toHaveBeenCalledTimes(2);
    await stats.trackGamePhase("finished", { ...run, ending: "master", finalized: true });
    expect(backend.fetch).toHaveBeenCalledTimes(2);
  });

  it("can load activity counts while the shared research snapshot is frozen", async () => {
    const backend = createBackend();
    backend.fetch.mockRejectedValueOnce(new Error("Research statistics unavailable"));
    const client = shared({ fetch: backend.fetch, storage: createStorage() });
    await client.startRun("run-1");
    const stats = create({ recordVisit: false, client });
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "0（0）", views: "0（0）", games: "0（0）" });
    expect(backend.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses Beijing days and leaves yesterday's cached daily counts as placeholders until explicit loading", async () => {
    const backend = createBackend();
    const storage = createStorage();
    vi.setSystemTime(Date.parse("2026-10-17T15:59:59Z"));
    const stats = create({ recordVisit: true, storage, fetch: backend.fetch });
    await stats.load();
    await vi.advanceTimersByTimeAsync(1000);
    const { root } = fakeRoot();
    stats.render(root);
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（--）", views: "1（--）", games: "0（--）" });
    expect(backend.fetch).toHaveBeenCalledTimes(2);
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（0）", views: "1（0）", games: "0（0）" });
    expect([...backend.rows.values()]).toHaveLength(1);
    expect(JSON.parse(String(backend.fetch.mock.calls[2]![1]?.body))).toEqual({ p_day: "2026-10-18" });
  });

  it("never uploads read-only preview traffic and respects a disabled shared client", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const stats = create({ recordVisit: false, storage, fetch: backend.fetch });
    await stats.load();
    await stats.trackGamePhase("playing", { roleId: "normal", ending: null, runKey: JSON.stringify([6, "normal"]) });
    await stats.trackGamePhase("finished", { roleId: "normal", ending: "phd", runKey: JSON.stringify([6, "normal"]), finalized: true });
    await stats.flush();
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    expect(backend.rows.size).toBe(0);
    expect(storage.getItem(VISITOR_KEY)).toBeNull();
    const client = shared({ enabled: false, fetch: backend.fetch, storage });
    const disabled = create({ recordVisit: false, client, storage });
    await disabled.load();
    expect(disabled.getDisplayValues().views).toBe("--（--）");
    expect(backend.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, summary({ version: undefined }), summary({ version: 1 }), summary({ day: "2026-09-13" }), summary({ games: -1 }),
    summary({ roles: { normal: { games: 2, finished: 1, clears: 2, phd: 0 } } })])(
    "rejects invalid aggregates instead of inventing zero counters: %j", async (value) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(value));
      const stats = create({ recordVisit: false, fetch, storage: createStorage() });
      await stats.load();
      expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）", games: "--（--）" });
      expect(stats.getRoleDisplayValues("normal")["phd-rate"]).toBe("--");
    },
  );

  it("preserves cached real numbers on failure and tolerates blocked local storage", async () => {
    const backend = createBackend();
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    const stats = create({ recordVisit: true, fetch: backend.fetch, storage });
    await stats.load();
    expect(stats.getDisplayValues().views).toBe("1（1）");
    backend.failReads();
    await vi.advanceTimersByTimeAsync(600_001);
    await stats.load();
    expect(stats.getDisplayValues().views).toBe("1（1）");
    const unavailable = create({ recordVisit: false, fetch: backend.fetch, storage: createStorage() });
    await unavailable.load();
    expect(unavailable.getDisplayValues().views).toBe("--（--）");
  });
});
