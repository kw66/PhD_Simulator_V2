import type { FinalizedRunRecord } from "../core/v2-account-storage";
import { isAchievementAvailableToRole } from "../core/v2-achievement-scope";
import { getRoleOptions } from "../core/v2-progression";
import { getAllAchievementDefinitions } from "../core/v2-role-lobby-meta";
import type { RoleId } from "../core/v2-types";
import { DATA_EPOCH, isCurrentDataEpoch } from "../core/v2-data-epoch";

export const ACHIEVEMENT_STATS_STORAGE_KEY = "phd_simulator_v2_achievement_stats_v2";
const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const READ_RPC = "get_phd_simulator_v2_achievement_stats_v2";
const WRITE_RPC = "record_phd_simulator_v2_achievement_run";
const CACHE_MS = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFINITIONS = new Map(getAllAchievementDefinitions().map(item => [item.id, item]));
const ROLES = new Set<string>(getRoleOptions().map(item => item.id));
type StatsStorage = Pick<Storage, "getItem" | "setItem">;
export interface AchievementGlobalCompletion { achievedPlayers: number; eligiblePlayers: number }
export interface AchievementStatisticsSnapshot extends AchievementGlobalCompletion { id: string }
interface Snapshot { version: 2; epoch: typeof DATA_EPOCH; achievements: AchievementStatisticsSnapshot[] }
interface QueuedRun { p_player_id: string; p_run_id: string; p_role_id: RoleId; p_achievement_ids: string[] }
export interface AchievementStatsOptions {
  enabled?: boolean;
  uploadEnabled?: boolean;
  storage?: StatsStorage | null;
  fetch?: typeof fetch;
  now?: () => number;
  onChange?: () => void;
}
export interface AchievementStatsRead {
  status: "loading" | "ready" | "unavailable";
  data: AchievementGlobalCompletion | null;
}
let activeController: ReturnType<typeof createAchievementStats> | undefined;
export function getAchievementGlobalCompletion(id: string): AchievementGlobalCompletion | undefined {
  return activeController?.read(id).data ?? undefined;
}
function browserStorage(): StatsStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function parseSnapshot(value: unknown): Snapshot {
  const data = value as Snapshot;
  if (!data || data.epoch !== DATA_EPOCH
    || data.version !== 2 || !Array.isArray(data.achievements)) throw new Error("Invalid achievement statistics");
  const seen = new Set<string>();
  const achievements = data.achievements.map(row => {
    if (!row || typeof row.id !== "string" || seen.has(row.id)
      || !Number.isSafeInteger(row.achievedPlayers) || !Number.isSafeInteger(row.eligiblePlayers)
      || row.achievedPlayers < 0 || row.eligiblePlayers < row.achievedPlayers) throw new Error("Invalid achievement counts");
    seen.add(row.id);
    return { id: row.id, achievedPlayers: row.achievedPlayers, eligiblePlayers: row.eligiblePlayers };
  });
  return { version: 2, epoch: DATA_EPOCH, achievements };
}
function validQueuedRun(value: unknown): value is QueuedRun {
  const row = value as QueuedRun;
  return !!row && typeof row.p_player_id === "string" && UUID.test(row.p_player_id)
    && typeof row.p_run_id === "string" && UUID.test(row.p_run_id) && ROLES.has(row.p_role_id)
    && Array.isArray(row.p_achievement_ids) && row.p_achievement_ids.every(id => {
      const definition = DEFINITIONS.get(id);
      return !!definition && isAchievementAvailableToRole(definition.scope, row.p_role_id);
    });
}

/** One account outbox and one batch snapshot; rendering never performs network IO. */
export function createAchievementStats(options: AchievementStatsOptions = {}) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const request = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const enabled = options.enabled !== false;
  const uploads = enabled && options.uploadEnabled !== false;
  let snapshot: Snapshot | null = null;
  let fetchedAt = 0;
  let readRetryAt = 0;
  let queue: QueuedRun[] = [];
  const acknowledgedRuns = new Set<string>();
  const pendingPlayers = new Set<string>();
  const acknowledgedPlayers = new Set<string>();
  let disposed = false;
  let loading: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  let failureCount = 0;
  let uploadRetryAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let playerId: string | null = null;
  const mergeStorage = (): void => {
    try {
      const saved = JSON.parse(storage?.getItem(ACHIEVEMENT_STATS_STORAGE_KEY) ?? "null");
      if (saved?.version === 1 && isCurrentDataEpoch(saved)) {
        if (Array.isArray(saved.acknowledgedPlayers)) for (const id of saved.acknowledgedPlayers) {
          if (typeof id === "string" && UUID.test(id)) acknowledgedPlayers.add(id);
        }
        if (Array.isArray(saved.pendingPlayers)) for (const id of saved.pendingPlayers) {
          if (typeof id === "string" && UUID.test(id)) pendingPlayers.add(id);
        }
        for (const id of acknowledgedPlayers) pendingPlayers.delete(id);
        if (Array.isArray(saved.acknowledgedRuns)) for (const id of saved.acknowledgedRuns) {
          if (typeof id === "string" && UUID.test(id)) acknowledgedRuns.add(id);
        }
        const pending = new Map(queue.map(row => [row.p_run_id, row]));
        if (Array.isArray(saved.pending)) for (const row of saved.pending) {
          if (validQueuedRun(row) && !pending.has(row.p_run_id)) pending.set(row.p_run_id, row);
        }
        queue = [...pending.values()].filter(row => !acknowledgedRuns.has(row.p_run_id));
        if (saved.snapshot && Number.isFinite(saved.fetchedAt) && saved.fetchedAt <= now()
          && (!snapshot || saved.fetchedAt > fetchedAt)) {
          try { snapshot = parseSnapshot(saved.snapshot); fetchedAt = saved.fetchedAt; } catch { /* Ignore old denominator caches, retain outbox. */ }
        }
      }
    } catch { /* A corrupt cache must not prevent account outbox replay. */ }
  };
  mergeStorage();
  const persistPending = (): boolean => {
    try {
      if (!storage) return false;
      // A stale tab must neither erase another tab's outbox nor restore a run
      // already acknowledged by the server. Receipts also make account replay safe.
      mergeStorage();
      storage.setItem(ACHIEVEMENT_STATS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: new Date(now()).toISOString(), pending: queue,
        acknowledgedRuns: [...acknowledgedRuns], pendingPlayers: [...pendingPlayers],
        acknowledgedPlayers: [...acknowledgedPlayers], snapshot, fetchedAt }));
      return true;
    } catch { return false; }
  };
  const getPlayerId = (): string | null => {
    if (playerId) return playerId;
    try {
      const stored = storage?.getItem(VISITOR_KEY);
      if (stored && UUID.test(stored)) return playerId = stored;
      if (!storage || !globalThis.crypto?.randomUUID) return null;
      const generated = globalThis.crypto.randomUUID();
      storage.setItem(VISITOR_KEY, generated);
      return playerId = generated;
    } catch { return null; }
  };
  const rpc = async (name: string, body: object): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(`${RPC_URL}/${name}`, {
        method: "POST", headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal, keepalive: true,
      });
      if (!response.ok) throw new Error(`Achievement statistics HTTP ${response.status}`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally { clearTimeout(timeout); }
  };
  const scheduleFlush = (delay = 500): void => {
    if (!uploads || disposed || timer || (queue.length === 0 && pendingPlayers.size === 0)) return;
    timer = setTimeout(() => { timer = null; void flush(); }, Math.max(delay, uploadRetryAt - now()));
  };
  const flush = (): Promise<void> => {
    mergeStorage();
    if (flushing) return flushing;
    if (!uploads || disposed || (queue.length === 0 && pendingPlayers.size === 0)) return Promise.resolve();
    if (now() < uploadRetryAt) { scheduleFlush(); return Promise.resolve(); }
    flushing = (async () => {
      for (const id of [...pendingPlayers].slice(0, 20)) {
        if (disposed) break;
        try {
          if (await rpc("record_phd_simulator_v2_achievement_start", { p_player_id: id, p_epoch: DATA_EPOCH }) !== true) throw new Error("Start was not acknowledged");
          acknowledgedPlayers.add(id); pendingPlayers.delete(id);
          failureCount = 0; uploadRetryAt = 0; persistPending();
        } catch {
          failureCount++;
          uploadRetryAt = now() + Math.min(CACHE_MS, 30_000 * 2 ** Math.min(5, failureCount - 1));
          return;
        }
      }
      // Bound each batch so an offline backlog cannot monopolise the connection.
      for (const row of queue.slice(0, 20)) {
        if (disposed) break;
        try {
          if (await rpc(WRITE_RPC, { ...row, p_epoch: DATA_EPOCH }) !== true) throw new Error("Achievement run was not acknowledged");
          acknowledgedRuns.add(row.p_run_id);
          queue = queue.filter(item => item.p_run_id !== row.p_run_id);
          failureCount = 0; uploadRetryAt = 0;
          persistPending();
        } catch {
          failureCount++;
          uploadRetryAt = now() + Math.min(CACHE_MS, 30_000 * 2 ** Math.min(5, failureCount - 1));
          break;
        }
      }
    })().finally(() => { flushing = null; scheduleFlush(); });
    return flushing;
  };
  const load = (): Promise<void> => {
    if (!enabled || disposed || (snapshot && now() - fetchedAt < CACHE_MS) || now() < readRetryAt) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const received = parseSnapshot(await rpc(READ_RPC, {}));
        if (disposed) return;
        snapshot = received; fetchedAt = now(); readRetryAt = 0; persistPending();
      } catch { readRetryAt = now() + 60_000; }
      if (!disposed) options.onChange?.();
    })().finally(() => { loading = null; });
    return loading;
  };
  const online = (): void => { void flush(); };
  if (typeof window !== "undefined") window.addEventListener("online", online);
  const result = {
    read(id: string): AchievementStatsRead {
      const row = snapshot?.achievements.find(item => item.id === id);
      return { status: row ? "ready" : loading ? "loading" : "unavailable", data: row
        ? { achievedPlayers: row.achievedPlayers, eligiblePlayers: row.eligiblePlayers } : null };
    },
    load,
    recordStartedPlayer(): boolean {
      if (!uploads || disposed) return false;
      const identity = getPlayerId();
      if (!identity) return false;
      mergeStorage();
      if (!acknowledgedPlayers.has(identity)) pendingPlayers.add(identity);
      const persisted = persistPending(); scheduleFlush(); return persisted;
    },
    recordFinalizedRun(record: FinalizedRunRecord): boolean {
      if (!uploads || disposed || record.debugUsed || record.state.phase !== "finished" || !record.state.ending
        || !UUID.test(record.runId) || !ROLES.has(record.state.selectedRoleId)) return false;
      const identity = getPlayerId();
      if (!identity) return false;
      mergeStorage();
      if (acknowledgedRuns.has(record.runId)) return persistPending();
      if (!queue.some(item => item.p_run_id === record.runId)) {
        const ids = [...new Set([...(record.state.runAchievementIds ?? []), ...(record.state.achievementProgress?.satisfied ?? [])])].filter(id => {
          const definition = DEFINITIONS.get(id);
          return definition && isAchievementAvailableToRole(definition.scope, record.state.selectedRoleId);
        });
        queue.push({ p_player_id: identity, p_run_id: record.runId, p_role_id: record.state.selectedRoleId, p_achievement_ids: ids });
      }
      const persisted = persistPending();
      scheduleFlush();
      return persisted;
    },
    persistPending,
    flush,
    dispose(): void {
      disposed = true;
      if (timer) clearTimeout(timer);
      persistPending();
      if (typeof window !== "undefined") window.removeEventListener("online", online);
      if (activeController === result) activeController = undefined;
    },
  };
  activeController = result;
  scheduleFlush();
  return result;
}
