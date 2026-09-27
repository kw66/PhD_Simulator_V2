import { getRoleAchievementDefinitions, getRoleLobbyAchievementDefinitions } from "./v2-role-lobby-meta";
import type { AccountProfile, RoleId } from "./v2-types";

type AchievementStorage = Pick<Storage, "getItem" | "setItem">;
const ACHIEVEMENT_STORAGE_KEY = "phd_simulator_v2_role_achievements_v1";

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function loadRoleAchievementRecords(account: AccountProfile, storage: AchievementStorage | null): AccountProfile {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ACHIEVEMENT_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("roles" in saved) || !saved.roles || typeof saved.roles !== "object") return account;

    const roles = saved.roles as Record<string, unknown>;
    const savedDates = "unlockedAt" in saved && saved.unlockedAt && typeof saved.unlockedAt === "object"
      ? saved.unlockedAt as Record<string, unknown>
      : {};
    const roleProgress = { ...account.roleProgress };
    const achievementUnlockedAt: Record<string, string> = {};
    for (const roleId of Object.keys(roleProgress) as RoleId[]) {
      const value = roles[roleId];
      if (!value || typeof value !== "object") continue;
      const record = value as Record<string, unknown>;
      const knownIds = new Set(getRoleAchievementDefinitions(roleId).map((definition) => definition.id));
      const unlockedAchievementIds = Array.isArray(record.unlockedAchievementIds)
        ? record.unlockedAchievementIds.filter((id): id is string => typeof id === "string" && knownIds.has(id))
        : [];
      roleProgress[roleId] = {
        ...roleProgress[roleId],
        unlocked: roleId === "normal" || record.unlocked === true,
        unlockedAchievementIds,
      };
      for (const definition of getRoleLobbyAchievementDefinitions(roleId)) {
        const savedDate = savedDates[definition.id];
        const unlocked = definition.unlocksRoleId
          ? roleProgress[roleId].unlocked
          : unlockedAchievementIds.includes(definition.id);
        if (unlocked && isValidTimestamp(savedDate)) {
          achievementUnlockedAt[definition.id] = savedDate;
        }
      }
    }
    return { ...account, roleProgress, achievementUnlockedAt };
  } catch {
    return account;
  }
}

export function recordNewAchievementDates(
  previous: AccountProfile,
  next: AccountProfile,
  timestamp = new Date().toISOString(),
): AccountProfile {
  let dates = next.achievementUnlockedAt;
  for (const roleId of Object.keys(next.roleProgress) as RoleId[]) {
    const before = previous.roleProgress[roleId];
    const after = next.roleProgress[roleId];
    for (const definition of getRoleLobbyAchievementDefinitions(roleId)) {
      const wasUnlocked = definition.unlocksRoleId
        ? before.unlocked
        : before.unlockedAchievementIds.includes(definition.id);
      const isUnlocked = definition.unlocksRoleId
        ? after.unlocked
        : after.unlockedAchievementIds.includes(definition.id);
      if (isUnlocked && !wasUnlocked && !dates[definition.id]) {
        dates = { ...dates, [definition.id]: timestamp };
      }
    }
  }
  return dates === next.achievementUnlockedAt ? next : { ...next, achievementUnlockedAt: dates };
}

export function achievementRecordsChanged(previous: AccountProfile, next: AccountProfile): boolean {
  if (Object.keys(previous.achievementUnlockedAt).length !== Object.keys(next.achievementUnlockedAt).length
    || Object.entries(next.achievementUnlockedAt).some(([id, date]) => previous.achievementUnlockedAt[id] !== date)) return true;
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
    storage?.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify({
      version: 1,
      unlockedAt: account.achievementUnlockedAt,
      roles: Object.fromEntries(Object.entries(account.roleProgress).map(([roleId, progress]) => [
        roleId, { unlocked: progress.unlocked, unlockedAchievementIds: progress.unlockedAchievementIds },
      ])),
    }));
  } catch {
    // Achievement records remain available for the current session when browser storage is unavailable.
  }
}
