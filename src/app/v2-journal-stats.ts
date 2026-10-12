import { getJournalScore } from "../core/v2-journal-system";
import type { GameState, JournalTarget, Paper } from "../core/v2-types";

const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const RULE_VERSION = "v2-journal-20261012";
const STORAGE_KEY = `phd_simulator_v2_journal_stats_${RULE_VERSION}`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface JournalGlobalStats {
  acceptedCount: number;
  meanScore: number | null;
  meanMonths: number | null;
}

export interface JournalGlobalStatsSnapshot {
  status: "loading" | "ready" | "unavailable";
  data: JournalGlobalStats | null;
}

interface JournalRecord {
  p_id: string;
  p_rule_version: string;
  p_journal: JournalTarget;
  p_score: number;
  p_months: number;
}

interface StoredRecord { run: string; sent: boolean; payload: JournalRecord }

interface JournalStatsOptions {
  onChange: () => void;
  enabled?: boolean;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

export interface JournalStatsController {
  read(journal: JournalTarget): JournalGlobalStatsSnapshot;
  load(journal: JournalTarget): Promise<void>;
  track(before: GameState, after: GameState, options?: { debugUsed?: boolean }): Promise<void>;
  markDebug(): void;
  resetRun(): void;
}

let activeController: JournalStatsController | null = null;

function validRecord(value: unknown): value is JournalRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as JournalRecord;
  return typeof record.p_id === "string" && UUID_PATTERN.test(record.p_id) && record.p_rule_version === RULE_VERSION
    && ["nature", "nmi", "pami"].includes(record.p_journal)
    && Number.isFinite(record.p_score) && record.p_score >= 0 && record.p_score <= 1_000_000
    && Number.isInteger(record.p_months) && record.p_months >= 0 && record.p_months <= 120;
}

function parseStats(value: unknown): JournalGlobalStats {
  if (!value || typeof value !== "object") throw new Error("Missing journal statistics");
  const stats = value as JournalGlobalStats;
  if (!Number.isSafeInteger(stats.acceptedCount) || stats.acceptedCount < 0
    || (stats.acceptedCount === 0
      ? stats.meanScore !== null || stats.meanMonths !== null
      : typeof stats.meanScore !== "number" || !Number.isFinite(stats.meanScore) || stats.meanScore < 0
        || typeof stats.meanMonths !== "number" || !Number.isFinite(stats.meanMonths) || stats.meanMonths < 0)) {
    throw new Error("Invalid journal statistics");
  }
  return { acceptedCount: stats.acceptedCount, meanScore: stats.meanScore, meanMonths: stats.meanMonths };
}

function browserStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function runKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

function recordFor(paper: Paper): JournalRecord | null {
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  const submittedAt = paper.submittedYear && paper.submittedMonth
    ? (paper.submittedYear - 1) * 12 + paper.submittedMonth : null;
  const acceptedAt = paper.acceptedTotalMonths;
  if (paper.status !== "published" || paper.nonFirstAuthor === true
    || (paper.leadAuthorId && paper.leadAuthorId !== "player")
    || !journal || submittedAt === null || acceptedAt === undefined
    || acceptedAt < submittedAt) return null;
  let id: string;
  try { id = globalThis.crypto.randomUUID(); } catch { return null; }
  const record: JournalRecord = { p_id: id, p_rule_version: RULE_VERSION, p_journal: journal,
    p_score: getJournalScore(paper), p_months: acceptedAt - submittedAt };
  return validRecord(record) ? record : null;
}

export function createJournalStats(options: JournalStatsOptions): JournalStatsController {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const enabled = options.enabled !== false;
  const records = new Map<string, StoredRecord>();
  const debugRuns = new Set<string>();
  const cache = new Map<JournalTarget, { snapshot: JournalGlobalStatsSnapshot; attemptedAt: number; pending?: Promise<void> }>();
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
    if (!response.ok) throw new Error(`Journal statistics unavailable: ${response.status}`);
    return response.json();
  };
  const load: JournalStatsController["load"] = (journal) => {
    if (!enabled || !["nature", "nmi", "pami"].includes(journal)) return Promise.resolve();
    const existing = cache.get(journal);
    if (existing?.pending) return existing.pending;
    if (existing && Date.now() - existing.attemptedAt < (existing.snapshot.status === "ready" ? 60_000 : 30_000)) return Promise.resolve();
    const entry = { snapshot: { status: "loading", data: existing?.snapshot.data ?? null } as JournalGlobalStatsSnapshot,
      attemptedAt: Date.now(), pending: undefined as Promise<void> | undefined };
    cache.set(journal, entry);
    entry.pending = rpc("get_phd_simulator_v2_journal_stats", { p_rule_version: RULE_VERSION, p_journal: journal })
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
    if (pendingFlush) return pendingFlush;
    pendingFlush = (async () => {
      for (const record of records.values()) {
        if (record.sent || debugRuns.has(record.run)) continue;
        try {
          if (await rpc("record_phd_simulator_v2_journal_acceptance", record.payload) !== true) continue;
          record.sent = true;
          persist();
          cache.delete(record.payload.p_journal);
          await load(record.payload.p_journal);
        } catch { continue; }
      }
    })().finally(() => { pendingFlush = null; });
    return pendingFlush;
  };
  const track: JournalStatsController["track"] = (before, after, tracking = {}) => {
    currentRun = runKey(after);
    if (tracking.debugUsed || debugUsed || debugRuns.has(currentRun)) markDebug();
    if (!enabled || debugUsed || before.phase !== "playing" || before === after || runKey(before) !== currentRun) return Promise.resolve();
    const priorIds = new Set(before.externalPublications.map((paper) => paper.id));
    let added = false;
    for (const paper of after.externalPublications) {
      if (priorIds.has(paper.id)) continue;
      const fingerprint = JSON.stringify([currentRun, paper.id, paper.createdTotalMonths]);
      if (records.has(fingerprint)) continue;
      const payload = recordFor(paper);
      if (!payload) continue;
      records.set(fingerprint, { run: currentRun, sent: false, payload });
      added = true;
    }
    if (added) persist();
    return added ? flush() : Promise.resolve();
  };
  const controller: JournalStatsController = {
    read: (journal) => enabled ? structuredClone(cache.get(journal)?.snapshot ?? { status: "loading", data: null })
      : { status: "unavailable", data: null },
    load, track, markDebug, resetRun: () => { currentRun = null; debugUsed = false; },
  };
  activeController = controller;
  if (enabled) queueMicrotask(() => { void flush(); });
  return controller;
}

export function getJournalGlobalStats(journal: JournalTarget): JournalGlobalStatsSnapshot {
  return activeController?.read(journal) ?? { status: "unavailable", data: null };
}

export function loadJournalGlobalStats(journal: JournalTarget): Promise<void> {
  return activeController?.load(journal) ?? Promise.resolve();
}
