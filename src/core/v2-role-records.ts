import { calculateHIndex } from "./v2-citation-stats";
import type { AccountProfile, GameState, RoleHistoryBest, RoleId } from "./v2-types";

type RecordStorage = Pick<Storage, "getItem" | "setItem">;
const STORAGE_KEY = "phd_simulator_v2_role_records_v1";

function nonnegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function count(value: unknown): number {
  return Number.isSafeInteger(value) ? nonnegativeNumber(value) : 0;
}

export function loadRoleRecords(account: AccountProfile, storage: RecordStorage | null): AccountProfile {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("roles" in saved) || !saved.roles || typeof saved.roles !== "object") return account;
    const roles = saved.roles as Record<string, unknown>;
    const roleProgress = { ...account.roleProgress };
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const value = roles[roleId];
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const playedRuns = count(record.playedRuns);
      const completedRuns = count(record.completedRuns);
      if (completedRuns > playedRuns) continue;
      const historyBest = { ...roleProgress[roleId].historyBest };
      if (record.historyBest && typeof record.historyBest === "object") {
        const history = record.historyBest as Record<string, unknown>;
        for (const key of Object.keys(historyBest) as (keyof RoleHistoryBest)[]) {
          historyBest[key] = key === "hIndex" || key === "natureCount"
            ? count(history[key]) : nonnegativeNumber(history[key]);
        }
      }
      roleProgress[roleId] = { ...roleProgress[roleId], playedRuns, completedRuns, historyBest };
    }
    return { ...account, roleProgress };
  } catch {
    return account;
  }
}

export function saveRoleRecords(account: AccountProfile, storage: RecordStorage | null): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [
        roleId, { playedRuns: progress.playedRuns, completedRuns: progress.completedRuns, historyBest: progress.historyBest },
      ])),
    }));
  } catch {
    return;
  }
}

export function recordRoleResult(account: AccountProfile, state: GameState): AccountProfile {
  if (state.phase !== "finished" || !state.ending) return account;
  const roleId = state.selectedRoleId;
  const previous = account.roleProgress[roleId];
  const published = [...new Map([...state.papers, ...state.externalPublications]
    .filter((paper) => paper.status === "published"
      && (paper.nonFirstAuthor === true || !paper.leadAuthorId || paper.leadAuthorId === "player"))
    .map((paper) => [paper.id, paper])).values()];
  const citations = published.map((paper) => nonnegativeNumber(paper.publication?.citations));
  const current: RoleHistoryBest = {
    researchScore: nonnegativeNumber(state.totalResearchScore),
    totalCitations: nonnegativeNumber(state.totalCitations),
    hIndex: calculateHIndex(citations),
    natureCount: published.filter((paper) => (paper.publication?.journalTarget ?? paper.journalTarget) === "nature").length,
    representativeCitations: Math.max(0, ...citations),
    representativeScore: Math.max(0, ...published.map((paper) => nonnegativeNumber(paper.publication?.effectiveScore))),
  };
  const historyBest = { ...previous.historyBest };
  for (const key of Object.keys(current) as (keyof RoleHistoryBest)[]) {
    historyBest[key] = Math.max(historyBest[key], current[key]);
  }
  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      [roleId]: {
        ...previous,
        playedRuns: previous.playedRuns + 1,
        completedRuns: previous.completedRuns + Number(state.ending === "master" || state.ending === "phd"),
        historyBest,
      },
    },
  };
}
