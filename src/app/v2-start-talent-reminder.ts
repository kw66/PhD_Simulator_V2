import { isRoleOwned } from "../core/v2-lobby";
import { getDesignedTalentNodes, getTalentPointBalance, isRoleTalentImplemented } from "../core/v2-role-talent-definitions";
import type { AccountProfile, GameState, RoleId } from "../core/v2-types";

/** Saved runs use their frozen talent allocation, independently of lobby edits. */
export function getStartTalentReminderPoints(account: AccountProfile, roleId: RoleId, hasRoleSave: boolean,
  savedRun?: { phase: GameState["phase"]; levels: Record<string, number> } | null): number | null {
  if (!isRoleOwned(account, roleId) || !isRoleTalentImplemented(roleId)) return null;
  if (hasRoleSave && savedRun?.phase !== "playing") return null;
  const allocation = hasRoleSave ? savedRun!.levels : account.talentAllocation?.[roleId] ?? {};
  const hasAllocation = getDesignedTalentNodes(roleId)?.some(node => !node.fixed && node.cost > 0 && (allocation[node.id] ?? 0) > 0);
  if (hasAllocation) return null;
  const points = getTalentPointBalance(roleId, account.roleProgress[roleId].level, allocation, account.achievementTalentPoints?.[roleId] ?? 0);
  return points > 0 ? points : null;
}

export function renderStartTalentReminder(points: number, continuing = false): string {
  return `
    <div class="game-confirm-overlay talent-start-reminder" role="dialog" aria-modal="true" aria-labelledby="talent-start-title" aria-describedby="talent-start-description">
      <button class="game-confirm-backdrop" type="button" data-ui-close-talent-reminder tabindex="-1" aria-label="返回角色页"></button>
      <section class="game-confirm-dialog">
        <header class="game-confirm-heading">
          <h2 id="talent-start-title"><i data-lucide="sparkles" aria-hidden="true"></i>别忘了点亮天赋</h2>
          <button class="game-confirm-close" type="button" data-ui-close-talent-reminder aria-label="关闭"><i data-lucide="x" aria-hidden="true"></i></button>
        </header>
        <div class="game-confirm-copy" id="talent-start-description">
          <p>${continuing ? "本局" : "当前角色"}还没有加点，有 <strong>${points} 点</strong>天赋点可用。</p>
          <p>${continuing ? "重开会将本局按主动退学结算，返回天赋树加点。" : "点亮天赋可以让开局更轻松。"}</p>
        </div>
        <div class="game-confirm-actions">
          <button class="game-confirm-button" type="button" data-ui-start-without-talents>${continuing ? "仍然继续" : "仍然开始"}</button>
          <button class="game-confirm-button is-talent-primary" type="button" ${continuing ? "data-ui-restart-allocate-talents" : "data-ui-go-allocate-talents"} data-talent-reminder-initial-focus>${continuing ? "重开加点" : "去加点"}</button>
        </div>
      </section>
    </div>
  `;
}
