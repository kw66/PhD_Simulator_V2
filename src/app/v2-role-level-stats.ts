import { DATA_EPOCH, isCurrentDataEpoch } from "../core/v2-data-epoch";
import { ENABLE_LOCAL_PLAYGROUND } from "../core/v2-development-flags";
import { getRoleOptions } from "../core/v2-progression";
import { MAX_ROLE_LEVEL } from "../core/v2-role-experience";
import type { AccountProfile, RoleId } from "../core/v2-types";
import { isRemoteWriteEnabled } from "./v2-remote-access";

export const ROLE_LEVEL_STATS_STORAGE_KEY = "phd_simulator_v2_role_level_stats_v1";
const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const READ_RPC = "get_phd_simulator_v2_role_level_statistics";
const WRITE_RPC = "record_phd_simulator_v2_role_levels";
const CACHE_MS = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<string>(getRoleOptions().map(role => role.id));
type StatsStorage = Pick<Storage, "getItem" | "setItem">;
interface LevelRow { playerId: string; roleId: RoleId; level: number }
interface RemoteSnapshot { version: 1; epoch: typeof DATA_EPOCH; roles: Partial<Record<RoleId, { counts: number[] }>> }
export interface RoleLevelStatistics {
  counts: number[];
  players: number;
  meanLevel: number | null;
  medianLevel: number | null;
  maxLevelPlayers: number;
}
export interface RoleLevelStatsSnapshot {
  status: "loading" | "ready" | "unavailable";
  data: RoleLevelStatistics | null;
}
export interface RoleLevelStatsOptions {
  uploadEnabled?: boolean;
  fetch?: typeof fetch;
  storage?: StatsStorage | null;
  now?: () => number;
  onChange?: () => void;
}

function browserStorage(): StatsStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function validLevel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ROLE_LEVEL;
}
function validRow(value: unknown): value is LevelRow {
  const row = value as LevelRow;
  return !!row && typeof row.playerId === "string" && UUID.test(row.playerId)
    && ROLES.has(row.roleId) && validLevel(row.level);
}
function parseSnapshot(value: unknown): RemoteSnapshot {
  const data = value as RemoteSnapshot;
  if (!data || data.version !== 1 || data.epoch !== DATA_EPOCH || !data.roles
    || typeof data.roles !== "object" || Array.isArray(data.roles)) throw new Error("Invalid role level statistics");
  const roles: RemoteSnapshot["roles"] = {};
  for (const [roleId, row] of Object.entries(data.roles)) {
    if (!ROLES.has(roleId) || !row || !Array.isArray(row.counts) || row.counts.length !== MAX_ROLE_LEVEL + 1
      || !row.counts.every(count => Number.isSafeInteger(count) && count >= 0)
      || !Number.isSafeInteger(row.counts.reduce((total, count) => total + count, 0))) {
      throw new Error("Invalid level distribution");
    }
    roles[roleId as RoleId] = { counts: [...row.counts] };
  }
  return { version: 1, epoch: DATA_EPOCH, roles };
}
function summarize(counts: number[]): RoleLevelStatistics {
  const players = counts.reduce((sum, count) => sum + count, 0);
  const atRank = (rank: number): number => {
    let seen = 0;
    return counts.findIndex(count => (seen += count) >= rank);
  };
  return {
    counts: [...counts], players,
    meanLevel: players ? counts.reduce((sum, count, level) => sum + count / players * level, 0) : null,
    medianLevel: players ? (atRank(Math.floor((players + 1) / 2)) + atRank(Math.ceil((players + 1) / 2))) / 2 : null,
    maxLevelPlayers: counts[MAX_ROLE_LEVEL]!,
  };
}

/** Latest per-browser levels; account snapshots are merged by maximum, never added. */
export function createRoleLevelStats(options: RoleLevelStatsOptions = {}) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const request = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const uploads = !ENABLE_LOCAL_PLAYGROUND && (options.uploadEnabled ?? (options.fetch !== undefined || isRemoteWriteEnabled()));
  const pending = new Map<string, LevelRow>();
  const acknowledged = new Map<string, LevelRow>();
  let snapshot: RemoteSnapshot | null = null;
  let snapshotReceipt = "";
  let fetchedAt = 0;
  let readRetryAt = 0;
  let uploadRetryAt = 0;
  let failureCount = 0;
  let loading: Promise<void> | null = null;
  let flushing: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let playerId: string | null = null;
  const keyOf = (row: LevelRow): string => `${row.playerId}/${row.roleId}`;
  const mergeRow = (target: Map<string, LevelRow>, row: LevelRow): void => {
    const key = keyOf(row);
    if (!target.has(key) || target.get(key)!.level < row.level) target.set(key, { ...row });
  };
  const prune = (): void => {
    for (const [key, row] of pending) {
      if ((acknowledged.get(key)?.level ?? -1) >= row.level) pending.delete(key);
    }
  };
  // Receipt fingerprints invalidate a cached distribution after a successful
  // upgrade, including upgrades made in another tab at the same timestamp.
  const receiptFingerprint = (): string => [...acknowledged.entries()]
    .map(([key, row]) => `${key}:${row.level}`).sort().join("|");
  const mergeStorage = (): void => {
    try {
      const saved = JSON.parse(storage?.getItem(ROLE_LEVEL_STATS_STORAGE_KEY) ?? "null");
      if (saved?.version !== 1 || !isCurrentDataEpoch(saved)) return;
      if (Array.isArray(saved.acknowledged)) for (const row of saved.acknowledged) {
        if (validRow(row)) mergeRow(acknowledged, row);
      }
      if (Array.isArray(saved.pending)) for (const row of saved.pending) {
        if (validRow(row)) mergeRow(pending, row);
      }
      prune();
      if (saved.snapshot && Number.isFinite(saved.fetchedAt) && saved.fetchedAt <= now()
        && (!snapshot || saved.fetchedAt > fetchedAt)) {
        try {
          snapshot = parseSnapshot(saved.snapshot); fetchedAt = saved.fetchedAt;
          snapshotReceipt = typeof saved.snapshotReceipt === "string" ? saved.snapshotReceipt : "";
        } catch { /* Keep the outbox if a cache is corrupt. */ }
      }
    } catch { /* Storage failure must not block read-only statistics. */ }
  };
  mergeStorage();
  const persist = (): void => {
    if (!storage) return;
    try {
      mergeStorage();
      storage.setItem(ROLE_LEVEL_STATS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH,
        savedAt: new Date(now()).toISOString(), pending: [...pending.values()], acknowledged: [...acknowledged.values()], snapshot, fetchedAt, snapshotReceipt }));
    } catch { /* A later account sync retries a snapshot that could not be persisted. */ }
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
      const response = await request(`${RPC_URL}/${name}`, { method: "POST", keepalive: true,
        headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) throw new Error(`Role level statistics HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  };
  const schedule = (): void => {
    if (!uploads || disposed || timer || !pending.size) return;
    timer = setTimeout(() => { timer = null; void flush(); }, Math.max(500, uploadRetryAt - now()));
  };
  const flush = (): Promise<void> => {
    if (!uploads || disposed) return Promise.resolve();
    mergeStorage();
    if (flushing) return flushing;
    if (!pending.size) return Promise.resolve();
    if (now() < uploadRetryAt) { schedule(); return Promise.resolve(); }
    flushing = (async () => {
      // A local identity reset does not reassign an existing offline upload.
      for (const identity of new Set([...pending.values()].map(row => row.playerId))) {
        if (disposed) break;
        const rows = [...pending.values()].filter(row => row.playerId === identity);
        try {
          const accepted = await rpc(WRITE_RPC, { p_player_id: identity, p_epoch: DATA_EPOCH,
            p_levels: Object.fromEntries(rows.map(row => [row.roleId, row.level])) });
          if (accepted !== true) throw new Error("Level snapshot was not acknowledged");
          for (const row of rows) mergeRow(acknowledged, row);
          prune(); failureCount = 0; uploadRetryAt = 0; readRetryAt = 0; persist();
        } catch {
          failureCount++;
          uploadRetryAt = now() + Math.min(CACHE_MS, 30_000 * 2 ** Math.min(5, failureCount - 1));
          break;
        }
      }
    })().finally(() => { flushing = null; schedule(); });
    return flushing;
  };
  const load = (): Promise<void> => {
    mergeStorage();
    if (disposed || (snapshot && snapshotReceipt === receiptFingerprint() && now() - fetchedAt < CACHE_MS)
      || now() < readRetryAt) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const receipt = receiptFingerprint();
        const received = parseSnapshot(await rpc(READ_RPC, {}));
        if (disposed) return;
        snapshot = received; fetchedAt = now(); snapshotReceipt = receipt; readRetryAt = 0; persist();
      } catch { readRetryAt = now() + 60_000; }
    })().finally(() => { loading = null; if (!disposed) options.onChange?.(); });
    return loading;
  };
  const online = (): void => { void flush(); };
  if (typeof window !== "undefined") window.addEventListener("online", online);
  schedule();
  return {
    async syncAccount(account: AccountProfile): Promise<void> {
      if (!uploads || disposed) return;
      const identity = getPlayerId();
      if (!identity) return;
      mergeStorage();
      for (const role of getRoleOptions()) {
        const progress = account.roleProgress[role.id];
        if (!progress?.unlocked || !validLevel(progress.level)) continue;
        mergeRow(pending, { playerId: identity, roleId: role.id, level: progress.level });
      }
      prune();
      if (pending.size) persist();
      await flush();
    },
    load,
    read(roleId: RoleId): RoleLevelStatsSnapshot {
      const row = snapshot?.roles[roleId];
      return { status: row ? "ready" : loading ? "loading" : "unavailable", data: row ? summarize(row.counts) : null };
    },
    flush,
    dispose(): void {
      disposed = true;
      if (timer) clearTimeout(timer);
      persist();
      if (typeof window !== "undefined") window.removeEventListener("online", online);
    },
  };
}
