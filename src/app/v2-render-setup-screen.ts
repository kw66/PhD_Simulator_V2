import {
  buildLobbySelectedRoleViewModel,
  getLobbyRolePageCount,
  getLobbyRolePageRows,
  getRoleAchievementPageCount,
  isRoleOwned,
  LOBBY_ROLE_PAGE_ROW_COUNT,
  ROLE_ACHIEVEMENT_PAGE_SIZE,
} from "../core/v2-lobby";
import { getRoleDefinition, getRoleOptions } from "../core/v2-progression";
import { animationNumberAttributes, animationBarAttribute, renderAnimatedNumber } from "./v2-render-animation";
import { getRoleLobbyAchievementDefinitions } from "../core/v2-role-lobby-meta";
import { DEFAULT_ROLE_EXP_GAIN_MULTIPLIER, getNextRoleLevelExperience, ROLE_TALENT_POINTS_PER_LEVEL } from "../core/v2-role-experience";
import type { AccountProfile, GameState, LobbySelectedRoleViewModel, RoleAchievementDefinition, RoleId } from "../core/v2-types";
import { getRoleCardPortraitUrl, getRoleDetailPortraitUrl } from "./v2-role-portrait-assets";
import { renderLobbyMasthead, renderLobbyMessageRailView } from "./v2-render-community";
import { renderLobbyAnnouncementRailView } from "./v2-render-announcements";
import type { RoleRailViewId } from "./v2-render-types";

const SPECIAL_ROLE_IDS = new Set<RoleId>(["rewinder", "research-captain", "special-dandan", "special-daji"]);
const CURSED_ROLE_IDS = new Set<RoleId>(["cursed-frail", "cursed-debt"]);
function hasDesignedTalentTree(roleId: RoleId): roleId is keyof typeof DESIGNED_TALENT_TREES {
  return Object.hasOwn(DESIGNED_TALENT_TREES, roleId);
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
  progress: AccountProfile["roleProgress"][RoleId],
  achievement: RoleAchievementDefinition,
): boolean {
  return achievement.unlocksRoleId
    ? isRoleOwned(accountProfile, achievement.unlocksRoleId)
    : progress.unlockedAchievementIds.includes(achievement.id);
}

function renderRoleAchievementDisplay(
  roleId: RoleId,
  progress: AccountProfile["roleProgress"][RoleId],
  owned: boolean,
  accountProfile: AccountProfile,
): string {
  const achievements = getRoleLobbyAchievementDefinitions(roleId);

  return `
    <div class="lobby-role-card-achievement-display${owned ? "" : " is-locked"}" aria-label="角色成就">
      <span class="lobby-role-card-achievement-label">成就</span>
      <span class="lobby-role-card-achievement-icons">
      ${achievements.map((achievement) => {
        const achieved = isLobbyAchievementUnlocked(accountProfile, progress, achievement);
        return `
        <span
          class="lobby-role-card-achievement-icon${achieved ? " is-unlocked" : ""}"
          data-achievement-id="${escapeHtml(achievement.id)}"
          title="${escapeHtml(achievement.title)}"
          aria-label="${escapeHtml(`${achievement.title}${achieved ? "，已达成" : "，未达成"}`)}"
        >${escapeHtml(achievement.icon)}</span>
      `;
      }).join("")}
      </span>
    </div>
  `;
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
            ${renderRoleAchievementDisplay(role.id, progress, owned, accountProfile)}
            ${renderRoleCardCornerBadge(roleId, progress.level, owned)}
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

function renderAchievementUnlockDate(timestamp: string | undefined): string {
  if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
    return '<span class="lobby-profile-achievement-date is-unknown">日期未记录</span>';
  }
  const date = new Date(timestamp);
  const label = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  return `<time class="lobby-profile-achievement-date" datetime="${escapeHtml(timestamp)}">${label}</time>`;
}

function renderRoleAchievementList(selectedRoleId: RoleId, accountProfile: AccountProfile): string {
  const viewModel = buildLobbySelectedRoleViewModel(accountProfile, selectedRoleId);
  const roleAchievementById = new Map(viewModel.roleAchievements.map((achievement) => [achievement.definition.id, achievement]));
  const visibleAchievements = getRoleLobbyAchievementDefinitions(selectedRoleId).map((definition) => {
    const roleAchievement = roleAchievementById.get(definition.id);
    return {
      definition,
      unlocked: definition.unlocksRoleId
        ? isRoleOwned(accountProfile, definition.unlocksRoleId)
        : roleAchievement?.unlocked === true,
    };
  });
  const unlockedCount = visibleAchievements.filter((achievement) => achievement.unlocked).length;
  const achievementPageCount = getRoleAchievementPageCount(selectedRoleId);
  const achievementPageIndex = Math.min(accountProfile.lobbyRoleAchievementPage, achievementPageCount - 1);
  const pageAchievements = visibleAchievements.slice(
    achievementPageIndex * ROLE_ACHIEVEMENT_PAGE_SIZE,
    (achievementPageIndex + 1) * ROLE_ACHIEVEMENT_PAGE_SIZE,
  );
  return `
    <section class="lobby-profile-section lobby-profile-achievement-section">
      <div class="lobby-profile-achievement-bar">
        <div class="lobby-profile-achievement-title-block">
          <span class="lobby-profile-achievement-progress-label">成就</span>
          <strong class="lobby-profile-achievement-progress-count">${renderAnimatedNumber(`role:${selectedRoleId}:achievements:unlocked`, unlockedCount)}/${renderAnimatedNumber(`role:${selectedRoleId}:achievements:total`, visibleAchievements.length)}</strong>
        </div>
        ${achievementPageCount > 1 ? `<div class="lobby-role-pagination is-compact">
          <button
            class="lobby-page-button pager-arrow"
            type="button"
            aria-label="上一页"
            data-action="change-role-achievement-page"
            data-delta="-1"
            ${achievementPageIndex <= 0 ? "disabled" : ""}
          ><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          ${renderLobbyPageDots(achievementPageCount, achievementPageIndex, "change-role-achievement-page")}
          <button
            class="lobby-page-button pager-arrow"
            type="button"
            aria-label="下一页"
            data-action="change-role-achievement-page"
            data-delta="1"
            ${achievementPageIndex >= achievementPageCount - 1 ? "disabled" : ""}
          ><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>` : ""}
      </div>
      <div class="lobby-profile-achievement-list">
        ${pageAchievements.length > 0
          ? pageAchievements.map((achievement) => `
          <article class="lobby-profile-achievement${achievement.unlocked ? " is-unlocked" : ""}">
            <span class="lobby-profile-achievement-icon" aria-hidden="true">${escapeHtml(achievement.definition.icon)}</span>
            <div class="lobby-profile-achievement-copy">
              <p class="lobby-profile-achievement-condition"><strong>${escapeHtml(achievement.definition.title)}</strong>：${escapeHtml(achievement.definition.description)}</p>
              ${achievement.definition.rewardText ? `<p class="lobby-profile-achievement-reward">${escapeHtml(achievement.definition.rewardText)}</p>` : ""}
            </div>
            ${achievement.unlocked ? renderAchievementUnlockDate(accountProfile.achievementUnlockedAt[achievement.definition.id]) : ""}
          </article>
        `).join("")
          : `<div class="lobby-profile-achievement-empty">暂无成就</div>`}
      </div>
    </section>
  `;
}

function buildTalentPointSummary(viewModel: LobbySelectedRoleViewModel): TalentPointSummary {
  const nextExp = getNextRoleLevelExperience(viewModel.progress.level);

  return {
    level: viewModel.progress.level,
    currentExp: viewModel.progress.exp,
    nextExp,
    availablePoints: viewModel.progress.level * ROLE_TALENT_POINTS_PER_LEVEL,
  };
}

function renderGrowthProgress(
  viewModel: LobbySelectedRoleViewModel,
  pointSummary: TalentPointSummary,
): string {
  const expTarget = pointSummary.nextExp;
  const expProgressPercent = expTarget === null
    ? 100
    : Math.max(0, Math.min(100, Math.round((pointSummary.currentExp / expTarget) * 100)));

  return `
    <div class="lobby-profile-growth-summary">
      <div class="lobby-growth-summary-row">
        <div class="lobby-growth-level-group">
          <span class="lobby-growth-level-hint" role="note" tabindex="0" aria-label="等级${pointSummary.level}，每级+${ROLE_TALENT_POINTS_PER_LEVEL}天赋点" data-tooltip="每级+${ROLE_TALENT_POINTS_PER_LEVEL}天赋点">
            <span class="lobby-growth-inline-label">等级</span>
            <strong class="lobby-growth-inline-value" ${animationNumberAttributes(`role:${viewModel.role.id}:growth:level`, pointSummary.level)}>${pointSummary.level}</strong>
          </span>
          <span class="lobby-growth-multiplier-hint" role="note" tabindex="0" aria-label="经验倍率${DEFAULT_ROLE_EXP_GAIN_MULTIPLIER.toFixed(1)}，所有加经验的都乘以这个倍率。" data-tooltip="所有加经验的都乘以这个倍率。">
            <span class="lobby-growth-inline-label">经验倍率</span>
            <strong class="lobby-growth-inline-value">${DEFAULT_ROLE_EXP_GAIN_MULTIPLIER.toFixed(1)}</strong>
          </span>
        </div>
        <div class="lobby-growth-exp-detail-row">
          <div class="lobby-talent-allocation-meta">
            <span class="lobby-talent-points-hint" role="note" tabindex="0" aria-label="天赋点${pointSummary.availablePoints}，每级获得${ROLE_TALENT_POINTS_PER_LEVEL}点天赋点。" data-tooltip="每级获得${ROLE_TALENT_POINTS_PER_LEVEL}点天赋点，用于解锁天赋。">天赋点 <strong class="lobby-talent-points-value">${renderAnimatedNumber(`role:${viewModel.role.id}:growth:available-points`, pointSummary.availablePoints)}</strong></span>
            <button class="lobby-talent-reset-button" type="button" disabled title="重置天赋点"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>重置</span></button>
          </div>
        </div>
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

function renderProfileInfoPanel(viewModel: LobbySelectedRoleViewModel): string {
  const pointSummary = buildTalentPointSummary(viewModel);
  const unlockAchievement = getRoleLobbyAchievementDefinitions(viewModel.role.id)
    .find((achievement) => achievement.unlocksRoleId === viewModel.role.id);
  const unlockHint = unlockAchievement
    ? `解锁目标：${unlockAchievement.description}。当前暂不能解锁。`
    : "该角色的解锁方式尚未开放。";

  return `
    <section class="lobby-profile-info">
      <div class="lobby-profile-info-head">
        <h1 class="lobby-profile-art-name">${escapeHtml(viewModel.role.name)}</h1>
        ${viewModel.unlockState.owned
          ? `<button class="lobby-start-button" type="button" data-action="start-game" data-role-id="${escapeHtml(viewModel.role.id)}"><span class="lobby-start-button-label">开始游戏</span><i class="lobby-start-button-arrow" data-lucide="arrow-right" aria-hidden="true"></i></button>`
          : `<span class="lobby-start-lock" role="group" tabindex="0" aria-label="${escapeHtml(unlockHint)}" data-tooltip="${escapeHtml(unlockHint)}"><button class="lobby-start-button is-disabled" type="button" disabled aria-label="角色尚未解锁"><i data-lucide="lock" aria-hidden="true"></i></button></span>`}
      </div>
      <p class="lobby-profile-summary">${escapeHtml(viewModel.lobby.summary)}</p>
      <div class="lobby-profile-stat-columns">
        <section class="lobby-profile-stat-column">
          <h2 class="lobby-profile-stat-column-title">历史</h2>
          <div class="lobby-profile-stat-stack lobby-profile-history-stack">
            ${viewModel.historyStats.map((stat) => `
              <div class="lobby-profile-stat-row">
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
      ${renderGrowthProgress(viewModel, pointSummary)}
    </section>
  `;
}

interface DesignedTalentNode {
  id: string;
  name: string;
  icon: string;
  tier: number;
  column: string;
  row: string;
  maxLevel: number;
  cost: number;
  effect: string;
  prerequisiteIds: readonly string[];
  initialLevel?: number;
  fixed?: boolean;
}

const NORMAL_TALENT_NODES = [
  { id: "first-month-drive", name: "满怀干劲", icon: "heart-plus", tier: 0, column: "1", row: "1 / 4", maxLevel: 3, cost: 1, effect: "首月结束后，下月初SAN回复+2/级", prerequisiteIds: [] },
  { id: "self-determination", name: "我命由我", icon: "sunrise", tier: 1, column: "2", row: "1", maxLevel: 10, cost: 1, effect: "转博时科研、社交、导师好感提升10%/级，向上取整", prerequisiteIds: ["first-month-drive"] },
  { id: "diligence", name: "勤能补拙", icon: "footprints", tier: 1, column: "2", row: "2", maxLevel: 10, cost: 1, effect: "转博后每月行动+0.1次/级，余数逐月累积", prerequisiteIds: ["first-month-drive"] },
  { id: "first-month-drive-plus", name: "满怀干劲+", icon: "zap", tier: 1, column: "2", row: "3", maxLevel: 5, cost: 1, effect: "除入学以外，每学期初SAN回复+1/级", prerequisiteIds: ["first-month-drive"] },
  { id: "breakthrough", name: "突破极限", icon: "rocket", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 3, effect: "属性溢出时上限+1，最多+10", prerequisiteIds: ["self-determination"] },
  { id: "burning-life-alpha", name: "燃烧生命α", icon: "heart-crack", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 3, effect: "转博后每月行动点耗尽仍可行动1次，消耗1点SAN上限", prerequisiteIds: ["diligence"] },
  { id: "burning-life-beta", name: "燃烧生命β", icon: "heart-pulse", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "转博后每月SAN不足时，免除1次SAN消耗，消耗1点SAN上限", prerequisiteIds: ["first-month-drive-plus"] },
  { id: "burnout", name: "触底反弹", icon: "flame", tier: 3, column: "4", row: "2 / 4", maxLevel: 1, cost: 3, effect: "每月初SAN上限低于8时，SAN上限+1", prerequisiteIds: ["burning-life-alpha", "burning-life-beta"] },
  { id: "epiphany", name: "厚积薄发", icon: "sparkles", tier: 3, column: "4", row: "1", maxLevel: 2, cost: 3, effect: "转博后每年科研、社交、导师好感+1/级", prerequisiteIds: ["breakthrough"] },
] as const satisfies readonly DesignedTalentNode[];

const RICH_TALENT_NODES = [
  { id: "red-envelope", name: "红包拿来", icon: "gift", tier: 0, column: "1", row: "1", maxLevel: 4, cost: 1, effect: "寒假事件中压岁钱+1/级", prerequisiteIds: [] },
  { id: "heiress", name: "千金小姐", icon: "wallet", tier: 0, column: "1", row: "3", maxLevel: 4, cost: 1, effect: "初始金币+2/级", prerequisiteIds: [] },
  { id: "bring-funding", name: "带资进组", icon: "hand-coins", tier: 1, column: "2", row: "2", maxLevel: 4, cost: 1, effect: "导师科研经费+5/级", prerequisiteIds: ["red-envelope", "heiress"] },
  // Preview rule for later activation: both transfer bonuses use the pre-transfer state, so paper rewards do not compound the coin bonus.
  { id: "wealth-growth", name: "财富倍增", icon: "trending-up", tier: 1, column: "2", row: "1", maxLevel: 8, cost: 1, effect: "转博时金币增加25%/级，向上取整", prerequisiteIds: ["red-envelope"] },
  { id: "knowledge-is-wealth", name: "书中自有黄金屋", icon: "book-open", tier: 1, column: "2", row: "3", maxLevel: 5, cost: 2, effect: "转博时每篇一作论文奖励1金币/级", prerequisiteIds: ["heiress"] },
  { id: "investment-savvy", name: "理财能手", icon: "piggy-bank", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 3, effect: "每次投资5金币，12个月后获得利息+1/级", prerequisiteIds: ["wealth-growth"] },
  { id: "work-pays-off", name: "薪满意足", icon: "briefcase-business", tier: 2, column: "3", row: "3", maxLevel: 2, cost: 3, effect: "实习收入+50%/级，向上取整", prerequisiteIds: ["knowledge-is-wealth"] },
  { id: "gold-power-alpha", name: "金之力α", icon: "circle-dollar-sign", tier: 3, column: "4", row: "3", maxLevel: 1, cost: 2, effect: "金币达到50时，每点SAN消耗转为1金币", prerequisiteIds: ["work-pays-off"] },
  { id: "gold-power-beta", name: "金之力β", icon: "badge-dollar-sign", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 2, effect: "金币达到50时，导师好感降低转为金币-2/级", prerequisiteIds: ["bring-funding"] },
  { id: "gold-power-gamma", name: "金之力γ", icon: "coins", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 2, effect: "金币达到50时，社交能力降低转为金币-2/级", prerequisiteIds: ["investment-savvy"] },
] as const satisfies readonly DesignedTalentNode[];

const GENIUS_TALENT_NODES = [
  { id: "innate-insight", name: "生而知之", icon: "brain", tier: 0, column: "1", row: "1", maxLevel: 5, cost: 1, effect: "初始科研能力+1/级", prerequisiteIds: [] },
  { id: "idea-insight", name: "灵光乍现", icon: "lightbulb", tier: 0, column: "1", row: "3", maxLevel: 3, cost: 1, effect: "永久想idea+2分/级", prerequisiteIds: [] },
  { id: "tireless-scholar", name: "学而不倦", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "科研能力每年+1", prerequisiteIds: ["innate-insight"] },
  { id: "thirst-for-knowledge", name: "求知若渴", icon: "book-open", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "不断学习事件出现概率+100%", prerequisiteIds: ["innate-insight"] },
  { id: "experiment-practice", name: "躬行求真", icon: "flask-conical", tier: 1, column: "2", row: "3", maxLevel: 3, cost: 1, effect: "永久做实验+2分/级", prerequisiteIds: ["idea-insight"] },
  { id: "proven-by-papers", name: "以文证道", icon: "file-text", tier: 2, column: "3", row: "1", maxLevel: 3, cost: 2, effect: "转博时每篇一作A类论文，科研能力+1/级", prerequisiteIds: ["tireless-scholar"] },
  { id: "boundless-study", name: "学无止境", icon: "infinity", tier: 2, column: "3", row: "2", maxLevel: 5, cost: 1, effect: "转博时每篇一作A类论文，科研上限+1/级", prerequisiteIds: ["thirst-for-knowledge"] },
  { id: "writing-mastery", name: "妙笔成章", icon: "notebook-pen", tier: 2, column: "3", row: "3", maxLevel: 3, cost: 1, effect: "永久写论文+2分/级", prerequisiteIds: ["experiment-practice"] },
  { id: "rise-together", name: "共攀高峰", icon: "users", tier: 3, column: "4", row: "1", maxLevel: 4, cost: 1, effect: "转博后同学的科研能力+1/级", prerequisiteIds: ["proven-by-papers", "boundless-study"] },
  { id: "lasting-work", name: "历久弥新", icon: "hourglass", tier: 3, column: "4", row: "3", maxLevel: 5, cost: 1, effect: "转博后论文分数每月衰减率减少3个百分点/级", prerequisiteIds: ["writing-mastery"] },
] as const satisfies readonly DesignedTalentNode[];

const TEACHER_CHILD_TALENT_NODES = [
  { id: "near-the-source", name: "近水楼台", icon: "house", tier: 0, column: "1", row: "1 / 4", maxLevel: 5, cost: 1, effect: "初始导师好感+1/级", prerequisiteIds: [] },
  { id: "growing-familiarity", name: "朝夕相处", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "导师好感每年+1", prerequisiteIds: ["near-the-source"] },
  { id: "family-host", name: "长辈买单", icon: "hand-coins", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "组内团建事件中聚餐必定由导师请客", prerequisiteIds: ["near-the-source"] },
  { id: "family-patronage", name: "长辈提携", icon: "files", tier: 1, column: "2", row: "3", maxLevel: 2, cost: 3, effect: "转博时每6点导师好感赠送1篇一作C类论文/级", prerequisiteIds: ["near-the-source"] },
  { id: "computing-support", name: "算力后盾", icon: "cpu", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 4, effect: "转博时获得1次显卡报销/级", prerequisiteIds: ["growing-familiarity"] },
  { id: "workspace-renewal", name: "工位焕新", icon: "monitor", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 4, effect: "转博时获得1次工位报销/级", prerequisiteIds: ["growing-familiarity"] },
  { id: "mentor-insight", name: "名师点拨", icon: "book-open", tier: 2, column: "3", row: "3", maxLevel: 2, cost: 2, effect: "导师协作分+50%/级", prerequisiteIds: ["family-patronage"] },
  { id: "funding-shield", name: "经费护航", icon: "store", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 4, effect: "商店购买AI优先扣除科研经费", prerequisiteIds: ["computing-support", "workspace-renewal"] },
  { id: "learning-by-osmosis", name: "耳濡目染", icon: "graduation-cap", tier: 3, column: "4", row: "3", maxLevel: 1, cost: 6, effect: "转博后科研能力视为科研能力与导师好感的较大值", prerequisiteIds: ["mentor-insight"] },
] as const satisfies readonly DesignedTalentNode[];

const CHOSEN_TALENT_NODES = [
  { id: "favored-by-fate", name: "天命所眷", icon: "star", tier: 0, column: "1", row: "1", maxLevel: 2, cost: 3, effect: "初始科研、社交、导师好感、金币+1/级", prerequisiteIds: [] },
  { id: "athletic-prodigy", name: "运动健将", icon: "dumbbell", tier: 0, column: "1", row: "2", maxLevel: 2, cost: 1, effect: "组内团建事件中羽毛球实力+20/级", prerequisiteIds: [] },
  { id: "lasting-fortune", name: "福运绵长", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 4, effect: "每2年科研、社交、导师好感、金币+1", prerequisiteIds: ["favored-by-fate"] },
  { id: "lucky-hand", name: "牌运亨通", icon: "gem", tier: 0, column: "1", row: "3", maxLevel: 2, cost: 1, effect: "组内团建事件中打牌胜率+20%/级", prerequisiteIds: [] },
  { id: "rare-color-fate", name: "异色之缘", icon: "gamepad-2", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 1, effect: "游戏放松事件中游玩洛克王国必定捉到异色", prerequisiteIds: ["athletic-prodigy", "lucky-hand"] },
  { id: "effortless-reinstall", name: "手到擒来", icon: "cpu", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 1, effect: "显卡故障事件中自己重装必定成功", prerequisiteIds: ["athletic-prodigy", "lucky-hand"] },
  { id: "fortunate-health", name: "吉人天相", icon: "shield", tier: 2, column: "3", row: "2 / 4", maxLevel: 4, cost: 1, effect: "每月疾病概率-1%/级", prerequisiteIds: ["rare-color-fate", "effortless-reinstall"] },
  { id: "complete-potential", name: "查缺补漏", icon: "chart-no-axes-combined", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 8, effect: "转博时科研、社交、导师好感补齐至三者最大值", prerequisiteIds: ["lasting-fortune"] },
  { id: "balanced-growth", name: "齐头并进", icon: "sprout", tier: 3, column: "4", row: "1", maxLevel: 2, cost: 2, effect: "转博后科研、社交、导师好感中的最低项每年+1/级", prerequisiteIds: ["complete-potential"] },
  { id: "misfortune-to-fortune", name: "否极泰来", icon: "sunrise", tier: 3, column: "4", row: "2 / 4", maxLevel: 3, cost: 2, effect: "疾病概率可为负数，每满-100%，全属性+1/级", prerequisiteIds: ["fortunate-health"] },
] as const satisfies readonly DesignedTalentNode[];

const CHOSEN_REVERSED_TALENT_NODES = [
  { id: "fate-curse", name: "命运反噬", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "SAN、金币、科研、社交、导师好感轮流在月初-1", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "attribute-swap", name: "乾坤错位", icon: "network", tier: 0, column: "1", row: "1", maxLevel: 1, cost: 2, effect: "每月科研、社交、导师好感随机交换", prerequisiteIds: [] },
  { id: "san-money-swap", name: "祸福相依", icon: "network", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 2, effect: "每月SAN、金币随机交换", prerequisiteIds: [] },
  { id: "post-phd-swap", name: "万象更迭", icon: "rotate-ccw", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 3, effect: "转博后每月科研、社交、导师好感、SAN、金币全部随机交换", prerequisiteIds: ["attribute-swap", "san-money-swap"] },
  { id: "group-event-focus", name: "人声鼎沸", icon: "users", tier: 2, column: "3", row: "1", maxLevel: 4, cost: 2, effect: "组内团建事件出现概率+100%/级", prerequisiteIds: ["post-phd-swap"] },
  { id: "game-event-focus", name: "幻境游踪", icon: "gamepad-2", tier: 2, column: "3", row: "2", maxLevel: 4, cost: 2, effect: "游戏放松事件出现概率+100%/级", prerequisiteIds: ["post-phd-swap"] },
  { id: "swap-breaks-cap", name: "无界轮转", icon: "infinity", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 4, effect: "属性交换可突破上限", prerequisiteIds: ["group-event-focus", "game-event-focus"] },
] as const satisfies readonly DesignedTalentNode[];

const SOCIAL_TALENT_NODES = [
  { id: "natural-charisma", name: "八面玲珑", icon: "smile", tier: 0, column: "1", row: "1", maxLevel: 5, cost: 1, effect: "初始社交+1/级", prerequisiteIds: [] },
  { id: "supporting-juniors", name: "提携后进", icon: "user-round", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 2, effect: "指导师弟师妹事件出现概率+100%", prerequisiteIds: [] },
  { id: "growing-connections", name: "左右逢源", icon: "calendar-days", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "社交每年+1", prerequisiteIds: ["natural-charisma"] },
  { id: "peer-camaraderie", name: "同窗共进", icon: "handshake", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 2, effect: "同门合作事件出现概率+100%", prerequisiteIds: ["supporting-juniors"] },
  { id: "circle-of-friends", name: "高朋满座", icon: "users", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 3, effect: "转博时人际栏每位同学使社交+1/级、社交上限+1/级", prerequisiteIds: ["growing-connections"] },
  { id: "senior-mentorship", name: "师友相助", icon: "graduation-cap", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "师兄师姐指导事件出现概率+100%", prerequisiteIds: ["peer-camaraderie"] },
  { id: "kindly-reviewed", name: "人缘加持", icon: "heart", tier: 3, column: "4", row: "1", maxLevel: 5, cost: 2, effect: "转博时心软审稿人概率+社交×1%/级，其余类型保持相对比例", prerequisiteIds: ["circle-of-friends"] },
  { id: "collective-wisdom", name: "群策群力", icon: "network", tier: 3, column: "4", row: "3", maxLevel: 2, cost: 2, effect: "同学协作分+50%/级", prerequisiteIds: ["senior-mentorship"] },
  { id: "junior-delegation", name: "借力后进", icon: "hand-helping", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 2, effect: "麻烦师弟师妹不扣社交", prerequisiteIds: [] },
  { id: "junior-bond", name: "投桃报李", icon: "heart-handshake", tier: 1, column: "2", row: "2", maxLevel: 3, cost: 1, effect: "麻烦师弟师妹默契+1/级", prerequisiteIds: ["junior-delegation"] },
  { id: "paper-camaraderie", name: "珠联璧合", icon: "file-heart", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 2, effect: "合作发表论文提升的默契+1/级", prerequisiteIds: ["junior-bond"] },
  { id: "overflow-social", name: "人多势众", icon: "user-round-plus", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 2, effect: "人际栏同学溢出转为社交+1", prerequisiteIds: ["senior-mentorship"] },
] as const satisfies readonly DesignedTalentNode[];

const NORMAL_REVERSED_TALENT_NODES = [
  { id: "sloth-core", name: "极致怠惰", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "SAN消耗×2；转博后SAN消耗×3", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "monthly-san-recovery", name: "松弛人生", icon: "heart-pulse", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 2, effect: "每月SAN回复+1/级", prerequisiteIds: [] },
  { id: "sloth-head-start", name: "天纵不羁", icon: "sparkles", tier: 1, column: "2", row: "2", maxLevel: 5, cost: 2, effect: "初始全属性+1/级", prerequisiteIds: ["monthly-san-recovery"] },
  { id: "restful-idle", name: "睡得好香", icon: "hourglass", tier: 0, column: "1", row: "3", maxLevel: 3, cost: 2, effect: "休息效果+1/级", prerequisiteIds: [] },
  { id: "post-phd-recovery", name: "无所事事", icon: "heart-plus", tier: 1, column: "2", row: "1", maxLevel: 2, cost: 2, effect: "转博后每月SAN+已损SAN的10%/级", prerequisiteIds: ["monthly-san-recovery"] },
  { id: "post-phd-growth", name: "天生我材", icon: "trending-up", tier: 2, column: "3", row: "2", maxLevel: 2, cost: 2, effect: "转博时全属性+50%/级", prerequisiteIds: ["sloth-head-start"] },
  { id: "coffee-lifeline", name: "困睡醒科", icon: "brain", tier: 1, column: "2", row: "3", maxLevel: 2, cost: 2, effect: "休息后下次想idea、做实验、写论文+3", prerequisiteIds: ["restful-idle"] },
  { id: "san-cap-reserve", name: "日渐圆润", icon: "shield", tier: 2, column: "3", row: "1", maxLevel: 2, cost: 2, effect: "浪费的行动点转为SAN上限", prerequisiteIds: ["post-phd-recovery"] },
  { id: "year-summary-recovery", name: "忙里偷闲", icon: "calendar-days", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "学年总结事件中休息会回满SAN", prerequisiteIds: ["coffee-lifeline"] },
  { id: "full-san-research", name: "满血状态", icon: "brain", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 2, effect: "SAN为满时科研能力视为+5", prerequisiteIds: ["post-phd-growth"] },
] as const satisfies readonly DesignedTalentNode[];

const RICH_REVERSED_TALENT_NODES = [
  { id: "money-curse", name: "金钱诅咒", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "每月SAN/属性重置为0", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "money-growth", name: "聚沙成塔", icon: "coins", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 2, effect: "每月金币+1/级", prerequisiteIds: [] },
  { id: "loss-to-money", name: "因祸得财", icon: "badge-dollar-sign", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 2, effect: "属性减少转为金钱", prerequisiteIds: [] },
  { id: "spend-to-break-curse", name: "破财消灾", icon: "shield-plus", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 3, effect: "每消耗100金币，金钱诅咒重置值+1", prerequisiteIds: ["money-growth"] },
  { id: "post-phd-money-conversion", name: "钱能通神", icon: "circle-dollar-sign", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 2, effect: "转博后每枚金币消耗随机转化提升SAN、三项属性及三项属性上限", prerequisiteIds: ["money-growth", "loss-to-money"] },
  { id: "finance-master", name: "理财能手", icon: "piggy-bank", tier: 2, column: "3", row: "2", maxLevel: 3, cost: 2, effect: "每次投资5金币，12个月后获得利息+1/级", prerequisiteIds: ["post-phd-money-conversion"] },
  { id: "coin-game", name: "金币游戏", icon: "coins", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 3, effect: "每次属性减少1点，进行一次判定：50%金币×1.5，50%金币×0.4", prerequisiteIds: ["loss-to-money"] },
  { id: "investment-acceleration", name: "快速周转", icon: "clock-3", tier: 3, column: "4", row: "2", maxLevel: 8, cost: 1, effect: "投资回报周期-1个月/级", prerequisiteIds: ["finance-master"] },
  { id: "coin-game-comeback", name: "败局翻盘", icon: "rotate-ccw", tier: 2, column: "3", row: "3", maxLevel: 5, cost: 1, effect: "金币游戏失败后的倍率+0.05/级", prerequisiteIds: ["coin-game"] },
] as const satisfies readonly DesignedTalentNode[];

const GENIUS_REVERSED_TALENT_NODES = [
  { id: "research-curse", name: "学术失语", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "科研视为0", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "paper-opening", name: "笔下藏锋", icon: "file-plus-2", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 1, effect: "开局解锁论文卡片+1/级", prerequisiteIds: [] },
  { id: "knowledge-monetization", name: "以文谋生", icon: "coins", tier: 1, column: "2", row: "1", maxLevel: 2, cost: 1, effect: "科研提升→金币+2/级", prerequisiteIds: ["paper-opening"] },
  { id: "work-life-balance", name: "忍辱负重", icon: "heart-pulse", tier: 1, column: "2", row: "2", maxLevel: 2, cost: 1, effect: "科研提升→SAN+2/级", prerequisiteIds: ["learning-from-rejection"] },
  { id: "research-network", name: "正名之路", icon: "handshake", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 3, effect: "科研提升→社交/好感+1", prerequisiteIds: ["papers-to-insight"] },
  { id: "research-wellness", name: "百折不挠", icon: "shield-plus", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 3, effect: "转博后科研提升→SAN上限+1", prerequisiteIds: ["work-life-balance"] },
  { id: "reputation-growth", name: "导师力挺", icon: "heart-plus", tier: 2, column: "3", row: "2", maxLevel: 1, cost: 3, effect: "转博后科研提升→好感上限+1", prerequisiteIds: ["research-network"] },
  { id: "social-growth", name: "学界声援", icon: "users", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 3, effect: "转博后科研提升→社交上限+1", prerequisiteIds: ["research-network"] },
  { id: "break-research-curse", name: "拨云见日", icon: "sunrise", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 3, effect: "科研达到20时破除视为0诅咒", prerequisiteIds: ["research-wellness", "reputation-growth", "social-growth"] },
  { id: "learning-from-rejection", name: "屡败屡研", icon: "rotate-ccw", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 3, effect: "转博前每篇一作论文首次被拒后，科研能力+1", prerequisiteIds: [] },
  { id: "papers-to-insight", name: "积稿成学", icon: "files", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 3, effect: "转博时每篇一作论文，科研能力+1", prerequisiteIds: [] },
] as const satisfies readonly DesignedTalentNode[];

const TEACHER_CHILD_REVERSED_TALENT_NODES = [
  { id: "favor-burden", name: "恩荫成枷", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "科研、社交视为减少导师好感上限，最低为0", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "advisor-meeting-focus", name: "耳提面命", icon: "message-circle", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 1, effect: "导师约谈事件出现概率+100%", prerequisiteIds: [] },
  { id: "favor-reset", name: "无限包容", icon: "rotate-ccw", tier: 0, column: "1", row: "1", maxLevel: 1, cost: 2, effect: "导师好感低于0时重置为上限", prerequisiteIds: [] },
  { id: "group-meeting-focus", name: "特别关注", icon: "presentation", tier: 0, column: "1", row: "3", maxLevel: 1, cost: 1, effect: "组会汇报事件出现概率+100%", prerequisiteIds: [] },
  { id: "reset-research", name: "歪打正着", icon: "brain", tier: 1, column: "2", row: "3", maxLevel: 1, cost: 2, effect: "导师好感重置时科研+1", prerequisiteIds: ["group-meeting-focus"] },
  { id: "reset-social", name: "没大没小", icon: "users", tier: 1, column: "2", row: "1", maxLevel: 1, cost: 2, effect: "导师好感重置时社交+1", prerequisiteIds: ["favor-reset"] },
  { id: "reset-coins", name: "伸手就有", icon: "coins", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 2, effect: "导师好感重置时金币补充到3", prerequisiteIds: ["advisor-meeting-focus"] },
  { id: "favor-reset-decrease", name: "得寸进尺", icon: "trending-up", tier: 3, column: "4", row: "2", maxLevel: 8, cost: 1, effect: "导师好感重置值-1/级", prerequisiteIds: ["lower-favor-reset"] },
  { id: "lower-favor-reset", name: "恃宠而骄", icon: "heart-crack", tier: 2, column: "3", row: "2", maxLevel: 3, cost: 3, effect: "导师好感下降幅度+1/级", prerequisiteIds: ["reset-research", "reset-social", "reset-coins"] },
  { id: "reset-research-cap", name: "离经叛道", icon: "shield-plus", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 2, effect: "导师好感重置时科研上限+1", prerequisiteIds: ["reset-research"] },
  { id: "reset-social-cap", name: "横行无忌", icon: "heart-handshake", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 2, effect: "导师好感重置时社交上限+1", prerequisiteIds: ["reset-social"] },
  { id: "end-of-grace", name: "恩断义绝", icon: "shield-plus", tier: 3, column: "4", row: "3", maxLevel: 2, cost: 3, effect: "导师好感上限下降幅度+1/级", prerequisiteIds: ["lower-favor-reset"] },
] as const satisfies readonly DesignedTalentNode[];

const SOCIAL_REVERSED_TALENT_NODES = [
  { id: "social-stagnation", name: "患得患失", icon: "skull", tier: 3, column: "4", row: "1", maxLevel: 1, cost: 0, effect: "本月社交未发生变化，下月初科研或导师好感随机-1", prerequisiteIds: [], initialLevel: 1, fixed: true },
  { id: "social-to-san", name: "人前春风", icon: "heart-handshake", tier: 0, column: "1", row: "1", maxLevel: 3, cost: 1, effect: "社交每提升1点，SAN+1/级", prerequisiteIds: [] },
  { id: "fellow-add-social", name: "呼朋引伴", icon: "users", tier: 0, column: "1", row: "2", maxLevel: 1, cost: 3, effect: "人际栏添加同学，社交+1", prerequisiteIds: [] },
  { id: "social-loss-coins", name: "人走茶凉", icon: "coins", tier: 1, column: "2", row: "1", maxLevel: 3, cost: 1, effect: "社交每降低1点，金币+1/级", prerequisiteIds: ["social-to-san"] },
  { id: "fellow-remove-social", name: "割席断交", icon: "heart-crack", tier: 1, column: "2", row: "2", maxLevel: 1, cost: 3, effect: "人际栏放弃同学，社交-1", prerequisiteIds: ["fellow-add-social"] },
  { id: "peer-event-focus", name: "暗中较劲", icon: "handshake", tier: 2, column: "3", row: "1", maxLevel: 4, cost: 2, effect: "同门合作事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "junior-event-focus", name: "后生可畏", icon: "users", tier: 2, column: "3", row: "2", maxLevel: 4, cost: 2, effect: "指导师弟师妹事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "senior-event-focus", name: "望其项背", icon: "presentation", tier: 2, column: "3", row: "3", maxLevel: 4, cost: 2, effect: "师兄师姐指导事件出现概率+100%/级", prerequisiteIds: ["fellow-remove-social"] },
  { id: "affinity-conversion", name: "过河拆桥", icon: "rotate-ccw", tier: 3, column: "4", row: "2", maxLevel: 1, cost: 4, effect: "放弃同学时，每点默契依次转为导师好感、科研、SAN上限、好感上限、科研上限+1，循环分配", prerequisiteIds: ["peer-event-focus", "junior-event-focus", "senior-event-focus"] },
] as const satisfies readonly DesignedTalentNode[];

const DESIGNED_TALENT_TREES = {
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
      "M375 32 H525", "M375 96 C445 96 455 32 525 32", "M375 160 H525",
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
      "M375 96 H525",
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
      "M75 32 H225", "M75 96 H225", "M75 160 H225",
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

function renderDesignedGrowthBoard(roleId: keyof typeof DESIGNED_TALENT_TREES, selectedNodeIndex: number): string {
  const tree = DESIGNED_TALENT_TREES[roleId];
  const nodes: readonly DesignedTalentNode[] = tree.nodes;
  const { paths, viewBoxHeight } = tree;
  const activeIndex = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < nodes.length
    ? selectedNodeIndex : 0;
  return `
    <section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card">
      <div class="lobby-talent-tree is-designed-tree is-${roleId}-tree${nodes.some((node) => node.fixed) ? " is-fixed-tree" : ""}" role="group" aria-label="天赋树预览" data-active-page="0" data-prerequisite-mode="any" data-prerequisite-min-level="1">
        <div class="lobby-talent-tree-pages">
          <div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
            <svg class="lobby-normal-tree-connections" viewBox="0 0 600 ${viewBoxHeight}" preserveAspectRatio="none" aria-hidden="true">
              ${paths.map((path) => `<path d="${path}" />`).join("")}
            </svg>
            ${nodes.map((node, index) => `
              <button class="lobby-talent-tree-node${index === activeIndex ? " is-selected" : ""}${node.fixed ? " is-fixed" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-talent-id="${node.id}" data-tier="${node.fixed ? "fixed" : node.tier}" data-fixed="${node.fixed ? "true" : "false"}" aria-label="${escapeHtml(`${node.name}：${node.effect}${node.fixed ? "，固定生效" : `，${node.cost}天赋点`}，仅预览`)}" title="${node.name}" aria-pressed="${index === activeIndex}" style="grid-column:${node.column};grid-row:${node.row}" data-cost="${node.cost}" data-initial-level="${node.initialLevel ?? 0}" data-prerequisite-ids="${node.prerequisiteIds.join(" ")}">
                <span class="lobby-talent-tree-node-ring"><i data-lucide="${node.icon}" aria-hidden="true"></i></span>
                ${node.fixed ? "" : `<span class="lobby-normal-tree-node-level">${node.initialLevel ?? 0}/${node.maxLevel}</span>`}
              </button>
            `).join("")}
            <div class="lobby-normal-tree-details" aria-live="polite">
              ${nodes.map((node, index) => `
                <div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === activeIndex ? "" : " hidden"}>
                  <div class="lobby-normal-tree-detail-heading"><strong>${escapeHtml(node.name)}</strong></div>
                  <p>${escapeHtml(node.effect)}<span class="lobby-normal-tree-detail-cost">${node.fixed ? "固定生效" : `${node.cost}天赋点`}</span></p>
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
): string {
  const viewModel = buildLobbySelectedRoleViewModel(accountProfile, selectedRoleId);

  return `
    <section class="lobby-detail-stage">
      <section class="lobby-profile-card${viewModel.unlockState.owned ? " is-owned" : " is-locked"}">
        <div class="lobby-profile-main">
          <section class="lobby-profile-top">
            <div class="lobby-profile-art">
              <img
                class="lobby-profile-portrait"
                src="${escapeHtml(getRoleDetailPortraitUrl(viewModel.role.id))}"
                width="432"
                height="774"
                loading="eager"
                decoding="async"
                fetchpriority="high"
                alt="${escapeHtml(`${viewModel.role.name}立绘`)}"
              />
            </div>
            ${renderProfileInfoPanel(viewModel)}
          </section>
          ${hasDesignedTalentTree(selectedRoleId)
            ? renderDesignedGrowthBoard(selectedRoleId, talentTreeSelectedNodeByPage[0] ?? 0)
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
  activeRoleRailView: RoleRailViewId = "achievements",
  talentTreePageIndex = 0,
  talentTreeSelectedNodeByPage: readonly number[] = [0],
  announcementPageIndex = 0,
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
                      <span class="lobby-role-owned-count lobby-meta-count">已收录 ${ownedCount} / ${getRoleOptions().length}</span>
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
                ${renderSelectedRoleDetail(accountProfile, selectedRoleId, activeRoleRailView, talentTreePageIndex, talentTreeSelectedNodeByPage, announcementPageIndex)}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  `;
}
