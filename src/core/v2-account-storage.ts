import { createDefaultAccountProfile } from "./v2-lobby";
import { getRoleOptions } from "./v2-progression";
import { getNextRoleLevelExperience, MAX_ROLE_LEVEL } from "./v2-role-experience";
import { loadRoleRecords, saveRoleRecords } from "./v2-role-records";
import { loadRoleAchievementRecords, saveRoleAchievementRecords } from "./v2-achievement-records";
import { loadRoleTalentAllocation, saveRoleTalentAllocation } from "./v2-role-talent-storage";
import type { AccountProfile, DateDisplayMode, GameState, RoleId } from "./v2-types";

/** The only key written by the account layer. The value contains the old, independently
 * versioned records so each record can continue to be sanitised by its owner. */
export const ACCOUNT_STORAGE_KEY = "phd_simulator_v2_account_v1";
export const ACCOUNT_LOBBY_STORAGE_KEY = "phd_simulator_v2_lobby_v1";
export const ROLE_EXPERIENCE_STORAGE_KEY = "phd_simulator_v2_role_experience_v2";
const ROLE_IDS = new Set(getRoleOptions().map(role => role.id));

export type ExperienceStorage = Pick<Storage, "getItem" | "setItem">;
export type AccountStorage = Pick<Storage, "getItem" | "setItem">;

export interface FinalizedRunRecord {
  runId: string;
  state: GameState;
  debugUsed: boolean;
}

export interface LoadedAccountProfile {
  account: AccountProfile;
  settledRuns: Partial<Record<RoleId, string>>;
  finalizedOutbox: FinalizedRunRecord[];
}

type RawStorage = Pick<Storage, "getItem" | "setItem">;
type Envelope = {
  version: 1;
  records: Record<string, string>;
  settledRuns: Partial<Record<RoleId, string>>;
  finalizedOutbox?: FinalizedRunRecord[];
};

function memoryStorage(records: Record<string, string>): RawStorage {
  return {
    getItem: key => records[key] ?? null,
    setItem: (key, value) => { records[key] = value; },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDateMode(value: unknown): value is DateDisplayMode {
  return value === "academic" || value === "calendar";
}

function validRole(value: unknown): value is RoleId {
  return typeof value === "string" && ROLE_IDS.has(value as RoleId);
}

function validRunId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

function validSettledRuns(value: unknown): Partial<Record<RoleId, string>> {
  if (!isRecord(value)) return {};
  const output: Partial<Record<RoleId, string>> = {};
  for (const [roleId, runId] of Object.entries(value)) {
    if (!validRole(roleId) || !validRunId(runId)) continue;
    output[roleId] = runId;
  }
  return output;
}

function validOutbox(value: unknown): FinalizedRunRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FinalizedRunRecord =>
    isRecord(item) && validRunId(item.runId)
      && typeof item.debugUsed === "boolean" && isRecord(item.state)
      && item.state.phase === "finished" && typeof item.state.selectedRoleId === "string"
      && ROLE_IDS.has(item.state.selectedRoleId as RoleId),
  );
}

function loadFromRecords(records: Record<string, string>): AccountProfile {
  let account = createDefaultAccountProfile();
  const storage = memoryStorage(records);
  account = loadRoleTalentAllocation(loadRoleAchievementRecords(loadRoleRecords(loadRoleExperience(account, storage), storage), storage), storage);
  const lobby = parseJson(records[ACCOUNT_LOBBY_STORAGE_KEY]);
  if (isRecord(lobby)) {
    if (validDateMode(lobby.dateDisplayMode)) account = { ...account, dateDisplayMode: lobby.dateDisplayMode };
    if (validRole(lobby.selectedLobbyRoleId)) account = { ...account, selectedLobbyRoleId: lobby.selectedLobbyRoleId };
  }
  return account;
}

function parseJson(value: string | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

/** Loads the canonical envelope, falling back to the pre-envelope split keys. */
export function loadAccountProfile(storage: AccountStorage | null): LoadedAccountProfile {
  if (!storage) return { account: createDefaultAccountProfile(), settledRuns: {}, finalizedOutbox: [] };
  let stored: string | null;
  try { stored = storage.getItem(ACCOUNT_STORAGE_KEY); }
  catch { return { account: createDefaultAccountProfile(), settledRuns: {}, finalizedOutbox: [] }; }
  const raw = parseJson(stored ?? undefined);
  if (isRecord(raw) && raw.version === 1 && isRecord(raw.records)) {
    const records: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.records)) if (typeof value === "string") records[key] = value;
    return {
      account: loadFromRecords(records),
      settledRuns: validSettledRuns(raw.settledRuns),
      finalizedOutbox: validOutbox(raw.finalizedOutbox),
    };
  }
  // A present envelope is authoritative even if damaged. Falling back to stale split keys
  // could revive rewards/allocations that were already changed in a later transaction.
  if (stored !== null) return { account: createDefaultAccountProfile(), settledRuns: {}, finalizedOutbox: [] };
  const records: Record<string, string> = {};
  // Keep migration read-only: the next account write atomically replaces these keys.
  for (const key of [ROLE_EXPERIENCE_STORAGE_KEY, "phd_simulator_v2_role_records_v1", "phd_simulator_v2_role_achievements_v2", "phd_simulator_v2_role_talents_v2", ACCOUNT_LOBBY_STORAGE_KEY]) {
    try {
      const value = storage.getItem(key);
      if (value !== null) records[key] = value;
    } catch { /* An unavailable optional legacy record is treated as absent. */ }
  }
  return { account: loadFromRecords(records), settledRuns: {}, finalizedOutbox: [] };
}

/** Serialises every account record into memory and performs exactly one browser write. */
export function saveAccountProfile(
  account: AccountProfile,
  storage: AccountStorage | null,
  settledRuns: Partial<Record<RoleId, string>> = {},
  finalizedOutbox: readonly FinalizedRunRecord[] = [],
): void {
  if (!storage) return;
  const records: Record<string, string> = {};
  const collector = memoryStorage(records);
  saveRoleExperience(account, collector);
  saveRoleRecords(account, collector);
  saveRoleAchievementRecords(account, collector);
  saveRoleTalentAllocation(account, collector);
  records[ACCOUNT_LOBBY_STORAGE_KEY] = JSON.stringify({ dateDisplayMode: account.dateDisplayMode, selectedLobbyRoleId: account.selectedLobbyRoleId });
  const envelope: Envelope = {
    version: 1,
    records,
    settledRuns: validSettledRuns(settledRuns),
    finalizedOutbox: validOutbox([...finalizedOutbox]),
  };
  // Deliberately let quota/security failures propagate: callers can retain the in-memory state
  // and surface a save warning instead of falsely reporting a durable save.
  storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(envelope));
}

export function loadRoleExperience(account: AccountProfile, storage: ExperienceStorage | null): AccountProfile {
  try {
    const saved = parseJson(storage?.getItem(ROLE_EXPERIENCE_STORAGE_KEY) ?? undefined);
    if (!isRecord(saved) || saved.version !== 1 || !isRecord(saved.roles)) return account;
    const roleProgress = { ...account.roleProgress };
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const value = saved.roles[roleId];
      if (!isRecord(value) || !Number.isSafeInteger(value.level) || !Number.isSafeInteger(value.exp)
        || (value.level as number) < 0 || (value.level as number) > MAX_ROLE_LEVEL || (value.exp as number) < 0) continue;
      const level = value.level as number;
      const exp = value.exp as number;
      const next = getNextRoleLevelExperience(level);
      if (next !== null && exp >= next) continue;
      roleProgress[roleId] = { ...roleProgress[roleId], level, exp };
    }
    return { ...account, roleProgress };
  } catch { return account; }
}

export function saveRoleExperience(account: AccountProfile, storage: ExperienceStorage | null): void {
  if (!storage) return;
  storage.setItem(ROLE_EXPERIENCE_STORAGE_KEY, JSON.stringify({ version: 1, roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [roleId, { level: progress.level, exp: progress.exp }])) }));
}
