import {
  buildLobbySelectedRoleViewModel,
  getLobbyRolePageCount,
  getLobbyRolePageRows,
  getAchievementDisplayPages,
  isRoleOwned,
  LOBBY_ROLE_PAGE_ROW_COUNT,
} from "../core/v2-lobby";
import { formatMoney } from "../core/v2-money";
import { getRoleDefinition, getRoleOptions } from "../core/v2-progression";
import { getAchievementUnlockRoleIds } from "../core/v2-achievement-scope";
import {
  FRAIL_TALENT_NODES,
  FADING_GENIUS_TALENT_NODES,
  FINITE_LIFE_TALENT_NODES,
  DEBT_TALENT_NODES,
  NORMAL_TALENT_NODES,
  RICH_TALENT_NODES,
  GENIUS_TALENT_NODES,
  TEACHER_CHILD_TALENT_NODES,
  CHOSEN_TALENT_NODES,
  CHOSEN_REVERSED_TALENT_NODES,
  SOCIAL_TALENT_NODES,
  NORMAL_REVERSED_TALENT_NODES,
  RICH_REVERSED_TALENT_NODES,
  GENIUS_REVERSED_TALENT_NODES,
  TEACHER_CHILD_REVERSED_TALENT_NODES,
  SOCIAL_REVERSED_TALENT_NODES,
  getTalentPointBalance,
  isRoleTalentImplemented,
  type DesignedTalentNode,
  type TalentAllocation,
} from "../core/v2-role-talent-definitions";
import { animationNumberAttributes, animationBarAttribute, renderAnimatedNumber } from "./v2-render-animation";
import { getRoleLobbyAchievementDefinitions, getAllAchievementDefinitions } from "../core/v2-role-lobby-meta";
import { DEFAULT_ROLE_EXP_GAIN_MULTIPLIER, getNextRoleLevelExperience, MAX_ROLE_LEVEL, ROLE_TALENT_POINTS_PER_LEVEL } from "../core/v2-role-experience";
import type { AccountProfile, GameState, LobbySelectedRoleViewModel, RoleAchievementDefinition, RoleId } from "../core/v2-types";
import { getRoleCardPortraitUrl, getRoleDetailPortraitUrl } from "./v2-role-portrait-assets";
import { renderLobbyMasthead, renderLobbyMessageRailView } from "./v2-render-community";
import { renderLobbyAnnouncementRailView } from "./v2-render-announcements";
import { renderAchievementCard } from "./v2-render-achievement-progress";
import { getAchievementGlobalCompletion } from "./v2-achievement-stats";
import { getAchievementScopeLabels, isAchievementCompleted } from "../core/v2-achievement-scope";
import type { RoleRailViewId } from "./v2-render-types";
import { renderCaptainTags } from "./v2-render-captain-tags";
import { renderRewinderPreview } from "./v2-render-rewinder";
import { getSelectedCurseDifficulty, getUnlockedCurseDifficulty } from "../core/v2-curse-progress";
import { isCursedRole } from "../core/v2-curse-system";
import { ENABLE_LOCAL_PLAYGROUND } from "../core/v2-development-flags";
import { renderLobbyPortrait } from "./v2-lobby-portrait";
import "../styles/lobby-profile-layout.css";

const SPECIAL_ROLE_IDS = new Set<RoleId>(["rewinder", "research-captain"]);
const CURSED_ROLE_IDS = new Set<RoleId>(["cursed-frail", "cursed-debt", "special-finite-life", "special-fading-genius"]);
function hasDesignedTalentTree(roleId: RoleId): roleId is keyof typeof DESIGNED_TALENT_TREES {
  return Object.hasOwn(DESIGNED_TALENT_TREES, roleId);
}

export function getDisplayedRoleLevel(level: number): number {
  return Math.min(MAX_ROLE_LEVEL, Math.max(0, Math.floor(level)));
}

type TalentPointSummary = {
  level: number;
  currentExp: number;
  nextExp: number | null;
  availablePoints: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRoleToneClass(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return " tone-special";
  }

  if (CURSED_ROLE_IDS.has(roleId)) {
    return " tone-cursed";
  }

  return getRoleDefinition(roleId).mode === "reversed" ? " tone-reversed" : " tone-upright";
}

function getRoleModeLabel(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return "特殊";
  }

  if (CURSED_ROLE_IDS.has(roleId)) {
    return "诅咒";
  }

  return getRoleDefinition(roleId).mode === "reversed" ? "逆位" : "正位";
}

function getRoleModeClass(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return "is-special";
  }

  if (CURSED_ROLE_IDS.has(roleId)) {
    return "is-cursed";
  }

  return getRoleDefinition(roleId).mode === "reversed" ? "is-reversed" : "is-upright";
}

function isLobbyAchievementUnlocked(
  accountProfile: AccountProfile,
  achievement: RoleAchievementDefinition,
): boolean {
  return isAchievementCompleted(accountProfile, achievement);
}

function renderRoleCardCornerBadge(roleId: RoleId, level: number, owned: boolean): string {
  if (!owned) {
    return `
      <span class="lobby-role-card-level-badge is-locked" aria-label="未解锁">
        <i data-lucide="lock" aria-hidden="true"></i>
      </span>
    `;
  }

  return `<span class="lobby-role-card-level-badge">Lv ${renderAnimatedNumber(`role:${roleId}:card:level`, level)}</span>`;
}

function renderRoleCard(roleId: RoleId, accountProfile: AccountProfile, selectedRoleId: RoleId): string {
  const role = getRoleDefinition(roleId);
  const progress = accountProfile.roleProgress[roleId];
  const owned = isRoleOwned(accountProfile, roleId);
  const toneClass = getRoleToneClass(roleId);
  const selectedClass = selectedRoleId === roleId ? " is-selected" : "";
  const statusClass = owned ? " is-owned" : " is-locked";

  return `
    <button
      class="lobby-role-card${toneClass}${selectedClass}${statusClass}"
      type="button"
      data-action="select-role"
      data-role-id="${escapeHtml(role.id)}"
      aria-pressed="${selectedRoleId === roleId ? "true" : "false"}"
    >
      <div class="lobby-role-card-top">
        <div class="lobby-role-card-main">
          <div class="lobby-role-card-portrait-shell">
            <img
              class="lobby-role-card-portrait"
              src="${escapeHtml(getRoleCardPortraitUrl(role.id))}"
              width="144"
              height="258"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              alt="${escapeHtml(`${role.name}缩略立绘`)}"
            />
          </div>
          <div class="lobby-role-card-headings">
            <strong class="lobby-role-card-name">${escapeHtml(role.name)}</strong>
            <div class="lobby-role-card-mode-band ${getRoleModeClass(roleId)}">
              <span>${getRoleModeLabel(roleId)}</span>
            </div>
            ${renderRoleCardCornerBadge(roleId, getDisplayedRoleLevel(progress.level), owned)}
          </div>
        </div>
      </div>
    </button>
  `;
}

function renderRolePager(accountProfile: AccountProfile): string {
  const pageCount = getLobbyRolePageCount();

  return `
    <div class="lobby-role-pagination">
      <button
        class="lobby-page-button pager-arrow"
        type="button"
        aria-label="上一页"
        data-action="change-lobby-role-page"
        data-delta="-1"
        ${accountProfile.lobbyRolePage <= 0 ? "disabled" : ""}
      >
        <i data-lucide="chevron-left" aria-hidden="true"></i>
      </button>
      ${renderLobbyPageDots(pageCount, accountProfile.lobbyRolePage, "change-lobby-role-page")}
      <button
        class="lobby-page-button pager-arrow"
        type="button"
        aria-label="下一页"
        data-action="change-lobby-role-page"
        data-delta="1"
        ${accountProfile.lobbyRolePage >= pageCount - 1 ? "disabled" : ""}
      >
        <i data-lucide="chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function renderLobbyPageDots(pageCount: number, currentPage: number, action: string): string {
  return `
    <div class="lobby-page-dots" role="group" aria-label="分页">
      ${Array.from({ length: pageCount }, (_, pageIndex) => `
        <button
          class="lobby-page-dot${pageIndex === currentPage ? " is-active" : ""}"
          type="button"
          aria-label="第${pageIndex + 1}页"
          ${pageIndex === currentPage ? 'aria-current="page" disabled' : ""}
          data-action="${action}"
          data-delta="${pageIndex - currentPage}"
        ></button>
      `).join("")}
    </div>
  `;
}

function formatAchievementUnlockDate(timestamp: string | undefined): string {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return "日期未记录";
  }
  const date = new Date(timestamp);
  const label = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return label;
}

function renderAchievementHistoryTooltip(
  definition: RoleAchievementDefinition,
  accountProfile: AccountProfile,
): string {
  const byRole = { ...accountProfile.achievementUnlockedByRole?.[definition.id] };
  for (const roleId of Object.keys(accountProfile.roleProgress) as RoleId[]) {
    if (accountProfile.roleProgress[roleId].unlockedAchievementIds.includes(definition.id) && !byRole[roleId]) {
      byRole[roleId] = accountProfile.achievementUnlockedAt[definition.id] ?? "";
    }
  }
  const entries = Object.entries(byRole)
    .sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""))
    .map(([roleId, timestamp]) => {
      const role = getRoleDefinition(roleId as RoleId);
      const date = formatAchievementUnlockDate(timestamp);
      return `${date}：${role.name}达成`;
    });
  if (!entries.length && accountProfile.achievementUnlockedAt[definition.id]) {
    entries.push(`${formatAchievementUnlockDate(accountProfile.achievementUnlockedAt[definition.id])}：已达成`);
  }
  return entries.join("\n");
}

function renderRoleAchievementList(selectedRoleId: RoleId, accountProfile: AccountProfile): string {
  // Keep every achievement visible; lobby pagination prioritizes unlocks, rewards and scope.
  const definitions = getAllAchievementDefinitions();
  const unlockedCount = definitions.filter((definition) => isLobbyAchievementUnlocked(accountProfile, definition)).length;
  const personalPercent = definitions.length ? unlockedCount / definitions.length * 100 : 0;
  const pages = getAchievementDisplayPages(selectedRoleId);
  const pageIndex = Math.max(0, Math.min(accountProfile.lobbyRoleAchievementPage, pages.length - 1));
  const page = pages[pageIndex];
  return `
    <section class="lobby-profile-section lobby-profile-achievement-section">
      <div class="lobby-profile-achievement-bar">
        <div class="lobby-profile-achievement-overall-progress" role="progressbar"
          aria-label="全部成就"
          aria-valuemin="0" aria-valuemax="${definitions.length || 1}" aria-valuenow="${unlockedCount}"
          aria-valuetext="${unlockedCount}/${definitions.length}">
          <span class="achievement-completion-fill" ${animationBarAttribute("achievements:progress")} style="width:${personalPercent}%;" aria-hidden="true"></span>
          <span class="lobby-profile-achievement-progress-label">成就</span>
          <strong class="lobby-profile-achievement-progress-count">${renderAnimatedNumber("achievements:unlocked", unlockedCount)}/${renderAnimatedNumber("achievements:total", definitions.length)}</strong>
        </div>
        <div class="lobby-role-pagination is-compact">
          <button class="lobby-page-button pager-arrow" type="button" aria-label="上一页" data-action="change-role-achievement-page" data-delta="-1"${pageIndex === 0 ? " disabled" : ""}><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <span class="achievement-page-index">${pageIndex + 1}/${pages.length}</span>
          <button class="lobby-page-button pager-arrow" type="button" aria-label="下一页" data-action="change-role-achievement-page" data-delta="1"${pageIndex === pages.length - 1 ? " disabled" : ""}><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="lobby-profile-achievement-list">
        ${page.achievements.length ? page.achievements.map((definition) => {
          const unlocked = isLobbyAchievementUnlocked(accountProfile, definition);
          const history = renderAchievementHistoryTooltip(definition, accountProfile);
          return renderAchievementCard(definition, unlocked, "", getAchievementGlobalCompletion(definition.id), history || "未达成");
        }).join("") : '<div class="lobby-profile-achievement-empty">该角色的成就尚未设计</div>'}
      </div>
    </section>
  `;
}

function buildTalentPointSummary(viewModel: LobbySelectedRoleViewModel, allocation?: Record<string, number>, bonusPoints = 0): TalentPointSummary {
  const level = getDisplayedRoleLevel(viewModel.progress.level);
  const nextExp = getNextRoleLevelExperience(level);

  return {
    level,
    currentExp: viewModel.progress.exp,
    nextExp,
    availablePoints: allocation ? getTalentPointBalance(viewModel.role.id, viewModel.progress.level, allocation, bonusPoints) : level * ROLE_TALENT_POINTS_PER_LEVEL + bonusPoints,
  };
}

function renderGrowthProgress(
  viewModel: LobbySelectedRoleViewModel,
  pointSummary: TalentPointSummary,
  allocation?: Record<string, number>,
  experienceMultiplier = DEFAULT_ROLE_EXP_GAIN_MULTIPLIER,
): string {
  const expTarget = pointSummary.nextExp;
  const usesTalentPoints = !SPECIAL_ROLE_IDS.has(viewModel.role.id) && !isCursedRole(viewModel.role.id);
  const passiveLevelHint = isCursedRole(viewModel.role.id) ? "选择已解锁的诅咒难度，无需加点" : "";
  const passiveTalentHint = viewModel.role.id === "research-captain" ? "标签等级跟随对应基础角色等级"
    : viewModel.role.id === "rewinder" ? "每学年末继承往世积累" : "选择已解锁的诅咒难度";
  const levelTooltip = usesTalentPoints ? `每级+${ROLE_TALENT_POINTS_PER_LEVEL}天赋点` : passiveLevelHint;
  const expProgressPercent = expTarget === null
    ? 100
    : Math.max(0, Math.min(100, Math.round((pointSummary.currentExp / expTarget) * 100)));

  return `
    <div class="lobby-profile-growth-summary">
      <div class="lobby-growth-summary-row">
        <div class="lobby-growth-level-group">
          <span class="lobby-growth-level-hint" role="note" tabindex="0" aria-label="等级${pointSummary.level}${usesTalentPoints ? `，每级+${ROLE_TALENT_POINTS_PER_LEVEL}天赋点` : ""}"${levelTooltip ? ` data-tooltip="${levelTooltip}"` : ""}>
            <span class="lobby-growth-inline-label">等级</span>
            <strong class="lobby-growth-inline-value" ${animationNumberAttributes(`role:${viewModel.role.id}:growth:level`, pointSummary.level)}>${pointSummary.level}</strong>
          </span>
          <span class="lobby-growth-multiplier-hint" role="note" tabindex="0" aria-label="经验倍率${experienceMultiplier.toFixed(1)}，所有加经验的都乘以这个倍率。" data-tooltip="所有加经验的都乘以这个倍率。">
            <span class="lobby-growth-inline-label">经验倍率</span>
            <strong class="lobby-growth-inline-value">${experienceMultiplier.toFixed(1)}</strong>
          </span>
        </div>
        ${usesTalentPoints ? `<div class="lobby-growth-exp-detail-row">
          <div class="lobby-talent-allocation-meta">
            <span class="lobby-talent-points-hint" role="note" tabindex="0" aria-label="天赋点${pointSummary.availablePoints}，每级获得${ROLE_TALENT_POINTS_PER_LEVEL}点天赋点。" data-tooltip="每级获得${ROLE_TALENT_POINTS_PER_LEVEL}点天赋点，用于解锁天赋。">天赋点 <strong class="lobby-talent-points-value">${renderAnimatedNumber(`role:${viewModel.role.id}:growth:available-points`, pointSummary.availablePoints)}</strong></span>
            <button class="lobby-talent-reset-button" type="button" data-ui-talent-reset="${viewModel.role.id}"${Object.keys(allocation ?? {}).length === 0 ? " disabled" : ""} title="重置天赋点"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>重置</span></button>
          </div>
        </div>` : `<div class="lobby-growth-exp-detail-row"><span class="lobby-talent-passive-hint" role="note" tabindex="0" data-tooltip="${passiveTalentHint}">无需加点</span></div>`}
      </div>
      <div class="lobby-growth-exp-row">
        <span class="lobby-growth-inline-label lobby-growth-exp-label" role="note" tabindex="0" aria-label="经验，每局增加科研分乘经验倍率的经验。" data-tooltip="每局增加科研分✖经验倍率的经验。">经验</span>
        <div class="lobby-growth-exp-bar" aria-hidden="true">
          <span ${animationBarAttribute(`role:${viewModel.role.id}:growth:experience`)} style="width:${expProgressPercent}%;"></span>
        </div>
        <strong class="lobby-growth-exp-value">${renderAnimatedNumber(`role:${viewModel.role.id}:growth:experience`, pointSummary.currentExp)}/${expTarget === null ? "∞" : renderAnimatedNumber(`role:${viewModel.role.id}:growth:experience-cap`, expTarget)}</strong>
      </div>
    </div>
  `;
}

function renderProfileInfoPanel(viewModel: LobbySelectedRoleViewModel, allocation?: Record<string, number>, bonusPoints = 0, experienceMultiplier = DEFAULT_ROLE_EXP_GAIN_MULTIPLIER, hasRoleSave = false, isSaveLoading = false, roleHistoryPageIndex = 0): string {
  const pointSummary = buildTalentPointSummary(viewModel, allocation, bonusPoints);
  const historyPage = roleHistoryPageIndex === 1 ? 1 : 0;
  const historyStats = historyPage === 0 ? viewModel.historyStats : ([
    ["sanCap", "SAN上限"], ["research", "科研能力"], ["social", "社交能力"],
    ["favor", "导师好感"], ["money", "金币"],
  ] as const).map(([id, label]) => ({ id, label, value: formatMoney(viewModel.progress.historyBest[id] ?? 0) }));
  const unlockAchievement = getRoleLobbyAchievementDefinitions(viewModel.role.id)
    .find((achievement) => getAchievementUnlockRoleIds(achievement).includes(viewModel.role.id));
  const unlockHint = unlockAchievement
    ? `解锁目标：${getAchievementScopeLabels(unlockAchievement.scope).join("／")} · ${unlockAchievement.description}`
    : "该角色的解锁方式尚未开放。";

  return `
    <section class="lobby-profile-info">
      <div class="lobby-profile-info-head">
        <h1 class="lobby-profile-art-name">${escapeHtml(viewModel.role.name)}</h1>
        ${viewModel.unlockState.owned
          ? `<button class="lobby-start-button" type="button" data-action="start-game" data-role-id="${escapeHtml(viewModel.role.id)}"${isSaveLoading ? ' disabled aria-busy="true"' : ""}><span class="lobby-start-button-label">${isSaveLoading ? "读取中…" : hasRoleSave ? "继续游戏" : "开始游戏"}</span><i class="lobby-start-button-arrow" data-lucide="arrow-right" aria-hidden="true"></i></button>`
          : `<span class="lobby-start-lock" role="group" tabindex="0" aria-label="${escapeHtml(unlockHint)}" data-tooltip="${escapeHtml(unlockHint)}"><button class="lobby-start-button is-disabled" type="button" disabled aria-label="角色尚未解锁"><i data-lucide="lock" aria-hidden="true"></i></button></span>`}
      </div>
      <p class="lobby-profile-summary">${escapeHtml(viewModel.lobby.summary)}</p>
      <div class="lobby-profile-stat-columns">
        <section class="lobby-profile-stat-column">
          <div class="lobby-profile-history-heading">
            <h2 class="lobby-profile-stat-column-title">历史</h2>
            <button class="lobby-profile-history-pager" type="button" data-ui-role-history-page aria-label="${historyPage === 0 ? "查看属性历史，第2页" : "查看科研历史，第1页"}"><span>${historyPage + 1}/2</span><i data-lucide="${historyPage === 0 ? "chevron-right" : "chevron-left"}" aria-hidden="true"></i></button>
          </div>
          <div class="lobby-profile-stat-stack lobby-profile-history-stack" data-role-history-page="${historyPage}" aria-live="polite">
            ${historyStats.map((stat) => `
              <div class="lobby-profile-stat-row" data-role-history-stat="${stat.id}">
                <span>${escapeHtml(stat.label)}</span>
                <strong>${renderAnimatedNumber(`role:${viewModel.role.id}:history:${stat.id === "representative" ? "representative:score" : stat.id}`, Number(stat.value), stat.value)}</strong>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="lobby-profile-stat-column is-statistics">
          <h2 class="lobby-profile-stat-column-title">统计</h2>
          <div class="lobby-profile-stat-stack lobby-profile-history-stack">
            ${viewModel.statistics.map((stat) => `
              <div class="lobby-profile-stat-row">
                <span class="play-tooltip" role="note" tabindex="0" data-tooltip="${escapeHtml(stat.tooltip)}">${escapeHtml(stat.label)}</span>
                <strong data-role-stat="${stat.id}" data-role-id="${viewModel.role.id}">${Number.isFinite(Number(stat.value)) ? renderAnimatedNumber(`role:${viewModel.role.id}:statistics:${stat.id}`, Number(stat.value), stat.value) : escapeHtml(stat.value)}</strong>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
      ${renderGrowthProgress(viewModel, pointSummary, allocation, experienceMultiplier)}
    </section>
  `;
}

const DESIGNED_TALENT_TREES = {
  "cursed-frail": {
    nodes: FRAIL_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [],
  },
  "special-fading-genius": {
    nodes: FADING_GENIUS_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [],
  },
  "special-finite-life": {
    nodes: FINITE_LIFE_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [],
  },
  "cursed-debt": {
    nodes: DEBT_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [],
  },
  normal: {
    nodes: NORMAL_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 96 C145 96 155 32 225 32", "M75 96 H225", "M75 96 C145 96 155 160 225 160",
      "M225 32 H375", "M375 32 H525",
      "M225 96 H375", "M225 160 H375",
      "M375 96 C445 96 455 128 525 128", "M375 160 C445 160 455 128 525 128",
    ],
  },
  rich: {
    nodes: RICH_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 160 H225",
      "M75 32 C145 32 155 96 225 96", "M75 160 C145 160 155 96 225 96",
      "M225 32 H375", "M225 160 H375",
      "M375 32 H525", "M375 160 H525", "M225 96 H525",
    ],
  },
  genius: {
    nodes: GENIUS_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 160 H225",
      "M75 32 C145 32 155 96 225 96",
      "M225 32 H375", "M225 96 H375", "M225 160 H375",
      "M375 32 H525", "M375 96 H525", "M375 160 H525",
    ],
  },
  "teacher-child": {
    nodes: TEACHER_CHILD_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 96 C145 96 155 32 225 32", "M75 96 C145 96 155 160 225 160",
      "M75 96 H225",
      "M225 32 H375", "M225 32 C295 32 305 96 375 96",
      "M225 160 H375", "M375 160 H525",
      "M375 160 C445 160 455 96 525 96",
      "M375 32 H525", "M375 96 C445 96 455 32 525 32",
    ],
  },
  chosen: {
    nodes: CHOSEN_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M225 32 H375", "M375 32 H525",
      "M75 96 H225", "M75 160 H225",
      "M75 96 C145 96 155 160 225 160", "M75 160 C145 160 155 96 225 96",
      "M225 96 C295 96 305 128 375 128", "M225 160 C295 160 305 128 375 128",
      "M375 128 H525",
    ],
  },
  "chosen-reversed": {
    nodes: CHOSEN_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 C145 32 155 96 225 96", "M75 96 H225",
      "M225 96 C295 96 305 32 375 32", "M225 96 H375",
      "M375 32 C445 32 455 96 525 96", "M375 96 H525",
      "M75 160 H225", "M225 160 H375",
    ],
  },
  social: {
    nodes: SOCIAL_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M225 32 H375", "M375 32 H525",
      "M75 160 H225", "M225 160 H375", "M375 160 H525",
      "M75 96 H225", "M225 96 H375",
      "M375 160 C445 160 455 96 525 96",
    ],
  },
  "normal-reversed": {
    nodes: NORMAL_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 32 C145 32 155 96 225 96", "M75 160 H225",
      "M225 32 H375", "M225 96 H375", "M225 160 H375",
      "M375 32 C445 32 455 96 525 96",
      "M375 160 C445 160 455 96 525 96",
    ],
  },
  "rich-reversed": {
    nodes: RICH_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 160 C145 160 155 96 225 96",
      "M75 32 C145 32 155 96 225 96", "M75 160 H225",
      "M225 96 H375", "M375 96 H525", "M225 160 H375",
    ],
  },
  "genius-reversed": {
    nodes: GENIUS_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 96 H225", "M75 160 H225",
      "M225 96 C295 96 305 32 375 32", "M225 160 C295 160 305 96 375 96", "M225 160 H375",
      "M375 32 C445 32 455 96 525 96", "M375 96 H525", "M375 160 C445 160 455 96 525 96",
    ],
  },
  "teacher-child-reversed": {
    nodes: TEACHER_CHILD_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 96 C145 96 155 32 225 32", "M75 96 H225", "M75 96 C145 96 155 160 225 160",
      "M225 160 H375", "M225 32 H375",
      "M225 32 C285 32 315 96 375 96", "M225 96 H375", "M225 160 C285 160 315 96 375 96",
      "M375 96 H525", "M375 96 C445 96 455 160 525 160",
    ],
  },
  "social-reversed": {
    nodes: SOCIAL_REVERSED_TALENT_NODES,
    viewBoxHeight: 192,
    paths: [
      "M75 32 H225", "M75 96 H225",
      "M225 96 C295 96 305 32 375 32", "M225 96 H375", "M225 96 C295 96 305 160 375 160",
      "M375 32 C445 32 455 96 525 96", "M375 96 H525", "M375 160 C445 160 455 96 525 96",
    ],
  },
} as const;

export function renderDesignedGrowthBoard(roleId: keyof typeof DESIGNED_TALENT_TREES, selectedNodeIndex: number, allocation?: Record<string, number>, level?: number, showPoints = false, bonusPoints = 0, curseOptions?: { unlockedDifficulty: number; readOnly?: boolean }): string {
  const tree = DESIGNED_TALENT_TREES[roleId];
  const nodes: readonly DesignedTalentNode[] = tree.nodes;
  const { paths, viewBoxHeight } = tree;
  const activeIndex = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < nodes.length
    ? selectedNodeIndex : 0;
  const exclusiveChallenge = nodes.every((node) => node.challenge);
  const challengeDifficultyNames = ["简单", "中等", "困难", "地狱"];
  const nodeLabel = (node: DesignedTalentNode) => node.fixed ? "固定生效" : node.challenge ? challengeDifficultyNames[node.tier] : `${node.cost}天赋点`;
  const points = allocation && level !== undefined ? getTalentPointBalance(roleId, level, allocation, bonusPoints) : null;
  return `
    <section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card">
      ${!showPoints || points === null || exclusiveChallenge ? "" : `<div class="character-talent-points"><span>天赋点 <strong>${points}</strong></span><button type="button" data-ui-talent-reset="${roleId}"${Object.keys(allocation ?? {}).length === 0 ? " disabled" : ""} title="重置天赋点" aria-label="重置天赋点"><i data-lucide="rotate-ccw" aria-hidden="true"></i></button></div>`}
      <div class="lobby-talent-tree is-designed-tree is-${roleId}-tree${nodes.some((node) => node.fixed) ? " is-fixed-tree" : ""}${exclusiveChallenge ? " is-cursed-choice-tree" : ""}" role="group" aria-label="${exclusiveChallenge ? "诅咒难度，逐级挑战" : "天赋树预览"}" data-active-page="0" ${exclusiveChallenge ? `data-selection-mode="exclusive"${curseOptions?.readOnly ? ' data-curse-read-only="true"' : ""}` : 'data-prerequisite-mode="any" data-prerequisite-min-level="1"'}>
        <div class="lobby-talent-tree-pages">
          <div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
            <svg class="lobby-normal-tree-connections" viewBox="0 0 600 ${viewBoxHeight}" preserveAspectRatio="none" aria-hidden="true">
              ${paths.map((path) => `<path d="${path}" />`).join("")}
            </svg>
            ${nodes.map((node, index) => `
              <button class="lobby-talent-tree-node${index === activeIndex ? " is-selected" : ""}${node.fixed ? " is-fixed" : ""}${node.challenge && node.tier + 1 > (curseOptions?.unlockedDifficulty ?? 4) ? " is-locked" : ""}" type="button" data-ui-talent-tree-node="0-${index}" ${node.challenge ? `data-curse-difficulty="${node.tier + 1}"` : `data-talent-id="${node.id}"`} data-tier="${node.fixed ? "fixed" : node.tier}" data-fixed="${node.fixed ? "true" : "false"}" aria-label="${escapeHtml(`${node.name}：${node.effect}，${nodeLabel(node)}${node.challenge || isRoleTalentImplemented(roleId) ? "" : "，仅预览"}`)}" aria-pressed="${index === activeIndex}"${node.challenge && node.tier + 1 > (curseOptions?.unlockedDifficulty ?? 4) ? ' disabled aria-disabled="true" title="完成前一难度博士毕业后解锁"' : ""} style="grid-column:${node.column};grid-row:${node.row}" data-cost="${node.cost}" data-initial-level="${node.initialLevel ?? 0}" data-prerequisite-ids="${node.prerequisiteIds.join(" ")}" data-current-level="${allocation?.[node.id] ?? node.initialLevel ?? 0}">
                <span class="lobby-talent-tree-node-ring"><i data-lucide="${node.icon}" aria-hidden="true"></i></span>
                ${node.fixed || node.challenge ? "" : `<span class="lobby-normal-tree-node-level">${allocation?.[node.id] ?? node.initialLevel ?? 0}/${node.maxLevel}</span>`}
              </button>
            `).join("")}
            <div class="lobby-normal-tree-details" aria-live="polite">
              ${nodes.map((node, index) => `
                <div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === activeIndex ? "" : " hidden"}>
                  <div class="lobby-normal-tree-detail-heading"><strong>${escapeHtml(node.name)}${node.challenge ? `（${challengeDifficultyNames[node.tier]}）` : ""}</strong></div>
                  <p>${escapeHtml(node.effect)}${node.challenge ? node.tier < challengeDifficultyNames.length - 1 ? "；博士毕业解锁下一难度" : "" : `<span class="lobby-normal-tree-detail-cost">${nodeLabel(node)}</span>`}</p>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}


export function renderRoleRail(accountProfile: AccountProfile, selectedRoleId: RoleId, activeRoleRailView: RoleRailViewId, announcementPageIndex = 0): string {
  return `<aside class="lobby-profile-achievement-rail${activeRoleRailView === "messages" ? " is-message-view" : activeRoleRailView === "announcements" ? " is-announcement-view" : ""}">
    ${activeRoleRailView === "messages"
      ? renderLobbyMessageRailView()
      : activeRoleRailView === "announcements" ? renderLobbyAnnouncementRailView(announcementPageIndex)
      : renderRoleAchievementList(selectedRoleId, accountProfile)}
  </aside>`;
}

function renderSelectedRoleDetail(
  accountProfile: AccountProfile,
  selectedRoleId: RoleId,
  activeRoleRailView: RoleRailViewId,
  _talentTreePageIndex: number,
  talentTreeSelectedNodeByPage: readonly number[],
  announcementPageIndex: number,
  talentAllocation?: TalentAllocation,
  hasRoleSave = false,
  isSaveLoading = false,
  roleHistoryPageIndex = 0,
): string {
  const viewModel = buildLobbySelectedRoleViewModel(accountProfile, selectedRoleId);
  const allocation = talentAllocation?.[selectedRoleId] ?? accountProfile.talentAllocation?.[selectedRoleId] ?? {};
  const bonusPoints = accountProfile.achievementTalentPoints?.[selectedRoleId] ?? 0;
  const experienceMultiplier = DEFAULT_ROLE_EXP_GAIN_MULTIPLIER + (accountProfile.achievementExperienceMultipliers?.[selectedRoleId] ?? 0);

  return `
    <section class="lobby-detail-stage">
      <section class="lobby-profile-card${viewModel.unlockState.owned ? " is-owned" : " is-locked"}">
        <div class="lobby-profile-main">
          <section class="lobby-profile-top">
            ${renderLobbyPortrait(getRoleDetailPortraitUrl(viewModel.role.id), viewModel.role.name)}
            ${renderProfileInfoPanel(viewModel, allocation, bonusPoints, experienceMultiplier, hasRoleSave, isSaveLoading, roleHistoryPageIndex)}
          </section>
          ${selectedRoleId === "rewinder" ? renderRewinderPreview(talentTreeSelectedNodeByPage[0] ?? 3) : selectedRoleId === "research-captain" ? renderCaptainTags(accountProfile.roleProgress, talentTreeSelectedNodeByPage[0] ?? 0) : hasDesignedTalentTree(selectedRoleId)
            ? renderDesignedGrowthBoard(selectedRoleId, isCursedRole(selectedRoleId) ? getSelectedCurseDifficulty(accountProfile, selectedRoleId) - 1 : talentTreeSelectedNodeByPage[0] ?? 0, allocation, allocation ? viewModel.progress.level : undefined, false, bonusPoints, isCursedRole(selectedRoleId) ? { unlockedDifficulty: getUnlockedCurseDifficulty(accountProfile, selectedRoleId) } : undefined)
            : ""}
        </div>
        ${renderRoleRail(accountProfile, selectedRoleId, activeRoleRailView, announcementPageIndex)}
      </section>
    </section>
  `;
}

export function renderSetupScreen(
  _state: GameState,
  accountProfile: AccountProfile,
  activeRoleRailView: RoleRailViewId = "announcements",
  talentTreePageIndex = 0,
  talentTreeSelectedNodeByPage: readonly number[] = [0],
  announcementPageIndex = 0,
  talentAllocation?: TalentAllocation,
  hasRoleSave = false,
  isSaveLoading = false,
  roleHistoryPageIndex = 0,
): string {
  const selectedRoleId = accountProfile.selectedLobbyRoleId;
  const ownedCount = getRoleOptions().filter((role) => isRoleOwned(accountProfile, role.id)).length;
  const rolePageRows = getLobbyRolePageRows(accountProfile);

  return `
    <main class="lobby-page" data-phase="setup" data-scale-mode="fixed">
      <section class="lobby-stage-shell">
        <div class="lobby-stage-scale">
          <section class="lobby-stage">
            <section class="lobby-grid">
              <aside class="lobby-role-rail">
                <div class="lobby-panel lobby-role-panel">
                  <div class="lobby-panel-header">
                    <div class="lobby-panel-title-block">
                      <h2><i data-lucide="book-open" aria-hidden="true"></i>角色图鉴</h2>
                      <span class="lobby-role-owned-count lobby-meta-count">已收录 ${ownedCount} / ${getRoleOptions().length}${ENABLE_LOCAL_PLAYGROUND ? ' · <span data-local-playground title="全角色满级、诅咒全难度解锁；独立测试存档，不上传数据">本地测试</span>' : ""}</span>
                    </div>
                    <div class="lobby-panel-header-meta">
                      ${renderRolePager(accountProfile)}
                    </div>
                  </div>
                  <div class="lobby-role-list" style="--lobby-role-page-rows: ${LOBBY_ROLE_PAGE_ROW_COUNT}">
                    ${rolePageRows.map((row) => `
                      <div class="lobby-role-row">
                        ${row.map((roleId) => renderRoleCard(roleId, accountProfile, selectedRoleId)).join("")}
                      </div>
                    `).join("")}
                  </div>
                </div>
              </aside>

              <div class="lobby-detail-column">
                ${renderLobbyMasthead(activeRoleRailView)}
                ${renderSelectedRoleDetail(accountProfile, selectedRoleId, activeRoleRailView, talentTreePageIndex, talentTreeSelectedNodeByPage, announcementPageIndex, talentAllocation, hasRoleSave, isSaveLoading, roleHistoryPageIndex)}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  `;
}
