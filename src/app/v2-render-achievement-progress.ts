import type { RoleAchievementDefinition } from "../core/v2-types";
import { getAchievementScopeLabels } from "../core/v2-achievement-scope";

/** Aggregated anonymous-player counts from one shared database snapshot. */
export interface AchievementGlobalCompletion {
  achievedPlayers: number;
  eligiblePlayers: number;
}

export function getAchievementGlobalPercentage(value?: AchievementGlobalCompletion): number | null {
  if (!value || !Number.isSafeInteger(value.achievedPlayers) || !Number.isSafeInteger(value.eligiblePlayers)
    || value.eligiblePlayers <= 0 || value.achievedPlayers < 0 || value.achievedPlayers > value.eligiblePlayers) return null;
  return value.achievedPlayers / value.eligiblePlayers * 100;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderAchievementCard(
  definition: RoleAchievementDefinition,
  unlocked: boolean,
  dateMarkup = "",
  globalCompletion?: AchievementGlobalCompletion,
  hoverText = "",
): string {
  const percent = getAchievementGlobalPercentage(globalCompletion);
  const label = percent === null ? "—%" : percent > 0 && percent < 0.1 ? "<0.1%" : `${Number(percent.toFixed(1))}%`;
  const status = percent === null ? (globalCompletion?.eligiblePlayers === 0 ? "暂无符合条件的已结算玩家" : "全球达成率暂不可用")
    : `全球达成率 ${label}（${globalCompletion!.achievedPlayers}/${globalCompletion!.eligiblePlayers} 位符合条件的已结算玩家）`;
  const detail = hoverText || dateMarkup.replace(/<[^>]*>/g, "").trim();
  const tooltip = [`${definition.title}：${definition.description}`, definition.rewardText,
    `适用对象：${getAchievementScopeLabels(definition.scope).join("、")}`, detail].filter(Boolean).join("\n");
  return `
    <article class="lobby-profile-achievement${unlocked ? " is-unlocked" : ""}" data-achievement-id="${escapeHtml(definition.id)}"${tooltip ? ` data-card-tooltip data-tooltip="${escapeHtml(tooltip)}" tabindex="0"` : ""}>
      <span class="achievement-completion-fill" aria-hidden="true" style="width:${percent ?? 0}%"></span>
      <span class="lobby-profile-achievement-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
      <div class="lobby-profile-achievement-copy">
        <p class="lobby-profile-achievement-condition"><strong>${escapeHtml(definition.title)}</strong>：${escapeHtml(definition.description)}</p>
        ${definition.rewardText ? `<p class="lobby-profile-achievement-reward">${escapeHtml(definition.rewardText)}</p>` : ""}
      </div>
      <div class="achievement-card-meta">
        <span class="achievement-global-rate${percent === null ? " is-pending" : ""}" aria-label="${escapeHtml(status)}" title="${escapeHtml(status)}">${escapeHtml(label)}</span>
        <div class="achievement-scope-tags" aria-label="适用对象">${getAchievementScopeLabels(definition.scope).map(label => `<span class="achievement-scope-tag">${escapeHtml(label)}</span>`).join("")}</div>
      </div>
    </article>`;
}
