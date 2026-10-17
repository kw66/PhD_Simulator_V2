import type { AccountProfile, RoleId } from "./v2-types";
import { ACHIEVEMENT_CATALOG } from "./v2-achievement-catalog";
import { getAchievementUnlockRoleIds, isAchievementCompleted } from "./v2-achievement-scope";
import { getAllAchievementDefinitions } from "./v2-role-lobby-meta";

export const CAPTAIN_UNLOCK_ACHIEVEMENT_ID = "unlock:research-captain";
export const REWINDER_UNLOCK_ACHIEVEMENT_ID = "unlock:rewinder";
export const REWINDER_REQUIRED_ACHIEVEMENTS = 24;
export const CAPTAIN_PREREQUISITE_ROLE_IDS: readonly RoleId[] = [
  "normal", "rich", "genius", "social", "teacher-child", "chosen",
];

/** Account records only contain formally settled completions. Repeated roles share one ID. */
export function getRewinderAchievementCount(account: AccountProfile): number {
  return getAllAchievementDefinitions().filter(definition => definition.id !== REWINDER_UNLOCK_ACHIEVEMENT_ID
    && isAchievementCompleted(account, definition)).length;
}

function recordAccountMilestone(account: AccountProfile, id: string, unlockedRole: RoleId,
  timestamp: string, completingRoleId: RoleId): AccountProfile {
  const recorded = account.achievementUnlockedByRole?.[id];
  const alreadyRecorded = !!recorded && Object.keys(recorded).length > 0;
  const recipient = alreadyRecorded ? Object.keys(recorded)[0] as RoleId : completingRoleId;
  const progress = account.roleProgress[recipient];
  if (account.roleProgress[unlockedRole].unlocked && alreadyRecorded
    && account.achievementUnlockedAt[id] && account.achievementRewardedIds?.includes(id)
    && progress.unlockedAchievementIds.includes(id)) return account;
  const firstDate = account.achievementUnlockedAt[id] ?? (alreadyRecorded ? recorded[recipient] : undefined) ?? timestamp;
  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      [unlockedRole]: { ...account.roleProgress[unlockedRole], unlocked: true },
      [recipient]: { ...progress, ...(recipient === unlockedRole ? { unlocked: true } : {}),
        unlockedAchievementIds: [...new Set([...progress.unlockedAchievementIds, id])] },
    },
    achievementUnlockedAt: { ...account.achievementUnlockedAt, [id]: firstDate },
    achievementUnlockedByRole: { ...account.achievementUnlockedByRole,
      [id]: alreadyRecorded ? recorded : { [recipient]: firstDate } },
    achievementRewardedIds: [...new Set([...(account.achievementRewardedIds ?? []), id])],
  };
}

/** Account milestones use permanent ownership, never a run's temporary/debug state. */
export function reconcileAccountRoleUnlocks(
  account: AccountProfile,
  timestamp = new Date().toISOString(),
  completingRoleId: RoleId = "normal",
): AccountProfile {
  // Reconcile permanent unlock rewards too, including achievements earned before a reward was added.
  // Experience and multiplier rewards remain exclusively in the one-time ending transaction.
  for (const definition of ACHIEVEMENT_CATALOG) {
    const missing = getAchievementUnlockRoleIds(definition).filter(roleId => !account.roleProgress[roleId].unlocked);
    if (!missing.length || !isAchievementCompleted(account, definition)) continue;
    account = { ...account, roleProgress: { ...account.roleProgress } };
    for (const roleId of missing) account.roleProgress[roleId] = { ...account.roleProgress[roleId], unlocked: true };
  }
  if (CAPTAIN_PREREQUISITE_ROLE_IDS.every(roleId => account.roleProgress[roleId]?.unlocked)) {
    account = recordAccountMilestone(account, CAPTAIN_UNLOCK_ACHIEVEMENT_ID, "research-captain", timestamp, completingRoleId);
  }
  if (getRewinderAchievementCount(account) >= REWINDER_REQUIRED_ACHIEVEMENTS) {
    account = recordAccountMilestone(account, REWINDER_UNLOCK_ACHIEVEMENT_ID, "rewinder", timestamp, completingRoleId);
  }
  return account;
}
