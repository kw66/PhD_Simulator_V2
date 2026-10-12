import type { Degree, GameState } from "../core/v2-types";

export const THESIS_STATS_RULE_VERSION = "v2-thesis-20261013";
const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const STORAGE_KEY = `phd_simulator_v2_thesis_stats_${THESIS_STATS_RULE_VERSION}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ThesisGlobalStats {
  submittedCount: number;
  passedCount: number;
  excellentCount: number;
  notSubmittedCount: number;
}

export interface ThesisGlobalStatsSnapshot {
  status: "loading" | "ready" | "unavailable";
  data: ThesisGlobalStats | null;
}

interface ThesisRecord {
  p_id: string;
  p_rule_version: string;
  p_degree: Degree;
  p_submitted: boolean;
  p_passed: boolean;
  p_excellent: boolean;
}

interface StoredRecord { run: string; sent: boolean; payload: ThesisRecord }

interface ThesisStatsOptions {
  onChange: () => void;
  enabled?: boolean;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

export interface ThesisStatsController {
  read(degree: Degree): ThesisGlobalStatsSnapshot;
  load(degree: Degree): Promise<void>;
  track(before: GameState, after: GameState, options?: { debugUsed?: boolean }): Promise<void>;
  markDebug(): void;
  resetRun(): void;
}

let activeController: ThesisStatsController | null = null;

function validRecord(value: unknown): value is ThesisRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as ThesisRecord;
  return typeof record.p_id === "string" && UUID_PATTERN.test(record.p_id)
    && record.p_rule_version === THESIS_STATS_RULE_VERSION
    && (record.p_degree === "master" || record.p_degree === "phd")
    && typeof record.p_submitted === "boolean" && typeof record.p_passed === "boolean"
    && typeof record.p_excellent === "boolean"
    && (!record.p_passed || record.p_submitted) && (!record.p_excellent || record.p_passed);
}

function parseStats(value: unknown): ThesisGlobalStats {
  if (!value || typeof value !== "object") throw new Error("Missing thesis statistics");
  const stats = value as ThesisGlobalStats;
  const validCount = (count: unknown): count is number => typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  if (!validCount(stats.submittedCount) || !validCount(stats.passedCount)
    || !validCount(stats.excellentCount) || !validCount(stats.notSubmittedCount)
    || stats.excellentCount > stats.passedCount || stats.passedCount > stats.submittedCount) {
    throw new Error("Invalid thesis statistics");
  }
  return { submittedCount: stats.submittedCount, passedCount: stats.passedCount,
    excellentCount: stats.excellentCount, notSubmittedCount: stats.notSubmittedCount };
}

function browserStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function runKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

export function createThesisStats(options: ThesisStatsOptions): ThesisStatsController {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const enabled = options.enabled !== false;
  const records = new Map<string, StoredRecord>();
  const debugRuns = new Set<string>();
  const cache = new Map<Degree, { snapshot: ThesisGlobalStatsSnapshot; attemptedAt: number; pending?: Promise<void> }>();
  let currentRun: string | null = null;
  let debugUsed = false;
  let pendingFlush: Promise<void> | null = null;

  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (stored && Array.isArray(stored.records) && Array.isArray(stored.debugRuns)) {
      for (const run of stored.debugRuns) if (typeof run === "string") debugRuns.add(run);
      for (const entry of stored.records) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [fingerprint, record] = entry;
        if (typeof fingerprint === "string" && typeof record?.run === "string"
          && typeof record?.sent === "boolean" && validRecord(record.payload)
          && !debugRuns.has(record.run)) records.set(fingerprint, record);
      }
    }
  } catch { records.clear(); }
  const persist = (): void => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ records: [...records], debugRuns: [...debugRuns] })); } catch { return; }
  };
  const rpc = async (name: string, payload: object): Promise<unknown> => {
    const response = await request(`${RPC_URL}/${name}`, { method: "POST",
      headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Thesis statistics unavailable: ${response.status}`);
    return response.json();
  };
  const load: ThesisStatsController["load"] = (degree) => {
    if (!enabled) return Promise.resolve();
    const existing = cache.get(degree);
    if (existing?.pending) return existing.pending;
    if (existing && Date.now() - existing.attemptedAt < (existing.snapshot.status === "ready" ? 60_000 : 30_000)) return Promise.resolve();
    const entry = { snapshot: { status: "loading", data: existing?.snapshot.data ?? null } as ThesisGlobalStatsSnapshot,
      attemptedAt: Date.now(), pending: undefined as Promise<void> | undefined };
    cache.set(degree, entry);
    entry.pending = rpc("get_phd_simulator_v2_thesis_stats", { p_rule_version: THESIS_STATS_RULE_VERSION, p_degree: degree })
      .then((value) => { entry.snapshot = { status: "ready", data: parseStats(value) }; })
      .catch(() => { entry.snapshot = { status: "unavailable", data: entry.snapshot.data }; })
      .finally(() => { entry.pending = undefined; options.onChange(); });
    return entry.pending;
  };
  const markDebug = (): void => {
    debugUsed = true;
    if (currentRun !== null) {
      debugRuns.add(currentRun);
      for (const [fingerprint, record] of records) if (record.run === currentRun && !record.sent) records.delete(fingerprint);
      persist();
    }
  };
  const flush = (): Promise<void> => {
    if (!enabled) return Promise.resolve();
    if (pendingFlush) return pendingFlush.then(() => flush());
    pendingFlush = (async () => {
      for (const record of records.values()) {
        if (record.sent || debugRuns.has(record.run)) continue;
        try {
          if (await rpc("record_phd_simulator_v2_thesis_review", record.payload) !== true) continue;
          record.sent = true;
          persist();
          cache.delete(record.payload.p_degree);
          await load(record.payload.p_degree);
        } catch { continue; }
      }
    })().finally(() => { pendingFlush = null; });
    return pendingFlush;
  };
  const track: ThesisStatsController["track"] = (before, after, tracking = {}) => {
    currentRun = runKey(after);
    if (tracking.debugUsed || debugUsed || debugRuns.has(currentRun)) markDebug();
    if (!enabled || debugUsed || before.phase !== "playing" || before === after || runKey(before) !== currentRun
      || before.thesis.reviewResolved || !after.thesis.reviewResolved) return Promise.resolve();
    const event = before.eventQueue.find((entry) => entry.source === "thesis" && entry.stage === "result"
      && entry.thesisReviewPresentation?.stage === "decision");
    const review = event?.thesisReviewPresentation?.review;
    if (!event || !review || after.eventQueue.some((entry) => entry.id === event.id)
      || after.thesis.review?.degree !== review.degree || after.thesis.review?.submitted !== review.submitted
      || after.thesis.review?.passed !== review.passed || after.thesis.review?.excellent !== review.excellent) return Promise.resolve();
    const fingerprint = JSON.stringify([currentRun, review.degree]);
    if (records.has(fingerprint)) return Promise.resolve();
    let id: string;
    try { id = globalThis.crypto.randomUUID(); } catch { return Promise.resolve(); }
    const payload: ThesisRecord = { p_id: id, p_rule_version: THESIS_STATS_RULE_VERSION,
      p_degree: review.degree, p_submitted: review.submitted, p_passed: review.passed, p_excellent: review.excellent };
    if (!validRecord(payload)) return Promise.resolve();
    records.set(fingerprint, { run: currentRun, sent: false, payload });
    persist();
    return flush();
  };
  const controller: ThesisStatsController = {
    read: (degree) => enabled ? structuredClone(cache.get(degree)?.snapshot ?? { status: "loading", data: null })
      : { status: "unavailable", data: null },
    load, track, markDebug, resetRun: () => { currentRun = null; debugUsed = false; },
  };
  activeController = controller;
  if (enabled) queueMicrotask(() => { void flush(); });
  return controller;
}

export function getThesisGlobalStats(degree: Degree): ThesisGlobalStatsSnapshot {
  return activeController?.read(degree) ?? { status: "unavailable", data: null };
}

export function loadThesisGlobalStats(degree: Degree): Promise<void> {
  return activeController?.load(degree) ?? Promise.resolve();
}
