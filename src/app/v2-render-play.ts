import { getCoffeeMachineOwnedText, getCurrentCoffeeBonus, applyCoffeeMonthlyEffect } from "../core/v2-coffee-system";
import { MAX_SAN, PAPER_SLOT_RESEARCH_THRESHOLDS } from "../core/v2-content";
import { getConferenceInfo, getConferenceLocation } from "../core/v2-conference-catalog";
import { CAREER_DEFINITIONS, getCareerEventTargetYear, getCareerLevel } from "../core/v2-career-rules";
import { DEBUG_EVENT_GROUPS, DEBUG_MONTH_DELTAS, DEBUG_STAT_GROUPS } from "../core/v2-debug-tools";
import { getCurrentEvent, getSortedEventQueue } from "../core/v2-event-queue";
import { clampSan, isTransientUiHintLog } from "../core/v2-engine-helpers";
import { getJointTrainingCitationCapBonus } from "../core/v2-joint-training-system";
import { getLabTalentActionBonus, getLabTalentTeamSize, isLabTalentActive } from "../core/v2-lab-talent";
import { getFullGearMeetingDiscount, hasFullGear } from "../core/v2-meeting-system";
import { getFellowTaskSanCost } from "../core/v2-fellow-progression";
import { getSelectedPaper, getSubmitReadyThreshold } from "../core/v2-paper-rules";
import { applyInternshipMonthlyEffect, getInternshipMonthlyIncome, getPublishedAPaperCount } from "../core/v2-internship-system";
import { LOVER_DATE_MONEY_COST } from "../core/v2-lover-progression";
import { applyLoverMonthlyEffect, getBeautifulMonthlyRecovery } from "../core/v2-lover-system";
import { getAcceptedPaperScore } from "../core/v2-publication-rules";
import { ADVISOR_TASK_SAN_COST } from "../core/v2-advisor-progress";
import {
  formatAdvisorTierLabel,
  getCalendarForTotalMonths,
  getAdvisorDefinitionOrNull,
  getGraduationScoreTarget,
  getAdvisorSalaryForMonth,
  getPhdDecisionRequirement,
  getRoleDefinition,
  isPreEnrollmentState,
} from "../core/v2-progression";
import { getMonthlyRelationshipEffects } from "../core/v2-relationship-rules";
import { applyDualMonitorMonthlyRead } from "../core/v2-reading-system";
import { getResearchCap } from "../core/v2-research-cap-system";
import { getMonthlySeasonSanModifier, getSeasonByMonth } from "../core/v2-sanity-rules";
import {
  applyShopMonthlyModifier,
  getChairFlatMonthlySanBonus,
  getChairMonthlyRecovery,
  getShopPaperActionModifier,
  getShopReadSanDiscount,
  getShopRestSanGain,
} from "../core/v2-shop-items-effects";
import { getThesisStage } from "../core/v2-thesis-rules";
import type { FellowProgressProfile, GameLogEntry, GameState, LoverTypeId, Paper, RoleDefinition } from "../core/v2-types";
import {
  type PlayRenderUiState,
  type ResearchPaperFilterId,
  type TalentPanelTabId,
  WORKSTATION_CONFERENCE_PANEL_INDEX,
  WORKSTATION_GRADUATION_PANEL_INDEX,
} from "./v2-render";
import { renderShopSection as renderInteractiveShopSection } from "./v2-render-shop-panel";

const ATTR_TIER_THRESHOLDS = [6, 12, 18] as const;
const MAX_LOG_RENDER_COUNT = 10;
const TODO_FUTURE_MONTH_LOOKAHEAD = 6;
const BASE_MONTHLY_LIVING_COST = 1;
const RELATIONSHIP_SLOT_UNLOCK_THRESHOLDS = [0, 0, 6, 12, 18] as const;

type AttrTierId = "san" | "research" | "social" | "favor";

type EffectBucketItem = {
  id: string;
  label: string;
  sources: string[];
  isDebuff?: boolean;
};

type TalentPanelItem = {
  id: string;
  icon: string;
  name: string;
  active: boolean;
  description: string;
  detail?: string;
  requirement?: string;
};

type LogPage = {
  monthKey: number;
  label: string;
  entries: GameLogEntry[];
};

type TodoPreviewItem = {
  key: string;
  title: string;
  preview: string;
  badgeText: string;
  deadlineText: string;
  monthsLater: number;
  sortGroup: number;
  sortOrder: number;
  eventId: string | null;
  isFuture: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatMonthlyValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value));
  }
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

function appendUniqueSource(target: string[], source: string): void {
  const normalized = source.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }
  target.push(normalized);
}

function upsertBucketItem(
  bucket: EffectBucketItem[],
  bucketId: string,
  label: string,
  source: string,
  isDebuff = false,
): void {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return;

  const existing = bucket.find((item) => item.label === normalizedLabel && Boolean(item.isDebuff) === isDebuff);
  if (existing) {
    appendUniqueSource(existing.sources, source);
    return;
  }

  bucket.push({
    id: `${bucketId}-${bucket.length + 1}`,
    label: normalizedLabel,
    sources: source.trim() ? [source.trim()] : [],
    isDebuff,
  });
}

function getAcademicMonth(totalMonths: number): number {
  if (totalMonths <= 0) return 0;
  const remainder = totalMonths % 12;
  return remainder === 0 ? 12 : remainder;
}

function getYearText(state: GameState): string {
  return `第${state.year}年`;
}

function getMonthText(state: GameState): string {
  return isPreEnrollmentState(state) ? "入学前" : `第${state.month}月`;
}

function getSeasonLabel(state: GameState): string {
  if (isPreEnrollmentState(state)) {
    return "待开学";
  }

  const season = getSeasonByMonth(getAcademicMonth(state.totalMonths));
  if (season === "spring") return "春";
  if (season === "summer") return "夏";
  if (season === "autumn") return "秋";
  return "冬";
}

function getRemainingMonthsText(state: GameState): string {
  return `剩余${Math.max(0, state.maxMonths - state.totalMonths)}月`;
}

function getAttrTier(value: number): number {
  if (value >= ATTR_TIER_THRESHOLDS[2]) return 3;
  if (value >= ATTR_TIER_THRESHOLDS[1]) return 2;
  if (value >= ATTR_TIER_THRESHOLDS[0]) return 1;
  return 0;
}

function getAttrTierName(kind: AttrTierId, value: number): string {
  const tier = getAttrTier(value);

  if (kind === "san") return ["崩溃", "虚弱", "强壮", "满血"][tier];
  if (kind === "research") return ["小白", "入门", "熟练", "大佬"][tier];
  if (kind === "social") return ["社恐", "合群", "活跃", "社牛"][tier];
  return ["陌生", "认可", "信任", "心腹"][tier];
}

function getAttrFillStateClass(value: number, cap: number, lowThreshold: number, dangerThreshold: number): string {
  const ratio = cap > 0 ? value / cap : 0;
  if (ratio >= 1) return " full-glow";
  if (dangerThreshold > 0 && value <= dangerThreshold) return " danger-flash";
  if (lowThreshold > 0 && value <= lowThreshold) return " low-warning";
  return "";
}

function renderProgressBar(fillClassName: string, percent: number): string {
  return `
    <div class="new-progress-bar">
      <div class="progress-fill ${fillClassName}" style="width:${clampPercent(percent).toFixed(1)}%;"></div>
    </div>
  `;
}

function renderAttrItem(
  icon: string,
  name: string,
  value: number,
  cap: number,
  tierKind: AttrTierId,
  fillClassName: string,
): string {
  const fillStateClass = tierKind === "san"
    ? getAttrFillStateClass(value, cap, 5, 2)
    : getAttrFillStateClass(value, cap, 3, 1);
  const safePercent = cap > 0 ? ((value + (value > 0 ? 1 : 0)) / (cap + 1)) * 100 : 0;
  const progressClassName = `${fillClassName}${fillStateClass}${value > 0 ? " is-nonzero" : ""}`;

  return `
    <div class="new-attr-item attr-item-${tierKind}">
      <div class="new-attr-header">
        <span class="new-attr-icon">${icon}</span>
        <span class="new-attr-name">${name}</span>
        <span class="new-attr-value">${value}/${cap}</span>
        <span class="new-attr-level attr-level-${tierKind}">${getAttrTierName(tierKind, value)}</span>
      </div>
      <div class="new-attr-bar-row">
        ${renderProgressBar(progressClassName, safePercent)}
      </div>
    </div>
  `;
}

function renderEffectItems(items: EffectBucketItem[], emptyText = "暂无"): string {
  if (items.length === 0) {
    return `<span class="no-buff">${emptyText}</span>`;
  }

  return items
    .map((item) => `
      <button
        type="button"
        class="effect-chip${item.isDebuff ? " is-debuff" : ""}"
        data-effect-id="${escapeHtml(item.id)}"
        data-effect-label="${escapeHtml(item.label)}"
        data-effect-sources="${escapeHtml(JSON.stringify(item.sources))}"
        aria-pressed="false"
        title="${escapeHtml(item.sources.join("\n") || item.label)}"
      >${escapeHtml(item.label)}</button>
    `)
    .join("");
}

function getChairMonthlySourceLabel(shopState: GameState["shopState"]): string | null {
  if (!shopState.chairOwned) return null;
  if (shopState.chairUpgrade === null) return "办公椅";
  if (shopState.chairUpgrade === "advanced") return "人体工学椅";
  if (shopState.chairUpgrade === "massage") return "电动按摩椅";
  if (shopState.chairUpgrade === "torture") return "沙发";
  if (shopState.chairUpgrade === "spike") return "锥刺股椅";
  if (shopState.chairUpgrade === "hammock") return "吊床";
  return null;
}

function getBikeMonthlySourceLabel(shopState: GameState["shopState"], month: number): string | null {
  if (!shopState.bikeOwned) return null;
  if (shopState.bikeUpgrade === "ebike") {
    const season = getSeasonByMonth(month);
    return season === "spring" || season === "autumn" ? "小电驴季节加成" : null;
  }
  return "自行车";
}

function getSeasonSourceLabel(month: number): string {
  const season = getSeasonByMonth(month);
  if (season === "spring") return "春季";
  if (season === "summer") return "夏季";
  if (season === "autumn") return "秋季";
  return "冬季";
}

function buildNextMonthEffectItems(state: GameState): EffectBucketItem[] {
  const calendarMonth = getAcademicMonth(state.totalMonths + 1);
  const sanSources: string[] = [];
  const incomeSources: string[] = [];
  const expenseSources: string[] = [];
  let sanDelta = 0;
  let goldDelta = 0;
  let simulatedSan = state.player.san;
  let simulatedSanCap = state.sanCap;
  let simulatedMoney = state.player.money;

  const addSan = (label: string, delta: number): void => {
    if (!Number.isFinite(delta) || delta === 0) return;
    sanDelta += delta;
    appendUniqueSource(sanSources, `${label} ${delta > 0 ? "+" : ""}${formatMonthlyValue(delta)}`);
    simulatedSan = clampSan(simulatedSan + delta, simulatedSanCap);
  };

  const addGold = (label: string, delta: number): void => {
    if (!Number.isFinite(delta) || delta === 0) return;
    goldDelta += delta;
    const target = delta > 0 ? incomeSources : expenseSources;
    appendUniqueSource(target, `${label} ${delta > 0 ? "+" : "-"}${formatMonthlyValue(Math.abs(delta))}`);
    simulatedMoney += delta;
  };

  if (state.eventSupport.hasFinanceTalent) {
    addGold("理财能手", Math.ceil(Math.max(0, state.player.money) * 0.03));
  }
  addGold("导师工资", getAdvisorSalaryForMonth(state.selectedAdvisorId, state.degree, calendarMonth));

  addSan("基础休息", 1);
  addGold("基础开销", -BASE_MONTHLY_LIVING_COST);

  const loverMonthlyEffect = applyLoverMonthlyEffect(state.loverState, simulatedSan, simulatedSanCap);
  addGold("恋人约会", loverMonthlyEffect.moneyDelta);
  addSan("恋人恢复", loverMonthlyEffect.sanDelta);

  const chairFlatBonus = getChairFlatMonthlySanBonus(state.shopState);
  const chairSourceLabel = getChairMonthlySourceLabel(state.shopState);
  if (chairFlatBonus !== 0 && chairSourceLabel) {
    addSan(chairSourceLabel, chairFlatBonus);
  }

  const chairMonthlyRecovery = getChairMonthlyRecovery(state.shopState, simulatedSan, simulatedSanCap);
  if (chairMonthlyRecovery !== 0 && chairSourceLabel) {
    addSan(chairSourceLabel, chairMonthlyRecovery);
  }

  if (state.eventSupport.hasStrongBodyTalent) {
    addSan("强身健体", 1);
  }

  const seasonSanDelta = getMonthlySeasonSanModifier(calendarMonth, state.eventSupport);
  if (seasonSanDelta !== 0) {
    addSan(getSeasonSourceLabel(calendarMonth), seasonSanDelta);
  }

  const shopMonthlyModifier = applyShopMonthlyModifier(state.shopState, calendarMonth);
  const bikeSourceLabel = getBikeMonthlySourceLabel(state.shopState, calendarMonth);
  if (shopMonthlyModifier.sanDelta !== 0 && bikeSourceLabel) {
    addSan(bikeSourceLabel, shopMonthlyModifier.sanDelta);
  }
  simulatedSanCap += shopMonthlyModifier.sanCapDelta;
  simulatedSan = clampSan(simulatedSan, simulatedSanCap);

  const monthlyRelationshipEffects = getMonthlyRelationshipEffects(state.relationshipState);
  if (monthlyRelationshipEffects.sanDelta !== 0) {
    addSan("指导新生消耗", monthlyRelationshipEffects.sanDelta);
  }

  const internshipMonthlyEffect = applyInternshipMonthlyEffect(
    state.internshipState,
    getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations),
    state.internshipCount,
  );
  addGold("企业实习", internshipMonthlyEffect.moneyDelta);
  addSan("企业实习", internshipMonthlyEffect.sanDelta);

  const coffeeMonthlyEffect = applyCoffeeMonthlyEffect(state.coffeeState, simulatedMoney);
  addGold("自动咖啡机", coffeeMonthlyEffect.moneyDelta);
  addSan("自动咖啡机", coffeeMonthlyEffect.sanDelta);

  const dualMonitorMonthlyEffect = applyDualMonitorMonthlyRead(
    state.readingState,
    state.shopState,
    state.temporaryActionEffects,
  );
  if (dualMonitorMonthlyEffect.sanDelta !== 0) {
    addSan("双屏自动阅读", dualMonitorMonthlyEffect.sanDelta);
  }

  const goldSources = [
    ...incomeSources.map((source) => `收入：${source}`),
    ...expenseSources.map((source) => `支出：${source}`),
    `净变化：${goldDelta >= 0 ? "+" : ""}${formatMonthlyValue(goldDelta)}`,
  ];

  return [
    {
      id: "next-month-san",
      label: `SAN ${sanDelta >= 0 ? "+" : ""}${formatMonthlyValue(sanDelta)}`,
      sources: sanSources.length > 0 ? sanSources : ["暂无来源"],
      isDebuff: sanDelta < 0,
    },
    {
      id: "next-month-gold",
      label: `金币 ${goldDelta >= 0 ? "+" : ""}${formatMonthlyValue(goldDelta)}`,
      sources: goldSources,
      isDebuff: goldDelta < 0,
    },
  ];
}

function buildEffectBuckets(state: GameState): {
  permanent: EffectBucketItem[];
  monthly: EffectBucketItem[];
  single: EffectBucketItem[];
  nextMonth: EffectBucketItem[];
} {
  const permanent: EffectBucketItem[] = [];
  const monthly: EffectBucketItem[] = [];
  const single: EffectBucketItem[] = [];

  const experimentModifier = getShopPaperActionModifier(state.shopState, "experiment");
  const writingModifier = getShopPaperActionModifier(state.shopState, "writing");
  const readSanDiscount = getShopReadSanDiscount(state.shopState);
  const coffeeBonus = getCurrentCoffeeBonus(state.coffeeState);

  if (experimentModifier.bonus > 0) {
    upsertBucketItem(permanent, "permanent", `做实验 +${experimentModifier.bonus}分`, "显卡");
  }
  if (experimentModifier.extraActions > 0) {
    upsertBucketItem(permanent, "permanent", `做实验 +${experimentModifier.extraActions}次`, "显卡");
  }
  if (writingModifier.bonus > 0) {
    upsertBucketItem(permanent, "permanent", `写作 +${writingModifier.bonus}分`, "机械键盘");
  }
  if (writingModifier.sanDiscount > 0) {
    upsertBucketItem(permanent, "permanent", `写作 SAN-${writingModifier.sanDiscount}`, "机械键盘");
  }
  if (readSanDiscount > 0) {
    upsertBucketItem(permanent, "permanent", `看论文 SAN-${readSanDiscount}`, "显示器");
  }
  if (state.relationshipState.mentorshipStacks > 0) {
    upsertBucketItem(permanent, "permanent", `指导层数 ${state.relationshipState.mentorshipStacks}`, "关系网");
  }

  if (state.actionBonuses.idea > 0) {
    upsertBucketItem(monthly, "monthly", `灵感 +${state.actionBonuses.idea}`, "本月加成");
  }
  if (state.actionBonuses.experiment > 0) {
    upsertBucketItem(monthly, "monthly", `实验 +${state.actionBonuses.experiment}`, "本月加成");
  }
  if (state.actionBonuses.writing > 0) {
    upsertBucketItem(monthly, "monthly", `写作 +${state.actionBonuses.writing}`, "本月加成");
  }
  if (coffeeBonus > 0) {
    upsertBucketItem(monthly, "monthly", `冰美式额外 SAN+${coffeeBonus}`, "咖啡机");
  }
  if (state.coffeeState.machineOwned) {
    upsertBucketItem(monthly, "monthly", getCoffeeMachineOwnedText(state.coffeeState), "咖啡机");
  }

  if (state.readingState.dualMonitorIdeaBonus > 0) {
    upsertBucketItem(single, "single", `下次灵感 +${state.readingState.dualMonitorIdeaBonus}`, "双屏显示器");
  }
  if (state.publicationEffects.nextCitationMultipliers.length > 0) {
    upsertBucketItem(
      single,
      "single",
      `下次论文引用 ×${state.publicationEffects.nextCitationMultipliers[0].toFixed(2)}`,
      "论文效果",
    );
  }

  return {
    permanent,
    monthly,
    single,
    nextMonth: buildNextMonthEffectItems(state),
  };
}

function renderLegacyLeftRail(state: GameState): string {
  const researchCap = getResearchCap(state.researchCapacityState);
  const effectBuckets = buildEffectBuckets(state);

  return `
    <aside class="play-left-rail new-left-container">
      <div class="new-attr-panel" id="new-attr-panel">
        ${renderAttrItem("🧠", "SAN值", state.player.san, Math.max(state.sanCap, MAX_SAN), "san", "san")}
        ${renderAttrItem("💡", "科研能力", state.player.research, Math.max(researchCap, 20), "research", "research")}
        ${renderAttrItem("🤝", "社交能力", state.player.social, 20, "social", "social")}
        ${renderAttrItem("👨‍🏫", "导师好感", state.player.favor, 20, "favor", "favor")}
        <div class="new-attr-item new-currency-item">
          <div class="new-attr-header">
            <span class="new-attr-icon">💰</span>
            <span class="new-attr-name">金币</span>
            <span class="new-currency-value">${state.player.money}</span>
          </div>
        </div>
      </div>

      <div class="new-effect-panel" id="new-effect-panel">
        <div class="new-effect-head" id="new-effect-head">
          <span class="new-effect-head-item effect-head-permanent">永久效果</span>
          <span class="new-effect-head-item effect-head-monthly">本月效果</span>
          <span class="new-effect-head-item effect-head-single">下次效果</span>
          <span class="new-effect-head-item effect-head-next-month">下月初</span>
        </div>
        <div class="new-effect-grid" id="new-effect-grid">
          <div class="new-effect-section" id="new-effect-section-permanent">
            <div class="new-effect-subtitle">永久效果</div>
            <div class="new-effect-list" id="new-permanent-effect-list">${renderEffectItems(effectBuckets.permanent)}</div>
          </div>
          <div class="new-effect-section" id="new-effect-section-monthly">
            <div class="new-effect-subtitle">本月效果</div>
            <div class="new-effect-list" id="new-monthly-effect-list">${renderEffectItems(effectBuckets.monthly)}</div>
          </div>
          <div class="new-effect-section" id="new-effect-section-single">
            <div class="new-effect-subtitle">下次效果</div>
            <div class="new-effect-list" id="new-single-effect-list">${renderEffectItems(effectBuckets.single)}</div>
          </div>
          <div class="new-effect-section" id="new-effect-section-next-month">
            <div class="new-effect-subtitle">下月初</div>
            <div class="new-effect-list" id="new-next-month-effect-list">${renderEffectItems(effectBuckets.nextMonth, "SAN+0｜金币+0")}</div>
          </div>
        </div>
        <div class="new-effect-section" id="new-effect-section-source">
          <div class="new-effect-subtitle">效果来源</div>
          <div class="new-effect-source-box" id="new-effect-source-box">点击上方效果查看来源</div>
        </div>
      </div>
    </aside>
  `;
}

function getEventBadgeLabel(event: GameState["eventQueue"][number]): string {
  if (event.source === "random") return "随机";
  if (event.source === "review") return "审稿";
  if (event.source === "thesis") return "论文";
  if (event.source === "career") return "求职";

  if (event.chainId === "teachers-day") return "节日";
  if (event.chainId === "scholarship") return "通知";
  if (event.chainId === "mentor-assign") return "任务";
  if (
    event.chainId === "ccig-decision"
    || event.chainId === "ccig-activity"
    || event.chainId === "conference-decision"
    || event.chainId === "conference-activity"
  ) {
    return "会议";
  }

  return "剧情";
}

function getDeadlineText(deadlineMonths: number): string {
  if (deadlineMonths <= 0) return "本月";
  if (deadlineMonths === 1) return "剩1月";
  return `剩${deadlineMonths}月`;
}

function getFutureDeadlineText(monthsLater: number): string {
  return `${Math.max(1, monthsLater)}月后`;
}

function buildCurrentTodoPreviewItems(state: GameState): TodoPreviewItem[] {
  return getSortedEventQueue(state.eventQueue).map((event, index) => ({
    key: event.id,
    title: event.title,
    preview: event.preview,
    badgeText: getEventBadgeLabel(event),
    deadlineText: getDeadlineText(event.deadlineMonths),
    monthsLater: Math.max(0, event.deadlineMonths),
    sortGroup: 0,
    sortOrder: index,
    eventId: event.id,
    isFuture: false,
  }));
}

function shouldPreviewPhdDecision(state: GameState, targetYear: number, targetMonth: number): boolean {
  if (state.degree !== "master") {
    return false;
  }
  if (targetMonth !== 10 || (targetYear !== 2 && targetYear !== 3)) {
    return false;
  }
  return getPhdDecisionRequirement(state.selectedAdvisorId, targetYear) !== null;
}

function shouldPreviewAdvisorRetention(state: GameState, targetYear: number, targetMonth: number): boolean {
  if (state.degree !== "phd" || targetYear !== 5 || targetMonth !== 10) {
    return false;
  }

  const hasNaturePaper = [...state.papers, ...state.externalPublications]
    .some((paper) => paper.status === "published" && paper.target === "A");
  if (!hasNaturePaper) {
    return false;
  }

  const phdGradRequirement = getGraduationScoreTarget("phd", state.selectedAdvisorId);
  return phdGradRequirement !== null && state.totalResearchScore >= phdGradRequirement;
}

function buildFutureTodoPreviewItems(state: GameState): TodoPreviewItem[] {
  const items: TodoPreviewItem[] = [];
  let sortOrder = 0;

  const addItem = (params: {
    key: string;
    title: string;
    monthsLater: number;
  }): void => {
    items.push({
      key: params.key,
      title: params.title,
      preview: "",
      badgeText: "预告",
      deadlineText: getFutureDeadlineText(params.monthsLater),
      monthsLater: params.monthsLater,
      sortGroup: 1,
      sortOrder,
      eventId: null,
      isFuture: true,
    });
    sortOrder += 1;
  };

  for (let monthsLater = 1; monthsLater <= TODO_FUTURE_MONTH_LOOKAHEAD; monthsLater += 1) {
    const nextTotalMonths = state.totalMonths + monthsLater;
    if (nextTotalMonths > state.maxMonths) {
      continue;
    }

    const reviewingPaperCount = state.papers.filter((paper) => (
      paper.status === "reviewing"
      && paper.reviewMonthsLeft === monthsLater
    )).length;

    if (reviewingPaperCount > 0) {
      addItem({
        key: `review-result-${monthsLater}`,
        title: reviewingPaperCount === 1 ? "论文结果" : `论文结果x${reviewingPaperCount}`,
        monthsLater,
      });
    }

    const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
    const isExtensionYear = state.isNatureExtensionYear && calendar.year === 6;

    if (calendar.month === 5 && !isExtensionYear) {
      addItem({
        key: `winter-vacation-${calendar.year}-${calendar.month}`,
        title: "寒假",
        monthsLater,
      });
    }
    if (calendar.month === 9) {
      addItem({
        key: `ccig-${calendar.year}-${calendar.month}`,
        title: "领域年会",
        monthsLater,
      });
    }
    if (calendar.month === 11 && !isExtensionYear) {
      addItem({
        key: `summer-vacation-${calendar.year}-${calendar.month}`,
        title: "暑假",
        monthsLater,
      });
    }
    if (calendar.month === 1) {
      addItem({
        key: `teachers-day-${calendar.year}-${calendar.month}`,
        title: "教师节",
        monthsLater,
      });
    }
    if (calendar.month === 2 && calendar.year >= 2 && !isExtensionYear) {
      addItem({
        key: `scholarship-${calendar.year}-${calendar.month}`,
        title: "国奖评选",
        monthsLater,
      });
    }
    if (calendar.month === 11) {
      addItem({
        key: `year-summary-${calendar.year}-${calendar.month}`,
        title: "学年总结",
        monthsLater,
      });
    }
    if (calendar.year === 3 && calendar.month === 3) {
      addItem({
        key: `midterm-message-${calendar.year}-${calendar.month}`,
        title: "生涯留言",
        monthsLater,
      });
    }
    if (calendar.year === 4 && calendar.month === 3) {
      addItem({
        key: `mentor-assign-${calendar.year}-${calendar.month}`,
        title: "指导新生",
        monthsLater,
      });
    }
    if (shouldPreviewAdvisorRetention(state, calendar.year, calendar.month)) {
      addItem({
        key: `advisor-retention-${calendar.year}-${calendar.month}`,
        title: "导师挽留",
        monthsLater,
      });
    }

    if (shouldPreviewPhdDecision(state, calendar.year, calendar.month)) {
      addItem({
        key: `phd-decision-${calendar.year}-${calendar.month}`,
        title: "转博抉择",
        monthsLater,
      });
    }
  }

  return items;
}

function renderEventDescriptionHtml(description: string): string {
  const normalized = description.trim();
  if (!normalized) {
    return "<p>请点击下方按钮继续。</p>";
  }

  return normalized
    .split(/\n\s*\n/u)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderEventQueueList(state: GameState, activeEventId: string | null): string {
  const queue = getSortedEventQueue(state.eventQueue);

  if (queue.length === 0) {
    const hasAnyPaper = state.papers.some((paper) => Boolean(paper));
    let guideText = "本月待办已处理完成。你可以直接进入下一月，或先做一轮准备。";
    if (!hasAnyPaper) {
      guideText = "本月待办已处理完成。建议先去科研工作站开启论文，避免后续推进断档。";
    } else if (state.player.san > 0 && state.player.san <= 4) {
      guideText = "本月待办已处理完成。当前 SAN 偏低，建议先在科研中休息补状态，再进入下一月。";
    }

    return `
      <div class="event-column-empty">
        <div class="event-empty-guide">
          <div class="event-empty-guide-title">本月待办已清空</div>
          <div class="event-empty-guide-desc">${guideText}</div>
          <div class="event-empty-guide-actions">
            <button class="event-empty-guide-btn" type="button" data-ui-play-tab="workstation">前往科研</button>
            <button class="event-empty-guide-btn" type="button" data-ui-play-tab="relationship">前往人际</button>
            <button class="event-empty-guide-btn is-primary" type="button" data-action="next-month">进入下一月</button>
          </div>
        </div>
      </div>
    `;
  }

  return queue
    .map((event) => `
      <button
        class="event-card${activeEventId === event.id ? " is-active" : ""}"
        type="button"
        data-ui-open-event-id="${escapeHtml(event.id)}"
      >
        <div class="event-card-header">
          <span class="event-type-badge">${getEventBadgeLabel(event)}</span>
          <span class="event-title">${escapeHtml(event.title)}</span>
          <span class="event-ddl-badge">期限 ${getDeadlineText(event.deadlineMonths)}</span>
        </div>
      </button>
    `)
    .join("");
}

function renderEventContentBox(currentEvent: GameState["eventQueue"][number] | null): string {
  if (!currentEvent) {
    return `
      <div class="event-content-box" id="event-content-box" hidden>
        <div class="event-content-header">
          <span class="event-content-title">事件详情</span>
          <button class="event-content-close" type="button" data-ui-close-event-content aria-label="关闭事件详情">×</button>
        </div>
      </div>
    `;
  }

  const isResultPage = currentEvent.stage === "result";

  return `
    <div class="event-content-box" id="event-content-box">
      <div class="event-content-header">
        <span class="event-content-title" id="event-content-title">${escapeHtml(currentEvent.title)}</span>
        <button class="event-content-close" type="button" data-ui-close-event-content aria-label="关闭事件详情"${isResultPage ? " hidden" : ""}>×</button>
      </div>
      <div class="event-content-body" id="event-content-body">
        ${renderEventDescriptionHtml(currentEvent.description)}
      </div>
      <div class="event-content-buttons" id="event-content-buttons">
        ${currentEvent.choices.map((choice) => `
          <button
            class="event-choice-btn event-action-btn"
            type="button"
            data-action="resolve-event"
            data-event-id="${escapeHtml(currentEvent.id)}"
            data-event-choice-id="${escapeHtml(choice.id)}"
            title="${escapeHtml(choice.outcome)}"
          ><span>${escapeHtml(choice.label)}</span></button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPaperSwitchButtons(state: GameState, selectedPaper: Paper | null): string {
  if (state.papers.length === 0) {
    return `<div class="paper-switch-empty">暂无论文槽</div>`;
  }

  return state.papers
    .map((paper, index) => `
      <button class="paper-switch-btn${selectedPaper?.id === paper.id ? " active" : ""}" type="button" disabled title="论文切换交互待接入">
        ${paper.title || `论文 ${index + 1}`}
      </button>
    `)
    .join("");
}

function getPaperStatusText(paper: Paper): string {
  if (paper.status === "reviewing") {
    return `${paper.target ?? "待定"} 类审稿中`;
  }
  if (paper.status === "published") {
    return `${paper.target ?? "成果"} 已发表`;
  }
  return "草稿";
}

function renderPaperStats(paper: Paper): string {
  const total = paper.idea + paper.experiment + paper.writing;
  return `
    <div class="paper-stats-row">
      <span class="paper-stat-item">idea ${paper.idea}</span>
      <span class="paper-stat-item">实验 ${paper.experiment}</span>
      <span class="paper-stat-item">写作 ${paper.writing}</span>
      <span class="paper-stat-item">总分 ${total}</span>
      <span class="paper-stat-item">状态 ${getPaperStatusText(paper)}</span>
    </div>
  `;
}

function renderPaperActionRow(state: GameState, paper: Paper): string {
  const preEnrollment = isPreEnrollmentState(state);
  const reviewing = paper.status === "reviewing";

  return `
    <div class="paper-action-row">
      <button class="paper-action-btn" type="button" data-action="idea" ${preEnrollment || reviewing ? "disabled" : ""}>想 idea</button>
      <button class="paper-action-btn" type="button" data-action="experiment" ${preEnrollment || reviewing ? "disabled" : ""}>做实验</button>
      <button class="paper-action-btn" type="button" data-action="write" ${preEnrollment || reviewing ? "disabled" : ""}>写论文</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-c" ${preEnrollment || reviewing ? "disabled" : ""}>投 C</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-b" ${preEnrollment || reviewing ? "disabled" : ""}>投 B</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-a" ${preEnrollment || reviewing ? "disabled" : ""}>投 A</button>
    </div>
  `;
}

function renderPaperCurrentCard(state: GameState): string {
  const selectedPaper = getSelectedPaper(state) ?? state.papers[0] ?? null;
  const preEnrollment = isPreEnrollmentState(state);

  if (!selectedPaper) {
    return `
      <div class="paper-card paper-card-empty">
        <div class="paper-card-header">
          <span class="paper-title">暂无论文草稿</span>
        </div>
        <p class="section-empty">${preEnrollment ? "正式入学后开启第一篇论文" : "先创建一篇论文，再开始推进。"}</p>
        <div class="paper-action-row">
          <button class="paper-action-btn is-primary" type="button" data-action="create-paper" ${preEnrollment ? "disabled" : ""}>开启论文</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="paper-card">
      <div class="paper-card-header">
        <span class="paper-title">${escapeHtml(selectedPaper.title)}</span>
      </div>
      ${renderPaperStats(selectedPaper)}
      ${renderPaperActionRow(state, selectedPaper)}
    </div>
  `;
}

function renderConferenceInfo(state: GameState): string {
  const selectedPaper = getSelectedPaper(state) ?? state.papers[0] ?? null;

  if (!selectedPaper) {
    return `<div class="section-empty">开启论文后，这里会显示本月可投目标与审稿进度。</div>`;
  }

  if (selectedPaper.status === "reviewing") {
    return `<div class="conf-info-line">当前状态：${selectedPaper.target ?? "待定"} 类审稿中，还需 ${selectedPaper.reviewMonthsLeft} 月。</div>`;
  }

  return `<div class="conf-info-line">当前论文仍为草稿，可继续积累 idea / 实验 / 写作后投稿。</div>`;
}

void renderPaperSwitchButtons;
void renderPaperCurrentCard;
void renderConferenceInfo;

const MAX_CONFERENCE_MONTH_OFFSET = 11;

function clampConferenceMonthOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(MAX_CONFERENCE_MONTH_OFFSET, Math.trunc(offset)));
}

function normalizeWorkstationPanelIndex(panelIndex: number): number {
  if (!Number.isFinite(panelIndex)) return WORKSTATION_CONFERENCE_PANEL_INDEX;
  return Math.max(
    WORKSTATION_CONFERENCE_PANEL_INDEX,
    Math.min(WORKSTATION_GRADUATION_PANEL_INDEX, Math.trunc(panelIndex)),
  );
}

function getResolvedWorkstationPanelIndex(state: GameState, uiState: PlayRenderUiState = {}): number {
  if (typeof uiState.activeWorkstationPanelIndex === "number") {
    return normalizeWorkstationPanelIndex(uiState.activeWorkstationPanelIndex);
  }

  const selectedIndex = state.selectedPaperId
    ? state.papers.findIndex((paper) => paper.id === state.selectedPaperId)
    : -1;
  return selectedIndex >= 0 ? selectedIndex : WORKSTATION_CONFERENCE_PANEL_INDEX;
}

function getWorkstationPaperByPanelIndex(state: GameState, panelIndex: number): Paper | null {
  if (panelIndex < 0 || panelIndex >= PAPER_SLOT_RESEARCH_THRESHOLDS.length) {
    return null;
  }
  return state.papers[panelIndex] ?? null;
}

function getConferenceRegionText(region: ReturnType<typeof getConferenceLocation>["region"]): string {
  if (region === "domestic") return "国内";
  if (region === "asia") return "亚洲";
  return "欧美";
}

function renderEnhancedPaperSwitchButtons(state: GameState, activePanelIndex: number): string {
  const buttons = PAPER_SLOT_RESEARCH_THRESHOLDS.map((threshold, index) => {
    const paper = state.papers[index] ?? null;
    const unlocked = index < state.paperSlotsUnlocked;
    const isActive = activePanelIndex === index;

    if (!unlocked) {
      return `
        <button class="paper-switch-btn locked${isActive ? " active" : ""}" type="button" data-ui-workstation-panel-index="${index}">
          <span class="paper-switch-label">锁定</span>
          <span class="paper-switch-meta">科研 ${threshold}</span>
        </button>
      `;
    }

    let badge = "";
    if (paper?.status === "reviewing" && paper.reviewMonthsLeft > 0) {
      badge = `<span class="paper-switch-badge is-reviewing">${paper.reviewMonthsLeft}月</span>`;
    } else if (paper?.status === "draft" && paper.idea > 0 && paper.experiment > 0 && paper.writing > 0) {
      badge = `<span class="paper-switch-badge is-ready">可投</span>`;
    }

    return `
      <button class="paper-switch-btn${paper ? "" : " empty"}${isActive ? " active" : ""}" type="button" data-ui-workstation-panel-index="${index}">
        <span class="paper-switch-label">${paper ? `论文 ${index + 1}` : `空槽 ${index + 1}`}</span>
        <span class="paper-switch-meta">${paper ? getPaperStatusText(paper) : "可新建"}</span>
        ${badge}
      </button>
    `;
  }).join("");

  return `
    ${buttons}
    <button class="paper-switch-btn graduation${activePanelIndex === WORKSTATION_GRADUATION_PANEL_INDEX ? " active" : ""}" type="button" data-ui-workstation-panel-index="${WORKSTATION_GRADUATION_PANEL_INDEX}">
      <span class="paper-switch-label">毕业</span>
      <span class="paper-switch-meta">论文 / 求职</span>
    </button>
  `;
}

function renderEnhancedPaperActionRow(state: GameState, paper: Paper): string {
  const preEnrollment = isPreEnrollmentState(state);
  const editable = paper.status === "draft";
  const total = paper.idea + paper.experiment + paper.writing;

  return `
    <div class="paper-action-row">
      <button class="paper-action-btn" type="button" data-action="idea" data-paper-id="${paper.id}" ${preEnrollment || !editable ? "disabled" : ""}>想 idea</button>
      <button class="paper-action-btn" type="button" data-action="experiment" data-paper-id="${paper.id}" ${preEnrollment || !editable ? "disabled" : ""}>做实验</button>
      <button class="paper-action-btn" type="button" data-action="write" data-paper-id="${paper.id}" ${preEnrollment || !editable ? "disabled" : ""}>写论文</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-c" data-paper-id="${paper.id}" ${preEnrollment || !editable || total < getSubmitReadyThreshold("C") ? "disabled" : ""}>投 C</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-b" data-paper-id="${paper.id}" ${preEnrollment || !editable || total < getSubmitReadyThreshold("B") ? "disabled" : ""}>投 B</button>
      <button class="paper-action-btn is-submit" type="button" data-action="submit-a" data-paper-id="${paper.id}" ${preEnrollment || !editable || total < getSubmitReadyThreshold("A") ? "disabled" : ""}>投 A</button>
    </div>
  `;
}

function renderLockedWorkstationSlot(slotIndex: number): string {
  const threshold = PAPER_SLOT_RESEARCH_THRESHOLDS[slotIndex] ?? 0;
  return `
    <div class="paper-card paper-card-empty paper-card-locked">
      <div class="paper-card-header">
        <span class="paper-title">论文槽 ${slotIndex + 1}</span>
      </div>
      <p class="section-empty">科研达到 ${threshold} 后开放该槽位。</p>
    </div>
  `;
}

function renderEmptyWorkstationSlot(state: GameState, slotIndex: number): string {
  const preEnrollment = isPreEnrollmentState(state);
  return `
    <div class="paper-card paper-card-empty">
      <div class="paper-card-header">
        <span class="paper-title">论文槽 ${slotIndex + 1}</span>
      </div>
      <p class="section-empty">${preEnrollment ? "入学后开放" : "当前槽位为空，可以开启一篇新论文。"}</p>
      <div class="paper-action-row">
        <button class="paper-action-btn is-primary" type="button" data-action="create-paper" ${preEnrollment ? "disabled" : ""}>开启论文</button>
      </div>
    </div>
  `;
}

function renderEnhancedPaperCurrentCard(state: GameState, panelIndex: number): string {
  if (panelIndex < 0 || panelIndex >= PAPER_SLOT_RESEARCH_THRESHOLDS.length) {
    return renderEmptyWorkstationSlot(state, 0);
  }

  if (panelIndex >= state.paperSlotsUnlocked) {
    return renderLockedWorkstationSlot(panelIndex);
  }

  const selectedPaper = getWorkstationPaperByPanelIndex(state, panelIndex);
  if (!selectedPaper) {
    return renderEmptyWorkstationSlot(state, panelIndex);
  }

  return `
    <div class="paper-card">
      <div class="paper-card-header">
        <span class="paper-title">${escapeHtml(selectedPaper.title)}</span>
      </div>
      ${renderPaperStats(selectedPaper)}
      ${renderEnhancedPaperActionRow(state, selectedPaper)}
    </div>
  `;
}

function renderConferenceOverviewPage(state: GameState, conferenceMonthOffset: number): string {
  const safeOffset = clampConferenceMonthOffset(conferenceMonthOffset);
  const calendar = getCalendarForTotalMonths(state.totalMonths + safeOffset, state.degree);
  const title = safeOffset === 0 ? "本月可投会议" : `下 ${safeOffset} 个月可投会议`;

  return `
    <div class="conference-overview-card">
      <div class="conference-overview-head">
        <div>
          <div class="conference-overview-title">${title}</div>
          <div class="conference-overview-subtitle">${safeOffset + 4} 个月后参会 · 第 ${calendar.year} 年第 ${calendar.month} 月</div>
        </div>
        <div class="conference-overview-nav">
          <button class="log-nav-btn conference-nav-btn" type="button" data-ui-conference-offset="-1" ${safeOffset <= 0 ? "disabled" : ""}>‹</button>
          <button class="log-nav-btn conference-nav-btn" type="button" data-ui-conference-offset="1" ${safeOffset >= MAX_CONFERENCE_MONTH_OFFSET ? "disabled" : ""}>›</button>
        </div>
      </div>
      <div class="conference-overview-grid">
        ${(["A", "B", "C"] as const).map((target) => {
          const info = getConferenceInfo(calendar.month, target, calendar.year);
          const location = getConferenceLocation(calendar.month, target, calendar.year);
          return `
            <article class="conference-card">
              <div class="conference-card-head">
                <span class="conference-grade-tag">${target} 类</span>
                <span class="conference-card-year">${info.year}</span>
              </div>
              <strong class="conference-card-name">${escapeHtml(info.name)}</strong>
              <p class="conference-card-fullname">${escapeHtml(info.fullName)}</p>
              <div class="conference-card-meta">
                <span class="conference-meta-item">方向 ${escapeHtml(info.field)}</span>
                <span class="conference-meta-item">${escapeHtml(location.city)} · ${escapeHtml(location.country)}</span>
                <span class="conference-meta-item">${getConferenceRegionText(location.region)}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderGraduationProgressCard(state: GameState): string {
  const targetYear = getCareerEventTargetYear(state.degree, state.willTransferPhDYear3, state.isNatureExtensionYear);
  if (targetYear === null || state.year !== targetYear) {
    return `
      <div class="paper-card paper-card-empty paper-card-locked">
        <div class="paper-card-header">
          <span class="paper-title">毕业进度</span>
        </div>
        <p class="section-empty">${targetYear === null ? "当前路线不开放毕业页。" : `毕业年（第 ${targetYear} 年）开放该面板。`}</p>
      </div>
    `;
  }

  const thesisStage = getThesisStage(state.thesis.progress);
  const careerItems = (Object.keys(CAREER_DEFINITIONS) as Array<keyof typeof CAREER_DEFINITIONS>).map((careerType) => {
    const definition = CAREER_DEFINITIONS[careerType];
    const progress = state.careerProgress[careerType];
    const level = getCareerLevel(careerType, progress);
    const isActive = definition.activeMonths.includes(state.month);
    return `
      <div class="graduation-career-item${isActive ? " is-active" : ""}">
        <strong>${definition.name}</strong>
        <span>${level.name}</span>
        <span>进度 ${progress}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="paper-card graduation-progress-card">
      <div class="paper-card-header">
        <span class="paper-title">毕业进度</span>
      </div>
      <div class="graduation-progress-block">
        <strong>毕业论文</strong>
        <span>${state.thesis.abandoned ? "已放弃" : state.thesis.completed ? "已完成" : thesisStage.name}</span>
        <span>进度 ${state.thesis.progress}%</span>
      </div>
      <div class="graduation-progress-list">
        ${careerItems}
      </div>
    </div>
  `;
}

function renderEnhancedConferenceInfo(state: GameState, paper: Paper | null): string {
  if (isPreEnrollmentState(state)) {
    return "";
  }

  if (paper?.status === "reviewing" && paper.target && paper.submittedMonth && paper.submittedYear) {
    const info = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const location = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear);
    return `
      <div class="conf-info-line">
        正在审稿：${escapeHtml(info.name)} ${info.year} · ${escapeHtml(location.city)} · 还需 ${paper.reviewMonthsLeft} 月
      </div>
    `;
  }

  if (paper?.status === "published" && paper.target && paper.submittedMonth && paper.submittedYear) {
    const info = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const location = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear);
    return `
      <div class="conf-info-line">
        最近成果：${escapeHtml(info.name)} ${info.year} · ${escapeHtml(location.city)} · ${paper.target} 类已发表
      </div>
    `;
  }

  const calendar = getCalendarForTotalMonths(state.totalMonths, state.degree);
  return `
    <div class="conf-info-chip-row">
      ${(["A", "B", "C"] as const).map((target) => {
        const info = getConferenceInfo(calendar.month, target, calendar.year);
        return `<span class="conf-info-chip">${target} ${escapeHtml(info.name)}</span>`;
      }).join("")}
    </div>
  `;
}

function renderEnhancedWorkstationSection(state: GameState, uiState: PlayRenderUiState = {}): string {
  const preEnrollment = isPreEnrollmentState(state);
  const activePanelIndex = getResolvedWorkstationPanelIndex(state, uiState);
  const activePaper = getWorkstationPaperByPanelIndex(state, activePanelIndex);
  const conferenceMonthOffset = clampConferenceMonthOffset(uiState.conferenceMonthOffset ?? 0);
  const isConferencePanel = activePanelIndex === WORKSTATION_CONFERENCE_PANEL_INDEX;
  const isGraduationPanel = activePanelIndex === WORKSTATION_GRADUATION_PANEL_INDEX;

  let mainCardHtml = "";
  if (preEnrollment) {
    mainCardHtml = '<div class="section-empty play-module-lock-state">入学后开放</div>';
  } else if (isConferencePanel) {
    mainCardHtml = renderConferenceOverviewPage(state, conferenceMonthOffset);
  } else if (isGraduationPanel) {
    mainCardHtml = renderGraduationProgressCard(state);
  } else {
    mainCardHtml = renderEnhancedPaperCurrentCard(state, activePanelIndex);
  }

  return `
    <div class="right-section workstation-section" id="workstation-section">
      <div class="section-header">
        <span><i class="panel-icon">📄</i> 科研工作站</span>
        <div class="workstation-header-actions">
          ${preEnrollment ? "" : `<button class="btn-sm workstation-conference-btn${isConferencePanel ? " active" : ""}" type="button" data-ui-workstation-panel-index="${WORKSTATION_CONFERENCE_PANEL_INDEX}">会议信息</button>`}
        </div>
      </div>
      <div class="workstation-main-actions" id="workstation-main-actions" ${preEnrollment || isConferencePanel ? "hidden" : ""}>
        <button class="compact-action-btn" type="button" data-action="read" ${preEnrollment ? "disabled" : ""}>
          <span class="btn-desc">看论文</span>
          <span class="btn-effect">SAN-${Math.max(0, 2 - getShopReadSanDiscount(state.shopState))}</span>
        </button>
        <button class="compact-action-btn" type="button" data-action="work" ${preEnrollment ? "disabled" : ""}>
          <span class="btn-desc">打工</span>
          <span class="btn-effect">SAN-1 · 金币+2</span>
        </button>
        <button class="compact-action-btn" type="button" data-action="rest" ${preEnrollment ? "disabled" : ""}>
          <span class="btn-desc">休息</span>
          <span class="btn-effect">SAN+${getShopRestSanGain(state.shopState)}</span>
        </button>
      </div>
      <div class="paper-switch-btns" id="paper-switch-btns" ${preEnrollment ? "hidden" : ""}>
        ${preEnrollment ? "" : renderEnhancedPaperSwitchButtons(state, activePanelIndex)}
      </div>
      <div class="paper-current-card" id="paper-current-card">
        ${mainCardHtml}
      </div>
      <div class="conf-info-compact" id="conf-info-compact" ${preEnrollment || isConferencePanel ? "hidden" : ""}>
        ${isGraduationPanel ? "" : renderEnhancedConferenceInfo(state, activePaper)}
      </div>
    </div>
  `;
}

type RelationshipRenderCard = {
  slotIndex: number;
  type: "advisor" | "senior" | "peer" | "junior" | "lover";
  buttonLabel: string;
  displayType: string;
  displayName: string;
  detailItems: string[];
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  relationGrowthPerMonth: number;
  taskRewardText: string;
  taskLabel: string;
  taskCostLabel: string;
  taskActionId: string;
  relationshipId?: string;
  taskUsedThisMonth: boolean;
  canInteract: boolean;
  taskDisabled: boolean;
  interactDisabled: boolean;
};

function getSafeRelationshipSlotIndex(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value ?? 0), 0), 4);
}

function getRelationshipEmptyText(slotIndex: number): string {
  return slotIndex === 0 ? "待选择导师..." : "空槽位";
}

function getRelationshipLockedText(slotIndex: number): string {
  const threshold = RELATIONSHIP_SLOT_UNLOCK_THRESHOLDS[slotIndex] ?? 18;
  return `需要社交达到 ${threshold} 解锁该槽位。`;
}

function getRelationshipSortValue(startTotalMonths: number | null | undefined, fallback: number): number {
  return typeof startTotalMonths === "number" ? startTotalMonths : 1000 + fallback;
}

function getRenderedFellowTypeLabel(type: FellowProgressProfile["type"]): string {
  if (type === "senior") return "师兄/师姐";
  if (type === "peer") return "同级";
  return "师弟/师妹";
}

function getRenderedFellowTaskLabel(taskType: FellowProgressProfile["taskType"]): string {
  if (taskType === "writing") return "帮写论文";
  if (taskType === "experiment") return "帮做实验";
  return "帮想idea";
}

function getRenderedFellowTaskRewardText(taskType: FellowProgressProfile["taskType"], research: number): string {
  if (taskType === "writing") return `亲和度 +1、写作 +${research}`;
  if (taskType === "experiment") return `亲和度 +1、实验 +${research}`;
  return `亲和度 +1、idea +${research}`;
}

function getRenderedLoverName(type: LoverTypeId | null): string {
  if (type === "beautiful") return "活泼恋人";
  if (type === "smart") return "聪慧恋人";
  return "恋人";
}

function buildRelationshipCards(state: GameState): Array<RelationshipRenderCard | null> {
  const preEnrollment = isPreEnrollmentState(state);
  const advisor = getAdvisorDefinitionOrNull(state.selectedAdvisorId);
  const cards: Array<RelationshipRenderCard | null> = Array.from({ length: 5 }, () => null);

  if (advisor && state.relationshipState.advisorCount > 0) {
    cards[0] = {
      slotIndex: 0,
      type: "advisor",
      buttonLabel: "导师",
      displayType: "导师",
      displayName: formatAdvisorTierLabel(advisor),
      detailItems: [
        `科研资源 ${state.advisorProgressState.researchResource}`,
        `亲和度 ${state.advisorProgressState.affinity}`,
        `认识时间 ${Math.max(0, state.totalMonths)}月`,
      ],
      taskProgress: state.advisorProgressState.taskProgress,
      taskMax: state.advisorProgressState.taskMax,
      relationProgress: state.advisorProgressState.relationProgress,
      relationMax: state.advisorProgressState.relationMax,
      relationGrowthPerMonth: Math.max(0, state.player.favor + state.advisorProgressState.affinity),
      taskRewardText: "亲和度 +1、科研资源 +1、项目奖励",
      taskLabel: "做项目",
      taskCostLabel: `SAN-${ADVISOR_TASK_SAN_COST}`,
      taskActionId: "advance-advisor-task",
      taskUsedThisMonth: state.advisorProgressState.taskUsedThisMonth,
      canInteract: state.advisorProgressState.canInteract,
      taskDisabled: preEnrollment || state.advisorProgressState.taskUsedThisMonth || state.player.san < ADVISOR_TASK_SAN_COST,
      interactDisabled: preEnrollment || !state.advisorProgressState.canInteract,
    };
  }

  const fellowFallbackCounts: Record<FellowProgressProfile["type"], number> = {
    senior: 0,
    peer: 0,
    junior: 0,
  };

  const otherCards = [
    ...state.fellowProgressState.map((profile, index) => {
      fellowFallbackCounts[profile.type] += 1;
      const fallbackName = `${getRenderedFellowTypeLabel(profile.type)} ${fellowFallbackCounts[profile.type]}`;
      return ({
      sortValue: getRelationshipSortValue(profile.startTotalMonths, index),
      card: {
        slotIndex: index + 1,
        type: profile.type,
        buttonLabel: getRenderedFellowTypeLabel(profile.type),
        displayType: getRenderedFellowTypeLabel(profile.type),
        displayName: profile.name?.trim() || fallbackName,
        detailItems: [
          `科研 ${profile.research}`,
          `亲和度 ${profile.affinity}`,
          `认识时间 ${Math.max(0, state.totalMonths - profile.startTotalMonths)}月`,
        ],
        taskProgress: profile.taskProgress,
        taskMax: profile.taskMax,
        relationProgress: profile.relationProgress,
        relationMax: profile.relationMax,
        relationGrowthPerMonth: Math.max(0, state.player.social + profile.affinity),
        taskRewardText: getRenderedFellowTaskRewardText(profile.taskType, profile.research),
        taskLabel: getRenderedFellowTaskLabel(profile.taskType),
        taskCostLabel: `SAN-${getFellowTaskSanCost(profile.taskType)}`,
        taskActionId: "advance-fellow-task",
        relationshipId: profile.id,
        taskUsedThisMonth: profile.taskUsedThisMonth,
        canInteract: profile.canInteract,
        taskDisabled: preEnrollment || profile.taskUsedThisMonth || state.player.san < getFellowTaskSanCost(profile.taskType),
        interactDisabled: preEnrollment || !profile.canInteract,
      } satisfies RelationshipRenderCard,
    });
    }),
    ...((state.loverState.active && state.loverProgressState.active && state.loverState.type)
      ? [{
        sortValue: getRelationshipSortValue(state.loverState.startTotalMonths, state.fellowProgressState.length),
        card: {
          slotIndex: state.fellowProgressState.length + 1,
          type: "lover" as const,
          buttonLabel: "恋人",
          displayType: "恋人",
          displayName: getRenderedLoverName(state.loverState.type),
          detailItems: [
            `科研 ${state.loverProgressState.research}`,
            `亲密度 ${state.loverProgressState.intimacy}`,
            `认识时间 ${Math.max(0, state.totalMonths - (state.loverState.startTotalMonths ?? state.totalMonths))}月`,
          ],
          taskProgress: state.loverProgressState.taskProgress,
          taskMax: state.loverProgressState.taskMax,
          relationProgress: state.loverProgressState.relationProgress,
          relationMax: state.loverProgressState.relationMax,
          relationGrowthPerMonth: Math.max(0, state.loverProgressState.intimacy),
          taskRewardText: "亲密度 +1、特殊效果",
          taskLabel: "约会",
          taskCostLabel: `金钱-${LOVER_DATE_MONEY_COST}`,
          taskActionId: "advance-lover-task",
          taskUsedThisMonth: state.loverProgressState.taskUsedThisMonth,
          canInteract: state.loverProgressState.canInteract,
          taskDisabled: preEnrollment || state.loverProgressState.taskUsedThisMonth || state.player.money < LOVER_DATE_MONEY_COST,
          interactDisabled: preEnrollment || !state.loverProgressState.canInteract,
        } satisfies RelationshipRenderCard,
      }]
      : []),
  ]
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((item) => item.card)
    .slice(0, 4);

  otherCards.forEach((card, index) => {
    cards[index + 1] = {
      ...card,
      slotIndex: index + 1,
    };
  });

  return cards;
}

function renderRelationshipSwitchButtons(
  cards: Array<RelationshipRenderCard | null>,
  activeRelationshipIndex: number,
  unlockedSlots: number,
): string {
  return cards.map((card, slotIndex) => {
    const isUnlocked = slotIndex < unlockedSlots;
    const isActive = slotIndex === activeRelationshipIndex;
    if (!isUnlocked) {
      return `
        <button class="rel-switch-btn locked${isActive ? " active" : ""}" type="button" data-ui-relationship-index="${slotIndex}">
          <span>🔒</span>
        </button>
      `;
    }

    if (!card) {
      return `
        <button class="rel-switch-btn empty${isActive ? " active" : ""}" type="button" data-ui-relationship-index="${slotIndex}">
          <span>空</span>
        </button>
      `;
    }

    const badge = card.canInteract
      ? '<span class="rel-switch-badge is-chat">!</span>'
      : (!card.taskUsedThisMonth ? '<span class="rel-switch-badge is-task">•</span>' : "");

    return `
      <button class="rel-switch-btn${isActive ? " active" : ""}" type="button" data-ui-relationship-index="${slotIndex}">
        <span>${escapeHtml(card.buttonLabel)}</span>
        ${badge}
      </button>
    `;
  }).join("");
}

function renderRelationshipCurrentCard(
  cards: Array<RelationshipRenderCard | null>,
  activeRelationshipIndex: number,
  unlockedSlots: number,
): string {
  const isUnlocked = activeRelationshipIndex < unlockedSlots;
  if (!isUnlocked) {
    return `<div class="rel-card locked"><div class="section-empty">${getRelationshipLockedText(activeRelationshipIndex)}</div></div>`;
  }

  const card = cards[activeRelationshipIndex];
  if (!card) {
    return `<div class="rel-card empty"><div class="section-empty">${getRelationshipEmptyText(activeRelationshipIndex)}</div></div>`;
  }

  const relationActionId = card.type === "advisor"
    ? "interact-advisor"
    : card.type === "lover"
      ? "interact-lover"
      : "interact-fellow";
  const relationshipAttr = card.relationshipId ? ` data-relationship-id="${escapeHtml(card.relationshipId)}"` : "";

  return `
    <div class="rel-card filled" data-rel-type="${card.type}">
      <div class="rel-card-head rel-card-header">
        <span class="rel-type" data-rel-type-pill="${card.type}">${escapeHtml(card.displayType)}</span>
        <strong class="rel-name">${escapeHtml(card.displayName)}</strong>
      </div>
      <div class="rel-detail-row">
        ${card.detailItems.map((item) => `<span class="rel-detail-item">${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="rel-progress-section">
        <div class="rel-progress-item">
          <div class="rel-progress-header">
            <span class="rel-progress-label">任务进度（满后：${escapeHtml(card.taskRewardText)}）</span>
            <span class="rel-progress-val">${card.taskProgress}/${card.taskMax}</span>
          </div>
          <div class="rel-progress-bar">
            <div class="rel-progress-fill task" style="width:${clampPercent(card.taskProgress / Math.max(1, card.taskMax) * 100)}%"></div>
          </div>
        </div>
          <div class="rel-progress-item">
            <div class="rel-progress-header">
              <span class="rel-progress-label">关系积累（+${card.relationGrowthPerMonth}/月，满后解锁交流）</span>
              <span class="rel-progress-val">${card.relationProgress}/${card.relationMax}</span>
            </div>
            <div class="rel-progress-bar">
              <div class="rel-progress-fill relation" style="width:${clampPercent(card.relationProgress / Math.max(1, card.relationMax) * 100)}%"></div>
            </div>
        </div>
      </div>
      <div class="rel-actions">
        <button
          class="btn-sm rel-action-btn"
          type="button"
          data-action="${card.taskActionId}"${relationshipAttr}
          ${card.taskDisabled ? "disabled" : ""}
        >${escapeHtml(card.taskUsedThisMonth ? "✓ 本月已用" : `${card.taskLabel}（${card.taskCostLabel}）`)}</button>
        <button
          class="btn-sm rel-action-btn is-chat"
          type="button"
          data-action="${relationActionId}"${relationshipAttr}
          ${card.interactDisabled ? "disabled" : ""}
        >交流</button>
      </div>
    </div>
  `;
}

function renderRelationshipSection(state: GameState, uiState: PlayRenderUiState = {}): string {
  const rel = state.relationshipState;
  const activeRelationshipIndex = getSafeRelationshipSlotIndex(uiState.activeRelationshipIndex);
  const cards = buildRelationshipCards(state);
  const preEnrollment = isPreEnrollmentState(state);

  return `
    <div class="right-section relationship-section" id="relationship-section">
      <div class="section-header rel-section-header">
        <span><i class="panel-icon">👥</i> 人际关系</span>
        <div class="rel-helper-actions is-empty" id="rel-helper-actions"></div>
      </div>
      <div class="rel-switch-btns" id="rel-switch-btns" ${preEnrollment ? "hidden" : ""}>
        ${preEnrollment ? "" : renderRelationshipSwitchButtons(cards, activeRelationshipIndex, rel.unlockedSlots)}
      </div>
      <div class="rel-current-card" id="rel-current-card">
        ${preEnrollment
          ? `<div class="section-empty play-module-lock-state">入学后开放</div>`
          : renderRelationshipCurrentCard(cards, activeRelationshipIndex, rel.unlockedSlots)}
      </div>
    </div>
  `;
}

function getPublishedPapers(state: GameState): Paper[] {
  return [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
}

const RESEARCH_PAPER_FILTERS: ResearchPaperFilterId[] = ["S", "A", "B", "C"];

function getResearchPaperFilter(paper: Paper): ResearchPaperFilterId {
  return paper.target ?? "S";
}

function renderResearchSection(state: GameState, uiState: PlayRenderUiState = {}): string {
  const publishedPapers = getPublishedPapers(state);
  const gradeCount = {
    S: publishedPapers.filter((paper) => getResearchPaperFilter(paper) === "S").length,
    A: publishedPapers.filter((paper) => getResearchPaperFilter(paper) === "A").length,
    B: publishedPapers.filter((paper) => getResearchPaperFilter(paper) === "B").length,
    C: publishedPapers.filter((paper) => getResearchPaperFilter(paper) === "C").length,
  } as const;
  const currentFilter = uiState.currentResearchPaperFilter ?? "C";
  const filteredPapers = publishedPapers.filter((paper) => getResearchPaperFilter(paper) === currentFilter);
  const currentPaperIndex = filteredPapers.length === 0
    ? 0
    : Math.min(Math.max(uiState.currentResearchPaperIndex ?? 0, 0), filteredPapers.length - 1);
  const currentPaper = filteredPapers[currentPaperIndex] ?? null;
  const emptyText = publishedPapers.length === 0 ? "暂无已发表论文" : "暂无符合当前筛选的论文";

  return `
    <div class="right-section research-section" id="research-section">
      <div class="section-header">
        <span><i class="panel-icon">🏆</i> 科研成果</span>
        <div class="research-stats-mini">
          <span class="stat-item">科研分：${state.totalResearchScore}</span>
          <span class="stat-item">总引用：${state.totalCitations}</span>
        </div>
      </div>
      <div class="research-summary-bar">
        ${RESEARCH_PAPER_FILTERS.map((filterId) => `
          <button
            class="grade-tag${currentFilter === filterId ? " active" : ""}"
            type="button"
            data-ui-research-filter="${filterId}"
            aria-pressed="${currentFilter === filterId ? "true" : "false"}"
          >${filterId}:${gradeCount[filterId]}篇</button>
        `).join("")}
      </div>
      <div class="research-switch-btns" id="research-switch-btns">
        ${filteredPapers.length > 0
          ? filteredPapers.map((_paper, index) => `
            <button
              class="research-switch-btn${index === currentPaperIndex ? " active" : ""}"
              type="button"
              data-ui-research-index="${index}"
              aria-pressed="${index === currentPaperIndex ? "true" : "false"}"
            >${index + 1}</button>
          `).join("")
          : ""}
      </div>
      <div class="research-current-card" id="research-current-card">
        ${currentPaper
          ? `
            <article class="research-card">
              <div class="research-card-header">
                <span class="research-title">${escapeHtml(currentPaper.title)}</span>
              </div>
              <div class="research-info-row">
                <span class="research-info-item">档位 ${getResearchPaperFilter(currentPaper)} 类</span>
                <span class="research-info-item">状态 ${getPaperStatusText(currentPaper)}</span>
                <span class="research-info-item">中稿分 ${getAcceptedPaperScore(currentPaper)}</span>
                <span class="research-info-item">倍率 ×${(currentPaper.publication?.citationMultiplier ?? 1).toFixed(2)}</span>
                <span class="research-info-item">引用 ${currentPaper.publication?.citations ?? 0}</span>
                <span class="research-info-item">当前分 ${currentPaper.publication?.effectiveScore ?? getAcceptedPaperScore(currentPaper)}</span>
              </div>
            </article>
          `
          : `<div class="no-papers">${emptyText}</div>`}
      </div>
    </div>
  `;
}

function normalizeTalentPanelTab(tabId: TalentPanelTabId | undefined): TalentPanelTabId {
  return tabId === "relation" || tabId === "equip" ? tabId : "character";
}

function renderTalentTabButton(tabId: TalentPanelTabId, label: string, active: boolean): string {
  return `
    <button
      class="talent-tab-btn${active ? " active" : ""}"
      type="button"
      data-ui-talent-tab="${tabId}"
      aria-pressed="${active ? "true" : "false"}"
    >${label}</button>
  `;
}

function renderTalentPanelItem(item: TalentPanelItem): string {
  return `
    <article
      class="talent-item talent-item-row${item.active ? " is-active" : " is-inactive"}"
      data-talent-item-id="${escapeHtml(item.id)}"
      data-talent-item-active="${item.active ? "true" : "false"}"
    >
      <div class="talent-item-head">
        <strong class="talent-item-title">
          <span class="talent-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
          <span class="talent-item-title-text">${escapeHtml(item.name)}</span>
        </strong>
        <span class="talent-item-tag${item.active ? " is-active" : " is-inactive"}">${item.active ? "已激活" : "未激活"}</span>
      </div>
      <p class="talent-item-desc">${escapeHtml(item.description)}</p>
      ${item.detail ? `<p class="talent-item-note">${escapeHtml(item.detail)}</p>` : ""}
      ${!item.active && item.requirement ? `<p class="talent-item-note is-requirement">${escapeHtml(item.requirement)}</p>` : ""}
    </article>
  `;
}

function getTalentFellowTypeLabel(type: FellowProgressProfile["type"]): string {
  if (type === "senior") return "师兄/师姐";
  if (type === "peer") return "同门";
  return "师弟/师妹";
}

function getTalentFellowTaskLabel(type: FellowProgressProfile["taskType"]): string {
  if (type === "writing") return "写作";
  if (type === "experiment") return "实验";
  return "idea";
}

function getTalentLoverTypeLabel(type: LoverTypeId): string {
  return type === "smart" ? "聪慧恋人" : "活泼恋人";
}

function buildCharacterTalentItems(state: GameState, role: RoleDefinition): TalentPanelItem[] {
  const items: TalentPanelItem[] = [
    {
      id: "character-role",
      icon: role.icon,
      name: role.name,
      active: true,
      description: role.bonus,
      detail: role.mode === "reversed" ? "当前为逆位角色路线。" : "当前为正位角色路线。",
    },
    {
      id: "character-awaken",
      icon: role.awakenIcon,
      name: role.awakenName,
      active: state.degree === "phd",
      description: role.awakenDesc,
      requirement: "条件：转博后觉醒。",
    },
  ];

  if (role.hiddenAwakenName && role.hiddenAwakenDesc) {
    items.push({
      id: "character-hidden-awaken",
      icon: role.hiddenAwakenIcon ?? "🔒",
      name: role.hiddenAwakenName,
      active: false,
      description: role.hiddenAwakenDesc,
      requirement: "条件：达成隐藏触发条件。",
    });
  }

  items.push(
    {
      id: "strong-body",
      icon: "💪",
      name: "强身健体",
      active: state.eventSupport.hasStrongBodyTalent,
      description: "效果：每月 SAN +1。",
      requirement: "条件：在羽毛球比赛中获得冠军。",
    },
    {
      id: "finance-master",
      icon: "💰",
      name: "理财能手",
      active: state.eventSupport.hasFinanceTalent,
      description: "效果：每月金币 +3%（向上取整）。",
      requirement: `条件：德州扑克累计盈利 10 金币（当前 ${Math.max(0, state.eventCounters.pokerTotalEarnings)}/10）。`,
    },
  );

  return items;
}

function buildRelationTalentItems(state: GameState): TalentPanelItem[] {
  const fellowTypeOrder: Record<FellowProgressProfile["type"], number> = {
    senior: 0,
    peer: 1,
    junior: 2,
  };
  const fellows = [...state.fellowProgressState].sort((left, right) => {
    const leftOrder = fellowTypeOrder[left.type];
    const rightOrder = fellowTypeOrder[right.type];
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.startTotalMonths - right.startTotalMonths;
  });
  const jointTrainingProgress = state.conferenceEncounterState.metBigBullCoop
    ? `${Math.min(2, state.conferenceEncounterState.bigBullDeepCount)}/2`
    : "0/2";
  const jointTrainingBonus = Math.max(
    state.researchCapacityState.jointTrainingCitationCapBonus,
    getJointTrainingCitationCapBonus(state.totalCitations),
  );
  const internshipIncome = getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations);
  const labTalentActive = isLabTalentActive(state.relationshipState);
  const labBonus = getLabTalentActionBonus(state.relationshipState);
  const labTeamSize = getLabTalentTeamSize(state.relationshipState);
  const items: TalentPanelItem[] = [
    {
      id: "advisor",
      icon: "👨‍🏫",
      name: "导师关系",
      active: state.relationshipState.advisorCount > 0,
      description: "效果：导师任务循环奖励与关系成长。",
      detail: state.relationshipState.advisorCount > 0
        ? `当前科研资源 ${state.advisorProgressState.researchResource}，好感 ${state.player.favor}/20，项目进度 ${state.advisorProgressState.taskProgress}/${state.advisorProgressState.taskMax}。`
        : undefined,
      requirement: "条件：开局选择导师后自动获得。",
    },
    ...fellows.map((profile) => ({
      id: `fellow-${profile.id}`,
      icon: profile.type === "senior" ? "🧑‍🏫" : profile.type === "peer" ? "🤝" : "🧑‍🎓",
      name: `${getTalentFellowTypeLabel(profile.type)}·${profile.name ?? getTalentFellowTypeLabel(profile.type)}`,
      active: true,
      description: `效果：帮忙${getTalentFellowTaskLabel(profile.taskType)} +${profile.research}。`,
      detail: `当前亲和 ${profile.affinity}，任务进度 ${profile.taskProgress}/${profile.taskMax}。`,
    })),
    {
      id: "joint-training",
      icon: "🧠",
      name: "大牛联培",
      active: state.conferenceEncounterState.bigBullCooperation,
      description: state.conferenceEncounterState.bigBullCooperation
        ? `效果：联培引用成长带来科研上限 +${jointTrainingBonus}。`
        : "效果：建立联培后会接入科研上限成长与导师资源提升。",
      detail: state.conferenceEncounterState.bigBullCooperation
        ? `当前总引用 ${state.totalCitations}，联培累计上限加成 ${jointTrainingBonus}。`
        : undefined,
      requirement: `条件：会议中先建立合作，再完成 2 次深入交流（当前 ${jointTrainingProgress}）。`,
    },
    {
      id: "internship",
      icon: "💼",
      name: "企业实习",
      active: state.internshipState.active,
      description: state.internshipState.active
        ? `效果：做实验 ×${formatMonthlyValue(state.internshipState.experimentMultiplier)}，每月工资 +${formatMonthlyValue(internshipIncome)}，SAN -2。`
        : "效果：企业实习会提升实验收益，并按成果带来月薪。",
      detail: state.internshipState.active
        ? `剩余 ${state.internshipState.remainingMonths} 个月，累计完成 ${state.internshipCount} 次。`
        : undefined,
      requirement: `条件：会议中的企业交流达到 3 次（当前 ${state.conferenceCareerState.enterpriseCount}/3）。`,
    },
    {
      id: "lab-talent",
      icon: "🧪",
      name: "实验室互帮互助",
      active: labTalentActive,
      description: labTalentActive
        ? `效果：想 idea / 做实验 / 写论文 +${labBonus}。`
        : "效果：想 idea / 做实验 / 写论文会获得团队人数加成。",
      detail: labTalentActive
        ? `当前团队 ${labTeamSize} 人，指导层数 ${state.relationshipState.mentorshipStacks}。`
        : undefined,
      requirement: "条件：同时拥有导师、师兄/师姐、师弟/师妹。",
    },
  ];

  if (state.loverState.active && state.loverProgressState.active && state.loverState.type) {
    if (state.loverState.type === "smart") {
      items.push({
        id: "lover",
        icon: "💕",
        name: getTalentLoverTypeLabel(state.loverState.type),
        active: true,
        description: `效果：科研 +2，约会开销 -2；额外行动 idea +${state.persistentExtraActions.idea} / 实验 +${state.persistentExtraActions.experiment} / 写作 +${state.persistentExtraActions.writing}。`,
        detail: `已约会 ${state.loverProgressState.completedTaskCount} 次，亲密 ${state.loverProgressState.intimacy}，恋人科研 ${state.loverProgressState.research}。`,
      });
    } else {
      const recoveryRate = 10 + state.loverState.beautifulExtraRecoveryRate;
      const currentRecovery = getBeautifulMonthlyRecovery(state.loverState, state.player.san, state.sanCap);
      items.push({
        id: "lover",
        icon: "💕",
        name: getTalentLoverTypeLabel(state.loverState.type),
        active: true,
        description: `效果：SAN 上限 +4，约会开销 -2；每月回复已损 SAN 的 ${recoveryRate}%。`,
        detail: `已约会 ${state.loverProgressState.completedTaskCount} 次，当前月结按现状可回复 SAN ${currentRecovery}。`,
      });
    }
  } else {
    items.push({
      id: "lover",
      icon: "💕",
      name: "恋人",
      active: false,
      description: "效果：根据恋人类型提供不同的长期陪伴收益。",
      detail: `当前活泼线索 ${state.conferenceEncounterState.beautifulCount}/2，聪慧线索 ${state.conferenceEncounterState.smartCount}/2。`,
      requirement: "条件：在会议中与同一类型学者多次交流并确认关系。",
    });
  }

  return items;
}

function getChairTalentItem(state: GameState): TalentPanelItem | null {
  if (!state.shopState.chairOwned) return null;

  const currentRecovery = getChairMonthlyRecovery(state.shopState, state.player.san, state.sanCap);
  if (state.shopState.chairUpgrade === "advanced") {
    return {
      id: "chair",
      icon: "🪑",
      name: "人体工学椅",
      active: true,
      description: "效果：每月 SAN +2，休息 SAN +2。",
    };
  }
  if (state.shopState.chairUpgrade === "massage") {
    return {
      id: "chair",
      icon: "🪑",
      name: "电动按摩椅",
      active: true,
      description: `效果：每月恢复已损 SAN 的 10%（当前 +${currentRecovery}），休息 SAN +2。`,
    };
  }
  if (state.shopState.chairUpgrade === "torture") {
    return {
      id: "chair",
      icon: "🪑",
      name: "沙发",
      active: true,
      description: `效果：每月恢复当前 SAN 的 20%（当前 +${currentRecovery}），休息 SAN +2。`,
    };
  }
  if (state.shopState.chairUpgrade === "spike") {
    return {
      id: "chair",
      icon: "🪑",
      name: "锥刺股椅",
      active: true,
      description: "效果：SAN 小于等于 0 时保底恢复到 2，休息 SAN +2。",
    };
  }
  if (state.shopState.chairUpgrade === "hammock") {
    return {
      id: "chair",
      icon: "🪑",
      name: "吊床",
      active: true,
      description: "效果：休息动作改为 SAN +5。",
    };
  }

  return {
    id: "chair",
    icon: "🪑",
    name: "办公椅",
    active: true,
    description: "效果：每月 SAN +1，休息 SAN +2。",
  };
}

function getMonitorTalentItem(state: GameState): TalentPanelItem | null {
  if (!state.shopState.monitorOwned) return null;

  if (state.shopState.monitorUpgrade === "4k") {
    return {
      id: "monitor",
      icon: "🖥️",
      name: "4K 显示器",
      active: true,
      description: "效果：手动看论文 SAN = 0。",
    };
  }
  if (state.shopState.monitorUpgrade === "smart") {
    return {
      id: "monitor",
      icon: "🖥️",
      name: "智能显示器",
      active: true,
      description: "效果：手动看论文 SAN = 2；每 10 次阅读让本次阅读的 idea 额外 +1。",
      detail: `当前智能阅读累计 ${state.readingState.smartMonitorReadCount} 次。`,
    };
  }
  if (state.shopState.monitorUpgrade === "dual") {
    return {
      id: "monitor",
      icon: "🖥️",
      name: "双屏显示器",
      active: true,
      description: "效果：手动看论文 SAN = 2；每月自动阅读 1 次（SAN -2）。",
      detail: `当前自动阅读积累的下次 idea 加成 +${state.readingState.dualMonitorIdeaBonus}。`,
    };
  }

  return {
    id: "monitor",
    icon: "🖥️",
    name: "2K 显示器",
    active: true,
    description: `效果：手动看论文 SAN -${getShopReadSanDiscount(state.shopState)}。`,
  };
}

function getBikeTalentItem(state: GameState): TalentPanelItem | null {
  if (!state.shopState.bikeOwned) return null;

  if (state.shopState.bikeUpgrade === "road") {
    return {
      id: "bike",
      icon: "🚲",
      name: "公路车",
      active: true,
      description: `效果：每月 SAN -2；每累计骑行消耗 5 点，SAN 上限 +1（当前 +${state.shopState.bikeSanCapGains}/12）。`,
      detail: `累计骑行消耗 ${state.shopState.bikeSanSpent}。`,
    };
  }
  if (state.shopState.bikeUpgrade === "ebike") {
    return {
      id: "bike",
      icon: "🛵",
      name: "小电驴",
      active: true,
      description: "效果：春季和秋季每月 SAN +1。",
      detail: `当前开会次数 ${state.eventCounters.meetingCount}。`,
    };
  }

  return {
    id: "bike",
    icon: "🚲",
    name: "自行车",
    active: true,
    description: `效果：每月 SAN -1；每累计骑行消耗 6 点，SAN 上限 +1（当前 +${state.shopState.bikeSanCapGains}/6）。`,
    detail: `累计骑行消耗 ${state.shopState.bikeSanSpent}。`,
  };
}

function buildEquipTalentItems(state: GameState): TalentPanelItem[] {
  const fullGearActive = hasFullGear(state.shopState, state.eventSupport);
  const fullGearDiscount = getFullGearMeetingDiscount(state.eventCounters.meetingCount, state.shopState, state.eventSupport);
  const items: TalentPanelItem[] = [
    {
      id: "full-gear",
      icon: "🎒",
      name: "整装待发",
      active: fullGearActive,
      description: fullGearActive
        ? `效果：开会自费减 ${fullGearDiscount} 金币。`
        : "效果：成套出行装备会降低开会自费成本。",
      detail: fullGearActive ? `当前开会次数 ${state.eventCounters.meetingCount}。` : undefined,
      requirement: "条件：小电驴 + 遮阳伞 + 羽绒服。",
    },
  ];

  const chairItem = getChairTalentItem(state);
  if (chairItem) items.push(chairItem);

  const monitorItem = getMonitorTalentItem(state);
  if (monitorItem) items.push(monitorItem);

  if (state.shopState.keyboardOwned) {
    const writingModifier = getShopPaperActionModifier(state.shopState, "writing");
    items.push({
      id: "keyboard",
      icon: "⌨️",
      name: "机械键盘",
      active: true,
      description: `效果：写作 SAN -${writingModifier.sanDiscount}，写作 +${writingModifier.bonus}。`,
    });
  }

  const bikeItem = getBikeTalentItem(state);
  if (bikeItem) items.push(bikeItem);

  if (state.coffeeState.machineOwned) {
    items.push({
      id: "coffee-machine",
      icon: "☕",
      name: "咖啡机",
      active: true,
      description: `${getCoffeeMachineOwnedText(state.coffeeState)}。`,
      detail: `当前冰美式额外 SAN +${getCurrentCoffeeBonus(state.coffeeState)}。`,
    });
  }

  if (state.shopState.gpuServersBought > 0) {
    const experimentModifier = getShopPaperActionModifier(state.shopState, "experiment");
    items.push({
      id: "gpu",
      icon: "🖥️",
      name: `GPU 服务器 x${state.shopState.gpuServersBought}`,
      active: true,
      description: `效果：做实验 +${experimentModifier.extraActions} 次，做实验 +${experimentModifier.bonus} 分。`,
    });
  }

  if (state.eventSupport.hasGameController) {
    items.push({
      id: "game-controller",
      icon: "🎮",
      name: "游戏手柄",
      active: true,
      description: "效果：玩游戏时 SAN 消耗 -2。",
    });
  }

  if (state.eventSupport.hasParasol) {
    items.push({
      id: "parasol",
      icon: "☂️",
      name: "遮阳伞",
      active: true,
      description: "效果：夏季炎热减益无效。",
    });
  }

  if (state.eventSupport.hasDownJacket) {
    items.push({
      id: "down-jacket",
      icon: "🧥",
      name: "羽绒服",
      active: true,
      description: "效果：冬季寒冷减益无效。",
    });
  }

  if (state.eventSupport.hasBadmintonRacket) {
    items.push({
      id: "badminton-racket",
      icon: "🏸",
      name: "羽毛球拍",
      active: true,
      description: "效果：羽毛球比赛获得额外尝试机会。",
    });
  }

  return items;
}

function renderTalentSection(
  state: GameState,
  role: RoleDefinition,
  activeTalentTab: TalentPanelTabId | undefined,
): string {
  const tabId = normalizeTalentPanelTab(activeTalentTab);
  const items = tabId === "relation"
    ? buildRelationTalentItems(state)
    : tabId === "equip"
      ? buildEquipTalentItems(state)
      : buildCharacterTalentItems(state, role);

  return `
    <div class="talent-panel">
      <div class="talent-header-row">
        <span class="talent-title">天赋</span>
        <div class="talent-tab-btns">
          ${renderTalentTabButton("character", "角色", tabId === "character")}
          ${renderTalentTabButton("relation", "关系", tabId === "relation")}
          ${renderTalentTabButton("equip", "装备", tabId === "equip")}
        </div>
      </div>
      <div class="talent-items-list" id="talent-items-list" data-talent-panel-tab="${tabId}">
        ${items.map((item) => renderTalentPanelItem(item)).join("")}
      </div>
    </div>
  `;
}

function renderSettingsAdjustButtons(): string {
  const statButtons = DEBUG_STAT_GROUPS.flatMap((group) =>
    group.deltas.map((delta) => `
      <button
        class="settings-tool-btn"
        type="button"
        data-action="debug-adjust-stat"
        data-debug-stat-id="${group.statId}"
        data-delta="${delta}"
      >${escapeHtml(`${group.label}${formatSignedNumber(delta)}`)}</button>
    `)
  ).join("");
  const monthButtons = DEBUG_MONTH_DELTAS.map((delta) => `
    <button
      class="settings-tool-btn"
      type="button"
      data-action="debug-shift-month"
      data-delta="${delta}"
    >${escapeHtml(`时间${formatSignedNumber(delta)}月`)}</button>
  `).join("");
  return `${statButtons}${monthButtons}`;
}

function renderSettingsEventGroups(): string {
  return DEBUG_EVENT_GROUPS.map((group) => `
    <div class="settings-event-category">
      <div class="settings-event-category-title">${escapeHtml(group.title)}</div>
      <div class="settings-event-grid">
        ${group.buttons.map((button) => `
          <button
            class="settings-tool-btn"
            type="button"
            data-action="debug-trigger-event"
            data-event-id="${button.id}"
          >${escapeHtml(button.label)}</button>
        `).join("")}
      </div>
    </div>
  `).join("");
}

function renderSettingsSection(): string {
  return `
    <div class="settings-panel">
      <div class="settings-header-row">
        <span class="settings-title">设置</span>
      </div>
      <div class="settings-content" id="settings-panel-content">
        <div class="settings-section">
          <div class="settings-section-title">属性调整</div>
          <div class="settings-attr-grid">
            ${renderSettingsAdjustButtons()}
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">事件触发</div>
          <div class="settings-event-list">
            ${renderSettingsEventGroups()}
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">游戏控制</div>
          <div class="settings-action-row">
            <button class="settings-primary-btn" type="button" data-action="reset-game">返回开始页</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLegacyCenterShell(state: GameState, uiState: PlayRenderUiState = {}): string {
  const role = getRoleDefinition(state.selectedRoleId);
  const eventCount = state.eventQueue.length;
  const activeEventId = uiState.isEventContentOpen ? (uiState.activeEventId ?? null) : null;
  const openEvent = activeEventId ? getCurrentEvent(state.eventQueue, activeEventId) : null;

  return `
    <section class="play-center-column game-main-area">
      <div class="center-shell" id="center-shell">
        <div class="center-main-tabs" id="center-main-tabs">
          <button class="center-tab-btn active" type="button" data-ui-play-tab="events">
            <span>事件处理</span>
            ${eventCount > 0 ? `<span class="center-tab-badge" id="center-events-badge">${eventCount}</span>` : ""}
          </button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="workstation">科研</button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="relationship">人际</button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="shop">商店</button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="research">科研成果</button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="talent">天赋</button>
          <button class="center-tab-btn" type="button" data-ui-play-tab="settings">设置</button>
          <button class="center-tab-btn center-tab-btn-next" type="button" data-action="next-month">下一月</button>
        </div>

        <div class="center-main-panels" id="center-main-panels">
          <section class="center-main-panel active" data-tab-panel="events">
            <div class="event-panel${openEvent ? " showing-content" : ""}" id="event-panel">
              <div class="event-header-row">
                <span class="event-panel-title">待办事项</span>
                <span class="event-badge${eventCount > 0 ? "" : " is-empty"}" id="event-badge">${eventCount}</span>
              </div>
              <div class="event-queue" id="event-queue">
                ${renderEventQueueList(state, activeEventId)}
              </div>
              ${renderEventContentBox(openEvent)}
            </div>
          </section>

          <section class="center-main-panel" data-tab-panel="workstation" hidden>
            ${renderEnhancedWorkstationSection(state, uiState)}
          </section>

          <section class="center-main-panel" data-tab-panel="relationship" hidden>
            ${renderRelationshipSection(state, uiState)}
          </section>

          <section class="center-main-panel" data-tab-panel="shop" hidden>
            ${renderInteractiveShopSection(state, uiState.activeShopTab)}
          </section>

          <section class="center-main-panel" data-tab-panel="research" hidden>
            ${renderResearchSection(state, uiState)}
          </section>

          <section class="center-main-panel" data-tab-panel="talent" hidden>
            ${renderTalentSection(state, role, uiState.activeTalentTab)}
          </section>

          <section class="center-main-panel" data-tab-panel="settings" hidden>
            ${renderSettingsSection()}
          </section>
        </div>
      </div>
    </section>
  `;
}

function renderTodoPreviewList(state: GameState): string {
  const items = [
    ...buildCurrentTodoPreviewItems(state),
    ...buildFutureTodoPreviewItems(state),
  ].sort((left, right) => {
    if (left.monthsLater !== right.monthsLater) {
      return left.monthsLater - right.monthsLater;
    }
    if (left.sortGroup !== right.sortGroup) {
      return left.sortGroup - right.sortGroup;
    }
    return left.sortOrder - right.sortOrder;
  });

  if (items.length === 0) {
    return `<div class="todo-empty">暂无待办事件</div>`;
  }

  return `
    <div class="new-todo-list">
      ${items.map((item) => `
        ${item.eventId
          ? `
            <button
              class="todo-item todo-preview-item todo-preview-current"
              type="button"
              data-ui-open-event-id="${escapeHtml(item.eventId)}"
            >
              <div class="todo-item-head">
                <span class="todo-type-badge">${escapeHtml(item.badgeText)}</span>
                <span class="todo-deadline">${escapeHtml(item.deadlineText)}</span>
              </div>
              <strong class="todo-title">${escapeHtml(item.title)}</strong>
            </button>
          `
          : `
            <article class="todo-item todo-preview-item todo-preview-future">
              <div class="todo-item-head">
                <span class="todo-type-badge">${escapeHtml(item.badgeText)}</span>
                <span class="todo-deadline">${escapeHtml(item.deadlineText)}</span>
              </div>
              <strong class="todo-title">${escapeHtml(item.title)}</strong>
            </article>
          `}
      `).join("")}
    </div>
  `;
}

function getLogPageLabel(totalMonths: number, degree: GameState["degree"]): string {
  if (totalMonths <= 0) {
    return "入学前";
  }
  const calendar = getCalendarForTotalMonths(totalMonths, degree);
  return `第${calendar.year}年第${calendar.month}月`;
}

function buildLogPages(logEntries: GameLogEntry[], degree: GameState["degree"]): LogPage[] {
  const visibleEntries = logEntries.filter((entry) => !isTransientUiHintLog(entry.text));

  if (visibleEntries.length === 0) {
    return [];
  }

  const pageMap = new Map<number, LogPage>();
  for (const entry of [...visibleEntries].reverse()) {
    const monthKey = Math.max(0, entry.month);
    const existing = pageMap.get(monthKey);
    if (existing) {
      existing.entries.push(entry);
    } else {
      pageMap.set(monthKey, {
        monthKey,
        label: getLogPageLabel(monthKey, degree),
        entries: [entry],
      });
    }
  }

  return [...pageMap.values()];
}

function getLogEntryClassName(text: string): string {
  const isNegative = text.includes("拒稿") || text.includes("失败") || text.includes("不足") || text.includes("惩罚") || text.includes("降低");
  const isAchievement = text.includes("成就") || text.includes("解锁") || text.includes("毕业") || text.includes("Nature");
  if (isNegative && isAchievement) return "log-entry negative achievement";
  if (isNegative) return "log-entry negative";
  if (isAchievement) return "log-entry achievement";
  return "log-entry";
}

function renderLogList(page: LogPage | null): string {
  if (!page || page.entries.length === 0) {
    return `<div class="no-logs">暂无日志</div>`;
  }

  return [...page.entries]
    .slice(-MAX_LOG_RENDER_COUNT)
    .reverse()
    .map((entry) => `
      <div class="${getLogEntryClassName(entry.text)}">
        <div class="event">${escapeHtml(entry.text)}</div>
      </div>
    `)
    .join("");
}

function renderLegacyRightRail(state: GameState, uiState: PlayRenderUiState = {}): string {
  const logPages = buildLogPages(state.log, state.degree);
  const latestLogPageIndex = Math.max(0, logPages.length - 1);
  const resolvedLogPageIndex = logPages.length === 0
    ? 0
    : Math.min(Math.max(uiState.activeLogPage ?? latestLogPageIndex, 0), latestLogPageIndex);
  const activeLogPage = logPages[resolvedLogPageIndex] ?? null;
  const atFirstLogPage = resolvedLogPageIndex <= 0;
  const atLastLogPage = resolvedLogPageIndex >= latestLogPageIndex;

  return `
    <aside class="play-right-rail new-right-container" id="new-right-container">
      <div class="new-time-panel" id="new-time-panel">
        <div class="new-time-row">
          <span class="new-time-item" id="new-time-year">${getYearText(state)}</span>
          <span class="new-time-item" id="new-time-month">${getMonthText(state)}</span>
          <span class="new-time-item" id="new-time-season">${getSeasonLabel(state)}</span>
          <span class="new-time-item" id="new-time-remaining">${getRemainingMonthsText(state)}</span>
        </div>
        <div class="new-calendar-section new-todo-section">
          <div class="new-calendar-header">
            <span class="new-calendar-title">待办事件</span>
          </div>
          <div class="new-calendar-content new-todo-content" id="new-todo-preview">
            ${renderTodoPreviewList(state)}
          </div>
        </div>
      </div>

      <div class="new-right-log-panel" id="new-right-log-panel">
        <div class="log-panel" data-log-page-index="${resolvedLogPageIndex}" data-log-page-count="${logPages.length}">
          <div class="log-header-row">
            <span class="log-title">游戏日志</span>
            <span class="log-time" id="log-time-header">${activeLogPage?.label ?? "暂无日志"}</span>
            <div class="log-nav-btns">
              <button class="log-nav-btn" id="log-nav-prev-year" type="button" data-ui-log-nav="first" ${atFirstLogPage ? "disabled" : ""}>«</button>
              <button class="log-nav-btn" id="log-nav-prev-month" type="button" data-ui-log-nav="prev" ${atFirstLogPage ? "disabled" : ""}>‹</button>
              <button class="log-nav-btn" id="log-nav-next-month" type="button" data-ui-log-nav="next" ${atLastLogPage ? "disabled" : ""}>›</button>
              <button class="log-nav-btn" id="log-nav-next-year" type="button" data-ui-log-nav="last" ${atLastLogPage ? "disabled" : ""}>»</button>
            </div>
          </div>
          <div class="log-content" id="log-content">
            ${renderLogList(activeLogPage)}
          </div>
        </div>
      </div>
    </aside>
  `;
}

void [
  renderPaperSwitchButtons,
  renderPaperCurrentCard,
  renderConferenceInfo,
  normalizeTalentPanelTab,
  renderTalentTabButton,
  renderTalentPanelItem,
  buildCharacterTalentItems,
  buildRelationTalentItems,
  buildEquipTalentItems,
];

export function renderPlayScreen(state: GameState, uiState: PlayRenderUiState = {}): string {
  return `
    <main class="play-page" data-phase="playing" data-scale-mode="fixed">
      <section class="play-stage-shell">
        <div class="play-stage-scale">
          <section class="play-stage">
            <section class="play-workbench">
              <div class="play-workbench-body">
                ${renderLegacyLeftRail(state)}
                ${renderLegacyCenterShell(state, uiState)}
                ${renderLegacyRightRail(state, uiState)}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  `;
}
