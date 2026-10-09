import { getConferenceInfo } from "../core/v2-conference-catalog";
import type { GameState, PaperAcceptType, PaperTarget } from "../core/v2-types";

export const CONFERENCE_STATS_RULE_VERSION = "v2-review-20261009";
const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const STORAGE_KEY = `phd_simulator_v2_conference_stats_${CONFERENCE_STATS_RULE_VERSION}`;
const ACCEPT_TYPES: PaperAcceptType[] = ["Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SCORE = 1_000_000;
export type ConferenceStatsMeanKey = "Reject" | PaperAcceptType;

export interface ConferenceGlobalStats {
  submissions: number;
  accepted: number;
  counts: Record<PaperAcceptType, number>;
  means: Record<ConferenceStatsMeanKey, number | null>;
  acceptedMeanScore: number | null;
  rejectedMeanScore: number | null;
  p90: number | null;
  p99: number | null;
  updatedAt: string | null;
}

export interface ConferenceGlobalStatsSnapshot {
  status: "loading" | "ready" | "unavailable";
  data: ConferenceGlobalStats | null;
}

interface ConferenceKey {
  p_rule_version: string;
  p_conference_name: string;
  p_conference_year: number;
  p_target: PaperTarget;
}

interface ReviewRecord extends ConferenceKey {
  p_id: string;
  p_accepted: boolean;
  p_accept_type: PaperAcceptType | null;
  p_score: number;
}

interface StoredRecord {
  run: string;
  sent: boolean;
  payload: ReviewRecord;
}

interface ConferenceStatsOptions {
  onChange: () => void;
  enabled?: boolean;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

interface TrackingOptions { debugUsed?: boolean }

export interface ConferenceStatsController {
  read(name: string, year: number, target: PaperTarget): ConferenceGlobalStatsSnapshot;
  load(name: string, year: number, target: PaperTarget): Promise<void>;
  track(before: GameState, after: GameState, options?: TrackingOptions): Promise<void>;
  recordReview(before: GameState, after: GameState, options?: TrackingOptions): Promise<void>;
  observe(state: GameState, options?: TrackingOptions): Promise<void>;
  markDebug(): void;
  resetRun(): void;
  flush(): Promise<void>;
}

let activeController: ConferenceStatsController | null = null;

function validKey(key: ConferenceKey): boolean {
  return key.p_rule_version === CONFERENCE_STATS_RULE_VERSION
    && typeof key.p_conference_name === "string" && /^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$/.test(key.p_conference_name)
    && Number.isInteger(key.p_conference_year) && key.p_conference_year >= 2000 && key.p_conference_year <= 2100
    && ["A", "B", "C"].includes(key.p_target);
}

function keyFor(name: string, year: number, target: PaperTarget): ConferenceKey {
  return { p_rule_version: CONFERENCE_STATS_RULE_VERSION, p_conference_name: name, p_conference_year: year, p_target: target };
}

function validRecord(record: ReviewRecord): boolean {
  return validKey(record) && typeof record.p_id === "string" && UUID_PATTERN.test(record.p_id)
    && typeof record.p_accepted === "boolean"
    && (record.p_accepted ? ACCEPT_TYPES.includes(record.p_accept_type!) : record.p_accept_type === null)
    && Number.isFinite(record.p_score) && record.p_score >= 0 && record.p_score <= MAX_SCORE;
}

function parseStats(value: unknown): ConferenceGlobalStats {
  if (!value || typeof value !== "object") throw new Error("Missing conference statistics");
  const data = value as ConferenceGlobalStats;
  const count = (amount: unknown): amount is number => typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0;
  const score = (amount: unknown): boolean => typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= MAX_SCORE;
  const meanKeys: ConferenceStatsMeanKey[] = ["Reject", ...ACCEPT_TYPES];
  const meanValid = Boolean(data.means) && meanKeys.every((key) => {
    const expectedCount = key === "Reject" ? data.submissions - data.accepted : data.counts?.[key];
    return expectedCount === 0 ? data.means[key] === null : score(data.means[key]);
  });
  if (!count(data.submissions) || !count(data.accepted) || data.accepted > data.submissions || !data.counts
    || !ACCEPT_TYPES.every((type) => count(data.counts[type]))
    || ACCEPT_TYPES.reduce((total, type) => total + data.counts[type], 0) !== data.accepted
    || !meanValid
    || (data.accepted === 0 ? data.acceptedMeanScore !== null : !score(data.acceptedMeanScore))
    || (data.submissions === data.accepted ? data.rejectedMeanScore !== null : !score(data.rejectedMeanScore))
    || (data.submissions === 0 ? data.p90 !== null || data.p99 !== null || data.updatedAt !== null
      : !score(data.p90) || !score(data.p99) || data.p90! > data.p99!
        || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt)))) {
    throw new Error("Invalid conference statistics");
  }
  return { submissions: data.submissions, accepted: data.accepted,
    counts: Object.fromEntries(ACCEPT_TYPES.map((type) => [type, data.counts[type]])) as Record<PaperAcceptType, number>,
    means: Object.fromEntries(meanKeys.map((key) => [key, data.means[key]])) as Record<ConferenceStatsMeanKey, number | null>,
    acceptedMeanScore: data.acceptedMeanScore, rejectedMeanScore: data.rejectedMeanScore,
    p90: data.p90, p99: data.p99, updatedAt: data.updatedAt };
}

function browserStorage(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function runKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

export function createConferenceStats(options: ConferenceStatsOptions): ConferenceStatsController {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const enabled = options.enabled !== false;
  const records = new Map<string, StoredRecord>();
  const debugRuns = new Set<string>();
  const cache = new Map<string, { snapshot: ConferenceGlobalStatsSnapshot; attemptedAt: number; pending?: Promise<void> }>();
  let currentRun: string | null = null;
  let debugUsed = false;
  let pendingFlush: Promise<void> | null = null;
  let lastFlushAttempt = -Infinity;

  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (stored && Array.isArray(stored.records) && Array.isArray(stored.debugRuns)) {
      for (const run of stored.debugRuns) if (typeof run === "string") debugRuns.add(run);
      for (const entry of stored.records) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [fingerprint, record] = entry;
        if (typeof fingerprint === "string" && record && typeof record.run === "string"
          && typeof record.sent === "boolean" && record.payload && validRecord(record.payload)
          && !debugRuns.has(record.run)) records.set(fingerprint, record);
      }
    }
  } catch { records.clear(); }

  const persist = (): void => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ records: [...records], debugRuns: [...debugRuns] })); } catch { return; }
  };
  const notify = (): void => { options.onChange(); };
  const rpc = async (name: string, payload: object): Promise<unknown> => {
    const response = await request(`${RPC_URL}/${name}`, {
      method: "POST", headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Conference statistics unavailable: ${response.status}`);
    return response.json();
  };
  const read: ConferenceStatsController["read"] = (name, year, target) => {
    if (!enabled || !validKey(keyFor(name, year, target))) return { status: "unavailable", data: null };
    return structuredClone(cache.get(JSON.stringify(keyFor(name, year, target)))?.snapshot ?? { status: "loading", data: null });
  };
  const load: ConferenceStatsController["load"] = (name, year, target) => {
    const key = keyFor(name, year, target);
    if (!enabled || !validKey(key)) return Promise.resolve();
    const serialized = JSON.stringify(key);
    const existing = cache.get(serialized);
    if (existing?.pending) return existing.pending;
    if (existing && Date.now() - existing.attemptedAt < (existing.snapshot.status === "ready" ? 60_000 : 30_000)) return Promise.resolve();
    const entry = { snapshot: { status: "loading", data: existing?.snapshot.data ?? null } as ConferenceGlobalStatsSnapshot,
      attemptedAt: Date.now(), pending: undefined as Promise<void> | undefined };
    cache.set(serialized, entry);
    entry.pending = rpc("get_phd_simulator_v2_conference_stats", key).then((value) => {
      entry.snapshot = { status: "ready", data: parseStats(value) };
    }).catch(() => {
      entry.snapshot = { status: "unavailable", data: entry.snapshot.data };
    }).finally(() => { entry.pending = undefined; notify(); });
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
    lastFlushAttempt = Date.now();
    pendingFlush = (async () => {
      for (const record of records.values()) {
        if (record.sent || debugRuns.has(record.run)) continue;
        try {
          const result = await rpc("record_phd_simulator_v2_conference_review", record.payload);
          if (result !== true) continue;
          record.sent = true;
          persist();
          const key = keyFor(record.payload.p_conference_name, record.payload.p_conference_year, record.payload.p_target);
          const existing = cache.get(JSON.stringify(key));
          if (existing?.pending) await existing.pending;
          cache.delete(JSON.stringify(key));
          await load(key.p_conference_name, key.p_conference_year, key.p_target);
        } catch { continue; }
      }
    })().finally(() => { pendingFlush = null; });
    return pendingFlush;
  };
  const observe: ConferenceStatsController["observe"] = (state, tracking = {}) => {
    currentRun = runKey(state);
    if (tracking.debugUsed || debugUsed || debugRuns.has(currentRun)) markDebug();
    return Date.now() - lastFlushAttempt >= 30_000 ? flush() : Promise.resolve();
  };
  const track: ConferenceStatsController["track"] = (before, after, tracking = {}) => {
    currentRun = runKey(after);
    if (tracking.debugUsed || debugUsed || debugRuns.has(currentRun)) markDebug();
    if (!enabled || debugUsed || before.phase !== "playing" || before === after || runKey(before) !== currentRun) return Promise.resolve();
    let added = false;
    for (const event of before.eventQueue) {
      if (event.source !== "review" || event.stage !== "result" || event.paperReviewPresentation?.kind !== "decision"
        || after.eventQueue.some((remaining) => remaining.id === event.id)) continue;
      const settlement = event.choices.find((choice) => choice.id === "confirm-review-result")?.effects.paperReviewSettlement;
      if (!settlement) continue;
      const paper = before.papers.find((entry) => entry.id === settlement.paperId);
      if (!paper || paper.status !== "reviewing" || paper.journalTarget || !paper.target
        || !paper.submittedMonth || !paper.submittedYear || paper.target !== settlement.target) continue;
      const settled = [...after.papers, ...after.externalPublications].find((entry) => entry.id === paper.id);
      if (!settled || settled.lastReview?.accepted !== settlement.accepted
        || settled.lastReview.totalReviewScore !== settlement.totalReviewScore
        || (settlement.accepted ? settled.status !== "published" || settled.publication?.acceptType !== settlement.acceptType
          : settled.status !== "draft" || settled.rejectionCount !== (paper.rejectionCount ?? 0) + 1)) continue;
      const conference = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
      const fingerprint = JSON.stringify([currentRun, paper.id, paper.createdTotalMonths, paper.submittedMonth,
        paper.submittedYear, paper.rejectionCount ?? 0]);
      if (records.has(fingerprint)) continue;
      let id: string;
      try { id = globalThis.crypto.randomUUID(); } catch { continue; }
      const payload: ReviewRecord = { ...keyFor(conference.name, conference.year, paper.target), p_id: id,
        p_accepted: settlement.accepted, p_accept_type: settlement.acceptType, p_score: settlement.submittedScore };
      if (!validRecord(payload)) continue;
      records.set(fingerprint, { run: currentRun, sent: false, payload });
      added = true;
    }
    if (added) persist();
    return added || Date.now() - lastFlushAttempt >= 30_000 ? flush() : Promise.resolve();
  };
  const controller: ConferenceStatsController = { read, load, track, recordReview: track, observe, markDebug,
    resetRun: () => { currentRun = null; debugUsed = false; }, flush };
  activeController = controller;
  return controller;
}

export function getConferenceGlobalStats(name: string, year: number, target: PaperTarget): ConferenceGlobalStatsSnapshot {
  return activeController?.read(name, year, target) ?? { status: "unavailable", data: null };
}

export function loadConferenceGlobalStats(name: string, year: number, target: PaperTarget): Promise<void> {
  return activeController?.load(name, year, target) ?? Promise.resolve();
}
