import { afterEach, describe, expect, it, vi } from "vitest";
import { createVisitStats } from "../src/app/v2-visit-stats";
import { createStore } from "../src/core/v2-store";

const PREFIX = "phd_simulator_v2";
const DAY = "2026-09-14";
const TODAY = Date.parse(`${DAY}T12:00:00+08:00`);

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

function createBackend() {
  const counters = new Map<string, number>();
  const failedIds = new Set<string>();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const payload = JSON.parse(String(init?.body));
    if (String(input).endsWith("/increment_counter")) {
      if (failedIds.has(payload.counter_id)) return new Response("unavailable", { status: 503 });
      counters.set(payload.counter_id, (counters.get(payload.counter_id) ?? 0) + 1);
      return new Response(null, { status: 204 });
    }
    return Response.json(payload.counter_ids
      .filter((id: string) => counters.has(id))
      .map((id: string) => ({ id, count: String(counters.get(id)) })));
  });
  return { counters, fetch, failedIds };
}

afterEach(() => vi.unstubAllGlobals());

describe("V2 visit statistics", () => {
  it.each(["burnout", "poor", "expelled", "isolated", "delay", "quit", "master", "phd"] as const)("records the real %s ending once through store updates", async (ending) => {
    const backend = createBackend();
    const stats = createVisitStats({ recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => TODAY });
    const store = createStore();
    const records: Promise<void>[] = [];
    store.subscribe((state) => records.push(stats.trackGamePhase(state.phase)));
    store.dispatch("start-game", { roleId: "normal" });
    const state = store.getState();
    state.eventQueue = [];
    state.totalMonths = 1;
    state.month = 1;
    if (ending === "burnout") state.player.san = -1;
    if (ending === "poor") state.player.money = -1;
    if (ending === "expelled") state.player.favor = -1;
    if (ending === "isolated") state.player.social = -1;
    if (ending === "master" || ending === "phd" || ending === "delay") {
      state.degree = ending === "phd" ? "phd" : "master";
      state.totalMonths = state.maxMonths;
      state.graduationScoreTarget = ending === "phd" ? 7 : 1;
      state.totalResearchScore = ending === "delay" ? 0 : state.graduationScoreTarget;
    }
    store.dispatch(ending === "quit" ? "quit-game" : "next-month");
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    store.dispatch("set-date-display-mode", { dateDisplayMode: "calendar" });
    store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
    store.dispatch("next-month");
    store.dispatch("reset-game");
    await Promise.all(records);
    expect(stats.getDisplayValues().games).toBe("1（1）");
    expect(backend.counters.get(`${PREFIX}_games_total`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_games_${DAY}`)).toBe(1);
  });

  it("counts a page once and keeps visitor totals independent from the homepage", async () => {
    const backend = createBackend();
    const storage = createStorage();
    storage.setItem("kw66_home_visitor_seen_v2", "true");
    const stats = createVisitStats({ recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY });
    expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）", games: "--（--）" });
    await Promise.all([stats.load(), stats.load(), stats.load()]);
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "0（0）" });
    expect(backend.fetch).toHaveBeenCalledTimes(5);
    expect([...backend.counters.keys()]).toEqual(expect.arrayContaining([
      `${PREFIX}_uv_total`, `${PREFIX}_pv_total`, `${PREFIX}_uv_${DAY}`, `${PREFIX}_pv_${DAY}`,
    ]));
    expect(backend.counters.size).toBe(4);
  });

  it("counts refreshes as visits while deduplicating the same browser", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const options = { recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY };
    await createVisitStats(options).load();
    const reloaded = createVisitStats(options);
    expect(reloaded.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "0（0）" });
    await reloaded.load();
    expect(reloaded.getDisplayValues()).toEqual({ visitors: "1（1）", views: "2（2）", games: "0（0）" });
    const otherBrowser = createVisitStats({ ...options, storage: createStorage() });
    await otherBrowser.load();
    expect(otherBrowser.getDisplayValues()).toEqual({ visitors: "2（2）", views: "3（3）", games: "0（0）" });
  });

  it("uses Beijing midnight and never labels yesterday's cached counts as today's", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const beforeMidnight = Date.parse("2026-09-14T15:59:59Z");
    const options = { recordVisit: true, storage, fetch: backend.fetch };
    await createVisitStats({ ...options, now: () => beforeMidnight }).load();
    const tomorrow = createVisitStats({ ...options, now: () => beforeMidnight + 1000 });
    expect(tomorrow.getDisplayValues()).toEqual({ visitors: "1（--）", views: "1（--）", games: "0（--）" });
    await tomorrow.load();
    expect(tomorrow.getDisplayValues()).toEqual({ visitors: "2（1）", views: "2（1）", games: "0（0）" });
    expect(backend.counters.get(`${PREFIX}_uv_2026-09-15`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_uv_total`)).toBe(2);
  });

  it("serializes visitor marking across simultaneously opened tabs when Web Locks are available", async () => {
    let pending = Promise.resolve();
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, callback: () => Promise<void>) => {
          pending = pending.then(callback);
          return pending;
        },
      },
    });
    const backend = createBackend();
    const options = { recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => TODAY };
    await Promise.all([createVisitStats(options).load(), createVisitStats(options).load()]);
    expect(backend.counters.get(`${PREFIX}_uv_total`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_uv_${DAY}`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_pv_total`)).toBe(2);
  });

  it("reads shared totals without recording local development or preview traffic", async () => {
    const backend = createBackend();
    backend.counters.set(`${PREFIX}_uv_total`, 123);
    backend.counters.set(`${PREFIX}_pv_total`, 456);
    backend.counters.set(`${PREFIX}_uv_${DAY}`, 7);
    backend.counters.set(`${PREFIX}_pv_${DAY}`, 8);
    const storage = createStorage();
    const stats = createVisitStats({ recordVisit: false, storage, fetch: backend.fetch, now: () => TODAY });
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "123（7）", views: "456（8）", games: "0（0）" });
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    expect(storage.getItem(`${PREFIX}_visitor_seen`)).toBeNull();
    expect(storage.getItem(`${PREFIX}_visitor_day`)).toBeNull();
    expect(storage.getItem(`${PREFIX}_visitor_total_day`)).toBeNull();
  });

  it("does not mark a failed visitor increment as successfully recorded", async () => {
    const backend = createBackend();
    backend.failedIds.add(`${PREFIX}_uv_total`);
    const storage = createStorage();
    const options = { recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY };
    await createVisitStats(options).load();
    expect(storage.getItem(`${PREFIX}_visitor_total_day`)).toBeNull();
    expect(storage.getItem(`${PREFIX}_visitor_day`)).toBe(DAY);
    backend.failedIds.clear();
    const retried = createVisitStats(options);
    await retried.load();
    expect(retried.getDisplayValues()).toEqual({ visitors: "1（1）", views: "2（2）", games: "0（0）" });
  });

  it("retains a valid cache on failure and leaves unavailable data as placeholders", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const options = { recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY };
    await createVisitStats(options).load();
    backend.fetch.mockRejectedValue(new Error("offline"));
    const cached = createVisitStats(options);
    await cached.load();
    expect(cached.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "0（0）" });
    const unavailable = createVisitStats({ ...options, storage: createStorage() });
    await unavailable.load();
    expect(unavailable.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）", games: "--（--）" });
  });

  it("continues loading when browser storage is blocked", async () => {
    const backend = createBackend();
    const stats = createVisitStats({
      recordVisit: true,
      fetch: backend.fetch,
      now: () => TODAY,
      storage: {
        getItem: () => { throw new Error("storage blocked"); },
        setItem: () => { throw new Error("storage blocked"); },
      },
    });
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "0（0）" });
  });

  it("rejects malformed cache and counter data without displaying invented zero counts", async () => {
    const storage = createStorage();
    storage.setItem(`${PREFIX}_stats_snapshot`, JSON.stringify({ day: DAY, visitors: -1 }));
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([{ id: `${PREFIX}_uv_total`, count: "not a number" }]));
    const stats = createVisitStats({ recordVisit: false, storage, fetch, now: () => TODAY });
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）", games: "--（--）" });
  });

  it("keeps existing visit totals and migrates today's visitor marker without recounting", async () => {
    const backend = createBackend();
    backend.counters.set(`${PREFIX}_uv_total`, 123);
    backend.counters.set(`${PREFIX}_uv_${DAY}`, 7);
    const storage = createStorage();
    storage.setItem(`${PREFIX}_visitor_seen`, "true");
    storage.setItem(`${PREFIX}_visitor_day`, DAY);
    storage.setItem(`${PREFIX}_stats_snapshot`, JSON.stringify({ day: DAY, visitors: 123, views: 456, todayVisitors: 7, todayViews: 8 }));
    const stats = createVisitStats({ recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY });
    expect(stats.getDisplayValues()).toEqual({ visitors: "123（7）", views: "456（8）", games: "--（--）" });
    await stats.load();
    expect(backend.counters.get(`${PREFIX}_uv_total`)).toBe(123);
    expect(stats.getDisplayValues().visitors).toBe("123（7）");
    expect(stats.getDisplayValues().games).toBe("0（0）");
    const tomorrow = createVisitStats({ recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY + 86400000 });
    await tomorrow.load();
    expect(tomorrow.getDisplayValues().visitors).toBe("124（1）");
  });

  it("counts completed games once per ending and does not count starts or abandoned runs", async () => {
    const backend = createBackend();
    const stats = createVisitStats({ recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => TODAY });
    await stats.load();
    for (const phase of ["setup", "playing", "playing", "setup", "playing"] as const) await stats.trackGamePhase(phase);
    expect(stats.getDisplayValues().games).toBe("0（0）");
    await Promise.all([stats.trackGamePhase("finished"), stats.trackGamePhase("finished"), stats.load()]);
    expect(stats.getDisplayValues().games).toBe("1（1）");
    await stats.trackGamePhase("playing");
    await stats.trackGamePhase("finished");
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）", games: "2（2）" });
    expect(backend.counters.size).toBe(6);
  });

  it("serializes fast endings after the initial visit and attributes each to its Beijing date", async () => {
    const backend = createBackend();
    let timestamp = Date.parse("2026-09-14T15:59:59Z");
    const stats = createVisitStats({ recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => timestamp });
    const loading = stats.load();
    await stats.trackGamePhase("playing");
    const first = stats.trackGamePhase("finished");
    timestamp += 1000;
    await stats.trackGamePhase("playing");
    const second = stats.trackGamePhase("finished");
    await Promise.all([loading, first, second]);
    expect(backend.counters.get(`${PREFIX}_games_${DAY}`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_games_2026-09-15`)).toBe(1);
    expect(stats.getDisplayValues().games).toBe("2（1）");
    expect(backend.counters.get(`${PREFIX}_pv_total`)).toBe(1);
  });

  it("does not count endings in local development or a finished state without an active game", async () => {
    const backend = createBackend();
    const stats = createVisitStats({ recordVisit: false, storage: createStorage(), fetch: backend.fetch, now: () => TODAY });
    await stats.load();
    await stats.trackGamePhase("playing");
    await stats.trackGamePhase("finished");
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    const restored = createVisitStats({ recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => TODAY });
    await restored.trackGamePhase("finished");
    expect(backend.counters.has(`${PREFIX}_games_total`)).toBe(false);
  });

  it("does not throw or claim a new game count when the statistics service is offline", async () => {
    const backend = createBackend();
    const stats = createVisitStats({ recordVisit: true, storage: createStorage(), fetch: backend.fetch, now: () => TODAY });
    await stats.load();
    backend.fetch.mockRejectedValue(new Error("offline"));
    await stats.trackGamePhase("playing");
    await expect(stats.trackGamePhase("finished")).resolves.toBeUndefined();
    expect(stats.getDisplayValues().games).toBe("0（0）");
  });
});
