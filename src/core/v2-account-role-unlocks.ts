import type { AccountProfile, RoleId } from "./v2-types";
import { ACHIEVEMENT_CATALOG } from "./v2-achievement-catalog";
import { getAchievementUnlockRoleIds, isAchievementCompleted } from "./v2-achievement-scope";

export const CAPTAIN_UNLOCK_ACHIEVEMENT_ID = "unlock:research-captain";
export const CAPTAIN_PREREQUISITE_ROLE_IDS: readonly RoleId[] = [
  "normal", "rich", "genius", "social", "teacher-child", "chosen",
];

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
  if (!CAPTAIN_PREREQUISITE_ROLE_IDS.every(roleId => account.roleProgress[roleId]?.unlocked)) return account;
  const id = CAPTAIN_UNLOCK_ACHIEVEMENT_ID;
  const recorded = account.achievementUnlockedByRole?.[id];
  const alreadyRecorded = !!recorded && Object.keys(recorded).length > 0;
  const recipient = alreadyRecorded ? Object.keys(recorded)[0] as RoleId : completingRoleId;
  const progress = account.roleProgress[recipient];
  if (account.roleProgress["research-captain"].unlocked && alreadyRecorded
    && account.achievementUnlockedAt[id] && account.achievementRewardedIds?.includes(id)
    && progress.unlockedAchievementIds.includes(id)) return account;
  return {
    ...account,
    roleProgress: {
      ...account.roleProgress,
      "research-captain": { ...account.roleProgress["research-captain"], unlocked: true },
      [recipient]: { ...progress, ...(recipient === "research-captain" ? { unlocked: true } : {}),
        unlockedAchievementIds: [...new Set([...progress.unlockedAchievementIds, id])] },
    },
    achievementUnlockedAt: { ...account.achievementUnlockedAt, [id]: account.achievementUnlockedAt[id] ?? timestamp },
    achievementUnlockedByRole: { ...account.achievementUnlockedByRole,
      [id]: alreadyRecorded ? recorded : { [recipient]: timestamp } },
    achievementRewardedIds: [...new Set([...(account.achievementRewardedIds ?? []), id])],
  };
}
