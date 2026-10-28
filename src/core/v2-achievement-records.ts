import { DATA_EPOCH, DATA_EPOCH_STARTED_AT, isCurrentDataEpoch } from "./v2-data-epoch";
import { getAllAchievementDefinitions, getRoleAchievementDefinitions } from "./v2-role-lobby-meta";
import { isAchievementAvailableToRole, isAchievementCompleted } from "./v2-achievement-scope";
import { COLLECTION_REQUIREMENTS, getCollectorAchievementKey } from "./v2-achievement-collections";
import type { AccountProfile, RoleId } from "./v2-types";

type AchievementStorage = Pick<Storage, "getItem" | "setItem">;
export const ROLE_ACHIEVEMENT_STORAGE_KEY = "phd_simulator_v2_role_achievements_v3";

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value && date.getTime() >= Date.parse(DATA_EPOCH_STARTED_AT);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function loadRoleAchievementRecords(account: AccountProfile, storage: AchievementStorage | null): AccountProfile {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ROLE_ACHIEVEMENT_STORAGE_KEY) ?? "null");
    if (!isRecord(saved) || saved.version !== 2 || !isCurrentDataEpoch(saved) || !isRecord(saved.roles)) return account;
    const definitions = getAllAchievementDefinitions();
    const knownIds = new Set(definitions.map(definition => definition.id));
    const knownRoles = new Set(Object.keys(account.roleProgress));
    // Narrowing future eligibility must not erase a previously paid shared
    // completion or its per-role date. Scoped role challenges remain strict.
    const previouslyPaidShared = new Set(Array.isArray(saved.rewardedIds)
      ? saved.rewardedIds.filter((id): id is string => typeof id === "string" && id.startsWith("global:") && knownIds.has(id)) : []);
    const savedDates = isRecord(saved.unlockedAt) ? saved.unlockedAt : {};
    const savedRoleDates = isRecord(saved.unlockedByRole) ? saved.unlockedByRole : {};
    const roleProgress = { ...account.roleProgress };
    const achievementUnlockedAt: Record<string, string> = {};
    const achievementUnlockedByRole: NonNullable<AccountProfile["achievementUnlockedByRole"]> = {};
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const record = saved.roles[roleId];
      if (!isRecord(record)) continue;
      const availableIds = new Set([...getRoleAchievementDefinitions(roleId).map(definition => definition.id), ...previouslyPaidShared]);
      const unlockedAchievementIds = Array.isArray(record.unlockedAchievementIds)
        ? [...new Set(record.unlockedAchievementIds.filter((id): id is string => typeof id === "string" && availableIds.has(id)
          && (isValidTimestamp(savedDates[id]) || (isRecord(savedRoleDates[id]) && isValidTimestamp(savedRoleDates[id][roleId])))))] : [];
      roleProgress[roleId] = { ...roleProgress[roleId],
        unlocked: roleId === "normal" || record.unlocked === true, unlockedAchievementIds };
    }
    for (const definition of definitions) {
      const value = savedRoleDates[definition.id];
      if (!isRecord(value)) continue;
      const roleDates: Partial<Record<RoleId, string>> = {};
      for (const [rawRoleId, date] of Object.entries(value)) {
        const roleId = rawRoleId as RoleId;
        if (!knownRoles.has(roleId) || (!isAchievementAvailableToRole(definition.scope, roleId)
          && !previouslyPaidShared.has(definition.id)) || !isValidTimestamp(date)) continue;
        roleDates[roleId] = date;
        const progress = roleProgress[roleId];
        roleProgress[roleId] = { ...progress, unlockedAchievementIds: [...new Set([...progress.unlockedAchievementIds, definition.id])] };
      }
      if (Object.keys(roleDates).length > 0) achievementUnlockedByRole[definition.id] = roleDates;
    }
    const restored = { ...account, roleProgress, achievementUnlockedByRole };
    for (const definition of definitions) {
      const date = savedDates[definition.id];
      if (isValidTimestamp(date) && isAchievementCompleted(restored, definition)) achievementUnlockedAt[definition.id] = date;
    }
    const collectionProgress = { buffs: [], products: [], conferences: [], locations: [], directions: [] } as import("./v2-types").AchievementCollectionProgress;
    const rawCollection = isRecord(saved.collectionProgress) ? saved.collectionProgress : {};
    for (const key of Object.keys(collectionProgress) as (keyof typeof collectionProgress)[]) {
      const raw = rawCollection[key];
      const available = new Set(COLLECTION_REQUIREMENTS[key].map(item => item.id));
      collectionProgress[key] = Array.isArray(raw)
        ? [...new Set(raw.filter((item): item is string => typeof item === "string" && available.has(item)))] : [];
    }
    const loadBonuses = (raw: unknown, fractional = false): Partial<Record<RoleId, number>> => isRecord(raw)
      ? Object.fromEntries(Object.entries(raw).filter(([id, value]) => knownRoles.has(id) && typeof value === "number"
        && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER && (fractional || Number.isSafeInteger(value)))) : {};
    const achievementRewardedIds = Array.isArray(saved.rewardedIds)
      ? [...new Set(saved.rewardedIds.filter((id): id is string => typeof id === "string" && knownIds.has(id)))] : [];
    const achievementExperienceMultipliers = loadBonuses(saved.experienceMultipliers, true);
    const achievementTalentPoints = loadBonuses(saved.talentPoints);
    // Only the five known, already-paid collectors changed reward. Preserve all
    // unrelated bonuses and let talent storage sanitize allocations afterwards.
    if (saved.collectorRewardVersion !== 1) {
      const paidCollectors = achievementRewardedIds.filter(id => getCollectorAchievementKey(id)).length;
      if (paidCollectors > 0) for (const roleId of Object.keys(roleProgress) as RoleId[]) {
        if (achievementTalentPoints[roleId] !== undefined) achievementTalentPoints[roleId] = Math.max(0, achievementTalentPoints[roleId]! - paidCollectors);
        achievementExperienceMultipliers[roleId] = Number(((achievementExperienceMultipliers[roleId] ?? 0) + paidCollectors * 0.2).toFixed(10));
      }
    }
    if (saved.unlockRewardVersion !== 1) {
      for (const roleId of ["genius", "teacher-child", "social", "rich", "chosen"] as const) {
        if (achievementRewardedIds.includes(`unlock:${roleId}-reversed`)) {
          achievementExperienceMultipliers[roleId] = Number(Math.max(0, (achievementExperienceMultipliers[roleId] ?? 0) - 1).toFixed(10));
        }
      }
      if (achievementRewardedIds.includes("normal:truly-ordinary")) {
        for (const roleId of Object.keys(roleProgress) as RoleId[]) {
          if (roleId !== "normal") achievementExperienceMultipliers[roleId] = Number(((achievementExperienceMultipliers[roleId] ?? 0) + 1).toFixed(10));
        }
      }
    }
    return { ...account, roleProgress, achievementUnlockedAt, achievementUnlockedByRole,
      achievementRewardedIds, achievementCollectionProgress: collectionProgress,
      achievementExperienceMultipliers, achievementTalentPoints };
  } catch {
    return account;
  }
}

export function recordNewAchievementDates(
  previous: AccountProfile,
  next: AccountProfile,
  timestamp = new Date().toISOString(),
): AccountProfile {
  if (!isValidTimestamp(timestamp)) return next;
  let dates = next.achievementUnlockedAt;
  let byRole = next.achievementUnlockedByRole ?? {};
  for (const roleId of Object.keys(next.roleProgress) as RoleId[]) {
    const before = previous.roleProgress[roleId].unlockedAchievementIds;
    for (const definition of getRoleAchievementDefinitions(roleId)) {
      if (before.includes(definition.id) || !next.roleProgress[roleId].unlockedAchievementIds.includes(definition.id)) continue;
      if (!dates[definition.id]) dates = { ...dates, [definition.id]: timestamp };
      if (!byRole[definition.id]?.[roleId]) byRole = { ...byRole,
        [definition.id]: { ...byRole[definition.id], [roleId]: timestamp } };
    }
  }
  return dates === next.achievementUnlockedAt && byRole === next.achievementUnlockedByRole ? next
    : { ...next, achievementUnlockedAt: dates, achievementUnlockedByRole: byRole };
}

export function achievementRecordsChanged(previous: AccountProfile, next: AccountProfile): boolean {
  if (Object.keys(previous.achievementUnlockedAt).length !== Object.keys(next.achievementUnlockedAt).length
    || Object.entries(next.achievementUnlockedAt).some(([id, date]) => previous.achievementUnlockedAt[id] !== date)) return true;
  if (JSON.stringify(previous.achievementUnlockedByRole ?? {}) !== JSON.stringify(next.achievementUnlockedByRole ?? {})
    || JSON.stringify(previous.achievementRewardedIds ?? []) !== JSON.stringify(next.achievementRewardedIds ?? [])
    || JSON.stringify(previous.achievementCollectionProgress ?? {}) !== JSON.stringify(next.achievementCollectionProgress ?? {})
    || JSON.stringify(previous.achievementTalentPoints ?? {}) !== JSON.stringify(next.achievementTalentPoints ?? {})
    || JSON.stringify(previous.achievementExperienceMultipliers ?? {}) !== JSON.stringify(next.achievementExperienceMultipliers ?? {})) return true;
  return (Object.keys(next.roleProgress) as RoleId[]).some((roleId) => {
    const before = previous.roleProgress[roleId];
    const after = next.roleProgress[roleId];
    return before.unlocked !== after.unlocked
      || before.unlockedAchievementIds.length !== after.unlockedAchievementIds.length
      || after.unlockedAchievementIds.some((id) => !before.unlockedAchievementIds.includes(id));
  });
}

export function saveRoleAchievementRecords(account: AccountProfile, storage: AchievementStorage | null): void {
  try {
    storage?.setItem(ROLE_ACHIEVEMENT_STORAGE_KEY, JSON.stringify({
      version: 2,
      collectorRewardVersion: 1,
      unlockRewardVersion: 1,
      epoch: DATA_EPOCH,
      savedAt: new Date().toISOString(),
      unlockedAt: account.achievementUnlockedAt,
      unlockedByRole: account.achievementUnlockedByRole ?? {},
      rewardedIds: account.achievementRewardedIds ?? [],
      collectionProgress: account.achievementCollectionProgress,
      experienceMultipliers: account.achievementExperienceMultipliers ?? {},
      talentPoints: account.achievementTalentPoints ?? {},
      roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [
        roleId, { unlocked: progress.unlocked, unlockedAchievementIds: progress.unlockedAchievementIds },
      ])),
    }));
  } catch {
    // Achievement records remain available for the current session when browser storage is unavailable.
  }
}
