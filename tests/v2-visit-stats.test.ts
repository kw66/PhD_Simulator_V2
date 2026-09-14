import { afterEach, describe, expect, it, vi } from "vitest";
import { createVisitStats } from "../src/app/v2-visit-stats";

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
  it("counts a page once and keeps visitor totals independent from the homepage", async () => {
    const backend = createBackend();
    const storage = createStorage();
    storage.setItem("kw66_home_visitor_seen_v2", "true");
    const stats = createVisitStats({ recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY });
    expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）" });
    await Promise.all([stats.load(), stats.load(), stats.load()]);
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）" });
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
    expect(reloaded.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）" });
    await reloaded.load();
    expect(reloaded.getDisplayValues()).toEqual({ visitors: "1（1）", views: "2（2）" });
    const otherBrowser = createVisitStats({ ...options, storage: createStorage() });
    await otherBrowser.load();
    expect(otherBrowser.getDisplayValues()).toEqual({ visitors: "2（2）", views: "3（3）" });
  });

  it("uses Beijing midnight and never labels yesterday's cached counts as today's", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const beforeMidnight = Date.parse("2026-09-14T15:59:59Z");
    const options = { recordVisit: true, storage, fetch: backend.fetch };
    await createVisitStats({ ...options, now: () => beforeMidnight }).load();
    const tomorrow = createVisitStats({ ...options, now: () => beforeMidnight + 1000 });
    expect(tomorrow.getDisplayValues()).toEqual({ visitors: "1（--）", views: "1（--）" });
    await tomorrow.load();
    expect(tomorrow.getDisplayValues()).toEqual({ visitors: "1（1）", views: "2（1）" });
    expect(backend.counters.get(`${PREFIX}_uv_2026-09-15`)).toBe(1);
    expect(backend.counters.get(`${PREFIX}_uv_total`)).toBe(1);
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
    expect(stats.getDisplayValues()).toEqual({ visitors: "123（7）", views: "456（8）" });
    expect(backend.fetch).toHaveBeenCalledTimes(1);
    expect(storage.getItem(`${PREFIX}_visitor_seen`)).toBeNull();
    expect(storage.getItem(`${PREFIX}_visitor_day`)).toBeNull();
  });

  it("does not mark a failed visitor increment as successfully recorded", async () => {
    const backend = createBackend();
    backend.failedIds.add(`${PREFIX}_uv_total`);
    const storage = createStorage();
    const options = { recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY };
    await createVisitStats(options).load();
    expect(storage.getItem(`${PREFIX}_visitor_seen`)).toBeNull();
    expect(storage.getItem(`${PREFIX}_visitor_day`)).toBe(DAY);
    backend.failedIds.clear();
    const retried = createVisitStats(options);
    await retried.load();
    expect(retried.getDisplayValues()).toEqual({ visitors: "1（1）", views: "2（2）" });
  });

  it("retains a valid cache on failure and leaves unavailable data as placeholders", async () => {
    const backend = createBackend();
    const storage = createStorage();
    const options = { recordVisit: true, storage, fetch: backend.fetch, now: () => TODAY };
    await createVisitStats(options).load();
    backend.fetch.mockRejectedValue(new Error("offline"));
    const cached = createVisitStats(options);
    await cached.load();
    expect(cached.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）" });
    const unavailable = createVisitStats({ ...options, storage: createStorage() });
    await unavailable.load();
    expect(unavailable.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）" });
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
    expect(stats.getDisplayValues()).toEqual({ visitors: "1（1）", views: "1（1）" });
  });

  it("rejects malformed cache and counter data without displaying invented zero counts", async () => {
    const storage = createStorage();
    storage.setItem(`${PREFIX}_stats_snapshot`, JSON.stringify({ day: DAY, visitors: -1 }));
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([{ id: `${PREFIX}_uv_total`, count: "not a number" }]));
    const stats = createVisitStats({ recordVisit: false, storage, fetch, now: () => TODAY });
    await stats.load();
    expect(stats.getDisplayValues()).toEqual({ visitors: "--（--）", views: "--（--）" });
  });
});
