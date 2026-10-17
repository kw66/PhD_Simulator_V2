import { getAllAchievementDefinitions } from "./v2-role-lobby-meta";
import { getAchievementUnlockRoleIds, isAchievementAvailableToRole, isAchievementCompleted } from "./v2-achievement-scope";
import { createAchievementRunProgress } from "./v2-achievement-runtime-types";
import { observeStateAchievements } from "./v2-achievement-state";
import { observeResearchAchievements } from "./v2-achievement-research";
import { observeEventAchievements } from "./v2-achievement-events";
import { COLLECTION_REQUIREMENTS, getCollectorAchievementKey, observeAchievementCollections } from "./v2-achievement-collections";
import { awardRoleExperience } from "./v2-role-experience";
import { CAPTAIN_UNLOCK_ACHIEVEMENT_ID, REWINDER_UNLOCK_ACHIEVEMENT_ID, reconcileAccountRoleUnlocks } from "./v2-account-role-unlocks";
import type { AccountProfile, AchievementCollectionProgress, DispatchPayload, GameActionId, GameState, RoleId } from "./v2-types";

/** Pure evidence update. Called only on committed engine transitions, never scene previews. */
export function observeAchievements(previous: GameState, next: GameState, actionId?: GameActionId, payload?: DispatchPayload): GameState {
  if (next.phase === "setup" || actionId?.startsWith("debug-")) return next;
  const run = structuredClone(next.achievementProgress ?? createAchievementRunProgress());
  const before = previous.phase === "setup" ? next : previous;
  observeStateAchievements(before, next, run, actionId, payload);
  observeResearchAchievements(before, next, run);
  observeEventAchievements(before, next, run);
  observeAchievementCollections(before, next, run, actionId, payload);
  return { ...next, achievementProgress: run };
}

/** The complete ending transaction. A new role adds a date, but never regrants the shared reward. */
export function settleRunAchievements(account: AccountProfile, state: GameState, timestamp = new Date().toISOString()): {
  account: AccountProfile; state: GameState; experienceForCurrentRole: number;
} {
  if (state.phase !== "finished" || !state.ending) return { account, state, experienceForCurrentRole: 0 };
  const roleId = state.selectedRoleId;
  const run = state.achievementProgress ?? createAchievementRunProgress();
  const collection = { ...createAchievementRunProgress().collections };
  for (const key of Object.keys(collection) as (keyof AchievementCollectionProgress)[]) {
    const known = new Set(COLLECTION_REQUIREMENTS[key].map(item => item.id));
    collection[key] = [...new Set([...(account.achievementCollectionProgress?.[key] ?? []), ...run.collections[key]])].filter(id => known.has(id));
  }
  const next: AccountProfile = { ...account, roleProgress: { ...account.roleProgress },
    achievementUnlockedAt: { ...account.achievementUnlockedAt },
    achievementUnlockedByRole: structuredClone(account.achievementUnlockedByRole ?? {}),
    achievementRewardedIds: [...(account.achievementRewardedIds ?? [])],
    achievementCollectionProgress: collection,
    achievementExperienceMultipliers: { ...account.achievementExperienceMultipliers },
    achievementTalentPoints: { ...account.achievementTalentPoints },
  };
  const candidates = new Set(run.satisfied);
  const newlyCompleted: string[] = [];
  let experienceForCurrentRole = 0;
  for (const definition of getAllAchievementDefinitions()) {
    // This account milestone is derived after all ordinary role unlocks settle.
    if (definition.id === CAPTAIN_UNLOCK_ACHIEVEMENT_ID || definition.id === REWINDER_UNLOCK_ACHIEVEMENT_ID) continue;
    if (!isAchievementAvailableToRole(definition.scope, roleId)) continue;
    const collector = getCollectorAchievementKey(definition.id);
    if (collector && COLLECTION_REQUIREMENTS[collector].length > 0
      && COLLECTION_REQUIREMENTS[collector].every(item => collection[collector].includes(item.id))) candidates.add(definition.id);
    if (!candidates.has(definition.id)) continue;
    const existed = isAchievementCompleted(account, definition);
    const roleDates = next.achievementUnlockedByRole![definition.id] ?? {};
    // Account-level collections finish once, unlike repeatable per-role challenges.
    if (!roleDates[roleId] && !(collector && existed)) {
      next.achievementUnlockedByRole![definition.id] = { ...roleDates, [roleId]: timestamp };
      newlyCompleted.push(definition.id);
    }
    next.achievementUnlockedAt[definition.id] ??= timestamp;
    const progress = next.roleProgress[roleId];
    next.roleProgress[roleId] = { ...progress, unlockedAchievementIds: [...new Set([...progress.unlockedAchievementIds, definition.id])] };
    if (next.achievementRewardedIds!.includes(definition.id)) continue;
    // Older actual completions must not be paid again when records are loaded.
    next.achievementRewardedIds!.push(definition.id);
    if (existed) continue;
    const exp = Number(/经验\+(\d+)/u.exec(definition.rewardText ?? "")?.[1] ?? 0);
    const multiplier = Number(/经验倍率\+(\d+(?:\.\d+)?)/u.exec(definition.rewardText ?? "")?.[1] ?? 0);
    const points = Number(/天赋点\+(\d+)/u.exec(definition.rewardText ?? "")?.[1] ?? 0);
    for (const recipient of Object.keys(next.roleProgress) as RoleId[]) {
      if (!isAchievementAvailableToRole(definition.rewardScope ?? definition.scope, recipient)) continue;
      if (exp) {
        // All rewards earned together use the multiplier from before this ending.
        const award = awardRoleExperience(next.roleProgress[recipient], exp, 1 + (account.achievementExperienceMultipliers?.[recipient] ?? 0));
        next.roleProgress[recipient] = award.progress;
        if (recipient === roleId) experienceForCurrentRole += award.gained;
      }
      if (multiplier) next.achievementExperienceMultipliers![recipient] = Number(((next.achievementExperienceMultipliers![recipient] ?? 0) + multiplier).toFixed(10));
      if (points) next.achievementTalentPoints![recipient] = (next.achievementTalentPoints![recipient] ?? 0) + points;
    }
    const legacyUnlocks: Record<string, RoleId> = { "normal:first-pot": "rich", "normal:research-start": "genius",
      "normal:favorite": "teacher-child", "normal:socialite": "social", "normal:all-rounder": "chosen", "normal:chair-upgrade": "normal-reversed" };
    const unlockIds = getAchievementUnlockRoleIds(definition);
    for (const unlockId of unlockIds.length ? unlockIds : legacyUnlocks[definition.id] ? [legacyUnlocks[definition.id]] : []) {
      next.roleProgress[unlockId] = { ...next.roleProgress[unlockId], unlocked: true };
    }
  }
  const reconciled = reconcileAccountRoleUnlocks(next, timestamp, roleId);
  for (const id of [CAPTAIN_UNLOCK_ACHIEVEMENT_ID, REWINDER_UNLOCK_ACHIEVEMENT_ID]) {
    if (!account.achievementUnlockedAt[id] && reconciled.achievementUnlockedAt[id]) newlyCompleted.push(id);
  }
  return { account: reconciled, state: { ...state, runAchievementIds: newlyCompleted }, experienceForCurrentRole };
}
