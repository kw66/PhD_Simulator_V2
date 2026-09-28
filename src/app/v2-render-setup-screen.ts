import {
  buildLobbySelectedRoleViewModel,
  getLobbyRolePageCount,
  getLobbyRolePageRows,
  getRoleAchievementPageCount,
  isRoleOwned,
  LOBBY_ROLE_PAGE_ROW_COUNT,
  ROLE_ACHIEVEMENT_PAGE_SIZE,
} from "../core/v2-lobby";
import { MAX_SAN } from "../core/v2-content";
import { getRoleDefinition, getRoleOptions } from "../core/v2-progression";
import { animationNumberAttributes, animationBarAttribute, renderAnimatedNumber } from "./v2-render-animation";
import { BASE_RESEARCH_CAP } from "../core/v2-research-cap-system";
import { getRoleLobbyAchievementDefinitions } from "../core/v2-role-lobby-meta";
import { DEFAULT_ROLE_EXP_GAIN_MULTIPLIER, getNextRoleLevelExperience } from "../core/v2-role-experience";
import type { AccountProfile, GameState, LobbySelectedRoleViewModel, RoleAchievementDefinition, RoleId } from "../core/v2-types";
import { getRoleCardPortraitUrl, getRoleDetailPortraitUrl } from "./v2-role-portrait-assets";
import { renderLobbyMasthead, renderLobbyMessageRailView } from "./v2-render-community";
import type { RoleRailViewId } from "./v2-render-types";

const SPECIAL_ROLE_IDS = new Set<RoleId>(["rewinder", "research-captain"]);

type TalentPointSummary = {
  level: number;
  currentExp: number;
  nextExp: number | null;
  availablePoints: number;
};

const DOSSIER_STAT_LABELS = {
  san: "SAN",
  research: "科研能力",
  social: "社交能力",
  favor: "导师好感",
  money: "金币",
} as const;

const LOBBY_STARTING_STAT_CAPS: Partial<Record<keyof typeof DOSSIER_STAT_LABELS, number>> = {
  san: MAX_SAN,
  research: BASE_RESEARCH_CAP,
  social: 20,
  favor: 20,
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

  return getRoleDefinition(roleId).mode === "reversed" ? " tone-reversed" : " tone-upright";
}

function getRoleModeLabel(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return "特殊";
  }

  return getRoleDefinition(roleId).mode === "reversed" ? "逆位" : "正位";
}

function getRoleModeClass(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return "is-special";
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

function getDossierStatLabel(statId: string, fallback: string): string {
  return DOSSIER_STAT_LABELS[statId as keyof typeof DOSSIER_STAT_LABELS] ?? fallback;
}

function buildTalentPointSummary(viewModel: LobbySelectedRoleViewModel): TalentPointSummary {
  const nextExp = getNextRoleLevelExperience(viewModel.progress.level);

  return {
    level: viewModel.progress.level,
    currentExp: viewModel.progress.exp,
    nextExp,
    availablePoints: viewModel.progress.level,
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
          <span class="lobby-growth-level-hint" role="note" tabindex="0" aria-label="等级${pointSummary.level}，每级+1天赋点" data-tooltip="每级+1天赋点">
            <span class="lobby-growth-inline-label">等级</span>
            <strong class="lobby-growth-inline-value" ${animationNumberAttributes(`role:${viewModel.role.id}:growth:level`, pointSummary.level)}>${pointSummary.level}</strong>
          </span>
          <span class="lobby-growth-multiplier-hint" role="note" tabindex="0" aria-label="经验倍率${DEFAULT_ROLE_EXP_GAIN_MULTIPLIER.toFixed(1)}，每局增加科研分✖经验倍率的经验。" data-tooltip="每局增加科研分✖经验倍率的经验。">
            <span class="lobby-growth-inline-label">经验倍率</span>
            <strong class="lobby-growth-inline-value">${DEFAULT_ROLE_EXP_GAIN_MULTIPLIER.toFixed(1)}</strong>
          </span>
        </div>
        <div class="lobby-growth-exp-detail-row">
          <div class="lobby-talent-allocation-meta">
            <span>天赋点 <strong class="lobby-talent-points-value">${renderAnimatedNumber(`role:${viewModel.role.id}:growth:available-points`, pointSummary.availablePoints)}</strong></span>
            <button class="lobby-talent-reset-button" type="button" disabled title="重置天赋点"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>重置</span></button>
          </div>
        </div>
      </div>
      <div class="lobby-growth-exp-row">
        <span class="lobby-growth-inline-label">经验</span>
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
          <h2 class="lobby-profile-stat-column-title">开局属性</h2>
          <div class="lobby-profile-stat-stack">
            ${viewModel.stats.map((stat) => `
              <div class="lobby-profile-stat-row">
                <span>${escapeHtml(getDossierStatLabel(stat.id, stat.label))}</span>
                <strong>${escapeHtml(formatLobbyStartingStatValue(stat.id, stat.total))}</strong>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="lobby-profile-stat-column is-history">
          <h2 class="lobby-profile-stat-column-title">历史最高</h2>
          <div class="lobby-profile-stat-stack lobby-profile-history-stack">
            ${viewModel.historyStats.map((stat) => `
              <div class="lobby-profile-stat-row">
                <span>${escapeHtml(stat.label)}</span>
                <strong>${stat.id === "representative" ? renderAnimatedNumber(`role:${viewModel.role.id}:history:representative:score`, viewModel.progress.historyBest.representativeScore) : Number.isFinite(Number(stat.value)) && stat.value.trim() !== "" ? renderAnimatedNumber(`role:${viewModel.role.id}:history:${stat.id}`, Number(stat.value), stat.value) : escapeHtml(stat.value)}</strong>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
      ${renderGrowthProgress(viewModel, pointSummary)}
    </section>
  `;
}

function formatLobbyStartingStatValue(statId: string, value: number): string {
  const cap = LOBBY_STARTING_STAT_CAPS[statId as keyof typeof LOBBY_STARTING_STAT_CAPS];
  return typeof cap === "number" ? `${value}/${cap}` : `${value}`;
}

const NORMAL_TALENT_NODES = [
  { id: "first-month-drive", name: "满怀干劲", icon: "heart-plus", tier: 0, column: "1", row: "1 / 3", maxLevel: 4, cost: 1, effect: "首月（9月）结束后，下月初SAN回复+2/级", prerequisite: "" },
  { id: "self-determination", name: "我命由我", icon: "sunrise", tier: 1, column: "2", row: "1", maxLevel: 5, cost: 2, effect: "转博时属性提升20%/级，向上取整", prerequisite: "满怀干劲至少1级" },
  { id: "diligence", name: "勤能补拙", icon: "footprints", tier: 2, column: "2", row: "2", maxLevel: 5, cost: 2, effect: "转博后每月行动+0.2次/级，余数逐月累积", prerequisite: "满怀干劲至少1级" },
  { id: "breakthrough", name: "突破极限", icon: "rocket", tier: 3, column: "3", row: "1", maxLevel: 1, cost: 3, effect: "转博后属性溢出时上限+1，最多+10", prerequisite: "我命由我" },
  { id: "burning-life", name: "燃烧生命", icon: "heart-crack", tier: 4, column: "3", row: "2", maxLevel: 1, cost: 3, effect: "转博后行动点耗尽仍可行动，每次消耗2点SAN上限", prerequisite: "勤能补拙" },
] as const;

const RICH_TALENT_NODES = [
  { id: "red-envelope", name: "红包拿来", icon: "gift", tier: 0, column: "1", row: "1", maxLevel: 2, cost: 1, effect: "压岁钱+2/级", prerequisite: "" },
  { id: "bring-funding", name: "带资进组", icon: "hand-coins", tier: 0, column: "1", row: "2", maxLevel: 2, cost: 1, effect: "导师科研经费+10/级", prerequisite: "" },
  { id: "heiress", name: "千金小姐", icon: "wallet", tier: 0, column: "1", row: "3", maxLevel: 2, cost: 1, effect: "初始金币+4/级", prerequisite: "" },
  // Preview rule for later activation: both transfer bonuses use the pre-transfer state, so paper rewards do not compound the coin bonus.
  { id: "wealth-growth", name: "财富倍增", icon: "trending-up", tier: 1, column: "2", row: "1", maxLevel: 4, cost: 2, effect: "转博时金币增加50%/级，向上取整", prerequisite: "红包拿来至少1级" },
  { id: "knowledge-is-wealth", name: "书中自有黄金屋", icon: "book-open", tier: 1, column: "2", row: "3", maxLevel: 4, cost: 2, effect: "转博时每篇一作论文奖励1金币/级", prerequisite: "千金小姐至少1级" },
  { id: "investment-savvy", name: "理财能手", icon: "piggy-bank", tier: 2, column: "3", row: "1", maxLevel: 1, cost: 3, effect: "转博后每满12个月获得金币30%的利息，向上取整", prerequisite: "财富倍增" },
  { id: "work-pays-off", name: "身价不菲", icon: "briefcase-business", tier: 2, column: "3", row: "3", maxLevel: 1, cost: 3, effect: "打工、实习收入+50%，向上取整", prerequisite: "书中自有黄金屋" },
] as const;

const GENIUS_TALENT_NODES = [
  { id: "innate-insight", name: "生而知之", icon: "brain", tier: 0, column: "1", row: "1", maxLevel: 3, effect: "初始科研能力+2/级", prerequisiteIds: [] },
  { id: "tireless-scholar", name: "学而不倦", icon: "calendar-days", tier: 0, column: "1", row: "2", maxLevel: 1, effect: "科研能力每年+1", prerequisiteIds: [] },
  { id: "proven-by-papers", name: "以文证道", icon: "file-text", tier: 1, column: "2", row: "1", maxLevel: 4, effect: "转博时每篇一作A类论文，科研能力+1/级", prerequisiteIds: ["innate-insight", "tireless-scholar"] },
  { id: "boundless-study", name: "学无止境", icon: "infinity", tier: 1, column: "2", row: "2", maxLevel: 4, effect: "转博时每篇一作A类论文，科研上限+2/级", prerequisiteIds: ["innate-insight", "tireless-scholar"] },
  { id: "lasting-work", name: "历久弥新", icon: "hourglass", tier: 2, column: "3", row: "1", maxLevel: 2, effect: "转博后论文分数每月衰减减少50%/级", prerequisiteIds: ["proven-by-papers", "boundless-study"] },
  { id: "rise-together", name: "共攀高峰", icon: "users", tier: 2, column: "3", row: "2", maxLevel: 1, effect: "转博后同学、恋人的科研能力+2", prerequisiteIds: ["proven-by-papers", "boundless-study"] },
] as const;

const DESIGNED_TALENT_TREES = {
  normal: {
    nodes: NORMAL_TALENT_NODES,
    viewBoxHeight: 200,
    paths: ["M100 100 C195 100 205 50 300 50 H500", "M100 100 C195 100 205 150 300 150 H500"],
  },
  rich: {
    nodes: RICH_TALENT_NODES,
    viewBoxHeight: 192,
    paths: ["M100 32 H500", "M100 160 H500"],
  },
  genius: {
    nodes: GENIUS_TALENT_NODES,
    viewBoxHeight: 200,
    paths: [
      "M100 50 H300", "M100 150 H300",
      "M100 50 C180 50 220 150 300 150", "M100 150 C180 150 220 50 300 50",
      "M300 50 H500", "M300 150 H500",
      "M300 50 C380 50 420 150 500 150", "M300 150 C380 150 420 50 500 50",
    ],
  },
} as const;

function renderDesignedGrowthBoard(roleId: keyof typeof DESIGNED_TALENT_TREES, selectedNodeIndex: number): string {
  const { nodes, paths, viewBoxHeight } = DESIGNED_TALENT_TREES[roleId];
  const activeIndex = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < nodes.length
    ? selectedNodeIndex : 0;
  return `
    <section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card">
      <div class="lobby-talent-tree is-designed-tree is-${roleId}-tree" role="group" aria-label="天赋树预览" data-active-page="0"${roleId === "genius" ? ' data-prerequisite-mode="any"' : ""}>
        <div class="lobby-talent-tree-pages">
          <div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
            <svg class="lobby-normal-tree-connections" viewBox="0 0 600 ${viewBoxHeight}" preserveAspectRatio="none" aria-hidden="true">
              ${paths.map((path) => `<path d="${path}" />`).join("")}
            </svg>
            ${nodes.map((node, index) => `
              <button class="lobby-talent-tree-node${index === activeIndex ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-talent-id="${node.id}" data-tier="${node.tier}" aria-label="${escapeHtml(`${node.name}：${node.effect}，仅预览`)}" title="${node.name}" aria-pressed="${index === activeIndex}" style="grid-column:${node.column};grid-row:${node.row}"${"prerequisiteIds" in node ? ` data-prerequisite-ids="${node.prerequisiteIds.join(" ")}"` : ""}>
                <span class="lobby-talent-tree-node-ring"><i data-lucide="${node.icon}" aria-hidden="true"></i></span>
                <span class="lobby-normal-tree-node-level">0/${node.maxLevel}</span>
              </button>
            `).join("")}
            <div class="lobby-normal-tree-details" aria-live="polite">
              ${nodes.map((node, index) => `
                <div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === activeIndex ? "" : " hidden"}>
                  <div class="lobby-normal-tree-detail-heading"><strong>${node.name}</strong></div>
                  <p>${node.effect}</p>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

const TALENT_TREE_PREVIEW_PAGES = [
  [
    { column: 2, row: 1, icon: "lightbulb", tier: 0 },
    { column: 4, row: 1, icon: "shield", tier: 1 },
    { column: 2, row: 2, icon: "flask-conical", tier: 1 },
    { column: 4, row: 2, icon: "target", tier: 3 },
    { column: 2, row: 3, icon: "file-text", tier: 2 },
    { column: 4, row: 3, icon: "heart-pulse", tier: 4 },
  ],
  [
    { column: 1, row: 1, icon: "microscope", tier: 0 },
    { column: 2, row: 1, icon: "brain", tier: 1 },
    { column: 3, row: 1, icon: "database", tier: 2 },
    { column: 5, row: 1, icon: "zap", tier: 4 },
    { column: 2, row: 2, icon: "book-open", tier: 1 },
    { column: 3, row: 2, icon: "network", tier: 2 },
    { column: 4, row: 2, icon: "sparkles", tier: 3 },
    { column: 1, row: 3, icon: "notebook-pen", tier: 0 },
    { column: 2, row: 3, icon: "chart-no-axes-combined", tier: 1 },
    { column: 3, row: 3, icon: "presentation", tier: 2 },
    { column: 5, row: 3, icon: "award", tier: 4 },
  ],
  [
    { column: 1, row: 1, icon: "message-circle", tier: 0 },
    { column: 3, row: 1, icon: "users", tier: 2 },
    { column: 4, row: 1, icon: "handshake", tier: 3 },
    { column: 2, row: 2, icon: "coffee", tier: 1 },
    { column: 3, row: 2, icon: "heart", tier: 2 },
    { column: 4, row: 2, icon: "smile", tier: 3 },
    { column: 5, row: 2, icon: "star", tier: 4 },
    { column: 1, row: 3, icon: "calendar-days", tier: 0 },
    { column: 2, row: 3, icon: "dumbbell", tier: 1 },
    { column: 3, row: 3, icon: "activity", tier: 2 },
    { column: 5, row: 3, icon: "medal", tier: 4 },
  ],
  [
    { column: 1, row: 1, icon: "laptop", tier: 0 },
    { column: 3, row: 1, icon: "graduation-cap", tier: 2 },
    { column: 5, row: 1, icon: "crown", tier: 4 },
    { column: 2, row: 2, icon: "briefcase", tier: 1 },
    { column: 4, row: 2, icon: "gem", tier: 3 },
    { column: 1, row: 3, icon: "feather", tier: 0 },
    { column: 3, row: 3, icon: "badge-check", tier: 2 },
    { column: 5, row: 3, icon: "trophy", tier: 4 },
  ],
] as const;

function renderGrowthBoard(pageIndex: number, selectedNodeByPage: readonly number[]): string {
  const activePage = Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < TALENT_TREE_PREVIEW_PAGES.length ? pageIndex : 0;
  const selectedNodeIndices = TALENT_TREE_PREVIEW_PAGES.map((_, index) => selectedNodeByPage[index] ?? (index === 0 ? 0 : -1));
  return `
    <section class="lobby-profile-growth-card lobby-profile-section">
      <div class="lobby-talent-tree" role="group" aria-label="天赋树预览" data-active-page="${activePage}" data-direction="forward">
        <div class="lobby-talent-tree-controls">
          <button class="lobby-talent-tree-page-button pager-arrow" type="button" data-ui-talent-tree-page-delta="-1" aria-label="上一页" ${activePage === 0 ? "disabled" : ""}><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <span class="lobby-talent-tree-crest" aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <button class="lobby-talent-tree-page-button pager-arrow" type="button" data-ui-talent-tree-page-delta="1" aria-label="下一页" ${activePage === TALENT_TREE_PREVIEW_PAGES.length - 1 ? "disabled" : ""}><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>
        <div class="lobby-talent-tree-pages">
          ${TALENT_TREE_PREVIEW_PAGES.map((nodes, pageIndex) => `
            <div class="lobby-talent-tree-page${pageIndex === activePage ? " is-active" : ""}" data-tree-page="${pageIndex}"${pageIndex === activePage ? "" : " hidden"}>
              ${nodes.map((node, nodeIndex) => `
                <button class="lobby-talent-tree-node${nodeIndex === selectedNodeIndices[pageIndex] ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="${pageIndex}-${nodeIndex}" data-tier="${node.tier}" aria-label="第${pageIndex + 1}页技能节点${nodeIndex + 1}，仅预览" aria-pressed="${nodeIndex === selectedNodeIndices[pageIndex]}" style="grid-column:${node.column};grid-row:${node.row}">
                  <span class="lobby-talent-tree-node-ring"><i data-lucide="${node.icon}" aria-hidden="true"></i></span>
                </button>
              `).join("")}
            </div>
          `).join("")}
        </div>
        <div class="lobby-talent-tree-page-dots" aria-hidden="true">${TALENT_TREE_PREVIEW_PAGES.map((_, index) => `<span class="${index === activePage ? "is-active" : ""}"></span>`).join("")}</div>
      </div>
    </section>
  `;
}

export function renderRoleRail(accountProfile: AccountProfile, selectedRoleId: RoleId, activeRoleRailView: RoleRailViewId): string {
  return `<aside class="lobby-profile-achievement-rail${activeRoleRailView === "messages" ? " is-message-view" : ""}">
    ${activeRoleRailView === "messages"
      ? renderLobbyMessageRailView()
      : renderRoleAchievementList(selectedRoleId, accountProfile)}
  </aside>`;
}

function renderSelectedRoleDetail(
  accountProfile: AccountProfile,
  selectedRoleId: RoleId,
  activeRoleRailView: RoleRailViewId,
  talentTreePageIndex: number,
  talentTreeSelectedNodeByPage: readonly number[],
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
          ${selectedRoleId === "normal" || selectedRoleId === "rich" || selectedRoleId === "genius"
            ? renderDesignedGrowthBoard(selectedRoleId, talentTreeSelectedNodeByPage[0] ?? 0)
            : renderGrowthBoard(talentTreePageIndex, talentTreeSelectedNodeByPage)}
        </div>
        ${renderRoleRail(accountProfile, selectedRoleId, activeRoleRailView)}
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
                ${renderSelectedRoleDetail(accountProfile, selectedRoleId, activeRoleRailView, talentTreePageIndex, talentTreeSelectedNodeByPage)}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  `;
}
