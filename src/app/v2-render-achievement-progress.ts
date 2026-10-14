import type { RoleAchievementDefinition } from "../core/v2-types";

/** Display contract for the future database snapshot. No completion tracking or network IO yet. */
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
): string {
  const percent = getAchievementGlobalPercentage(globalCompletion);
  const label = percent === null ? "—%" : percent > 0 && percent < 0.1 ? "<0.1%" : `${Number(percent.toFixed(1))}%`;
  const status = percent === null ? "全球达成率，统计尚未接入" : `全球达成率 ${label}`;
  return `
    <article class="lobby-profile-achievement${unlocked ? " is-unlocked" : ""}" data-achievement-id="${escapeHtml(definition.id)}">
      <span class="achievement-completion-fill" aria-hidden="true" style="width:${percent ?? 0}%"></span>
      <span class="lobby-profile-achievement-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
      <div class="lobby-profile-achievement-copy">
        <p class="lobby-profile-achievement-condition"><strong>${escapeHtml(definition.title)}</strong>：${escapeHtml(definition.description)}</p>
        ${definition.rewardText ? `<p class="lobby-profile-achievement-reward">${escapeHtml(definition.rewardText)}</p>` : ""}
        ${dateMarkup}
      </div>
      <span class="achievement-global-rate${percent === null ? " is-pending" : ""}" aria-label="${escapeHtml(status)}" title="${escapeHtml(status)}">${escapeHtml(label)}</span>
    </article>`;
}
