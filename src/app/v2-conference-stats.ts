import { getConferenceInfo } from "../core/v2-conference-catalog";
import type { GameState, PaperAcceptType, PaperTarget } from "../core/v2-types";

import { createStatisticsClient, type StatisticsClient, type StatisticsClientOptions } from "./v2-statistics-client";

export const CONFERENCE_STATS_RULE_VERSION = "v2-review-20261009";
const ACCEPT_TYPES: PaperAcceptType[] = ["Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"];
const MAX_SCORE = 1_000_000;
export type ConferenceStatsMeanKey = "Reject" | PaperAcceptType;

export interface ConferenceGlobalStats {
  submissions: number;
  accepted: number;
  counts: Record<PaperAcceptType, number>;
  means: Record<ConferenceStatsMeanKey, number | null>;
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

interface ConferenceStatsOptions extends StatisticsClientOptions {
  onChange: () => void;
  client?: StatisticsClient;
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
  dispose(): void;
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
    || !meanValid) {
    throw new Error("Invalid conference statistics");
  }
  return { submissions: data.submissions, accepted: data.accepted,
    counts: Object.fromEntries(ACCEPT_TYPES.map((type) => [type, data.counts[type]])) as Record<PaperAcceptType, number>,
    means: Object.fromEntries(meanKeys.map((key) => [key, data.means[key]])) as Record<ConferenceStatsMeanKey, number | null> };
}

function runKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

export function createConferenceStats(options: ConferenceStatsOptions): ConferenceStatsController {
  const enabled = options.enabled !== false;
  const client = options.client ?? createStatisticsClient(options);
  let currentRun: string | null = null;
  let debugUsed = false;
  const markDebug = (): void => { debugUsed = true; client.markDebug(currentRun); };
  const syncRun = (state: GameState, tracking: { debugUsed?: boolean }): void => {
    currentRun = state.phase === "setup" ? null : runKey(state);
    if (tracking.debugUsed || debugUsed || (currentRun !== null && client.isDebugRun(currentRun))) markDebug();
  };

  const read: ConferenceStatsController["read"] = (name, year, target) => {
    const key = keyFor(name, year, target);
    return enabled && validKey(key) ? client.read("get_phd_simulator_v2_conference_stats", key, parseStats) : { status: "unavailable", data: null };
  };
  const load: ConferenceStatsController["load"] = (name, year, target) => {
    const key = keyFor(name, year, target);
    return enabled && validKey(key) ? client.load("get_phd_simulator_v2_conference_stats", key, parseStats) : Promise.resolve();
  };
  const observe: ConferenceStatsController["observe"] = (state, tracking = {}) => { syncRun(state, tracking); return Promise.resolve(); };
  const track: ConferenceStatsController["track"] = (before, after, tracking = {}) => {
    syncRun(after, tracking);
    if (!enabled || debugUsed || currentRun === null || before.phase !== "playing" || before === after || runKey(before) !== currentRun) return Promise.resolve();
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
      const fingerprint = JSON.stringify([paper.id, paper.createdTotalMonths, paper.submittedMonth, paper.submittedYear, paper.rejectionCount ?? 0]);
      client.enqueue("conference", currentRun, fingerprint, { ...keyFor(conference.name, conference.year, paper.target),
        p_accepted: settlement.accepted, p_accept_type: settlement.acceptType, p_score: settlement.submittedScore });
    }
    return Promise.resolve();
  };
  const controller: ConferenceStatsController = { read, load, track, recordReview: track, observe,
    markDebug, resetRun: () => { currentRun = null; debugUsed = false; },
    flush: () => enabled ? client.flush() : Promise.resolve(),
    dispose: () => { if (!options.client) client.dispose(); },
  };
  activeController = controller;
  return controller;
}

export function getConferenceGlobalStats(name: string, year: number, target: PaperTarget): ConferenceGlobalStatsSnapshot {
  return activeController?.read(name, year, target) ?? { status: "unavailable", data: null };
}

export function loadConferenceGlobalStats(name: string, year: number, target: PaperTarget): Promise<void> {
  return activeController?.load(name, year, target) ?? Promise.resolve();
}
