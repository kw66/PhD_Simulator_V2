import { getStatisticsRunKey } from "../core/v2-run-statistics";
import type { GameState, JournalTarget } from "../core/v2-types";

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
  track(before: GameState, after: GameState, options?: { debugUsed?: boolean; finalized?: boolean }): Promise<void>;
  markDebug(): void;
  restoreRun(state: GameState, options: { debugUsed: boolean }): void;
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


export function createJournalStats(options: JournalStatsOptions): JournalStatsController {
  const enabled = options.enabled !== false;
  const client = options.client ?? createStatisticsClient(options);
  let currentRun: string | null = null;
  let debugUsed = false;
  const markDebug = (): void => { debugUsed = true; client.markDebug(currentRun); };
  const syncRun = (state: GameState, tracking: { debugUsed?: boolean; finalized?: boolean }): void => {
    currentRun = state.phase === "setup" ? null : getStatisticsRunKey(state);
    if (tracking.debugUsed || debugUsed || (currentRun !== null && client.isDebugRun(currentRun))) markDebug();
  };

  const key = (journal: JournalTarget) => ({ p_rule_version: RULE_VERSION, p_journal: journal });
  const valid = (journal: JournalTarget) => enabled && ["nature", "nmi", "pami"].includes(journal);
  const track: JournalStatsController["track"] = (_before, after, tracking = {}) => {
    syncRun(after, tracking);
    if (!enabled || debugUsed || currentRun === null || !tracking.finalized || after.phase !== "finished") return Promise.resolve();
    for (const record of after.pendingRunStatistics ?? []) {
      if (record.kind === "journal") client.enqueue(record.kind, currentRun, record.fingerprint, record.payload);
    }
    return Promise.resolve();
  };
  const controller: JournalStatsController = {
    read: (journal) => valid(journal) ? client.read("get_phd_simulator_v2_journal_stats", key(journal), parseStats) : { status: "unavailable", data: null },
    load: (journal) => valid(journal) ? client.load("get_phd_simulator_v2_journal_stats", key(journal), parseStats) : Promise.resolve(),
    track,
    restoreRun: (state, tracking) => {
      currentRun = state.phase === "setup" ? null : getStatisticsRunKey(state);
      debugUsed = tracking.debugUsed;
      if (debugUsed) markDebug();
      else if (currentRun !== null) client.restoreRunQualification(currentRun);
    },
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
