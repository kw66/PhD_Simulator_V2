import type { AccountProfile, RoleId } from "./v2-types";
import { sanitizeRoleTalentAllocation, type TalentAllocation } from "./v2-role-talent-definitions";

export const ROLE_TALENT_STORAGE_KEY = "phd_simulator_v2_role_talents_v1";
type TalentStorage = Pick<Storage, "getItem" | "setItem">;

export function loadRoleTalentAllocation(account: AccountProfile, storage: TalentStorage | null): AccountProfile {
  const talentAllocation: TalentAllocation = {};
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ROLE_TALENT_STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("roles" in saved) || !saved.roles || typeof saved.roles !== "object") return { ...account, talentAllocation };
    for (const roleId of Object.keys(account.roleProgress) as RoleId[]) {
      const allocation = sanitizeRoleTalentAllocation(roleId, account.roleProgress[roleId].level, (saved.roles as Record<string, unknown>)[roleId]);
      if (Object.keys(allocation).length > 0) talentAllocation[roleId] = allocation;
    }
  } catch {
    // A damaged or blocked storage entry must not prevent opening the game.
  }
  return { ...account, talentAllocation };
}

export function saveRoleTalentAllocation(account: AccountProfile, storage: TalentStorage | null): void {
  try {
    storage?.setItem(ROLE_TALENT_STORAGE_KEY, JSON.stringify({ version: 1, roles: account.talentAllocation ?? {} }));
  } catch {
    // Keep this session's allocation when storage is unavailable.
  }
}
