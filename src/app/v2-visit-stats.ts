import type { GamePhase } from "../core/v2-types";

const COUNTER_PREFIX = "phd_simulator_v2";
const STATS_URL = "https://ypefmpeekfucmarbbdov.supabase.co/rest/v1/rpc";
const STATS_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwZWZtcGVla2Z1Y21hcmJiZG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NTA2NTYsImV4cCI6MjA4MTUyNjY1Nn0.XTOQNFuuwfu9nwDTnO9-NEqlzZnzdCVnEmYEJh0rXf8";
const VISITOR_KEY = `${COUNTER_PREFIX}_visitor_seen`;
const DAILY_VISITOR_KEY = `${COUNTER_PREFIX}_visitor_day`;
const TOTAL_VISITOR_DAY_KEY = `${COUNTER_PREFIX}_visitor_total_day`;
const SNAPSHOT_KEY = `${COUNTER_PREFIX}_stats_snapshot`;

interface VisitSnapshot {
  day: string;
  visitors: number;
  views: number;
  todayVisitors: number;
  todayViews: number;
  games: number | null;
  todayGames: number | null;
}

interface VisitStatsOptions {
  recordVisit: boolean;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  fetch?: typeof fetch;
  now?: () => number;
}

function getBeijingDay(timestamp: number): string {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseCounter(value: unknown): number {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new Error("Invalid visit counter");
  }
  return number;
}

export function createVisitStats(options: VisitStatsOptions) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  let snapshot: VisitSnapshot | null = null;
  let pendingLoad: Promise<void> | null = null;
  let pendingGameRecords = Promise.resolve();
  let previousPhase: GamePhase = "setup";

  const readStorage = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const writeStorage = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value);
    } catch {
      return;
    }
  };

  try {
    const cached = JSON.parse(readStorage(SNAPSHOT_KEY) ?? "null");
    if (cached && typeof cached.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cached.day)) {
      snapshot = {
        day: cached.day,
        visitors: parseCounter(cached.visitors),
        views: parseCounter(cached.views),
        todayVisitors: parseCounter(cached.todayVisitors),
        todayViews: parseCounter(cached.todayViews),
        games: cached.games == null ? null : parseCounter(cached.games),
        todayGames: cached.todayGames == null ? null : parseCounter(cached.todayGames),
      };
    }
  } catch {
    snapshot = null;
  }

  const rpc = async (endpoint: string, payload: object): Promise<unknown> => {
    const response = await request(`${STATS_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        apikey: STATS_PUBLIC_KEY,
        Authorization: `Bearer ${STATS_PUBLIC_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Visit statistics unavailable: ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const refresh = async (recordVisit: boolean, completedDay?: string): Promise<void> => {
    const day = getBeijingDay(now());
    const ids = [`${COUNTER_PREFIX}_uv_total`, `${COUNTER_PREFIX}_pv_total`, `${COUNTER_PREFIX}_uv_${day}`, `${COUNTER_PREFIX}_pv_${day}`, `${COUNTER_PREFIX}_games_total`, `${COUNTER_PREFIX}_games_${day}`];
    const increment = (id: string): Promise<unknown> => rpc("increment_counter", { counter_id: id });
    if (recordVisit) {
      const recordVisitor = async (): Promise<void> => {
        if (readStorage(TOTAL_VISITOR_DAY_KEY) === null && readStorage(VISITOR_KEY) === "true" && readStorage(DAILY_VISITOR_KEY) === day) {
          writeStorage(TOTAL_VISITOR_DAY_KEY, day);
        }
        const countOnce = async (id: string, key: string, marker: string): Promise<void> => {
          if (readStorage(key) === marker) return;
          await increment(id);
          writeStorage(key, marker);
        };
        await Promise.allSettled([
          countOnce(ids[0], TOTAL_VISITOR_DAY_KEY, day),
          countOnce(ids[2], DAILY_VISITOR_KEY, day),
        ]);
      };
      const visitorTask = typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request(`${COUNTER_PREFIX}_visitor_lock`, recordVisitor)
        : recordVisitor();
      await Promise.allSettled([increment(ids[1]), increment(ids[3]), visitorTask]);
    }
    if (completedDay) {
      await Promise.allSettled([increment(ids[4]), increment(`${COUNTER_PREFIX}_games_${completedDay}`)]);
    }
    try {
      const rows = await rpc("get_counters", { counter_ids: ids });
      if (!Array.isArray(rows)) throw new Error("Invalid visit statistics response");
      const counters = new Map<string, number>();
      for (const row of rows) {
        if (row && ids.includes(row.id)) counters.set(row.id, parseCounter(row.count));
      }
      snapshot = {
        day,
        visitors: counters.get(ids[0]) ?? 0,
        views: counters.get(ids[1]) ?? 0,
        todayVisitors: counters.get(ids[2]) ?? 0,
        todayViews: counters.get(ids[3]) ?? 0,
        games: counters.get(ids[4]) ?? 0,
        todayGames: counters.get(ids[5]) ?? 0,
      };
      writeStorage(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      return;
    }
  };

  const getDisplayValues = (): { visitors: string; views: string; games: string } => {
    if (!snapshot) return { visitors: "--（--）", views: "--（--）", games: "--（--）" };
    const isToday = snapshot.day === getBeijingDay(now());
    return {
      visitors: `${snapshot.visitors}（${isToday ? snapshot.todayVisitors : "--"}）`,
      views: `${snapshot.views}（${isToday ? snapshot.todayViews : "--"}）`,
      games: `${snapshot.games ?? "--"}（${isToday ? snapshot.todayGames ?? "--" : "--"}）`,
    };
  };

  const load = (): Promise<void> => {
    pendingLoad ??= refresh(options.recordVisit);
    return pendingLoad;
  };

  return {
    load,
    trackGamePhase(phase: GamePhase): Promise<void> {
      const completed = previousPhase === "playing" && phase === "finished";
      previousPhase = phase;
      if (!completed || !options.recordVisit) return Promise.resolve();
      const day = getBeijingDay(now());
      pendingGameRecords = pendingGameRecords.then(async () => {
        await load();
        await refresh(false, day);
      });
      return pendingGameRecords;
    },
    getDisplayValues,
    render(root: ParentNode): void {
      for (const [metric, value] of Object.entries(getDisplayValues())) {
        root.querySelectorAll(`[data-community-stat="${metric}"]`).forEach((target) => {
          target.textContent = value;
        });
      }
    },
  };
}
