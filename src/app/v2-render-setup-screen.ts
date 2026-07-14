import {
  buildLobbySelectedRoleViewModel,
  getLobbyRolePageCount,
  getLobbyRolePageRows,
  getRoleAchievementDisplayTotal,
  getRoleAchievementPageCount,
  isRoleOwned,
  ROLE_ACHIEVEMENT_PAGE_SIZE,
} from "../core/v2-account";
import { MAX_SAN } from "../core/v2-content";
import { getRoleDefinition, getRoleOptions } from "../core/v2-progression";
import { BASE_RESEARCH_CAP } from "../core/v2-research-cap-system";
import type { AccountProfile, GameState, LobbySelectedRoleViewModel, RoleId } from "../core/v2-types";
import { getRoleCardPortraitUrl, getRoleDetailPortraitUrl } from "./v2-role-portrait-assets";

const SPECIAL_ROLE_IDS = new Set<RoleId>(["rewinder", "research-captain"]);

type RoleTagDescriptor = {
  label: string;
  className: string;
};

type TalentSourceId = "awakening" | "hidden-awaken";

type RoleTalentAllocationPreview = {
  id: TalentSourceId;
  name: string;
  allocatedPoints: number;
  effectText: string;
};

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

const ROLE_LEVEL_EXP_REQUIREMENTS = [20, 40, 80, 140, 220, 320, 440, 580, 640, 820] as const;
const NORMAL_EFFECT_MAX_LEVEL = 10;
const DEFAULT_ROLE_EXP_GAIN_MULTIPLIER = 1;

function buildTalentPreviewDefinitions(...sourceIds: TalentSourceId[]): TalentSourceId[] {
  return [...sourceIds];
}

const ROLE_TALENT_PREVIEW_DEFINITIONS: Record<RoleId, TalentSourceId[]> = {
  normal: buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  genius: buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  social: buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  rich: buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  "teacher-child": buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  chosen: buildTalentPreviewDefinitions("awakening", "hidden-awaken"),
  rewinder: buildTalentPreviewDefinitions("awakening"),
  "research-captain": buildTalentPreviewDefinitions("awakening"),
  "normal-reversed": buildTalentPreviewDefinitions("awakening"),
  "genius-reversed": buildTalentPreviewDefinitions("awakening"),
  "social-reversed": buildTalentPreviewDefinitions("awakening"),
  "rich-reversed": buildTalentPreviewDefinitions("awakening"),
  "teacher-child-reversed": buildTalentPreviewDefinitions("awakening"),
  "chosen-reversed": buildTalentPreviewDefinitions("awakening"),
};

function getRoleToneClass(roleId: RoleId): string {
  if (SPECIAL_ROLE_IDS.has(roleId)) {
    return " tone-special";
  }

  return getRoleDefinition(roleId).mode === "reversed" ? " tone-reversed" : " tone-upright";
}

function getRoleTagDescriptors(roleId: RoleId, owned: boolean): RoleTagDescriptor[] {
  const tags: RoleTagDescriptor[] = SPECIAL_ROLE_IDS.has(roleId)
    ? [{ label: "特殊", className: " is-special" }]
    : [{
      label: getRoleDefinition(roleId).mode === "reversed" ? "逆位" : "正位",
      className: getRoleDefinition(roleId).mode === "reversed" ? " is-reversed" : " is-upright",
    }];

  if (!owned) {
    tags.push({ label: "未解锁", className: " is-locked" });
  }

  return tags;
}

function renderRoleMetricItem(label: string, value: string, className: string): string {
  return `
    <div class="lobby-role-card-metric ${className}">
      <span class="lobby-role-card-metric-label">${label}</span>
      <strong class="lobby-role-card-metric-value">${value}</strong>
    </div>
  `;
}

function renderRoleCard(roleId: RoleId, accountProfile: AccountProfile, selectedRoleId: RoleId): string {
  const role = getRoleDefinition(roleId);
  const progress = accountProfile.roleProgress[roleId];
  const owned = isRoleOwned(accountProfile, roleId);
  const toneClass = getRoleToneClass(roleId);
  const selectedClass = selectedRoleId === roleId ? " is-selected" : "";
  const statusClass = owned ? " is-owned" : " is-locked";
  const achievementTotal = getRoleAchievementDisplayTotal(roleId);
  const tagDescriptors = getRoleTagDescriptors(roleId, owned);

  return `
    <button
      class="lobby-role-card${toneClass}${selectedClass}${statusClass}"
      type="button"
      data-action="select-role"
      data-role-id="${role.id}"
      aria-pressed="${selectedRoleId === roleId ? "true" : "false"}"
    >
      <div class="lobby-role-card-top">
        <div class="lobby-role-card-main">
          <div class="lobby-role-card-portrait-shell">
            <img
              class="lobby-role-card-portrait"
              src="${getRoleCardPortraitUrl(role.id)}"
              width="144"
              height="258"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              alt="${role.name}缩略立绘"
            />
          </div>
          <div class="lobby-role-card-headings">
            <strong class="lobby-role-card-name">${role.name}</strong>
            <div class="lobby-role-card-tag-line">
              <span class="lobby-role-card-tags">
                ${tagDescriptors.map((tag) => `<span class="lobby-role-card-tag${tag.className}">${tag.label}</span>`).join("")}
              </span>
            </div>
            <div class="lobby-role-card-metric-list">
              ${renderRoleMetricItem("通关", `${progress.completedRuns}`, "is-runs")}
              ${renderRoleMetricItem("等级", `${progress.level}`, "is-level")}
              ${renderRoleMetricItem("成就", `${progress.achievementCount}/${achievementTotal}`, "is-achievement")}
            </div>
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
        class="lobby-page-button"
        type="button"
        aria-label="上一页"
        data-action="change-lobby-role-page"
        data-delta="-1"
        ${accountProfile.lobbyRolePage <= 0 ? "disabled" : ""}
      >
        ←
      </button>
      <span class="lobby-page-indicator">${accountProfile.lobbyRolePage + 1} / ${pageCount}</span>
      <button
        class="lobby-page-button"
        type="button"
        aria-label="下一页"
        data-action="change-lobby-role-page"
        data-delta="1"
        ${accountProfile.lobbyRolePage >= pageCount - 1 ? "disabled" : ""}
      >
        →
      </button>
    </div>
  `;
}

function renderRoleAchievementList(selectedRoleId: RoleId, accountProfile: AccountProfile): string {
  const viewModel = buildLobbySelectedRoleViewModel(accountProfile, selectedRoleId);
  const unlockedCount = viewModel.roleAchievements.filter((achievement) => achievement.unlocked).length;
  const achievementPageCount = getRoleAchievementPageCount(selectedRoleId);
  const achievementPageIndex = Math.min(accountProfile.lobbyRoleAchievementPage, achievementPageCount - 1);
  const visibleAchievements = viewModel.roleAchievements.slice(
    achievementPageIndex * ROLE_ACHIEVEMENT_PAGE_SIZE,
    (achievementPageIndex + 1) * ROLE_ACHIEVEMENT_PAGE_SIZE,
  );

  return `
    <section class="lobby-profile-section lobby-profile-achievement-section">
      <div class="lobby-profile-achievement-bar">
        <div class="lobby-profile-achievement-title-block">
          <h2>角色成就</h2>
          <span class="lobby-meta-count">${unlockedCount} / ${viewModel.roleAchievements.length}</span>
        </div>
        <div class="lobby-role-pagination is-compact">
          <button
            class="lobby-page-button"
            type="button"
            aria-label="上一页"
            data-action="change-role-achievement-page"
            data-delta="-1"
            ${achievementPageIndex <= 0 ? "disabled" : ""}
          >←</button>
          <span class="lobby-page-indicator">${achievementPageIndex + 1} / ${achievementPageCount}</span>
          <button
            class="lobby-page-button"
            type="button"
            aria-label="下一页"
            data-action="change-role-achievement-page"
            data-delta="1"
            ${achievementPageIndex >= achievementPageCount - 1 ? "disabled" : ""}
          >→</button>
        </div>
      </div>
      <div class="lobby-profile-achievement-list">
        ${visibleAchievements.length > 0
          ? visibleAchievements.map((achievement) => `
          <article class="lobby-profile-achievement${achievement.unlocked ? " is-unlocked" : ""}">
            <div class="lobby-profile-achievement-head">
              <strong>${achievement.definition.title}</strong>
              <span>${achievement.unlocked ? "已达成" : "未达成"}</span>
            </div>
            <div class="lobby-profile-achievement-copy">
              <p class="lobby-profile-achievement-condition">${achievement.definition.description}</p>
              ${achievement.definition.rewardText ? `<p class="lobby-profile-achievement-reward">${achievement.definition.rewardText}</p>` : ""}
              ${achievement.progressLines.length > 0
                ? `
                <div class="lobby-profile-achievement-progress">
                  ${achievement.progressLines.map((line) => `<span>${line}</span>`).join("")}
                </div>
              `
                : ""}
            </div>
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

function getRoleTalentPreviewDefinitions(roleId: RoleId): TalentSourceId[] {
  return ROLE_TALENT_PREVIEW_DEFINITIONS[roleId] ?? [];
}

function clampNormalEffectLevel(level: number): number {
  return Math.max(0, Math.min(NORMAL_EFFECT_MAX_LEVEL, Math.floor(level)));
}

function formatNormalBaseEffect(level: number): string {
  const effectLevel = clampNormalEffectLevel(level);
  return effectLevel <= 0 ? "无效果" : `天赋点+${effectLevel}`;
}

function formatNormalAwakeningEffect(level: number): string {
  const effectLevel = clampNormalEffectLevel(level);
  const baseEffectText = `转博时科研能力、社交能力、导师好感+${effectLevel * 10}%（属性小数上取整）`;
  return effectLevel >= NORMAL_EFFECT_MAX_LEVEL
    ? `${baseEffectText}；满级额外效果：每当属性溢出时上限+1`
    : baseEffectText;
}

function formatNormalHiddenAwakenEffect(level: number): string {
  const effectLevel = clampNormalEffectLevel(level);
  const actionBonusText = effectLevel <= 0 ? "0" : (effectLevel / 10).toFixed(1);
  const baseEffectText = `每月行动次数+${actionBonusText}（小数累积，满1生效）`;
  return effectLevel >= NORMAL_EFFECT_MAX_LEVEL
    ? `${baseEffectText}；满级额外效果：第一个月有10次行动次数`
    : baseEffectText;
}

function getRoleBaseEffectText(viewModel: LobbySelectedRoleViewModel): string {
  switch (viewModel.role.id) {
    case "normal":
      return formatNormalBaseEffect(viewModel.progress.level);
    default:
      return "无效果";
  }
}

function getRoleTalentEffectText(
  roleId: RoleId,
  sourceId: TalentSourceId,
  level: number,
  _fallbackText: string,
): string {
  if (roleId === "normal") {
    return sourceId === "awakening"
      ? formatNormalAwakeningEffect(level)
      : formatNormalHiddenAwakenEffect(level);
  }

  return "";
}

function buildRoleTalentAllocationPreview(viewModel: LobbySelectedRoleViewModel): RoleTalentAllocationPreview[] {
  const passiveById = new Map(viewModel.passives.map((passive) => [passive.definition.id, passive]));

  return getRoleTalentPreviewDefinitions(viewModel.role.id).flatMap((sourceId) => {
    const passive = passiveById.get(sourceId);
    if (!passive) {
      return [];
    }

    return [{
      id: sourceId,
      name: passive.definition.name,
      allocatedPoints: Math.max(0, passive.level),
      effectText: getRoleTalentEffectText(
        viewModel.role.id,
        sourceId,
        Math.max(0, passive.level),
        passive.definition.description,
      ),
    }];
  });
}

function buildTalentPointSummary(
  viewModel: LobbySelectedRoleViewModel,
  talents: RoleTalentAllocationPreview[],
): TalentPointSummary {
  const nextExp = ROLE_LEVEL_EXP_REQUIREMENTS[viewModel.progress.level] ?? null;
  const allocatedPoints = talents.reduce((sum, talent) => sum + talent.allocatedPoints, 0);
  const totalPoints = viewModel.progress.level;

  return {
    level: viewModel.progress.level,
    currentExp: viewModel.progress.exp,
    nextExp,
    availablePoints: Math.max(totalPoints - allocatedPoints, 0),
  };
}

function formatRoleExpGainHint(multiplier: number): string {
  return `每局经验=科研分*获取倍率，当前倍率为${multiplier.toFixed(1)}（完成成就可提升获取倍率）`;
}

function renderProfileInfoPanel(viewModel: LobbySelectedRoleViewModel): string {
  return `
    <section class="lobby-profile-info">
      <div class="lobby-profile-info-head">
        <h1 class="lobby-profile-art-name">${viewModel.role.name}</h1>
        ${viewModel.unlockState.owned
          ? `<button class="lobby-start-button" type="button" data-action="start-game" data-role-id="${viewModel.role.id}">开始游戏</button>`
          : `<button class="lobby-start-button is-disabled" type="button" disabled>未解锁</button>`}
      </div>
      <p class="lobby-profile-summary">${viewModel.lobby.summary}</p>
      <div class="lobby-profile-stat-columns">
        <section class="lobby-profile-stat-column">
          <h2 class="lobby-profile-stat-column-title">开局属性</h2>
          <div class="lobby-profile-stat-stack">
            ${viewModel.stats.map((stat) => `
              <div class="lobby-profile-stat-row">
                <span>${getDossierStatLabel(stat.id, stat.label)}</span>
                <strong>${formatLobbyStartingStatValue(stat.id, stat.total)}</strong>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="lobby-profile-stat-column is-history">
          <h2 class="lobby-profile-stat-column-title">历史最高</h2>
          <div class="lobby-profile-stat-stack lobby-profile-history-stack">
            ${viewModel.historyStats.map((stat) => `
              <div class="lobby-profile-stat-row">
                <span>${stat.label}</span>
                <strong>${stat.value}</strong>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
    </section>
  `;
}

function formatLobbyStartingStatValue(statId: string, value: number): string {
  const cap = LOBBY_STARTING_STAT_CAPS[statId as keyof typeof LOBBY_STARTING_STAT_CAPS];
  return typeof cap === "number" ? `${value}/${cap}` : `${value}`;
}

function renderGrowthBoard(viewModel: LobbySelectedRoleViewModel): string {
  const talents = buildRoleTalentAllocationPreview(viewModel);
  const pointSummary = buildTalentPointSummary(viewModel, talents);
  const expTarget = pointSummary.nextExp ?? Math.max(pointSummary.currentExp, 1);
  const expProgressPercent = Math.max(0, Math.min(100, Math.round((pointSummary.currentExp / expTarget) * 100)));
  const baseEffectText = getRoleBaseEffectText(viewModel);
  const expGainHint = formatRoleExpGainHint(DEFAULT_ROLE_EXP_GAIN_MULTIPLIER);

  return `
    <section class="lobby-profile-growth-card lobby-profile-section">
      <div class="lobby-growth-summary-row">
        <span class="lobby-growth-inline-label">等级</span>
        <strong class="lobby-growth-inline-value">${pointSummary.level}</strong>
        <span class="lobby-growth-inline-label is-effect">基础效果：</span>
        <strong class="lobby-growth-inline-value is-effect-copy">${baseEffectText}</strong>
      </div>
      <div class="lobby-growth-exp-row">
        <span class="lobby-growth-inline-label">经验</span>
        <div class="lobby-growth-exp-bar" aria-hidden="true">
          <span style="width:${expProgressPercent}%;"></span>
        </div>
        <strong class="lobby-growth-exp-value">${pointSummary.currentExp} / ${expTarget}</strong>
      </div>
      <div class="lobby-growth-exp-detail-row">
        <p class="lobby-growth-exp-note">${expGainHint}</p>
        <div class="lobby-talent-allocation-meta">
          <span>天赋点 ${pointSummary.availablePoints}</span>
          <button class="lobby-talent-reset-button" type="button" disabled>重置</button>
        </div>
      </div>
      <div class="lobby-talent-allocation-section">
        <div class="lobby-talent-allocation-list">
        ${talents.map((talent) => `
          <article class="lobby-talent-allocation-row">
            <div class="lobby-talent-allocation-copy">
              <strong>${talent.name}</strong>
              ${talent.effectText ? `<span class="lobby-talent-allocation-effect">${talent.effectText}</span>` : ""}
            </div>
            <div class="lobby-talent-stepper">
              <button class="lobby-talent-step-button" type="button" disabled aria-label="减少${talent.name}点数">−</button>
              <strong class="lobby-talent-step-value">${talent.allocatedPoints}</strong>
              <button class="lobby-talent-step-button" type="button" disabled aria-label="增加${talent.name}点数">+</button>
            </div>
          </article>
        `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderSelectedRoleDetail(accountProfile: AccountProfile, selectedRoleId: RoleId): string {
  const viewModel = buildLobbySelectedRoleViewModel(accountProfile, selectedRoleId);

  return `
    <section class="lobby-detail-stage">
      <section class="lobby-profile-card${viewModel.unlockState.owned ? " is-owned" : " is-locked"}">
        <div class="lobby-profile-main">
          <section class="lobby-profile-top">
            <div class="lobby-profile-art">
              <img
                class="lobby-profile-portrait"
                src="${getRoleDetailPortraitUrl(viewModel.role.id)}"
                width="432"
                height="774"
                loading="eager"
                decoding="async"
                fetchpriority="high"
                alt="${viewModel.role.name}立绘"
              />
            </div>
            ${renderProfileInfoPanel(viewModel)}
          </section>
          ${renderGrowthBoard(viewModel)}
        </div>
        <aside class="lobby-profile-achievement-rail">
          ${renderRoleAchievementList(selectedRoleId, accountProfile)}
        </aside>
      </section>
    </section>
  `;
}

export function renderSetupScreen(_state: GameState, accountProfile: AccountProfile): string {
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
                      <h2>角色图鉴</h2>
                      <span class="lobby-role-owned-count lobby-meta-count">已收录 ${ownedCount} / ${getRoleOptions().length}</span>
                    </div>
                    <div class="lobby-panel-header-meta">
                      ${renderRolePager(accountProfile)}
                    </div>
                  </div>
                  <div class="lobby-role-list">
                    ${rolePageRows.map((row) => `
                      <div class="lobby-role-row">
                        ${row.map((roleId) => renderRoleCard(roleId, accountProfile, selectedRoleId)).join("")}
                      </div>
                    `).join("")}
                  </div>
                </div>
              </aside>

              ${renderSelectedRoleDetail(accountProfile, selectedRoleId)}
            </section>
          </section>
        </div>
      </section>
    </main>
  `;
}
