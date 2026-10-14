import { getJournalScore } from "../core/v2-journal-system";
import type { GameState, JournalTarget, Paper } from "../core/v2-types";

import { createStatisticsClient, type StatisticsClient, type StatisticsClientOptions } from "./v2-statistics-client";

const RULE_VERSION = "v2-journal-20261012";

export interface JournalGlobalStats {
  acceptedCount: number;
  meanScore: number | null;
  meanMonths: number | null;
}

export interface JournalGlobalStatsSnapshot {
  status: "loading" | "ready" | "unavailable";
  data: JournalGlobalStats | null;
}

interface JournalStatsOptions extends StatisticsClientOptions {
  onChange: () => void;
  client?: StatisticsClient;
}
export interface JournalStatsController {
  read(journal: JournalTarget): JournalGlobalStatsSnapshot;
  load(journal: JournalTarget): Promise<void>;
  track(before: GameState, after: GameState, options?: { debugUsed?: boolean }): Promise<void>;
  markDebug(): void;
  resetRun(): void;
  flush(): Promise<void>;
  dispose(): void;
}

let activeController: JournalStatsController | null = null;

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

function runKey(state: GameState): string {
  return JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
}

function recordFor(paper: Paper): object | null {
  const journal = paper.journalTarget ?? paper.publication?.journalTarget;
  const submittedAt = paper.submittedYear && paper.submittedMonth ? (paper.submittedYear - 1) * 12 + paper.submittedMonth : null;
  const acceptedAt = paper.acceptedTotalMonths;
  if (paper.status !== "published" || paper.nonFirstAuthor === true || (paper.leadAuthorId && paper.leadAuthorId !== "player")
    || !journal || submittedAt === null || acceptedAt === undefined || acceptedAt < submittedAt) return null;
  return { p_rule_version: RULE_VERSION, p_journal: journal, p_score: getJournalScore(paper), p_months: acceptedAt - submittedAt };
}

export function createJournalStats(options: JournalStatsOptions): JournalStatsController {
  const enabled = options.enabled !== false;
  const client = options.client ?? createStatisticsClient(options);
  let currentRun: string | null = null;
  let debugUsed = false;
  const markDebug = (): void => { debugUsed = true; client.markDebug(currentRun); };
  const syncRun = (state: GameState, tracking: { debugUsed?: boolean }): void => {
    currentRun = state.phase === "setup" ? null : runKey(state);
    if (tracking.debugUsed || debugUsed || (currentRun !== null && client.isDebugRun(currentRun))) markDebug();
  };

  const key = (journal: JournalTarget) => ({ p_rule_version: RULE_VERSION, p_journal: journal });
  const valid = (journal: JournalTarget) => enabled && ["nature", "nmi", "pami"].includes(journal);
  const track: JournalStatsController["track"] = (before, after, tracking = {}) => {
    syncRun(after, tracking);
    if (!enabled || debugUsed || currentRun === null || before.phase !== "playing" || before === after || runKey(before) !== currentRun) return Promise.resolve();
    const priorIds = new Set(before.externalPublications.map((paper) => paper.id));
    for (const paper of after.externalPublications) {
      if (priorIds.has(paper.id)) continue;
      const payload = recordFor(paper);
      if (payload) client.enqueue("journal", currentRun, JSON.stringify([paper.id, paper.createdTotalMonths]), payload);
    }
    return Promise.resolve();
  };
  const controller: JournalStatsController = {
    read: (journal) => valid(journal) ? client.read("get_phd_simulator_v2_journal_stats", key(journal), parseStats) : { status: "unavailable", data: null },
    load: (journal) => valid(journal) ? client.load("get_phd_simulator_v2_journal_stats", key(journal), parseStats) : Promise.resolve(),
    track,
    markDebug, resetRun: () => { currentRun = null; debugUsed = false; },
    flush: () => enabled ? client.flush() : Promise.resolve(),
    dispose: () => { if (!options.client) client.dispose(); },
  };
  activeController = controller;
  return controller;
}

export function getJournalGlobalStats(journal: JournalTarget): JournalGlobalStatsSnapshot {
  return activeController?.read(journal) ?? { status: "unavailable", data: null };
}

export function loadJournalGlobalStats(journal: JournalTarget): Promise<void> {
  return activeController?.load(journal) ?? Promise.resolve();
}
