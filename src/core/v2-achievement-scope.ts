import { getRoleDefinition } from "./v2-progression";
import type { AccountProfile, AchievementAudience, AchievementScope, RoleAchievementDefinition, RoleId } from "./v2-types";

const SPECIAL_ROLES = new Set<RoleId>(["rewinder", "research-captain", "special-dandan", "special-daji"]);
const CURSED_ROLES = new Set<RoleId>(["cursed-frail", "cursed-debt", "special-finite-life", "special-fading-genius"]);
const AUDIENCE_LABELS: Record<AchievementAudience, string> = {
  all: "通用", upright: "正位", reversed: "逆位", special: "特殊", cursed: "诅咒",
};

export function getAchievementAudience(roleId: RoleId): AchievementAudience {
  if (SPECIAL_ROLES.has(roleId)) return "special";
  if (CURSED_ROLES.has(roleId)) return "cursed";
  return getRoleDefinition(roleId).mode;
}

export function isAchievementAvailableToRole(scope: AchievementScope | undefined, roleId: RoleId): boolean {
  if (!scope || scope.audiences?.includes("all")) return true;
  return !!scope.roleIds?.includes(roleId) || !!scope.audiences?.includes(getAchievementAudience(roleId));
}

export function getAchievementScopeLabels(scope?: AchievementScope): string[] {
  if (!scope || scope.audiences?.includes("all")) return ["通用"];
  return [...(scope.audiences ?? []).map(audience => AUDIENCE_LABELS[audience]),
    ...(scope.roleIds ?? []).map(roleId => getRoleDefinition(roleId).name)];
}

/** Shared definitions have one completion across eligible roles; graduation IDs remain role-specific. */
export function isAchievementCompleted(account: AccountProfile, definition: RoleAchievementDefinition): boolean {
  const originalIds: Record<string, string> = { "unlock:rich": "normal:first-pot", "unlock:genius": "normal:research-start",
    "unlock:teacher-child": "normal:favorite", "unlock:social": "normal:socialite", "unlock:chosen": "normal:all-rounder", "unlock:normal-reversed": "normal:chair-upgrade" };
  const id = originalIds[definition.id] ?? definition.id;
  if (account.achievementUnlockedByRole?.[id]
    && Object.keys(account.achievementUnlockedByRole[id]!).length > 0) return true;
  return (Object.keys(account.roleProgress) as RoleId[]).some(roleId =>
    isAchievementAvailableToRole(definition.scope, roleId)
      && account.roleProgress[roleId].unlockedAchievementIds.includes(id));
}
