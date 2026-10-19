import { getStatisticsRunKey } from "../core/v2-run-statistics";
import type { Degree, GameState } from "../core/v2-types";

import { createStatisticsClient, type StatisticsClient, type StatisticsClientOptions } from "./v2-statistics-client";

export const THESIS_STATS_RULE_VERSION = "v2-thesis-20261013";

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

interface ThesisStatsOptions extends StatisticsClientOptions {
  onChange: () => void;
  client?: StatisticsClient;
}
export interface ThesisStatsController {
  read(degree: Degree): ThesisGlobalStatsSnapshot;
  load(degree: Degree): Promise<void>;
  track(before: GameState, after: GameState, options?: { debugUsed?: boolean; finalized?: boolean }): Promise<void>;
  markDebug(): void;
  restoreRun(state: GameState, options: { debugUsed: boolean }): void;
  resetRun(): void;
  flush(): Promise<void>;
  dispose(): void;
}

let activeController: ThesisStatsController | null = null;

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


export function createThesisStats(options: ThesisStatsOptions): ThesisStatsController {
  const enabled = options.enabled !== false;
  const client = options.client ?? createStatisticsClient(options);
  let currentRun: string | null = null;
  let debugUsed = false;
  const markDebug = (): void => { debugUsed = true; client.markDebug(currentRun); };
  const syncRun = (state: GameState, tracking: { debugUsed?: boolean; finalized?: boolean }): void => {
    currentRun = state.phase === "setup" ? null : getStatisticsRunKey(state);
    if (tracking.debugUsed || debugUsed || (currentRun !== null && client.isDebugRun(currentRun))) markDebug();
  };

  const key = (degree: Degree) => ({ p_rule_version: THESIS_STATS_RULE_VERSION, p_degree: degree });
  const valid = (degree: Degree) => enabled && (degree === "master" || degree === "phd");
  const track: ThesisStatsController["track"] = (_before, after, tracking = {}) => {
    syncRun(after, tracking);
    if (!enabled || debugUsed || currentRun === null || !tracking.finalized || after.phase !== "finished") return Promise.resolve();
    for (const record of after.pendingRunStatistics ?? []) {
      if (record.kind === "thesis") client.enqueue(record.kind, currentRun, record.fingerprint, record.payload);
    }
    return Promise.resolve();
  };
  const controller: ThesisStatsController = {
    read: (degree) => valid(degree) ? client.read("get_phd_simulator_v2_thesis_stats", key(degree), parseStats) : { status: "unavailable", data: null },
    load: (degree) => valid(degree) ? client.load("get_phd_simulator_v2_thesis_stats", key(degree), parseStats) : Promise.resolve(),
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

export function getThesisGlobalStats(degree: Degree): ThesisGlobalStatsSnapshot {
  return activeController?.read(degree) ?? { status: "unavailable", data: null };
}

export function loadThesisGlobalStats(degree: Degree): Promise<void> {
  return activeController?.load(degree) ?? Promise.resolve();
}
