import { isCursedRole, normalizeCurseDifficulty, type CurseDifficulty } from "./v2-curse-system";
import type { AccountProfile, GameState, RoleId } from "./v2-types";

/** Difficulties are numbered 1–4; every curse starts with only the first unlocked. */
export function getUnlockedCurseDifficulty(account: AccountProfile, roleId: RoleId): CurseDifficulty {
  return isCursedRole(roleId) ? normalizeCurseDifficulty(account.curseDifficultyUnlocked?.[roleId]) : 1;
}

export function getSelectedCurseDifficulty(account: AccountProfile, roleId: RoleId): CurseDifficulty {
  return Math.min(getUnlockedCurseDifficulty(account, roleId),
    normalizeCurseDifficulty(account.curseDifficultyByRole?.[roleId])) as CurseDifficulty;
}

/** Lobby selection is a preference, never evidence of beating a challenge. */
export function selectCurseDifficulty(account: AccountProfile, roleId: RoleId, difficulty: unknown): AccountProfile {
  if (!isCursedRole(roleId) || !account.roleProgress[roleId].unlocked
    || difficulty !== normalizeCurseDifficulty(difficulty)
    || (difficulty as number) > getUnlockedCurseDifficulty(account, roleId)) return account;
  if (getSelectedCurseDifficulty(account, roleId) === difficulty) return account;
  return { ...account, curseDifficultyByRole: { ...account.curseDifficultyByRole, [roleId]: difficulty as CurseDifficulty } };
}

/** Call only from the validated, non-debug finalization transaction. Ending previews do not unlock ranks. */
export function settleCurseDifficultyProgress(account: AccountProfile, state: GameState): AccountProfile {
  const roleId = state.selectedRoleId;
  if (state.phase !== "finished" || state.ending !== "phd" || !isCursedRole(roleId)
    || !state.curseState || !account.roleProgress[roleId].unlocked) return account;
  const unlocked = getUnlockedCurseDifficulty(account, roleId);
  if (unlocked >= 4 || state.curseState.difficulty !== unlocked) return account;
  return { ...account, curseDifficultyUnlocked: { ...account.curseDifficultyUnlocked,
    [roleId]: (unlocked + 1) as CurseDifficulty } };
}
