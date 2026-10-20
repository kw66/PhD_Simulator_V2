import { DATA_EPOCH, isCurrentDataEpoch } from "./v2-data-epoch";
import { calculateHIndex } from "./v2-citation-stats";
import { getSelectedCurseDifficulty } from "./v2-curse-progress";
import { isCursedRole, normalizeCurseDifficulty, type CurseDifficulty } from "./v2-curse-system";
import type { AccountProfile, GameState, RoleHistoryBest, RoleId } from "./v2-types";

type RecordStorage = Pick<Storage, "getItem" | "setItem">;
export const ROLE_RECORDS_STORAGE_KEY = "phd_simulator_v2_role_records_v2";

function nonnegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function count(value: unknown): number {
  return Number.isSafeInteger(value) ? nonnegativeNumber(value) : 0;
}

function emptyHistoryBest(): RoleHistoryBest {
  return {
    researchScore: 0, totalCitations: 0, hIndex: 0, natureCount: 0,
    representativeCitations: 0, representativeScore: 0, sanCap: 0,
    research: 0, social: 0, favor: 0, money: 0,
  };
}

function readHistoryBest(value: unknown): RoleHistoryBest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const history = value as Record<string, unknown>;
  const output = emptyHistoryBest();
  for (const key of Object.keys(output) as (keyof RoleHistoryBest)[]) {
    output[key] = key === "hIndex" || key === "natureCount"
      ? count(history[key]) : nonnegativeNumber(history[key]);
  }
  return output;
}

function mergeHistoryBest(previous: RoleHistoryBest, current: RoleHistoryBest): RoleHistoryBest {
  const output = { ...previous };
  for (const key of Object.keys(current) as (keyof RoleHistoryBest)[]) {
    output[key] = Math.max(output[key], current[key]);
  }
  return output;
}

/** Cursed records follow the current lobby challenge; old unscoped records never fill an empty challenge. */
export function getRoleHistoryBest(
  account: AccountProfile,
  roleId: RoleId,
  difficulty: CurseDifficulty = getSelectedCurseDifficulty(account, roleId),
): RoleHistoryBest {
  const progress = account.roleProgress[roleId];
  return isCursedRole(roleId)
    ? progress.historyBestByCurseDifficulty?.[normalizeCurseDifficulty(difficulty)] ?? emptyHistoryBest()
    : progress.historyBest;
}

/** These records predate difficulty tracking and cannot safely be assigned to any challenge. */
export function getLegacyCurseRoleHistoryBest(account: AccountProfile, roleId: RoleId): RoleHistoryBest | null {
  const history = account.roleProgress[roleId].historyBest;
  return isCursedRole(roleId) && Object.values(history).some(value => value > 0) ? history : null;
}

export function loadRoleRecords(account: AccountProfile, storage: RecordStorage | null): AccountProfile {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ROLE_RECORDS_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1 || !isCurrentDataEpoch(saved)
      || !("roles" in saved) || !saved.roles || typeof saved.roles !== "object") return account;
    const roles = saved.roles as Record<string, unknown>;
    const roleProgress = { ...account.roleProgress };
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const value = roles[roleId];
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const playedRuns = count(record.playedRuns);
      // Every recorded ending proves one historical start. Keep newer unfinished
      // starts too, without adding already-counted endings again after reload.
      const startedRuns = Math.max(count(record.startedRuns), playedRuns);
      const completedRuns = count(record.completedRuns);
      if (completedRuns > playedRuns) continue;
      const historyBest = readHistoryBest(record.historyBest) ?? { ...roleProgress[roleId].historyBest };
      const historyBestByCurseDifficulty: Partial<Record<CurseDifficulty, RoleHistoryBest>> = {};
      if (isCursedRole(roleId) && record.historyBestByCurseDifficulty
        && typeof record.historyBestByCurseDifficulty === "object" && !Array.isArray(record.historyBestByCurseDifficulty)) {
        const byDifficulty = record.historyBestByCurseDifficulty as Record<string, unknown>;
        for (const difficulty of [1, 2, 3, 4] as const) {
          const history = readHistoryBest(byDifficulty[difficulty]);
          if (history) historyBestByCurseDifficulty[difficulty] = history;
        }
      }
      roleProgress[roleId] = { ...roleProgress[roleId], playedRuns, startedRuns, completedRuns, historyBest,
        ...(Object.keys(historyBestByCurseDifficulty).length ? { historyBestByCurseDifficulty } : {}),
      };
    }
    return { ...account, roleProgress };
  } catch {
    return account;
  }
}

export function saveRoleRecords(account: AccountProfile, storage: RecordStorage | null): void {
  try {
    storage?.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({
      version: 1,
      epoch: DATA_EPOCH,
      savedAt: new Date().toISOString(),
      roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [
        roleId, { playedRuns: progress.playedRuns, startedRuns: progress.startedRuns, completedRuns: progress.completedRuns,
          historyBest: progress.historyBest,
          ...(isCursedRole(roleId as RoleId) && progress.historyBestByCurseDifficulty
            ? { historyBestByCurseDifficulty: progress.historyBestByCurseDifficulty } : {}),
        },
      ])),
    }));
  } catch {
    return;
  }
}

export function recordRoleStart(account: AccountProfile, previousState: GameState, nextState: GameState): AccountProfile {
  if (nextState.phase !== "playing" || (previousState.phase === "playing"
    && previousState.conferenceLocationSeed === nextState.conferenceLocationSeed
    && previousState.selectedRoleId === nextState.selectedRoleId)) return account;
  const roleId = nextState.selectedRoleId;
  const previous = account.roleProgress[roleId];
  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      [roleId]: { ...previous, startedRuns: previous.startedRuns + 1 },
    },
  };
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
    sanCap: nonnegativeNumber(state.sanCap),
    research: nonnegativeNumber(state.player.research),
    social: nonnegativeNumber(state.player.social),
    favor: nonnegativeNumber(state.player.favor),
    money: nonnegativeNumber(state.player.money),
  };
  // Use the finished run's challenge, never a lobby preference which may have changed.
  // A run without trustworthy difficulty remains unscoped rather than being guessed as level 1.
  const difficulty = state.curseState?.difficulty;
  const scoped = isCursedRole(roleId) && difficulty === normalizeCurseDifficulty(difficulty);
  const historyBest = scoped ? previous.historyBest : mergeHistoryBest(previous.historyBest, current);
  const historyBestByCurseDifficulty = scoped ? {
    ...previous.historyBestByCurseDifficulty,
    [difficulty]: mergeHistoryBest(previous.historyBestByCurseDifficulty?.[difficulty] ?? emptyHistoryBest(), current),
  } : previous.historyBestByCurseDifficulty;
  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      [roleId]: {
        ...previous,
        playedRuns: previous.playedRuns + 1,
        completedRuns: previous.completedRuns + Number(state.ending === "master" || state.ending === "phd"),
        historyBest,
        ...(historyBestByCurseDifficulty ? { historyBestByCurseDifficulty } : {}),
      },
    },
  };
}
