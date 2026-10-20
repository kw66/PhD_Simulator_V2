import { getRoleDefinition } from "../core/v2-progression";
import { MAX_ROLE_LEVEL } from "../core/v2-role-experience";
import type { AccountProfile } from "../core/v2-types";
import type { RoleLevelStatsSnapshot } from "./v2-role-level-stats";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function displayLevel(value: number | null): string {
  return value === null ? "—" : Number(value.toFixed(1)).toString();
}

/** Pure markup: opening the panel, not rendering it, requests the shared snapshot. */
export function renderRoleLevelStatsOverlay(account: AccountProfile, snapshot: RoleLevelStatsSnapshot): string {
  const role = getRoleDefinition(account.selectedLobbyRoleId);
  const progress = account.roleProgress[role.id];
  const ownLevel = progress.unlocked ? progress.level : null;
  const data = snapshot.data;
  const populated = !!data?.players;
  const peak = data ? Math.max(1, ...data.counts) : 1;
  const chart = populated ? `<div class="role-level-stats-chart" role="list" aria-label="0至${MAX_ROLE_LEVEL}级玩家分布">
    ${data.counts.map((count, level) => `<div class="role-level-stats-column${ownLevel === level ? " is-own-level" : ""}" role="listitem" aria-label="${level}级：${count}位玩家${ownLevel === level ? "，我的等级" : ""}">
      <span class="role-level-stats-count">${count}</span>
      <div class="role-level-stats-track"><span class="role-level-stats-bar" style="height:${count ? Math.max(3, count / peak * 100) : 0}%"></span></div>
      <span class="role-level-stats-level">${level}</span>
    </div>`).join("")}
  </div>` : `<div class="role-level-stats-empty" role="status">${snapshot.status === "loading" ? "正在读取等级分布…" : data ? "暂无等级样本" : "等级统计暂不可用，稍后再试"}</div>`;
  return `<div class="role-level-stats-overlay">
    <button class="role-level-stats-backdrop" type="button" data-ui-close-level-stats aria-label="关闭等级统计"></button>
    <section class="role-level-stats-dialog" role="dialog" aria-modal="true" aria-labelledby="role-level-stats-title" tabindex="-1">
      <header class="role-level-stats-header">
        <div><p class="role-level-stats-eyebrow">${escapeHtml(role.name)}</p><h2 id="role-level-stats-title">玩家等级</h2></div>
        <button class="role-level-stats-close" type="button" data-ui-close-level-stats aria-label="关闭等级统计">×</button>
      </header>
      <div class="role-level-stats-summary">
        <div><strong>${data ? data.players.toLocaleString("zh-CN") : "—"}</strong><span>统计玩家</span></div>
        <div><strong>${displayLevel(data?.meanLevel ?? null)}</strong><span>平均等级</span></div>
        <div><strong>${displayLevel(data?.medianLevel ?? null)}</strong><span>中位等级</span></div>
      </div>
      <div class="role-level-stats-chart-heading"><span>等级分布</span>${ownLevel === null ? "" : `<span class="role-level-stats-own">我的 Lv.${ownLevel}</span>`}</div>
      ${chart}
      <footer class="role-level-stats-footer"><span>已解锁玩家 · 按浏览器去重</span><span>${populated ? `满级 ${data.maxLevelPlayers} 人` : ""}</span></footer>
      <p class="role-level-stats-note">每个角色只记录最高等级，升级后更新；数据每10分钟刷新。</p>
    </section>
  </div>`;
}
