import { getRoleOptions } from "../core/v2-progression";
import type { EndingId, GamePhase, RoleId } from "../core/v2-types";
import { DATA_EPOCH } from "../core/v2-data-epoch";
import { createStatisticsClient, type StatisticsClient } from "./v2-statistics-client";

const STATS_RPC = "get_phd_simulator_v2_activity_stats";
const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_IDS = getRoleOptions().map((role) => role.id);

interface RoleCounters { games: number; finished: number; clears: number; phd: number }
interface RoleRunResult {
  roleId: RoleId;
  ending: EndingId;
  runKey?: string;
  disqualifiedByDebug?: boolean;
  finalized?: boolean;
  /** Stable account outbox identity shared with achievement finalization. */
  finalizedRunId?: string;
}
interface VisitSnapshot {
  version: 2;
  epoch: typeof DATA_EPOCH;
  day: string;
  views: number;
  todayViews: number;
  visitors: number;
  todayVisitors: number;
  games: number;
  todayGames: number;
  roles: Record<RoleId, RoleCounters>;
}
interface VisitStatsOptions {
  recordVisit: boolean;
  client?: StatisticsClient;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  fetch?: typeof fetch;
  now?: () => number;
  onChange?: () => void;
}

function getBeijingDay(timestamp: number): string {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getBrowserStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function parseSnapshot(value: unknown, day: string): VisitSnapshot {
  if (!value || typeof value !== "object") throw new Error("Missing activity statistics");
  const data = value as VisitSnapshot;
  const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  // Older responses omitted proven historical starts. A cache-key change alone
  // cannot detect a response fetched while the database deployment was pending.
  if (data.version !== 2 || data.epoch !== DATA_EPOCH || data.day !== day || !count(data.views) || !count(data.todayViews) || data.todayViews > data.views
    || !count(data.visitors) || !count(data.todayVisitors) || data.todayVisitors > data.visitors
    || !count(data.games) || !count(data.todayGames) || data.todayGames > data.games
    || !data.roles || typeof data.roles !== "object" || Array.isArray(data.roles)) throw new Error("Invalid activity statistics");
  const roles = Object.fromEntries(ROLE_IDS.map((roleId) => {
    const role = data.roles[roleId];
    if (role === undefined) return [roleId, { games: 0, finished: 0, clears: 0, phd: 0 }];
    if (!role || !count(role.games) || !count(role.finished) || !count(role.clears) || !count(role.phd)
      || role.phd > role.clears || role.clears > role.finished) throw new Error("Invalid role activity statistics");
    return [roleId, { games: role.games, finished: role.finished, clears: role.clears, phd: role.phd }];
  })) as Record<RoleId, RoleCounters>;
  return { version: 2, epoch: DATA_EPOCH, day, views: data.views, todayViews: data.todayViews, visitors: data.visitors,
    todayVisitors: data.todayVisitors, games: data.games, todayGames: data.todayGames, roles };
}

export function createVisitStats(options: VisitStatsOptions) {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  const client = options.client ?? createStatisticsClient({ storage, fetch: options.fetch });
  const now = options.now ?? Date.now;
  let snapshot: VisitSnapshot | null = null;
  let pendingLoad: Promise<void> | null = null;
  let initialLoadStarted = false;
  let previousPhase: GamePhase = "setup";
  let currentRun: string | null = null;
  let disposed = false;

  const readDay = (day: string): VisitSnapshot | null =>
    client.read(STATS_RPC, { p_day: day }, (value) => parseSnapshot(value, day)).data;
  const getSnapshot = (): VisitSnapshot | null => {
    if (disposed) return snapshot;
    snapshot = readDay(getBeijingDay(now())) ?? snapshot ?? readDay(getBeijingDay(now() - 86_400_000));
    return snapshot;
  };
  const refresh = async (): Promise<void> => {
    if (disposed) return;
    const day = getBeijingDay(now());
    await client.load(STATS_RPC, { p_day: day }, (value) => parseSnapshot(value, day));
    if (!disposed) { getSnapshot(); options.onChange?.(); }
  };
  const unsubscribeActivityWrites = client.subscribeActivityWrites(refresh);
  const recordPageVisit = async (): Promise<void> => {
    if (!options.recordVisit) return;
    const getVisitor = (): string => {
      let visitor: string | null = null;
      try { visitor = storage?.getItem(VISITOR_KEY) ?? null; } catch { /* Storage may be unavailable. */ }
      if (visitor && UUID_PATTERN.test(visitor)) return visitor;
      visitor = globalThis.crypto.randomUUID();
      try { storage?.setItem(VISITOR_KEY, visitor); } catch { /* Keep this page usable without storage. */ }
      return visitor;
    };
    try {
      const visitor = typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request(`${VISITOR_KEY}_lock`, getVisitor)
        : getVisitor();
      if (disposed) return;
      const page = globalThis.crypto.randomUUID();
      client.enqueue("activity", "activity-visit", page, { p_event: "visit", p_day: getBeijingDay(now()), p_visitor_id: visitor });
    } catch { /* Do not invent an identity when secure randomness is unavailable. */ }
  };
  const load = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pendingLoad) return pendingLoad;
    const first = !initialLoadStarted;
    initialLoadStarted = true;
    pendingLoad = (async () => {
      if (first && options.recordVisit) {
        await recordPageVisit();
        if (disposed) return;
        await client.flush();
      }
      await refresh();
    })().finally(() => { pendingLoad = null; });
    return pendingLoad;
  };
  const getDisplayValues = (): { visitors: string; views: string; games: string } => {
    const data = getSnapshot();
    if (!data) return { visitors: "--（--）", views: "--（--）", games: "--（--）" };
    const today = data.day === getBeijingDay(now());
    return { visitors: `${data.visitors}（${today ? data.todayVisitors : "--"}）`,
      views: `${data.views}（${today ? data.todayViews : "--"}）`, games: `${data.games}（${today ? data.todayGames : "--"}）` };
  };
  const getRoleDisplayValues = (roleId: RoleId): Record<"global-completed-runs" | "global-played-runs" | "phd-rate", string> => {
    const counters = getSnapshot()?.roles[roleId];
    if (!counters) return { "global-completed-runs": "--", "global-played-runs": "--", "phd-rate": "--" };
    return { "global-completed-runs": String(counters.clears), "global-played-runs": String(counters.games),
      "phd-rate": counters.finished > 0 ? `${(counters.phd / counters.finished * 100).toFixed(1)}%` : "--" };
  };

  return {
    load,
    restoreRun(run: string, qualification: { debugUsed: boolean }): void {
      if (disposed) return;
      if (qualification.debugUsed) client.markDebug(run);
      else {
        client.restoreRunQualification(run);
        // A debug branch may have removed an unsent start. Its original receipt,
        // when already uploaded, still prevents a duplicate after the rewind.
        previousPhase = "setup";
        currentRun = null;
      }
    },
    trackGamePhase(phase: GamePhase, result?: RoleRunResult): Promise<void> {
      if (disposed) return Promise.resolve();
      const run = result?.runKey;
      const validRun = typeof run === "string" && run.length > 0 && run.length <= 160
        && result !== undefined && ROLE_IDS.includes(result.roleId);
      const started = phase === "playing" && validRun && (previousPhase !== "playing" || currentRun !== run);
      const finished = phase === "finished" && validRun && result.finalized === true;
      const changedPhase = phase !== previousPhase;
      if (validRun && result.disqualifiedByDebug) {
        client.markDebug(run);
        // Clear queued starts from clients created before starts shared the run key.
        client.markDebug(`activity-start:${run}`);
      }
      if (options.recordVisit && validRun && !result.disqualifiedByDebug && !client.isDebugRun(run)) {
        const payload = { p_day: getBeijingDay(now()), p_run_key: run, p_role_id: result.roleId };
        if (started) client.enqueue("activity", run, "start", { ...payload, p_event: "start" });
        if (finished && result.ending && !result.disqualifiedByDebug) {
          client.enqueue("activity", run, "finish", { ...payload, p_event: "finish", p_ending: result.ending }, result.finalizedRunId);
        }
      }
      previousPhase = phase;
      if (phase === "setup") currentRun = null;
      else if (validRun) currentRun = run;
      return started || (changedPhase && (phase === "setup" || phase === "finished")) ? refresh() : Promise.resolve();
    },
    getDisplayValues,
    getRoleDisplayValues,
    flush: () => options.recordVisit && !disposed ? client.flush() : Promise.resolve(),
    dispose() { disposed = true; unsubscribeActivityWrites(); if (!options.client) client.dispose(); },
    render(root: ParentNode): void {
      for (const [metric, value] of Object.entries(getDisplayValues())) {
        root.querySelectorAll(`[data-community-stat="${metric}"]`).forEach((target) => { target.textContent = value; });
      }
      for (const roleId of ROLE_IDS) for (const [metric, value] of Object.entries(getRoleDisplayValues(roleId))) {
        root.querySelectorAll(`[data-role-stat="${metric}"][data-role-id="${roleId}"]`).forEach((target) => { target.textContent = value; });
      }
    },
  };
}
