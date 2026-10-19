import { getRoleOptions } from "../core/v2-progression";
import { DATA_EPOCH, isCurrentDataEpoch } from "../core/v2-data-epoch";
import { validStatisticsContext } from "./v2-statistics-context";
import { isRemoteWriteEnabled } from "./v2-remote-access";

export const STATISTICS_CACHE_MS = 10 * 60_000;
export const ACTIVITY_RETENTION_DAYS = 30;
const READ_RETRY_MS = 60_000;
const UPLOAD_INTERVAL_MS = 30_000;
const BATCH_DELAY_MS = 500;
const MAX_BATCH_SIZE = 50;
const SNAPSHOT_RPC = "get_phd_simulator_v2_stats_snapshot";
export const STATISTICS_STORAGE_KEY = "phd_simulator_v2_statistics_v2";
const STORAGE_KEY = STATISTICS_STORAGE_KEY;
const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StatisticsKind = "conference" | "journal" | "thesis" | "activity";
const STATISTICS_KINDS: StatisticsKind[] = ["conference", "journal", "thesis", "activity"];
const ROLE_IDS = new Set<string>(getRoleOptions().map((role) => role.id));
const ENDINGS = new Set(["master", "phd", "delay", "burnout", "poor", "expelled", "isolated", "overthinking", "lab-bankrupt", "quit"]);
const ACTIVITY_RPC = "get_phd_simulator_v2_activity_stats";
type StatisticsStorage = Pick<Storage, "getItem" | "setItem">;
type Payload = Record<string, unknown> & { p_id: string };
export interface StatisticsSnapshot<T> { status: "loading" | "ready" | "unavailable"; data: T | null }
interface CachedStats { data: unknown; fetchedAt: number; retryAt: number; stale?: boolean }
interface QueuedResult { kind: StatisticsKind; run: string; id: string; payload?: Payload; activityDay?: string; rejected?: "future-date" }
interface DebugQualification { revision: number; debugUsed: boolean }

class ActivityDateRejection extends Error {
  readonly ids: string[];
  constructor(ids: string[]) {
    super("Activity date rejected by the server");
    this.ids = ids;
  }
}

export interface StatisticsClientOptions {
  enabled?: boolean;
  uploadEnabled?: boolean;
  fetch?: typeof fetch;
  storage?: StatisticsStorage | null;
  onChange?: (rpc: string) => void;
}

export interface StatisticsClient {
  startRun(run: string): Promise<void>;
  read<T>(rpc: string, key: object, parse: (value: unknown) => T): StatisticsSnapshot<T>;
  load<T>(rpc: string, key: object, parse: (value: unknown) => T): Promise<void>;
  enqueue(kind: StatisticsKind, run: string, fingerprint: string, payload: object): boolean;
  flush(): Promise<void>;
  persistPending(): boolean;
  markDebug(run: string | null): void;
  /** Only call after loading an authoritative clean snapshot. Does not recreate discarded results. */
  restoreRunQualification(run: string): void;
  isDebugRun(run: string): boolean;
  subscribeActivityWrites(listener: () => Promise<void>): () => void;
  dispose(): void;
}

interface RunStatistics {
  version: 1;
  conference: Array<{ name: string; year: number; target: string; stats: Record<string, unknown> }>;
  journals: Record<string, unknown>;
  theses: Record<string, unknown>;
}

const EMPTY_CONFERENCE_STATS = {
  submissions: 0, accepted: 0,
  counts: { Poster: 0, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
  means: { Reject: null, Poster: null, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null },
};

function parseRunStatistics(value: unknown): RunStatistics {
  if (!value || typeof value !== "object") throw new Error("Missing statistics snapshot");
  const snapshot = value as RunStatistics;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (snapshot.version !== 1 || !Array.isArray(snapshot.conference) || !snapshot.journals || !snapshot.theses
    || !["nature", "nmi", "pami"].every((key) => {
      const data = record(snapshot.journals[key]);
      return count(data.acceptedCount) && (data.acceptedCount === 0 ? data.meanScore === null && data.meanMonths === null : number(data.meanScore) && number(data.meanMonths));
    }) || !["master", "phd"].every((key) => {
      const data = record(snapshot.theses[key]);
      return count(data.submittedCount) && count(data.passedCount) && count(data.excellentCount) && count(data.notSubmittedCount)
        && data.excellentCount <= data.passedCount && data.passedCount <= data.submittedCount;
    })) throw new Error("Incomplete statistics snapshot");
  const seen = new Set<string>();
  for (const row of snapshot.conference) {
    const data = record(row?.stats);
    const counts = record(data.counts);
    const means = record(data.means);
    const keys = Object.keys(EMPTY_CONFERENCE_STATS.counts);
    const id = JSON.stringify([row?.name, row?.year, row?.target]);
    if (!row || typeof row.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$/.test(row.name)
      || !Number.isInteger(row.year) || row.year < 2000 || row.year > 2100 || !["A", "B", "C"].includes(row.target) || seen.has(id)
      || !count(data.submissions) || !count(data.accepted) || data.accepted > data.submissions
      || !keys.every((key) => count(counts[key]) && (counts[key] === 0 ? means[key] === null : number(means[key])))
      || keys.reduce((sum, key) => sum + Number(counts[key]), 0) !== data.accepted
      || (data.submissions === data.accepted ? means.Reject !== null : !number(means.Reject))) {
      throw new Error("Invalid conference snapshot");
    }
    seen.add(id);
  }
  return snapshot;
}

function browserStorage(): StatisticsStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// Restored queue items are validated before a malformed row can block an entire batch.
function validPayload(kind: StatisticsKind, value: unknown): value is Payload {
  if (!value || typeof value !== "object") return false;
  const p = value as Payload;
  if (typeof p.p_id !== "string" || !UUID_PATTERN.test(p.p_id)) return false;
  if (kind === "activity") {
    if (typeof p.p_day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.p_day)
      || !Number.isFinite(Date.parse(p.p_day)) || new Date(p.p_day).toISOString().slice(0, 10) !== p.p_day) return false;
    if (p.p_event === "visit") return typeof p.p_visitor_id === "string" && UUID_PATTERN.test(p.p_visitor_id)
      && p.p_run_key == null && p.p_role_id == null && p.p_ending == null;
    if (typeof p.p_run_key !== "string" || p.p_run_key.length < 1 || p.p_run_key.length > 160
      || typeof p.p_role_id !== "string" || !ROLE_IDS.has(p.p_role_id) || p.p_visitor_id != null) return false;
    try {
      const run = JSON.parse(p.p_run_key);
      if (!Array.isArray(run) || run.length !== 2 || typeof run[0] !== "number" || !Number.isFinite(run[0]) || run[1] !== p.p_role_id) return false;
    } catch { return false; }
    return (p.p_event === "start" && p.p_ending == null)
      || (p.p_event === "finish" && typeof p.p_ending === "string" && ENDINGS.has(p.p_ending));
  }
  const score = typeof p.p_score === "number" && Number.isFinite(p.p_score) && p.p_score >= 0 && p.p_score <= 1_000_000;
  if ((kind === "conference" || kind === "journal") && !validStatisticsContext(p.p_context, p.p_score)) return false;
  if (kind === "conference") return p.p_rule_version === "v2-review-20261009"
    && typeof p.p_conference_name === "string" && /^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$/.test(p.p_conference_name)
    && Number.isInteger(p.p_conference_year) && Number(p.p_conference_year) >= 2000 && Number(p.p_conference_year) <= 2100
    && ["A", "B", "C"].includes(String(p.p_target)) && score && typeof p.p_accepted === "boolean"
    && (p.p_accepted ? ["Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"].includes(String(p.p_accept_type)) : p.p_accept_type === null);
  if (kind === "journal") return p.p_rule_version === "v2-journal-20261012"
    && ["pami", "nmi", "nature"].includes(String(p.p_journal)) && score
    && Number.isInteger(p.p_months) && Number(p.p_months) >= 0 && Number(p.p_months) <= 120;
  return p.p_rule_version === "v2-thesis-20261013" && ["master", "phd"].includes(String(p.p_degree))
    && typeof p.p_submitted === "boolean" && typeof p.p_passed === "boolean" && typeof p.p_excellent === "boolean"
    && (!p.p_passed || p.p_submitted) && (!p.p_excellent || p.p_passed);
}

export function createStatisticsClient(options: StatisticsClientOptions = {}): StatisticsClient {
  const enabled = options.enabled !== false;
  const uploadEnabled = enabled && (options.uploadEnabled ?? (options.fetch !== undefined || isRemoteWriteEnabled()));
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const cache = new Map<string, CachedStats>();
  const results = new Map<string, QueuedResult>();
  const activityWriteListeners = new Set<() => Promise<void>>();
  const runSnapshots = new Map<string, RunStatistics>();
  const rememberRunSnapshot = (run: string, snapshot: RunStatistics): void => {
    // Keep the current run of every role, including roles left suspended for months.
    // New runs may replace that role's completed snapshot, never another role's save.
    try {
      const role = JSON.parse(run)[1];
      if (typeof role !== "string" || !ROLE_IDS.has(role)) return;
      for (const key of runSnapshots.keys()) if (key !== run && JSON.parse(key)[1] === role) runSnapshots.delete(key);
      runSnapshots.set(run, snapshot);
    } catch { /* Invalid run identities cannot occupy persistent snapshot slots. */ }
  };
  const debugRuns = new Set<string>();
  // Clean revisions are tombstones: an older tab must not restore a stale debug exclusion.
  const debugQualifications = new Map<string, DebugQualification>();
  const pendingReads = new Map<string, Promise<void>>();
  let pendingUpload: Promise<void> | null = null;
  let uploadTimer: ReturnType<typeof setTimeout> | null = null;
  let nextUploadAt = 0;
  let failures = 0;
  let uploadChangedAt = 0;
  let disposed = false;
  let activeRun: string | null = null;
  let runSnapshot: RunStatistics | null = null;
  let runStatus: "loading" | "ready" | "unavailable" = "loading";
  let runLoad: Promise<void> = Promise.resolve();
  const activityExpired = (row: QueuedResult): boolean => {
    const day = row.activityDay ?? row.payload?.p_day;
    const cutoff = new Date(Date.now() + 8 * 60 * 60_000 - ACTIVITY_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    return row.kind === "activity" && typeof day === "string" && day < cutoff;
  };

  const mergeStorage = (): void => {
    if (!enabled || disposed) return;
    try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (saved?.version === 1 && isCurrentDataEpoch(saved)) {
      if (Array.isArray(saved.runSnapshots)) for (const entry of saved.runSnapshots.slice(-40)) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || runSnapshots.has(entry[0])) continue;
        try {
          const role = JSON.parse(entry[0])[1];
          if ([...runSnapshots.keys()].some((key) => JSON.parse(key)[1] === role)) continue;
          rememberRunSnapshot(entry[0], parseRunStatistics(entry[1]));
        } catch { /* Ignore damaged run snapshots. */ }
      }
      if (Array.isArray(saved.debugQualifications)) for (const entry of saved.debugQualifications) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string"
          || !entry[1] || !Number.isSafeInteger(entry[1].revision) || entry[1].revision < 0
          || typeof entry[1].debugUsed !== "boolean") continue;
        const [run, incoming] = entry as [string, DebugQualification];
        const current = debugQualifications.get(run);
        if (!current || incoming.revision > current.revision
          || (incoming.revision === current.revision && incoming.debugUsed)) {
          debugQualifications.set(run, { revision: incoming.revision, debugUsed: incoming.debugUsed });
          if (incoming.debugUsed) debugRuns.add(run);
          else debugRuns.delete(run);
        }
      }
      if (Array.isArray(saved.debugRuns)) for (const run of saved.debugRuns) {
        if (typeof run === "string" && !debugQualifications.has(run)) {
          debugRuns.add(run);
          debugQualifications.set(run, { revision: 0, debugUsed: true });
        }
      }
      if (Array.isArray(saved.results)) for (const entry of saved.results) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key !== "string" || !value || !STATISTICS_KINDS.includes(value.kind)
          || typeof value.run !== "string" || debugRuns.has(value.run)
          || typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
          || (value.payload !== undefined && (!validPayload(value.kind, value.payload) || value.payload.p_id !== value.id))) continue;
        if (activityExpired(value)) continue;
        const current = results.get(key);
        if (!current || (current.payload !== undefined && (value.payload === undefined || current.id !== value.id))) results.set(key, value);
      }
      if (Array.isArray(saved.cache)) for (const entry of saved.cache.slice(-128)) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key === "string" && value && Number.isFinite(value.fetchedAt) && Number.isFinite(value.retryAt)
          && value.fetchedAt <= Date.now() && (!cache.has(key) || value.fetchedAt > cache.get(key)!.fetchedAt)) cache.set(key, value);
      }
      if (Number.isFinite(saved.nextUploadAt) && (!uploadChangedAt || saved.uploadChangedAt > uploadChangedAt)) {
        nextUploadAt = Math.min(saved.nextUploadAt, Date.now() + STATISTICS_CACHE_MS);
        if (Number.isInteger(saved.failures)) failures = Math.min(Math.max(saved.failures, 0), 5);
        uploadChangedAt = Number.isFinite(saved.uploadChangedAt) ? saved.uploadChangedAt : 0;
      }
      for (const [key, row] of results) if (activityExpired(row) || (row.payload && debugRuns.has(row.run))) results.delete(key);
    }
    } catch { /* Unavailable browser storage never blocks the game. */ }
  };
  mergeStorage();

  const persist = (): boolean => {
    if (!enabled) return true;
    if (disposed || !storage) return false;
    mergeStorage();
    while (cache.size > 128) cache.delete(cache.keys().next().value!);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: new Date().toISOString(), runSnapshots: [...runSnapshots], results: [...results], debugRuns: [...debugRuns], debugQualifications: [...debugQualifications], cache: [...cache], nextUploadAt, failures, uploadChangedAt }));
      return true;
    } catch { return false; }
  };
  const rpc = async (name: string, payload: object): Promise<unknown> => {
    const response = await request(`${RPC_URL}/${name}`, { method: "POST",
      headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000), keepalive: true });
    if (!response.ok) {
      if (name === "record_phd_simulator_v2_stats_batch" && response.status === 422) {
        let rejected: string[] | null = null;
        try {
          const error = await response.json();
          const details = JSON.parse(error.details);
          if (error.code === "PT422" && details.reason === "activity-future-date"
            && Array.isArray(details.ids) && details.ids.length > 0 && details.ids.length <= MAX_BATCH_SIZE
            && details.ids.every((id: unknown) => typeof id === "string" && UUID_PATTERN.test(id))
            && new Set(details.ids).size === details.ids.length) rejected = details.ids;
        } catch { /* Unknown errors retain the batch and use normal backoff. */ }
        if (rejected) throw new ActivityDateRejection(rejected);
      }
      throw new Error(`Statistics unavailable: ${response.status}`);
    }
    const data: unknown = await response.json();
    if (name.startsWith("get_phd_simulator_v2_") && (!data || typeof data !== "object"
      || (data as Record<string, unknown>).epoch !== DATA_EPOCH)) throw new Error("Statistics epoch mismatch");
    return data;
  };
  // Keep activity snapshots in the same namespace as the server data epoch.
  // This also discards responses cached by the superseded historical-starts
  // endpoint, which did not read the current epoch counters.
  const cacheKey = (name: string, key: object): string => JSON.stringify(
    name === ACTIVITY_RPC ? [name, key, `activity-${DATA_EPOCH}`] : [name, key]);
  const activityCachePrefix = `["${ACTIVITY_RPC}",`;
  const readCached: StatisticsClient["read"] = (name, key, parse) => {
    if (!enabled || disposed) return { status: "unavailable", data: null };
    const entry = cache.get(cacheKey(name, key));
    if (entry?.data != null) try { return { status: "ready", data: parse(structuredClone(entry.data)) }; }
    catch {
      // Keep its timestamp so merging storage cannot resurrect the rejected data.
      // A failed replacement read will then retain its normal retry deadline.
      entry.data = null;
      entry.retryAt = 0;
    }
    return { status: entry?.retryAt && entry.retryAt > Date.now() ? "unavailable" : "loading", data: null };
  };
  const loadCached: StatisticsClient["load"] = (name, key, parse) => {
    if (!enabled || disposed) return Promise.resolve();
    const id = cacheKey(name, key);
    const pending = pendingReads.get(id);
    if (pending) return pending;
    const previous = readCached(name, key, parse).data;
    const entry = cache.get(id);
    if (entry && (entry.retryAt > Date.now() || (!entry.stale && previous !== null && Date.now() - entry.fetchedAt < STATISTICS_CACHE_MS))) return Promise.resolve();
    const work = rpc(name, key).then((value) => {
      cache.set(id, { data: parse(value), fetchedAt: Date.now(), retryAt: 0 });
    }).catch(() => {
      cache.set(id, { data: previous, fetchedAt: entry?.fetchedAt ?? 0, retryAt: Date.now() + READ_RETRY_MS,
        ...(entry?.stale ? { stale: true } : {}) });
    }).finally(() => {
      pendingReads.delete(id);
      persist();
      if (!disposed && name !== SNAPSHOT_RPC) options.onChange?.(name);
    });
    pendingReads.set(id, work);
    return work;
  };
  const hasPending = (): boolean => [...results.values()].some((row) => row.payload !== undefined && !debugRuns.has(row.run));
  const schedule = (): void => {
    if (!uploadEnabled || disposed || pendingUpload || uploadTimer !== null || !hasPending()) return;
    uploadTimer = setTimeout(() => { uploadTimer = null; void flush(); }, Math.max(BATCH_DELAY_MS, nextUploadAt - Date.now()));
  };
  const flush = (): Promise<void> => {
    mergeStorage();
    if (!uploadEnabled || disposed || !hasPending()) return Promise.resolve();
    if (pendingUpload) return pendingUpload;
    if (Date.now() < nextUploadAt) { schedule(); return Promise.resolve(); }
    if (uploadTimer !== null) { clearTimeout(uploadTimer); uploadTimer = null; }
    let batch = [...results.entries()].filter(([, row]) => row.payload && !debugRuns.has(row.run)).slice(0, MAX_BATCH_SIZE);
    let activityChanged = false;
    pendingUpload = (async () => {
      try {
        while (batch.length > 0) {
          let response: unknown;
          try {
            response = await rpc("record_phd_simulator_v2_stats_batch", { p_epoch: DATA_EPOCH, p_records: batch.map(([, row]) => ({ kind: row.kind, payload: row.payload })) });
          } catch (error) {
            if (!(error instanceof ActivityDateRejection)) throw error;
            const rejected = new Set(error.ids);
            const invalid = batch.filter(([, row]) => row.kind === "activity" && rejected.has(row.id));
            if (invalid.length !== rejected.size) throw new Error("Unrelated activity date rejection");
            for (const [key, row] of invalid) if (results.get(key) === row) {
              // A rejection receipt prevents reloads or another tab from restoring
              // the poisonous payload. Keep its identity without pretending it counted.
              results.set(key, { kind: row.kind, run: row.run, id: row.id,
                activityDay: row.activityDay, rejected: "future-date" });
            }
            persist();
            // The failed batch wrote nothing. Retry its valid remainder with the
            // original UUIDs; every rejection removes at least one item (max 50).
            batch = batch.filter(([, row]) => !rejected.has(row.id) && !debugRuns.has(row.run));
            continue;
          }
          if (!Array.isArray(response) || response.some((id) => typeof id !== "string")) throw new Error("Invalid statistics acknowledgement");
          const acknowledged = new Set(response);
          activityChanged ||= batch.some(([, row]) => acknowledged.has(row.id) && row.kind === "activity"
            && (row.payload?.p_event === "start" || row.payload?.p_event === "finish"));
          for (const [key, row] of batch) if (acknowledged.has(row.id) && results.get(key) === row) {
            // Keep a small receipt; replaying the same result must not create a new UUID.
            results.set(key, { kind: row.kind, run: row.run, id: row.id, ...(row.activityDay ? { activityDay: row.activityDay } : {}) });
          }
          if (batch.some(([, row]) => !acknowledged.has(row.id))) throw new Error("Incomplete statistics acknowledgement");
          break;
        }
        failures = 0;
        nextUploadAt = Date.now() + UPLOAD_INTERVAL_MS;
      } catch {
        failures = Math.min(failures + 1, 5);
        nextUploadAt = Date.now() + Math.min(60_000 * 2 ** (failures - 1), STATISTICS_CACHE_MS);
      }
      uploadChangedAt = Date.now();
      persist();
    })().finally(async () => {
      if (activityChanged && !disposed) {
        // A read started before the write may still return the old aggregate.
        // Let it finish, then invalidate only activity, keeping paper snapshots frozen.
        await Promise.allSettled([...pendingReads.entries()]
          .filter(([key]) => key.startsWith(activityCachePrefix)).map(([, pending]) => pending));
        for (const [key, entry] of cache) if (key.startsWith(activityCachePrefix)) {
          cache.set(key, { ...entry, fetchedAt: Date.now(), retryAt: 0, stale: true });
        }
        persist();
        await Promise.allSettled([...activityWriteListeners].map(listener => Promise.resolve().then(listener)));
      }
      pendingUpload = null;
      schedule();
    });
    return pendingUpload;
  };
  const client: StatisticsClient = {
    startRun(run) {
      if (!enabled || disposed) return Promise.resolve();
      if (activeRun === run) return runLoad;
      activeRun = run;
      mergeStorage();
      const savedSnapshot = runSnapshots.get(run);
      if (savedSnapshot) {
        runSnapshot = structuredClone(savedSnapshot);
        runStatus = "ready";
        runLoad = Promise.resolve();
        options.onChange?.(SNAPSHOT_RPC);
        return runLoad;
      }
      runSnapshot = null;
      runStatus = "loading";
      runLoad = loadCached(SNAPSHOT_RPC, {}, parseRunStatistics).then(() => {
        if (disposed || activeRun !== run) return;
        const cached = readCached(SNAPSHOT_RPC, {}, parseRunStatistics);
        runSnapshot = cached.data;
        if (runSnapshot) { rememberRunSnapshot(run, structuredClone(runSnapshot)); persist(); }
        runStatus = cached.data ? "ready" : "unavailable";
        options.onChange?.(SNAPSHOT_RPC);
      });
      return runLoad;
    },
    read(name, key, parse) {
      if (!enabled || disposed) return { status: "unavailable", data: null };
      if (activeRun === null || name === ACTIVITY_RPC) return readCached(name, key, parse);
      if (!runSnapshot) return { status: runStatus, data: null };
      const params = key as Record<string, unknown>;
      let data: unknown;
      if (name === "get_phd_simulator_v2_conference_stats" && params.p_rule_version === "v2-review-20261009") {
        data = runSnapshot.conference.find((row) => row.name === params.p_conference_name && row.year === params.p_conference_year && row.target === params.p_target)?.stats ?? EMPTY_CONFERENCE_STATS;
      } else if (name === "get_phd_simulator_v2_journal_stats" && params.p_rule_version === "v2-journal-20261012") {
        data = runSnapshot.journals[String(params.p_journal)];
      } else if (name === "get_phd_simulator_v2_thesis_stats" && params.p_rule_version === "v2-thesis-20261013") {
        data = runSnapshot.theses[String(params.p_degree)];
      }
      try { return { status: "ready", data: parse(structuredClone(data)) }; }
      catch { return { status: "unavailable", data: null }; }
    },
    load: (name, key, parse) => activeRun === null || name === ACTIVITY_RPC ? loadCached(name, key, parse) : runLoad,
    flush,
    persistPending: () => !uploadEnabled || persist(),
    enqueue(kind, run, fingerprint, payload) {
      mergeStorage();
      if (!uploadEnabled || disposed || debugRuns.has(run)) return false;
      const key = JSON.stringify([kind, run, fingerprint]);
      if (results.has(key)) return false;
      let id: string;
      try { id = globalThis.crypto.randomUUID(); } catch { return false; }
      const row = { ...payload, p_id: id };
      if (!validPayload(kind, row)) return false;
      const entry: QueuedResult = { kind, run, id, payload: row,
        ...(kind === "activity" ? { activityDay: String(row.p_day) } : {}) };
      if (activityExpired(entry)) return false;
      results.set(key, entry);
      persist();
      schedule();
      return true;
    },
    markDebug(run) {
      mergeStorage();
      if (!enabled || disposed || run === null || debugRuns.has(run)) return;
      debugRuns.add(run);
      debugQualifications.set(run, { revision: (debugQualifications.get(run)?.revision ?? 0) + 1, debugUsed: true });
      for (const [key, row] of results) if (row.run === run && row.payload) results.delete(key);
      if (!hasPending() && uploadTimer !== null) { clearTimeout(uploadTimer); uploadTimer = null; }
      persist();
    },
    restoreRunQualification(run) {
      mergeStorage();
      if (!enabled || disposed) return;
      let changed = false;
      for (const key of [run, `activity-start:${run}`]) {
        if (!debugRuns.has(key)) continue;
        debugRuns.delete(key);
        debugQualifications.set(key, { revision: (debugQualifications.get(key)?.revision ?? 0) + 1, debugUsed: false });
        changed = true;
      }
      if (changed) persist();
    },
    isDebugRun: (run) => debugRuns.has(run),
    subscribeActivityWrites(listener) {
      activityWriteListeners.add(listener);
      return () => { activityWriteListeners.delete(listener); };
    },
    dispose() { disposed = true; activityWriteListeners.clear(); if (uploadTimer !== null) clearTimeout(uploadTimer); uploadTimer = null; },
  };
  schedule();
  return client;
}
