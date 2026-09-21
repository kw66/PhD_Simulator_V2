import { getCoffeeMachineOwnedText, getCurrentCoffeeBonus } from "../core/v2-coffee-system";
import { getActiveOperationAllowance, getAiCollaborationStatus } from "../core/v2-ai-shop";
import { PAPER_SLOT_RESEARCH_THRESHOLDS, SCORE_BY_TARGET } from "../core/v2-content";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { getCitationStats } from "../core/v2-citation-stats";
import { getConferenceInfo, getConferenceLocation } from "../core/v2-conference-catalog";
import type { ConferenceRegionId } from "../core/v2-conference-system";
import { getCurrentEvent, getSortedEventQueue } from "../core/v2-event-queue";
import { canAutoResolveLinearEvent, isEventBlocking, isLinearEvent } from "../core/v2-event-auto-resolution";
import { isTransientUiHintLog } from "../core/v2-engine-helpers";
import { getTeachersDayResultPreviews } from "../core/v2-fixed-events-teachers-day";
import { getMeetingSelfPayDiscount, hasFullGear } from "../core/v2-meeting-system";
import {
  ACTIVITY_WIN_RATE_CAP,
  BADMINTON_VICTORY_THRESHOLD,
  getBadmintonStrength,
  getPokerWinRate,
} from "../core/v2-growth-system";
import { getBikeSanCapLimit, getBikeTierDefinition } from "../core/v2-bike-system";
import { getActiveBuffs, getActiveOperationSanDelta } from "../core/v2-buffs";
import { previewNextMonthEffects } from "../core/v2-monthly-effects";
import { getFellowName, getFellowResearchTopic, getFellowRoleLabel } from "../core/v2-fellow-progression";
import { getFellowDiscussionSanCost } from "../core/v2-fellow-actions";
import { getFellowCurrentPaper } from "../core/v2-fellow-research";
import { LOVER_ROUTES, getLoverDateFailure, getLoverNextReward, getLoverPassiveGains, getLoverRouteCost, getLoverRouteGain, getLoverRouteProgress } from "../core/v2-lover-progression";
import { previewPartTimeWork } from "../core/v2-part-time-work";
import { getLoverName } from "../core/v2-lover-system";
import {
  getAcceptedPaperScore,
  getPaperPromotionCost,
  getPaperPromotionMultiplierBonus,
  getPaperPromotionMoneyCost,
} from "../core/v2-publication-rules";
import { getPaperCitationMultiplier, getPaperConferencePromotionMultiplier } from "../core/v2-publication-system";
import { getPublicationTalentChecklist } from "../core/v2-publication-talent";
import { getAvailablePaperSlotCount, getPaperSubmissionFailure, getWorkstationPaperSlotMap } from "../core/v2-paper-rules";
import { getPaperScoreBreakdown } from "../core/v2-paper-collaboration";
import { getPaperHeatTier } from "../core/v2-paper-topics";
import {
  ADVISOR_FUNDING_CAP,
  ADVISOR_GRANTS,
  ADVISOR_TASK_SAN_COST,
  getActiveAdvisorGrants,
  getAdvisorGrantLimit,
  getAdvisorMonthlyResearchGrowth,
  getAdvisorMonthlySalary,
  getAdvisorRankLabel,
} from "../core/v2-advisor-progress";
import {
  getCalendarForTotalMonths,
  getRoleDefinition,
  getMonthLimitByDegree,
  isPreEnrollmentState,
} from "../core/v2-progression";
import { getResearchCap } from "../core/v2-research-cap-system";
import {
  getReadingIdeaBonus,
  previewReadPaperAction,
} from "../core/v2-reading-system";
import { previewResearchOperation, RESEARCH_OPERATION_SAN_COST } from "../core/v2-research-operation";
import { getJournalDefinition, getJournalRevisionScore, getJournalSubmissionFailure } from "../core/v2-journal-system";
import {
  RANDOM_ADVISOR_GIVEN_CHARS,
  RANDOM_ADVISOR_NAMES,
  RANDOM_ADVISOR_SURNAMES,
} from "../core/v2-random-name";
import {
  DISEASE_MONTH_END_CHANGE_BY_SAN_TIER,
  getSeasonByMonth,
  getTierResistChance,
} from "../core/v2-sanity-rules";
import {
  getChairMonthlyRecovery,
  getShopPaperActionModifier,
  getShopReadSanDiscount,
  getShopRestSanGain,
} from "../core/v2-shop-items-effects";
import { getGpuTierDefinition } from "../core/v2-shop-items";
import type { DateDisplayMode, FellowProgressProfile, GameLogEntry, GameState, JournalTarget, LoverTypeId, Paper, PaperActionType, PaperPromotionId, PaperReviewEventPresentation, PaperReviewerReport, PendingEvent, RoleDefinition } from "../core/v2-types";
import {
  type PlayRenderUiState,
  type PlayTabId,
  type ResearchSortMode,
  type TalentPanelTabId,
} from "./v2-render-types";
import { renderShopSection as renderInteractiveShopSection } from "./v2-render-shop-panel";
import { buildBuffDisplayBuckets } from "./v2-render-buffs";
import { renderGameFeedbackOverlay } from "./v2-render-community";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "../core/v2-development-flags";
import { renderPlayHelpPanel } from "./v2-play-help";
import { isEndingSystemLog, renderEndingLog, renderEndingScreen } from "./v2-render-ending";
import type { EventLayoutSample } from "./v2-event-layout";
import { animationNumberAttributes, animationBarAttribute, renderAnimatedNumber, renderAnimatedTemplate } from "./v2-render-animation";

const ATTR_TIER_THRESHOLDS = [6, 12, 18] as const;
const RESEARCH_CHORE_SAN_DISCOUNT = [0, 1, 2, 3] as const;
const FUTURE_MONTH_LOOKAHEAD = 6;
const PENDING_PAGE_SIZE = 6;
const RESEARCH_PAGE_SIZE = 5;
const RELATIONSHIP_SLOT_UNLOCK_THRESHOLDS = [0, 0, 6, 12, 18] as const;
const DEFERRED_GAMEPLAY_ACTION_ATTRIBUTES = 'disabled aria-disabled="true" data-gameplay-status="deferred"';

function getSubmittablePaperCount(state: GameState): number {
  return state.papers.filter((paper) => paper.status === "draft" && getPaperSubmissionFailure(paper, "C") === null).length;
}

function getAvailablePromotionCount(state: GameState): number {
  if (state.phase !== "playing") return 0;
  return [...state.papers, ...state.externalPublications].filter((paper) => (
    paper.status === "published" && paper.nonFirstAuthor !== true && paper.publication
  )).reduce((count, paper) => {
    const promotions = paper.publication?.promotions ?? { arxiv: false, github: false, xiaohongshu: false, quantum: false };
    const ids: PaperPromotionId[] = (paper.journalTarget ?? paper.publication?.journalTarget)
      ? ["github", "xiaohongshu", "quantum"] as PaperPromotionId[]
      : ["arxiv", "github", "xiaohongshu"] as PaperPromotionId[];
    return count + ids.filter((id) => {
      if (promotions[id] === true) return false;
      if (id === "arxiv" && (paper.target === null || paper.conferenceHandled === true || (paper.publication?.monthsSincePublish ?? 0) >= 3)) return false;
      return state.player.san >= getPaperPromotionCost(id, state.buffs)
        && state.player.money >= getPaperPromotionMoneyCost(id);
    }).length;
  }, 0);
}

function getAvailableRelationshipActionCount(state: GameState): number {
  if (state.phase !== "playing" || isGameplayModuleLocked(state)) return 0;
  const advisorCost = Math.max(0, ADVISOR_TASK_SAN_COST + getActiveOperationSanDelta(state.buffs));
  const advisorAvailable = Boolean(state.selectedAdvisorName)
    && state.relationshipState.advisorCount > 0
    && state.advisorProgressState.lastHorizontalTotalMonths !== state.totalMonths
    && state.advisorProgressState.funding < ADVISOR_FUNDING_CAP
    && state.player.san >= advisorCost;
  const fellowAvailable = state.fellowProgressState.filter((profile) => (
    !profile.taskUsedThisMonth && state.player.san >= getFellowDiscussionSanCost(state, profile)
  )).length;
  const loverUsed = state.loverProgressState.taskUsedThisMonth
    || state.loverProgressState.lastDateTotalMonths === state.totalMonths;
  const loverAvailable = state.loverState.active
    && !loverUsed
    && (isDevelopmentPreEnrollmentPreview(state)
      || LOVER_ROUTES.some((route) => getLoverDateFailure(state, route) === null));
  return Number(advisorAvailable) + fellowAvailable + Number(loverAvailable);
}

function isGameplayModuleLocked(state: GameState): boolean {
  return isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT;
}

function isDevelopmentPreEnrollmentPreview(state: GameState): boolean {
  return isPreEnrollmentState(state) && SHOW_ALL_MODULES_DURING_DEVELOPMENT;
}

function getDeferredGameplayActionAttributes(state: GameState): string {
  return isPreEnrollmentState(state) && SHOW_ALL_MODULES_DURING_DEVELOPMENT
    ? "data-gameplay-status=\"deferred\""
    : DEFERRED_GAMEPLAY_ACTION_ATTRIBUTES;
}

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
  tagLabel?: string;
  ruleCard?: boolean;
  hideStatus?: boolean;
  description: string;
  detail?: string;
  requirement?: string;
  metrics?: Array<{ label: string; value: string; animation?: { template: string; values: Record<string, number>; displays?: Record<string, string> } }>;
  descriptionAnimation?: { template: string; values: Record<string, number> };
  rewardTable?: { label: string; columns: string[]; rows: string[][]; currentRow?: number };
  advisorSalaryPager?: { startIndex: number; lastStartIndex: number };
  loverRewardPager?: { page: number };
  rewardRules?: string[];
  progress?: { label: string; value: number; max: number; valueLabel: string; displayValue?: number; animateMax?: boolean };
};

type LogPage = {
  kind?: "ending";
  monthKey: number;
  label: string;
  entries: GameLogEntry[];
};

type TodoPreviewItem = {
  title: string;
  timeText: string;
  monthsLater: number;
  sortOrder: number;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function renderEventInlineHtml(value: string): string {
  return escapeHtml(normalizeGameDisplayText(value))
    .replace(/(^|\n)([^，。\n]+?)(?= · 讲师(?:\n|$))/gu, "$1<mark class=\"event-name-highlight\">$2</mark>")
    .replace(/(^|\n)(你叫)([^，。\n]+)(?=，)/gu, "$1$2<mark class=\"event-name-highlight\">$3</mark>")
    .replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value >= 0 ? `+${value}` : `${value}`;
}

function normalizeGameDisplayText(value: string): string {
  return value
    .replaceAll("领域年会", "年会")
    .replaceAll("金钱", "金币")
    .replace(/KTV\s*唱歌/gu, "KTV 唱歌");
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

function getDateDisplayMode(uiState: PlayRenderUiState): DateDisplayMode {
  return uiState.dateDisplayMode === "calendar" ? "calendar" : "academic";
}

function formatCalendarYear(year: number): string {
  return String(Math.max(0, Math.trunc(year)));
}

function formatGameDate(gameYear: number, gameMonth: number, mode: DateDisplayMode): string {
  if (gameMonth <= 0) return "入学前";
  if (mode === "calendar") {
    return `${formatCalendarYear(getAcademicCalendarYear(gameYear, gameMonth))}年${getAcademicCalendarMonth(gameMonth)}月`;
  }
  return `第${gameYear}年第${gameMonth}月`;
}

function getYearText(state: GameState, mode: DateDisplayMode): string {
  if (mode === "calendar") {
    return `${formatCalendarYear(getAcademicCalendarYear(state.year, state.month))}年`;
  }
  return `第${state.year}年`;
}

function getMonthText(state: GameState, mode: DateDisplayMode): string {
  if (isPreEnrollmentState(state)) return "入学前";
  return mode === "calendar" ? `${getAcademicCalendarMonth(state.month)}月` : `第${state.month}月`;
}

function getSeasonLabel(state: GameState): string | null {
  if (isPreEnrollmentState(state)) {
    return null;
  }

  const season = getSeasonByMonth(getAcademicMonth(state.totalMonths));
  if (season === "spring") return "春";
  if (season === "summer") return "夏";
  if (season === "autumn") return "秋";
  return "冬";
}

function getSeasonEffectText(state: GameState): string {
  const season = getSeasonByMonth(getAcademicMonth(state.totalMonths));
  if (season === "spring") return "春季：主动操作 SAN -1";
  if (season === "summer") return state.eventSupport.hasParasol ? "夏季：遮阳伞抵消主动操作 SAN +1" : "夏季：主动操作 SAN +1";
  if (season === "autumn") return "秋季：月初 SAN +1";
  return state.eventSupport.hasDownJacket ? "冬季：羽绒服抵消月初 SAN -1" : "冬季：月初 SAN -1";
}

function getRemainingMonthsText(state: GameState): string {
  const trainingLimit = getMonthLimitByDegree(state.degree);
  return `剩余${Math.max(0, trainingLimit - state.totalMonths)}月`;
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

function getAttrTierTooltip(kind: AttrTierId, value: number, illnessProbability = 0): string {
  const tier = getAttrTier(value);
  const currentChance = Math.round(getTierResistChance(value) * 100);
  if (kind === "san") {
    const monthEndChange = DISEASE_MONTH_END_CHANGE_BY_SAN_TIER[tier];
    const signedChange = monthEndChange >= 0 ? `+${monthEndChange}` : String(monthEndChange);
    return `当前疾病概率 ${illnessProbability}%｜月末结算 ${signedChange}%`;
  }
  if (kind === "research") {
    return `科研增减有${currentChance}%概率无效\n事件中科研杂活 SAN 减免 ${RESEARCH_CHORE_SAN_DISCOUNT[tier]}`;
  }
  const label = kind === "social" ? "社交" : "好感";
  return `${label}增减有${currentChance}%概率无效`;
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
  illnessProbability = 0,
): string {
  const fillStateClass = tierKind === "san"
    ? getAttrFillStateClass(value, cap, 5, 2)
    : getAttrFillStateClass(value, cap, 3, 1);
  const safePercent = cap > 0 ? ((value + (value > 0 ? 1 : 0)) / (cap + 1)) * 100 : 0;
  const progressClassName = `${fillClassName}${fillStateClass}${value > 0 ? " is-nonzero" : ""}`;

  return `
    <div
      class="new-attr-item attr-item-${tierKind}"
      data-player-stat="${tierKind}"
      data-stat-value="${value}"
      data-stat-cap="${cap}"
    >
      <div class="new-attr-header">
        <span class="new-attr-icon">${icon}</span>
        <span class="new-attr-name">${name}</span>
        <span class="new-attr-value">${value}/${cap}</span>
        <span
          class="new-attr-level attr-level-${tierKind}"
          tabindex="0"
          aria-label="${escapeHtml(`${getAttrTierName(tierKind, value)}，${getAttrTierTooltip(tierKind, value, illnessProbability)}`)}"
          data-tooltip="${escapeHtml(getAttrTierTooltip(tierKind, value, illnessProbability))}"
        >${getAttrTierName(tierKind, value)}</span>
      </div>
      <div class="new-attr-bar-row">
        ${renderProgressBar(progressClassName, safePercent)}
      </div>
    </div>
  `;
}

function renderEffectItems(items: EffectBucketItem[]): string {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => `
      <button
        type="button"
        class="effect-chip${item.isDebuff ? " is-debuff" : ""}"
        data-effect-id="${escapeHtml(item.id)}"
        data-effect-sources="${escapeHtml(JSON.stringify(item.sources))}"
        aria-pressed="false"
      >${escapeHtml(item.label)}</button>
    `)
    .join("");
}

function buildNextMonthEffectItems(state: GameState): EffectBucketItem[] {
  const hasMonthStartBuff = state.buffs.some((buff) => (
    buff.timing !== "next-action"
    && (buff.remainingMonths === null || buff.remainingMonths > 0)
    && buff.monthlyStats !== undefined
    && Object.keys(buff.monthlyStats).length > 0
  ));
  if (isPreEnrollmentState(state) && !hasMonthStartBuff) return [];
  const labels = { san: "SAN", research: "科研", social: "社交", favor: "好感", money: "金币" } as const;
  const resolution = previewNextMonthEffects(state);

  const items = (Object.keys(labels) as Array<keyof typeof labels>).flatMap((statId) => {
    const sources = resolution.items.flatMap((item) => {
      const value = item.stats[statId] ?? 0;
      if (!Object.hasOwn(item.stats, statId)) return [];
      const note = item.note ? `（${normalizeGameDisplayText(item.note)}）` : "";
      const displaySource = item.id === "base-san-recovery" || item.id === "debug-buff-base-recovery"
        ? "自然回复"
        : item.id === "advisor-salary" || item.id === "debug-buff-advisor-salary"
          ? `${state.degree === "phd" ? "博士" : "硕士"}工资`
          : normalizeGameDisplayText(item.source);
      const displayName = item.id === "base-san-recovery"
        || item.id === "debug-buff-base-recovery"
        || item.id === "advisor-salary"
        || item.id === "debug-buff-advisor-salary"
        ? "每月"
        : normalizeGameDisplayText(item.name);
      return [`${displaySource}：${displayName} ${formatSignedNumber(value)}${note}`];
    });
    const value = resolution.items.reduce((total, item) => total + (item.stats[statId] ?? 0), 0);
    const alwaysShow = statId === "san" || statId === "money";
    if (!alwaysShow && (sources.length === 0 || value === 0)) return [];
    return [{
      id: `next-month-${statId}`,
      label: `${labels[statId]} ${formatSignedNumber(value)}`,
      sources,
      isDebuff: value < 0,
    }];
  });
  if (state.loverState.active && state.loverProgressState.active
    && state.loverProgressState.sanDiscountMonths?.includes(state.totalMonths + 1)) {
    upsertBucketItem(items, "next-month-lover-play-discount", "主动操作 SAN消耗 -1", "恋人玩耍 · 下个月生效，持续1个月");
  }
  return items;
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

  if (!isPreEnrollmentState(state)) {
    const season = getSeasonByMonth(getAcademicMonth(state.totalMonths));
    if (season === "spring") {
      upsertBucketItem(monthly, "season", "主动操作 SAN-1", "春季");
    } else if (season === "summer") {
      if (state.eventSupport.hasParasol) {
        upsertBucketItem(monthly, "season", "夏季炎热已抵消", "遮阳伞");
      } else {
        upsertBucketItem(monthly, "season", "主动操作 SAN+1", "夏季", true);
      }
    }
  }

  if (experimentModifier.bonus > 0) {
    upsertBucketItem(permanent, "permanent", `实验 +${experimentModifier.bonus}分`, "显卡");
  }
  if (experimentModifier.extraActions > 0) {
    upsertBucketItem(permanent, "permanent", `实验 +${experimentModifier.extraActions}次`, "显卡");
  }
  if (writingModifier.bonus > 0) {
    upsertBucketItem(permanent, "permanent", `论文 +${writingModifier.bonus}分`, "机械键盘");
  }
  if (writingModifier.sanDiscount > 0) {
    upsertBucketItem(permanent, "permanent", `论文 SAN-${writingModifier.sanDiscount}`, "机械键盘");
  }
  if (readSanDiscount > 0) {
    upsertBucketItem(permanent, "permanent", `看论文 SAN-${readSanDiscount}`, "显示器");
  }
  if (coffeeBonus > 0) {
    upsertBucketItem(monthly, "monthly", `冰美式额外 SAN+${coffeeBonus}`, "咖啡机");
  }
  if (state.eventSupport.aiCostsCoveredUntilTotalMonths === state.totalMonths) {
    upsertBucketItem(monthly, "monthly", "AI 使用费 0 金币", "导师经费");
  }
  const entitlementCountText = (count: number) => count > 1 ? ` ×${count}` : "";
  if (state.shopState.entitlements.gpuTransaction > 0) {
    upsertBucketItem(
      single,
      "shop-free-gpu",
      `显卡下次购买/升级 0金币${entitlementCountText(state.shopState.entitlements.gpuTransaction)}`,
      "导师经费",
    );
  }
  const workstationEntitlements = [
    ["机械键盘购买", state.shopState.entitlements.keyboardPurchase],
    ["2K显示器购买", state.shopState.entitlements.monitorPurchase],
    ["办公椅购买", state.shopState.entitlements.chairPurchase],
    ["办公椅升级", state.shopState.entitlements.chairUpgrade],
    ["咖啡机购买", state.shopState.entitlements.coffeeMachinePurchase],
    ["咖啡机升级", state.shopState.entitlements.coffeeMachineUpgrade],
  ] as const;
  const workstationLabels = workstationEntitlements
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}${entitlementCountText(count)}`);
  if (workstationLabels.length > 0) {
    upsertBucketItem(single, "shop-free-workstation", `${workstationLabels.join("、")} 0金币`, "导师经费");
  }
  const buffBuckets = buildBuffDisplayBuckets(state.buffs);
  for (const [timing, target] of [["permanent", permanent], ["monthly", monthly], ["next-action", single]] as const) {
    const buffs = getActiveBuffs(state.buffs).filter((buff) => buff.timing === timing && buff.activeOperationSanDelta !== undefined);
    const delta = getActiveOperationSanDelta(buffs);
    if (delta === 0) continue;
    for (const buff of buffs) {
      const duration = timing === "permanent" ? "永久" : timing === "next-action" ? "对应效果触发后消耗"
        : buff.remainingMonths === null ? "持续生效" : `剩余 ${buff.remainingMonths} 月`;
      upsertBucketItem(target, `${timing}:rule:active-operation-san-delta`, `主动操作 SAN消耗 ${formatSignedNumber(delta)}`,
        `${buff.source} · ${duration}${buff.description?.trim() ? `：${buff.description.trim()}` : ""}`, delta > 0);
    }
  }
  const permanentBuffItems = buffBuckets.permanent.filter((item) => (
    !((item.id === "permanent:monthly-stat:san" || item.id === "permanent:monthly-stat:money")
      && !item.isDebuff)
  ));
  for (const [target, items] of [
    [permanent, permanentBuffItems],
    [monthly, buffBuckets.monthly],
    [single, buffBuckets.nextAction],
  ] as const) {
    for (const item of items) {
      for (const source of item.sources) {
        upsertBucketItem(target, item.id, item.label, source, item.isDebuff);
      }
    }
  }

  return {
    permanent,
    monthly,
    single,
    nextMonth: buildNextMonthEffectItems(state),
  };
}

function renderLeftRail(state: GameState): string {
  const researchCap = getResearchCap(state.researchCapacityState);
  const effectBuckets = buildEffectBuckets(state);
  const role = getRoleDefinition(state.selectedRoleId);
  const playerName = state.playerName?.trim() || getPendingStudentName(state);
  const displayName = playerName ? `${role.name}：${playerName}` : role.name;

  return `
    <aside class="play-left-rail new-left-container">
      <div class="new-attr-panel" id="new-attr-panel">
        ${renderAttrItem("🧠", "SAN值", state.player.san, state.sanCap, "san", "san", state.illnessProbability)}
        ${renderAttrItem("💡", "科研能力", state.player.research, Math.max(researchCap, 20), "research", "research")}
        ${renderAttrItem("🤝", "社交能力", state.player.social, 20, "social", "social")}
        ${renderAttrItem("👨‍🏫", "导师好感", state.player.favor, 20, "favor", "favor")}
        <div class="new-attr-item new-currency-item" data-player-stat="money" data-stat-value="${state.player.money}" aria-label="${escapeHtml(`${displayName}，金币 ${state.player.money}`)}">
          <div class="new-attr-header new-identity-money-header">
            <span class="new-player-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
            <span class="new-currency-value"><span class="new-currency-icon" aria-hidden="true">💰</span>${state.player.money}</span>
          </div>
        </div>
      </div>

      <div class="new-effect-panel" id="new-effect-panel">
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
            <div class="new-effect-subtitle">下个月初</div>
            <div class="new-effect-list" id="new-next-month-effect-list">${renderEffectItems(effectBuckets.nextMonth)}</div>
          </div>
        </div>
        <div class="new-effect-section" id="new-effect-section-source">
          <div class="new-effect-subtitle">效果来源</div>
          <div class="new-effect-source-box" id="new-effect-source-box"></div>
        </div>
      </div>
    </aside>
  `;
}

function getEventDeadlineTone(state: GameState, event: GameState["eventQueue"][number]): "blocking" | "pending" {
  return isEventBlocking(state, event)
    ? "blocking" : "pending";
}

function getFutureOccurrenceText(monthsLater: number): string {
  return `${Math.max(1, monthsLater)}月后 发生`;
}

function getEventRootTitle(title: string): string {
  return normalizeGameDisplayText(title.split("➜")[0]?.trim() || title.trim());
}

export function buildFutureTodoPreviewItems(state: GameState): TodoPreviewItem[] {
  const items: TodoPreviewItem[] = [];
  const reviewingPapers = state.papers.filter((paper) => paper.status === "reviewing" && paper.reviewMonthsLeft > 0);
  let sortOrder = 0;

  const addItem = (params: {
    title: string;
    monthsLater: number;
  }): void => {
    items.push({
      title: params.title,
      timeText: getFutureOccurrenceText(params.monthsLater),
      monthsLater: params.monthsLater,
      sortOrder,
    });
    sortOrder += 1;
  };

  for (let monthsLater = 1; monthsLater <= FUTURE_MONTH_LOOKAHEAD; monthsLater += 1) {
    const nextTotalMonths = state.totalMonths + monthsLater;
    if (nextTotalMonths > state.maxMonths) {
      continue;
    }

    for (const paper of reviewingPapers) {
      if (paper.reviewMonthsLeft === monthsLater) {
        addItem({ title: "论文结果", monthsLater });
      }
    }

    const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
    if (calendar.month === 5) {
      addItem({
        title: "寒假",
        monthsLater,
      });
    }
    if (calendar.month === 9) {
      addItem({
        title: "年会",
        monthsLater,
      });
    }
    if (calendar.month === 11) {
      addItem({
        title: "暑假",
        monthsLater,
      });
    }
    if (calendar.month === 1) {
      addItem({
        title: "教师节",
        monthsLater,
      });
    }
    if (calendar.month === 2 && calendar.year >= 2) {
      addItem({
        title: "国奖评选",
        monthsLater,
      });
    }
    if (state.degree === "master" && calendar.month === 10 && (calendar.year === 2 || calendar.year === 3)) {
      addItem({
        title: "转博抉择",
        monthsLater,
      });
    }
    if (calendar.month === 11) {
      addItem({
        title: "学年总结",
        monthsLater,
      });
    }
    if (state.degree === "phd" && state.phdStartYear === calendar.year && calendar.month === 1) {
      addItem({
        title: "指导新生",
        monthsLater,
      });
    }
  }

  return items;
}

function renderEventDescriptionHtml(description: string, mergeNarrative = true): string {
  const normalized = description.trim();
  if (!normalized) {
    return "<p>请点击下方按钮继续。</p>";
  }

  const paragraphs = normalized
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  // A few older multi-stage events used a descriptive settlement heading.
  // Treat it exactly like the shared marker so their result rows keep the
  // same compact presentation and the marker itself stays hidden.
  const settlementIndex = paragraphs.findIndex((paragraph) => /^(?:机制结算|本次活动结果)(?:\r?\n|$)/u.test(paragraph));
  const storyParagraphs = settlementIndex === -1
    ? paragraphs
    : paragraphs.slice(0, settlementIndex);
  const settlementItems = settlementIndex === -1
    ? []
    : paragraphs
        .slice(settlementIndex)
        .flatMap((paragraph) => paragraph.split(/\r?\n/u))
        .map((line) => line.trim().replace(/[。.]+$/u, ""))
        .filter((line) => line && line !== "机制结算" && line !== "本次活动结果");
  const storyBlocks: { paragraphs: string[]; isNarrative: boolean }[] = [];
  for (const paragraph of storyParagraphs) {
    const isNarrative = !/^(?:备注|小提示)：/u.test(paragraph) && !paragraph.includes("\n")
      && paragraph.length <= 160 && !/^-{3,}$/u.test(paragraph)
      && !/^(?:规则|条件|判定|培养安排|工资|待遇|毕业|转博|转博士|科研分|送审|录用|发表|会议)[：:]/u.test(paragraph);
    const previous = storyBlocks.at(-1);
    if (mergeNarrative && isNarrative && previous?.isNarrative && previous.paragraphs.join("").length + paragraph.length <= 260) {
      previous.paragraphs.push(paragraph);
    } else {
      storyBlocks.push({ paragraphs: [paragraph], isNarrative });
    }
  }
  const storyHtml = storyBlocks
    .map(({ paragraphs: blockParagraphs, isNarrative }) => {
      const paragraph = blockParagraphs.join("");
      if (/^-{3,}$/u.test(paragraph)) {
        return '<hr class="event-description-divider" role="separator">';
      }
      const isTip = /^(?:备注|小提示)：/u.test(paragraph);
      const displayText = paragraph.replace(/^备注：/u, "小提示：");
      const className = isTip ? ' class="event-description-note"' : isNarrative ? ' class="event-description-story"' : "";
      return `<p${className}>${isTip ? '<span aria-hidden="true">💡</span> ' : ""}${renderEventInlineHtml(displayText)}</p>`;
    })
    .join("");
  const settlementHtml = renderEventSettlementSummary(settlementItems);

  return `${storyHtml}${settlementHtml}`;
}

function isEventSettlementCondition(value: string): boolean {
  if (/[<>≥≤]/u.test(value) || /第\s*\d+\s*档/u.test(value)) return true;
  return /^(?:达到科研分门槛|获胜|落败|无本金|押注|导师请客|AA 聚餐|重装成功|重装失败|维修成功|维修翻车|导师到场|导师缺席|有熟悉的|暂无熟悉的|获得审稿灵感|未获得审稿灵感|对方选择留组|对方毕业离组|互挂成功|互挂未成|没有后续波澜|转而专注自身研究)/u.test(value);
}

function splitEventSettlementItems(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "（" || character === "(") depth += 1;
    if (character === "）" || character === ")") depth = Math.max(0, depth - 1);
    const separatesEffect = character === "，"
      && /^(?:SAN|金币|导师好感|好感|科研|社交|生病概率|下次|永久|新增|休息|每月|每年|未来引用|论文进度|所有未投稿)/u.test(text.slice(index + 1).trimStart());
    if (depth === 0 && (character === "｜" || character === "；" || separatesEffect)) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim().replace(/[。.]+$/u, "")).filter(Boolean);
}

function splitEventSettlementRows(items: string[]): { conditions: string[]; results: string[] } {
  const conditions: string[] = [];
  const results: string[] = [];
  const addResults = (values: string[]): void => {
    results.push(...values.filter((value) => !/^(?:无事发生|无变化|没有额外数值变化|(?:SAN|金币|导师好感|社交|科研)\s*(?:\+?0|未变化))$/u.test(value)));
  };

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    if (normalized.startsWith("条件：")) {
      conditions.push(...splitEventSettlementItems(normalized.slice(3)));
      continue;
    }
    if (normalized.startsWith("结果：")) {
      addResults(splitEventSettlementItems(normalized.slice(3)));
      continue;
    }

    for (const part of splitEventSettlementItems(normalized)) {
      if (isEventSettlementCondition(part)) {
        conditions.push(part);
      } else {
        addResults([part]);
      }
    }
  }

  return { conditions, results };
}

function renderEventSettlementValues(values: string[]): string {
  return values
    .map((value) => `<span class="event-settlement-item">${escapeHtml(normalizeGameDisplayText(value).replace(/[。.]+$/u, ""))}</span>`)
    .join('<span class="event-settlement-divider" aria-hidden="true">|</span>');
}

function renderEventSettlementSummary(items: string[]): string {
  if (items.length === 0) return "";
  const rows = splitEventSettlementRows(items);
  if (rows.conditions.length === 0 && rows.results.length === 0) return "";
  const renderRow = (label: "条件" | "结果", values: string[]): string => values.length === 0
    ? ""
    : `
      <div class="event-settlement-row is-${label === "条件" ? "condition" : "result"}">
        <span class="event-settlement-label">${label}</span>
        <span class="event-settlement-values">${renderEventSettlementValues(values)}</span>
      </div>
    `;

  return `<div class="event-settlement-summary">${renderRow("条件", rows.conditions)}${renderRow("结果", rows.results)}</div>`;
}

function formatPaperReviewDecision(report: PaperReviewerReport): string {
  if (report.decision === "Accept") return "接收";
  if (report.decision === "Borderline") return "边缘";
  return "拒稿";
}

function getPaperReviewImprovementText(report: PaperReviewerReport): string {
  const improvements = [
    ...(report.improvements?.idea ? [`idea +${report.improvements.idea}`] : []),
    ...(report.improvements?.experiment ? [`实验 +${report.improvements.experiment}`] : []),
    ...(report.improvements?.writing ? [`写作 +${report.improvements.writing}`] : []),
    ...(report.improvementAction && report.improvementAmount
      ? [`${report.improvementAction === "idea" ? "idea" : report.improvementAction === "experiment" ? "实验" : "写作"} +${report.improvementAmount}`]
      : []),
  ];
  return improvements.join(" · ");
}

function renderPaperReviewEvent(presentation: PaperReviewEventPresentation, settled = false): string {
  const venue = presentation.conferenceName
    ? `${presentation.conferenceName}${presentation.conferenceYear ?? ""}` : "会议评审";
  const heading = `
    <header class="paper-review-event-heading">
      <span class="paper-review-venue">${escapeHtml(venue)}</span>
      <strong>${escapeHtml(presentation.paperTitle)}</strong>
    </header>`;
  if (presentation.kind === "overview") {
    return `
      <section class="paper-review-event is-overview">
        ${heading}
        <p class="paper-review-intro">📬 等待三个月，审稿结果终于到了</p>
        <div class="paper-review-overview-grid">
          <span><small>会议等级</small><strong>${presentation.target}类</strong></span>
          <span><small>投稿总分</small><strong>${presentation.submittedScore}</strong></span>
          <span><small>影响力</small><strong>×${presentation.venueInfluence.toFixed(2)}</strong></span>
          <span><small>审稿标准</small><strong>×${presentation.reviewStrictnessMultiplier.toFixed(2)}</strong></span>
        </div>
        <p class="paper-review-event-footnote">投稿时的分数决定本轮评审，先读读三位审稿人的意见</p>
      </section>
    `;
  }

  if (presentation.kind === "reviewers") {
    return `
      <section class="paper-review-event is-reviewers">
        ${heading}
        <div class="paper-reviewer-grid">
          ${presentation.reports.map((report, index) => {
            const improvement = getPaperReviewImprovementText(report);
            const tone = report.decision === "Accept" ? "accept" : report.decision === "Borderline" ? "borderline" : "reject";
            return `
              <article class="paper-reviewer-card is-${tone}">
                <div class="paper-reviewer-card-head">
                  <span class="paper-reviewer-number">R${index + 1}</span>
                  <h3>${escapeHtml(report.reviewer)}</h3>
                </div>
                <div class="paper-reviewer-verdict">
                  <strong>${escapeHtml(formatPaperReviewDecision(report))} ${report.reviewScore === 0 ? "0" : formatSignedNumber(report.reviewScore)}</strong>
                  <span>有效分 <b>${report.effectiveScore}</b></span>
                </div>
                <p class="paper-reviewer-comment">${escapeHtml(report.comment ?? "未留下具体意见")}</p>
                <div class="paper-reviewer-meta">
                  ${improvement ? `<div><span>拒稿后修改</span><strong>${escapeHtml(improvement)}</strong></div>` : ""}
                  ${report.sanChange ? `<div><span>审稿影响</span><strong>SAN${formatSignedNumber(report.sanChange)}</strong></div>` : ""}
                  ${!improvement && !report.sanChange ? "<div><span>无额外影响</span></div>" : ""}
                </div>
              </article>
            `;
          }).join("")}
        </div>
        <p class="paper-review-event-footnote">接收+1 · 边缘0 · 拒稿−1，三人总评交由PC判定；修改加分仅在最终拒稿时生效</p>
      </section>
    `;
  }

  const resultItems = presentation.rewardText.split("；").map((item) => item.trim()).filter(Boolean);
  return `
    <section class="paper-review-event is-decision ${presentation.accepted ? "is-accepted" : "is-rejected"}">
      ${heading}
      <div class="paper-review-decision-head">
        <div>
          <span>PC 最终决定</span>
          <strong>${presentation.accepted
            ? `🎉 接收 · ${escapeHtml(presentation.acceptType ?? "Poster")}`
            : "📨 本轮未录用"}</strong>
        </div>
        <div class="paper-review-total-score">
          <small>总评</small>
          <strong>${presentation.totalReviewScore === 0 ? "0" : formatSignedNumber(presentation.totalReviewScore)}</strong>
        </div>
      </div>
      <div class="paper-review-votes">
        ${(presentation.reports ?? []).map((report, index) => `<span class="is-${report.decision.toLowerCase()}">R${index + 1} <b>${report.reviewScore === 0 ? "0" : formatSignedNumber(report.reviewScore)}</b></span>`).join("")}
        <span class="paper-review-decision-rule">${presentation.borderlineChance === null
          ? presentation.accepted ? "总评≥+2，直接接收" : "总评≤−2，直接拒稿"
          : `边缘录用概率 ${(presentation.borderlineChance * 100).toFixed(1)}%`}</span>
      </div>
      <section class="paper-review-settlement">
        <h3>${settled ? "结算记录" : "本次结算"}</h3>
        <div class="paper-review-result-strip">${resultItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      </section>
      <p class="paper-review-event-footnote">${settled
        ? presentation.accepted ? "论文已移入成果" : "论文已退回草稿，修改后可以再次投稿"
        : presentation.accepted ? "确认后论文移入成果" : "确认后论文退回草稿，应用修改反馈，拒稿次数+1"}</p>
    </section>
  `;
}

function getEventSceneLabel(title: string): string {
  const titleParts = title.split("➜").map((part) => part.trim()).filter(Boolean);
  if (titleParts.length > 1) {
    const label = titleParts[titleParts.length - 1] ?? title;
    return label === "结果" ? "处理结果" : normalizeGameDisplayText(label);
  }
  return title === "结果" ? "处理结果" : normalizeGameDisplayText(title);
}

function isSecondaryEventChoice(choice: { id: string; cosmetic?: boolean }): boolean {
  return choice.cosmetic === true || choice.id === "before-grad-school-reroll-name" || choice.id === "before-grad-school-reroll";
}

function renderEventContentBox(
  currentEvent: GameState["eventQueue"][number] | null,
  completedEvent: GameState["eventHistory"][number] | null,
  activeHistoryIndex: number | null,
): string {
  if (!currentEvent && !completedEvent) {
    return `
      <div class="event-content-box" id="event-content-box" hidden>
        <div class="event-content-header">
          <span class="event-content-title">事件详情</span>
          <button class="event-content-close" type="button" data-ui-close-event-content aria-label="关闭事件详情">×</button>
        </div>
      </div>
    `;
  }

  const isCompleted = completedEvent !== null;
  const completedStages = completedEvent?.stages ?? [];
  const history = currentEvent?.history ?? [];
  const currentPageIndex = isCompleted ? Math.max(0, completedStages.length - 1) : history.length;
  const displayPageIndex = activeHistoryIndex === null
    ? currentPageIndex
    : Math.max(0, Math.min(activeHistoryIndex, currentPageIndex));
  const historicalPage = isCompleted
    ? (completedStages[displayPageIndex] ?? completedStages[completedStages.length - 1] ?? null)
    : (displayPageIndex < currentPageIndex ? history[displayPageIndex] : null);
  const displayEvent = historicalPage ?? currentEvent;
  if (!displayEvent) return "";
  const paperReviewPresentation = displayEvent.paperReviewPresentation;
  const currentEventId = currentEvent?.id ?? "";
  const selectedChoiceId = historicalPage?.selectedChoiceId ?? null;
  const sceneTabs = isCompleted
    ? completedStages.map((page, index) => ({
      index,
      label: getEventSceneLabel(page.title),
    }))
    : [
      ...history.map((page, index) => ({
        index,
        label: getEventSceneLabel(page.title),
      })),
      {
        index: currentPageIndex,
        label: getEventSceneLabel(currentEvent?.title ?? displayEvent.title),
      },
    ];

  return `
    <div class="event-content-box${paperReviewPresentation ? " is-paper-review-result" : ""}" id="event-content-box">
      <div class="event-content-header">
        <div class="event-scene-tabs" aria-label="${escapeHtml(displayEvent.title)}事件幕次">
          ${sceneTabs.map((scene, index) => `
            <button
              class="event-scene-tab${scene.index === displayPageIndex ? " is-active" : ""}"
              type="button"
              data-ui-event-scene-index="${scene.index}"
              aria-current="${scene.index === displayPageIndex ? "step" : "false"}"
              title="${escapeHtml(scene.label)}"
            >${escapeHtml(scene.label)}</button>
            ${index < sceneTabs.length - 1
              ? '<i class="event-scene-separator" data-lucide="chevron-right" aria-hidden="true"></i>'
              : ""}
          `).join("")}
        </div>
        <button class="event-content-close" type="button" data-ui-close-event-content aria-label="关闭事件详情">×</button>
      </div>
      <div class="event-content-body" id="event-content-body">
        ${paperReviewPresentation
          ? renderPaperReviewEvent(paperReviewPresentation, historicalPage !== null)
          : renderEventDescriptionHtml(displayEvent.description, displayEvent.choices.filter((choice) => !isSecondaryEventChoice(choice)).length <= 1)}
      </div>
      ${displayEvent.choices.length > 0 ? `
        <div class="event-content-buttons${displayEvent.choices.every((choice) => choice.fellowCandidate) ? " event-candidate-grid" : ""}" id="event-content-buttons">
          ${displayEvent.choices.map((choice) => {
            const disabledReason = choice.disabledReason?.trim() ?? "";
            const secondary = isSecondaryEventChoice(choice);
            const isDisabled = historicalPage !== null || disabledReason !== "";
            const titleAttribute = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : "";
            const buttonAttributes = isDisabled
              ? `disabled aria-disabled="true"${titleAttribute}`
              : `data-action="resolve-event" data-event-id="${escapeHtml(currentEventId)}" data-event-choice-id="${escapeHtml(choice.id)}"`;
            return `
              <button
                class="event-choice-btn event-action-btn${choice.fellowCandidate ? " event-candidate-card" : ""}${choice.id === selectedChoiceId ? " is-selected" : ""}"
                type="button"
                ${secondary ? "data-event-secondary" : ""}
                ${buttonAttributes}
              ><span>${escapeHtml(normalizeGameDisplayText(choice.label))}</span>${choice.fellowCandidate ? `
                <span class="event-candidate-stats">科研能力 <strong>${choice.fellowCandidate.research}</strong> /20<br>默契度 <strong>${choice.fellowCandidate.affinity}</strong> /20</span>
                <span class="event-candidate-description">${escapeHtml(choice.fellowCandidate.description)}</span>
              ` : ""}${choice.id === selectedChoiceId ? '<i data-lucide="check" aria-label="已选择"></i>' : ""}</button>
            `;
          }).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

export function renderEventLayoutSamples(
  currentEvent: GameState["eventQueue"][number] | null,
  completedEvent: GameState["eventHistory"][number] | null,
  state?: GameState,
): EventLayoutSample[] {
  if (completedEvent) {
    return completedEvent.stages.map((_, index) => ({ key: `history:${index}`, html: renderEventContentBox(null, completedEvent, index) }));
  }
  if (!currentEvent) return [];
  const samples = (currentEvent.history ?? []).map((_, index) => ({ key: `history:${index}`, html: renderEventContentBox(currentEvent, null, index) }));
  const seen = new Set<PendingEvent>();
  const visit = (event: PendingEvent, history: NonNullable<PendingEvent["history"]>, branch = ""): void => {
    if (seen.has(event)) return;
    seen.add(event);
    samples.push({ key: `${event.id}:${history.map((stage) => stage.selectedChoiceId).join("/")}:${branch}`,
      html: renderEventContentBox({ ...event, history, queueOrder: currentEvent.queueOrder }, null, null) });
    const stage = { title: event.title, description: event.description, choices: event.choices,
      paperReviewPresentation: event.paperReviewPresentation, selectedChoiceId: "" };
    for (const choice of event.choices) {
      const queued = [
        ...(choice.effects.enqueueEvents ?? []),
        ...(state && choice.effects.fixedEventResolution
          ? getTeachersDayResultPreviews(state, choice.effects.fixedEventResolution) : []),
      ];
      queued.forEach((next, index) => {
        if (next.chainId === currentEvent.chainId) {
          visit(next, [...history, { ...stage, selectedChoiceId: choice.id }], queued.filter((entry) => entry.id === next.id).length > 1 ? String(index) : "");
        }
      });
    }
  };
  visit(currentEvent, currentEvent.history ?? []);
  return samples;
}

type PaperDisplayStatus = "draft" | "ready" | "reviewing" | "journal-reviewing" | "published";

function getPaperDisplayStatus(paper: Paper): PaperDisplayStatus {
  if (paper.status === "reviewing") return "reviewing";
  if (paper.status === "journal-reviewing") return "journal-reviewing";
  if (paper.status === "published") return "published";
  return paper.idea > 0 && paper.experiment > 0 && paper.writing > 0 ? "ready" : "draft";
}

function getPaperStatusBadgeText(paper: Paper): string {
  const status = getPaperDisplayStatus(paper);
  if (status === "reviewing") return "审稿中";
  if (status === "journal-reviewing") {
    return paper.journalTarget ? `${getJournalDefinition(paper.journalTarget).name} 修改中` : "期刊修改中";
  }
  if (status === "published") {
    return paper.publication?.journalTarget
      ? `${getJournalDefinition(paper.publication.journalTarget).name} · 已发表`
      : `${paper.target ?? "成果"} 类 · 已发表`;
  }
  if (status === "ready") return "可投稿";
  if (paper.idea <= 0) return "待想 idea";
  if (paper.experiment <= 0) return "待做实验";
  return "待写论文";
}

function getPaperReviewConference(paper: Paper) {
  const submittedMonth = typeof paper.submittedMonth === "number" ? paper.submittedMonth : null;
  const submittedYear = typeof paper.submittedYear === "number" ? paper.submittedYear : null;
  return submittedMonth !== null && submittedYear !== null && paper.target
    ? getConferenceInfo(submittedMonth, paper.target, submittedYear)
    : null;
}

function renderPaperReviewHeader(state: GameState, paper: Paper): string {
  if (paper.status !== "reviewing") return "";
  const conference = getPaperReviewConference(paper);
  const conferenceText = conference && paper.target
    ? `${paper.target}类 · ${conference.name}审稿中`
    : `${paper.target ?? "待定"} 类审稿中`;
  return `
    <div class="paper-card-header paper-review-card-header">
      <div class="paper-card-header-main">
        <span class="paper-card-status is-reviewing">${escapeHtml(conferenceText)}</span>
        <span class="paper-review-remaining">剩余 ${renderAnimatedNumber(`paper:${paper.id}:workstation:review-months`, paper.reviewMonthsLeft)} 月</span>
        ${renderPaperParticipants(state, paper)}
      </div>
      <div class="paper-card-header-actions">${renderPaperReviewAction(paper)}</div>
    </div>
  `;
}

function getJournalRevisionMonths(state: Pick<GameState, "year" | "month">, paper: Paper): number {
  if (typeof paper.submittedYear !== "number" || typeof paper.submittedMonth !== "number") return 0;
  const currentMonthIndex = state.year * 12 + state.month;
  const submittedMonthIndex = paper.submittedYear * 12 + paper.submittedMonth;
  return Math.max(0, currentMonthIndex - submittedMonthIndex);
}

function renderPaperJournalHeader(state: GameState, paper: Paper, selected: boolean): string {
  if (paper.status !== "journal-reviewing" || !paper.journalTarget) return "";
  const journal = getJournalDefinition(paper.journalTarget);
  const score = getJournalRevisionScore(paper);
  const revisedMonths = getJournalRevisionMonths(state, paper);
  return `
    <div class="paper-card-header paper-review-card-header">
      <div class="paper-card-header-main">
        ${renderPaperSelectionToggle(paper, selected, "期刊论文")}
        <span class="paper-card-status is-journal-reviewing">${escapeHtml(journal.name)} 修改中</span>
        <span class="paper-review-remaining">已修改 ${renderAnimatedNumber(`paper:${paper.id}:workstation:revision-months`, revisedMonths)} 月 · <span class="paper-journal-score" aria-label="期刊修改分数 ${score}/${journal.acceptanceScore}">${renderAnimatedNumber(`paper:${paper.id}:workstation:journal-score`, score)}/${journal.acceptanceScore}</span></span>
        ${renderPaperParticipants(state, paper)}
      </div>
      <div class="paper-card-header-actions">${renderPaperReviewAction(paper)}</div>
    </div>
  `;
}

function getPaperTotalScore(paper: Paper): number {
  return paper.idea + paper.experiment + paper.writing;
}

function formatPaperDecayRate(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

function renderPaperHistoryBadges(paper: Paper, showParticipation = false, view = "workstation"): string {
  const participated = paper.nonFirstAuthor === true || paper.collaborators?.some((person) => person.id === "player");
  const rejectionCount = paper.rejectionCount ?? 0;
  return `${showParticipation && participated ? '<span class="paper-history-badge paper-participation-badge" title="你已参与这篇论文" aria-label="你已参与这篇论文">✅</span>' : ""}${rejectionCount > 0 ? `<span class="paper-history-badge paper-rejection-badge" title="已被拒稿 ${rejectionCount} 次" aria-label="已被拒稿 ${rejectionCount} 次">rej×${renderAnimatedNumber(`paper:${paper.id}:${view}:rejections`, rejectionCount)}</span>` : ""}`;
}

function renderPaperTopicMeta(paper: Paper, showTooltip = true, showParticipation = false): string {
  const heatTier = getPaperHeatTier(paper.heatMultiplier);
  const decayText = paper.status === "journal-reviewing"
    ? "送审后不衰减"
    : `发表前衰减 ${formatPaperDecayRate(paper.prepublicationDecayRate)}/月`;
  return `
    <span class="paper-topic-meta">
      <span class="paper-topic-tag">${escapeHtml(paper.topicLabel)}</span>
      <span
        class="paper-heat-badge is-${heatTier}"
        ${showTooltip ? `title="${escapeHtml(`${decayText} · 引用倍率 ×${paper.heatMultiplier.toFixed(2)}`)}"` : ""}
      >热度 ×${renderAnimatedNumber(`paper:${paper.id}:${showParticipation ? "fellow" : "workstation"}:heat`, paper.heatMultiplier, paper.heatMultiplier.toFixed(2))}</span>
      ${renderPaperHistoryBadges(paper, showParticipation, showParticipation ? "fellow" : "workstation")}
    </span>
  `;
}

function renderPaperTitleWithMeta(paper: Paper, trailingAction = ""): string {
  return `
    <div class="paper-title-meta-row${trailingAction ? " has-trailing-action" : ""}">
      <div class="paper-title-meta-content">
        <strong class="paper-title">${escapeHtml(paper.title)}</strong>
        ${renderPaperTopicMeta(paper)}
      </div>
      ${trailingAction}
    </div>
  `;
}

function renderPaperSelectionToggle(paper: Paper, selected: boolean, label: string): string {
  return `
    <span
      class="paper-select-toggle"
      aria-hidden="true"
      data-paper-selection-label="${escapeHtml(`${selected ? "当前" : "选择"}${label}：${paper.title}`)}"
    ><span class="paper-select-check${selected ? " is-selected" : ""}">${selected ? '<i data-lucide="check"></i>' : ""}</span></span>
  `;
}

function renderPaperDraftActions(paper: Paper, canReroll: boolean): string {
  return `
    <div class="paper-card-header-actions paper-draft-actions">
      <button
        class="paper-draft-action-btn is-reroll"
        data-card-icon-action
        type="button"
        ${canReroll
          ? `data-action="reroll-paper-topic" data-paper-id="${escapeHtml(paper.id)}"`
          : 'disabled aria-disabled="true"'}
        aria-label="换个选题"
        title="${canReroll ? "换个选题" : "论文已有进度，不能更换选题"}"
      ><span aria-hidden="true">🎲</span></button>
      <button class="paper-draft-action-btn is-discard" data-card-icon-action type="button" aria-label="丢弃论文" title="丢弃论文" data-action="discard-paper" data-paper-id="${escapeHtml(paper.id)}"><span aria-hidden="true">🗑️</span></button>
    </div>
  `;
}

function renderPaperStats(paper: Paper): string {
  const idea = getPaperScoreBreakdown(paper, "idea");
  const experiment = getPaperScoreBreakdown(paper, "experiment");
  const writing = getPaperScoreBreakdown(paper, "writing");
  const total = idea.total + experiment.total + writing.total;
  const collaborationScores = [idea.collaboration, experiment.collaboration, writing.collaboration];
  return `
    <div class="paper-score-breakdown">
      <div class="paper-score-strip" aria-label="自身分：idea ${idea.own}，实验 ${experiment.own}，写作 ${writing.own}，总分 ${total}">
        <span><small>idea</small><strong ${animationNumberAttributes(`paper:${paper.id}:workstation:idea:own`, idea.own)}>${idea.own}</strong></span>
        <span><small>实验</small><strong ${animationNumberAttributes(`paper:${paper.id}:workstation:experiment:own`, experiment.own)}>${experiment.own}</strong></span>
        <span><small>写作</small><strong ${animationNumberAttributes(`paper:${paper.id}:workstation:writing:own`, writing.own)}>${writing.own}</strong></span>
        <span class="paper-score-total"><small>总分</small><strong ${animationNumberAttributes(`paper:${paper.id}:workstation:total`, total)}>${total}</strong></span>
      </div>
      <div class="paper-collaboration-score-strip" aria-label="协作分：idea ${idea.collaboration}，实验 ${experiment.collaboration}，写作 ${writing.collaboration}">
        ${collaborationScores.map((score, index) => `<span><small>协作</small><strong ${animationNumberAttributes(`paper:${paper.id}:workstation:${["idea", "experiment", "writing"][index]}:collaboration`, score)}>${score}</strong></span>`).join("")}
      </div>
    </div>
  `;
}

function renderPaperParticipants(state: GameState, paper: Paper): string {
  const leadAuthor = paper.leadAuthorId
    ? { id: paper.leadAuthorId, name: paper.leadAuthorName?.trim() || getFellowName({ id: paper.leadAuthorId }) }
    : { id: "player", name: state.playerName?.trim() || getPendingStudentName(state) || "你" };
  const collaborators = (paper.collaborators ?? []).filter((collaborator) => collaborator.name.trim() && collaborator.id !== leadAuthor.id);
  const participants = [leadAuthor, ...collaborators];
  const avatars = participants.map((participant, index) => {
    const name = participant.name.trim();
    const initial = [...name][0]!.toUpperCase();
    const color = `hsl(${getStableNameSeed(participant.id) % 360} 62% 42%)`;
    const label = `${participant.id === "player" && name !== "你" ? `${name}（你）` : name}${paper.leadAuthorId ? index === 0 ? " · 第一作者" : " · 协作者" : ""}`;
    return `<span class="paper-collaborator-avatar"${participant.id === "player" ? ' data-player-avatar="true"' : ""} style="--collaborator-color:${color}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(initial)}</span>`;
  }).join("");
  return `
    <div class="paper-collaborators" aria-label="论文参与者">
      <div class="paper-collaborator-list">${avatars}</div>
    </div>
  `;
}

function getWorkstationPaperByPanelIndex(state: GameState, panelIndex: number): Paper | null {
  if (panelIndex < 0 || panelIndex >= PAPER_SLOT_RESEARCH_THRESHOLDS.length) {
    return null;
  }
  return getWorkstationPaperSlotMap(state.papers).get(panelIndex) ?? null;
}

function renderPaperReviewAction(paper: Paper): string {
  if (paper.status === "reviewing" || paper.status === "journal-reviewing") {
    return `<button class="paper-withdraw-btn" data-card-icon-action type="button" title="撤稿" aria-label="撤稿" data-action="withdraw-paper" data-paper-id="${escapeHtml(paper.id)}"><span aria-hidden="true">📥</span></button>`;
  }
  return "";
}

function renderPaperPublishedSummary(paper: Paper): string {
  if (paper.status === "published") {
    return `<div class="paper-published-summary"><span>录用 ${getAcceptedPaperScore(paper)} 分</span><span>引用 ${paper.publication?.citations ?? 0}</span></div>`;
  }
  return "";
}

function getSelectedWorkstationPaper(state: GameState): Paper | null {
  const isEditable = (paper: Paper) => paper.status === "draft" || paper.status === "journal-reviewing";
  return state.papers.find((paper) => paper.id === state.selectedPaperId && isEditable(paper))
    ?? state.papers.find(isEditable)
    ?? null;
}

function renderWorkstationPaperResearchActions(
  state: GameState,
  paper: Paper | null,
): string {
  const actionDefinitions: Array<{ type: PaperActionType; label: string; icon: string }> = [
    { type: "idea", label: "想idea", icon: "💡" },
    { type: "experiment", label: "做实验", icon: "🧪" },
    { type: "writing", label: "写论文", icon: "✍️" },
  ];
  const actionButtons = actionDefinitions.map(({ type, label, icon }) => {
    const preview = previewResearchOperation(state, type, RESEARCH_OPERATION_SAN_COST[type]);
    const prerequisiteMet = paper !== null
      && (type !== "experiment" || paper.idea > 0)
      && (type !== "writing" || paper.experiment > 0);
    const enabled = prerequisiteMet && preview.allowed && state.player.san >= preview.sanCost;
    const disabledReason = paper === null
      ? "请先新建一篇论文"
      : !prerequisiteMet
        ? type === "experiment" ? "先想出 idea" : "先完成实验"
        : !preview.allowed
          ? "行动点和 AI行动均不可用"
          : state.player.san < preview.sanCost ? `需要 ${preview.sanCost} SAN` : "";
    const aiClass = preview.usesAiResearchBonus ? " is-ai-bonus" : "";
    const prerequisiteClass = paper !== null && !prerequisiteMet ? " is-prerequisite-locked" : "";
    const effectText = `SAN-${paper ? renderAnimatedNumber(`paper:${paper.id}:action:${type}:san-cost`, preview.sanCost) : preview.sanCost}${preview.usesAiResearchBonus ? " · AI行动" : ""}`;
    return `
      <button
        class="compact-action-btn workstation-main-action-btn workstation-paper-action-btn is-${type}${aiClass}${prerequisiteClass}"
        type="button"
        ${enabled && paper
          ? `data-action="research-paper" data-paper-id="${escapeHtml(paper.id)}" data-paper-action-type="${type}"`
          : `disabled aria-disabled="true"${disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ""}`}
      >
        <span class="workstation-action-main">
          <span class="workstation-action-icon" aria-hidden="true">${prerequisiteClass ? "🔒" : icon}</span>
          <span class="btn-desc">${label}</span>
        </span>
        <span class="btn-effect">${effectText}</span>
      </button>
    `;
  }).join("");
  return actionButtons;
}

function renderWorkstationPaperActions(
  state: GameState,
  paper: Paper | null,
): string {
  const targetLabel = paper ? "当前论文" : "论文操作";
  const targetTitle = paper ? paper.title : "尚无草稿";
  const submitFailure = paper ? getPaperSubmissionFailure(paper, "C") : "请先新建一篇论文";
  const canSubmit = paper !== null && submitFailure === null;
  const conferenceOptions = (["A", "B", "C"] as const).map((target) => {
    const conference = getConferenceInfo(state.month, target, state.year);
    const location = getConferenceLocation(state.month, target, state.year, state.conferenceLocationSeed);
    return {
      target,
      conference,
      displayName: conference.name === "-" ? "待定" : conference.name,
      displayFullName: conference.fullName === "入学前无会议" ? "会议将在入学后确定" : conference.fullName,
      referenceScore: conference.referenceScore > 0 ? String(conference.referenceScore) : "-",
      influenceText: conference.influence.toFixed(2),
      locationText: formatConferenceLocationText(location),
    };
  });
  const conferenceTargets = conferenceOptions.map((option) => {
    const { target, conference, displayName, displayFullName, referenceScore, influenceText, locationText } = option;
    const title = [displayFullName, submitFailure].filter(Boolean).join(" · ");
    return `
      <div class="workstation-submit-target grade-${target.toLowerCase()}">
        <button
          class="paper-submit-option paper-submit-conference grade-${target.toLowerCase()}"
          type="button"
          title="${escapeHtml(title)}"
          aria-label="投稿 ${target} 类${displayName === "待定" ? "" : ` · ${displayName}` }"
          ${canSubmit && paper
            ? `data-action="submit-paper" data-paper-id="${escapeHtml(paper.id)}" data-paper-target="${target}"`
            : "disabled aria-disabled=\"true\""}
        >
          <span class="paper-submit-action-prefix">投</span>
          <span class="paper-submit-grade-mark" aria-hidden="true">${target}</span>
          <strong class="paper-submit-destination">${escapeHtml(displayName)} ${conference.year}</strong>
        </button>
        <span class="workstation-submit-info-item grade-${target.toLowerCase()}">
          <small>${escapeHtml(locationText)}</small>
          <small>影响力${influenceText} · 参考分${referenceScore}</small>
        </span>
      </div>
    `;
  }).join("");
  const journalOptions = [
    { id: "nature" as const, name: "Nature" },
    { id: "nmi" as const, name: "子刊NMI" },
    { id: "pami" as const, name: "顶刊PAMI" },
  ].map(({ id, name }) => {
    const journal = getJournalDefinition(id);
    const journalFailure = getJournalSubmissionFailure(paper, id);
    return { id, name, journal, journalFailure };
  });
  const journalTargets = journalOptions.map(({ id, name, journal, journalFailure }) => {
    const journalAttributes = journalFailure === null && paper
      ? `data-action="submit-journal-paper" data-paper-id="${escapeHtml(paper.id)}" data-journal-target="${id}"`
      : "disabled aria-disabled=\"true\"";
    const journalTitle = [name, journalFailure].filter(Boolean).join(" · ");
    return `
      <div class="workstation-submit-target is-${id}">
        <button class="paper-journal-btn is-${id}" type="button" title="${escapeHtml(journalTitle)}" aria-label="投稿 ${name}" ${journalAttributes}>
          <span class="paper-submit-action-prefix">投</span>
          <strong class="paper-submit-destination">${name}</strong>
        </button>
        <span class="workstation-submit-info-item is-${id}">
          <small>送审分${journal.submissionScore}</small>
          <small>达标分${journal.acceptanceScore}</small>
        </span>
      </div>
    `;
  }).join("");
  return `
    <div class="workstation-paper-toolbar" data-paper-selected="${paper ? "true" : "false"}"
      aria-label="${escapeHtml(paper ? `${targetLabel}：${targetTitle}` : "论文操作")}">
      <div class="workstation-submit-target-grid" role="group" aria-label="选择投稿类别和期刊入口">
        ${conferenceTargets}
        ${journalTargets}
      </div>
    </div>
  `;
}

function formatConferenceLocationText(location: { city: string; region: ConferenceRegionId }): string {
  const regionLabels: Record<ConferenceRegionId, string> = {
    domestic: "国内",
    asia: "亚太",
    west: "欧美",
  };
  const currentRegion = regionLabels[location.region];
  const city = location.city === "未知" ? "地点待定" : location.city;
  return `${city} · ${currentRegion}`;
}

function renderLockedWorkstationSlot(slotIndex: number): string {
  const threshold = PAPER_SLOT_RESEARCH_THRESHOLDS[slotIndex] ?? 0;
  const tierName = getAttrTierName("research", threshold);
  return `
    <article class="paper-card paper-slot-card paper-card-empty paper-card-locked paper-slot-compact" data-paper-slot-index="${slotIndex}">
      <div class="paper-card-header paper-empty-card-header" aria-hidden="true"></div>
      <div class="paper-empty-body paper-locked-body">
        <div class="paper-card-lock-message">
          <strong>科研能力达到${threshold}<span class="new-attr-level attr-level-research paper-lock-tier">${tierName}</span>解锁</strong>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyWorkstationSlot(state: GameState, slotIndex: number): string {
  const preEnrollment = isGameplayModuleLocked(state);
  const canCreate = !preEnrollment && getWorkstationPaperByPanelIndex(state, slotIndex) === null;
  return `
    <article class="paper-card paper-slot-card paper-card-empty paper-slot-compact" data-paper-slot-index="${slotIndex}">
      <div class="paper-card-header paper-empty-card-header" aria-hidden="true"></div>
      <div class="paper-empty-body">
        <button
          class="paper-action-btn is-primary paper-empty-create-btn"
          type="button"
          ${canCreate
            ? `data-action="create-paper" data-paper-slot-index="${slotIndex}"`
            : `disabled aria-disabled="true"`}
        ><span aria-hidden="true">＋</span> 新建论文</button>
      </div>
    </article>
  `;
}

function renderWorkstationPaperCard(state: GameState, panelIndex: number): string {
  if (panelIndex < 0 || panelIndex >= PAPER_SLOT_RESEARCH_THRESHOLDS.length) {
    return renderEmptyWorkstationSlot(state, 0);
  }

  if (panelIndex >= getAvailablePaperSlotCount(state)) {
    return renderLockedWorkstationSlot(panelIndex);
  }

  const selectedPaper = getWorkstationPaperByPanelIndex(state, panelIndex);
  if (!selectedPaper) {
    return renderEmptyWorkstationSlot(state, panelIndex);
  }

  if (selectedPaper.status === "draft") {
    const selected = selectedPaper.id === getSelectedWorkstationPaper(state)?.id;
    const canReroll = getPaperTotalScore(selectedPaper) === 0;
    return `
      <article
        class="paper-card paper-slot-card paper-card-filled paper-card-selectable is-draft${selected ? " is-selected" : ""}${getPaperDisplayStatus(selectedPaper) === "ready" ? " is-ready" : ""}"
        data-paper-slot-index="${panelIndex}"
        data-paper-id="${escapeHtml(selectedPaper.id)}"
      >
        <div class="paper-card-selection-content" data-ui-select-workstation-paper="${escapeHtml(selectedPaper.id)}">
          <div class="paper-card-header">
            <div class="paper-card-header-main">
              ${renderPaperSelectionToggle(selectedPaper, selected, "论文")}
              <span class="paper-card-status is-${getPaperDisplayStatus(selectedPaper)}">${getPaperStatusBadgeText(selectedPaper)}</span>
              ${renderPaperParticipants(state, selectedPaper)}
            </div>
            ${renderPaperDraftActions(selectedPaper, canReroll)}
          </div>
          ${renderPaperTitleWithMeta(selectedPaper)}
          ${renderPaperStats(selectedPaper)}
        </div>
      </article>
    `;
  }

  if (selectedPaper.status === "journal-reviewing") {
    const selected = selectedPaper.id === getSelectedWorkstationPaper(state)?.id;
    return `
      <article class="paper-card paper-slot-card paper-card-filled paper-card-selectable is-journal-reviewing${selected ? " is-selected" : ""}" data-paper-id="${escapeHtml(selectedPaper.id)}" data-paper-slot-index="${panelIndex}">
        <div class="paper-card-selection-content" data-ui-select-workstation-paper="${escapeHtml(selectedPaper.id)}">
          ${renderPaperJournalHeader(state, selectedPaper, selected)}
          ${renderPaperTitleWithMeta(selectedPaper)}
          ${renderPaperStats(selectedPaper)}
        </div>
      </article>
    `;
  }

  return `
    <article class="paper-card paper-slot-card paper-card-filled is-${selectedPaper.status}" data-paper-id="${escapeHtml(selectedPaper.id)}" data-paper-slot-index="${panelIndex}">
      ${selectedPaper.status === "reviewing"
        ? renderPaperReviewHeader(state, selectedPaper)
        : `<div class="paper-card-header"><div class="paper-card-header-main"><span class="paper-card-status is-${selectedPaper.status}">${getPaperStatusBadgeText(selectedPaper)}</span>${renderPaperParticipants(state, selectedPaper)}</div></div>`}
      ${renderPaperTitleWithMeta(selectedPaper)}
      ${renderPaperStats(selectedPaper)}
      ${renderPaperPublishedSummary(selectedPaper)}
    </article>
  `;
}

function renderWorkstationPaperCards(state: GameState): string {
  return PAPER_SLOT_RESEARCH_THRESHOLDS
    .map((_threshold, panelIndex) => renderWorkstationPaperCard(state, panelIndex))
    .join("");
}

function renderEnhancedWorkstationSection(state: GameState): string {
  const preEnrollment = isGameplayModuleLocked(state);
  const selectedPaper = getSelectedWorkstationPaper(state);
  const readPreview = previewReadPaperAction(state);
  const readDisabledText = readPreview.blockedReason === "action-limit"
    ? "本月行动次数已用尽"
    : readPreview.blockedReason === "insufficient-san"
      ? `SAN 不足，需要 ${readPreview.sanCost}`
      : "";
  const readActionAttributes = readPreview.canRead
    ? 'data-action="read-paper"'
    : `disabled aria-disabled="true"${readDisabledText ? ` title="${escapeHtml(readDisabledText)}"` : ""}`;
  const workPreview = previewPartTimeWork(state);
  const workDisabledText = workPreview.blockedReason === "action-limit"
    ? "本月行动次数已用尽"
    : workPreview.blockedReason === "insufficient-san"
      ? `SAN 不足，需要 ${workPreview.sanCost}`
      : "";
  const workActionAttributes = workPreview.allowed
    ? 'data-action="part-time-work"'
    : `disabled aria-disabled="true"${workDisabledText ? ` title="${escapeHtml(workDisabledText)}"` : ""}`;
  const restSanGain = getShopRestSanGain(state.shopState);
  const restActionAttributes = state.actionState.used >= state.actionState.limit
      ? 'disabled aria-disabled="true" title="本月行动次数已用尽"'
      : 'data-action="rest"';
  const remainingActions = Math.max(0, state.actionState.limit - state.actionState.used);

  const html = `
    <div class="right-section workstation-section" id="workstation-section">
      <div class="workstation-action-toolbar" ${preEnrollment ? "hidden" : ""}>
      <div class="workstation-main-row">
          <div class="workstation-main-actions" id="workstation-main-actions">
            <button class="compact-action-btn workstation-main-action-btn is-read" type="button" ${readActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">📚</span>
                <span class="btn-desc">看论文${readPreview.readCount > 1 ? ` ×${renderAnimatedNumber("workstation:read:count", readPreview.readCount)}` : ""}</span>
              </span>
              <span class="btn-effect">SAN-${renderAnimatedNumber("workstation:read:san-cost", readPreview.sanCost)}</span>
            </button>
            <button class="compact-action-btn workstation-main-action-btn is-work" type="button" ${workActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">💼</span>
                <span class="btn-desc">打工</span>
              </span>
              <span class="btn-effect">SAN-${renderAnimatedNumber("workstation:work:san-cost", workPreview.sanCost)} · 金币+${renderAnimatedNumber("workstation:work:money", workPreview.moneyReward)}</span>
            </button>
            <button class="compact-action-btn workstation-main-action-btn is-rest" type="button" ${restActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">🛋</span>
                <span class="btn-desc">休息</span>
              </span>
              <span class="btn-effect">SAN+${renderAnimatedNumber("workstation:rest:san-gain", restSanGain)}</span>
            </button>
            ${renderWorkstationPaperResearchActions(state, selectedPaper)}
          </div>
          <div class="workstation-action-points" aria-label="行动点 ${remainingActions}/${state.actionState.limit}">
            <span><span class="workstation-action-points-icon" aria-hidden="true">👣</span>行动点</span>
            <strong>${renderAnimatedNumber("workstation:actions:remaining", remainingActions)}/${renderAnimatedNumber("workstation:actions:limit", state.actionState.limit)}</strong>
          </div>
        </div>
      </div>
      <div class="workstation-paper-grid" id="workstation-paper-grid">
        ${preEnrollment
          ? '<div class="section-empty play-module-lock-state">入学后开放</div>'
          : renderWorkstationPaperCards(state)}
      </div>
      ${preEnrollment ? "" : renderWorkstationPaperActions(state, selectedPaper)}
    </div>
  `;
  return html;
}

type RelationshipRenderCard = {
  relationshipId: string;
  type: "advisor" | "senior" | "peer" | "junior" | "lover";
  buttonLabel: string;
  displayType: string;
  displayName: string;
  detailItems: Array<{ label: string; value: number; max?: number }>;
  knownMonths: number;
  taskProgress: number;
  taskMax: number;
  relationProgress: number;
  relationMax: number;
  relationGrowthPerMonth: number;
  taskRewardText: string;
  taskLabel: string;
  taskCostLabel: string;
  taskUsedThisMonth: boolean;
  canInteract: boolean;
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
  return `社交达到${threshold}${getAttrTierName("social", threshold)}解锁`;
}

function getRelationshipSortValue(startTotalMonths: number | null | undefined, fallback: number): number {
  return typeof startTotalMonths === "number" ? startTotalMonths : 1000 + fallback;
}

function getRenderedFellowTypeLabel(profile: FellowProgressProfile): string {
  return getFellowRoleLabel(profile.type, profile.gender);
}

function getRenderedLoverType(type: LoverTypeId | null): string {
  if (type === "beautiful") return "活泼恋人";
  if (type === "smart") return "聪慧恋人";
  return "恋人";
}

function buildRelationshipCards(state: GameState): Array<RelationshipRenderCard | null> {
  const cards: Array<RelationshipRenderCard | null> = Array.from({ length: 6 }, () => null);

  if (state.selectedAdvisorName && state.relationshipState.advisorCount > 0) {
    cards[0] = {
      relationshipId: "advisor",
      type: "advisor",
      buttonLabel: "导师",
      displayType: "导师",
      displayName: `${state.selectedAdvisorName} 🎓 ${getAdvisorRankLabel(state.advisorProgressState)}`,
      detailItems: [
        { label: "科研积累", value: state.advisorProgressState.researchAccumulation },
        { label: "科研经费", value: state.advisorProgressState.funding, max: ADVISOR_FUNDING_CAP },
      ],
      knownMonths: Math.max(0, state.totalMonths),
      taskProgress: 0,
      taskMax: 0,
      relationProgress: 0,
      relationMax: 0,
      relationGrowthPerMonth: 0,
      taskRewardText: "经费 +1",
      taskLabel: "做横向",
      taskCostLabel: `SAN-${Math.max(0, ADVISOR_TASK_SAN_COST + getActiveOperationSanDelta(state.buffs))}`,
      taskUsedThisMonth: false,
      canInteract: false,
    };
  }

  const otherCards = [
    ...state.fellowProgressState.map((profile, index) => {
      const fellowLabel = getRenderedFellowTypeLabel(profile);
      return ({
      sortValue: getRelationshipSortValue(profile.startTotalMonths, index),
      card: {
        relationshipId: profile.id,
        type: profile.type,
        buttonLabel: fellowLabel,
        displayType: fellowLabel,
        displayName: getFellowName(profile),
        detailItems: [
          { label: "科研", value: profile.research },
          { label: "默契度", value: profile.affinity },
        ],
        knownMonths: Math.max(0, state.totalMonths - profile.startTotalMonths),
        taskProgress: profile.taskProgress,
        taskMax: 100,
        relationProgress: 0,
        relationMax: 0,
        relationGrowthPerMonth: profile.affinity,
        taskRewardText: "双方各获得1次自动帮助，各最多保留1次",
        taskLabel: "科研协作",
        taskCostLabel: `SAN-${getFellowDiscussionSanCost(state, profile)}`,
        taskUsedThisMonth: profile.taskUsedThisMonth,
        canInteract: false,
      } satisfies RelationshipRenderCard,
    });
    }),
  ]
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((item) => item.card)
    .slice(0, 4);

  otherCards.forEach((card, index) => {
    cards[index + 1] = card;
  });

  if (state.loverState.active && state.loverProgressState.active && state.loverState.type) {
    cards[5] = {
      relationshipId: "lover",
      type: "lover",
      buttonLabel: "恋人",
      displayType: getRenderedLoverType(state.loverState.type),
      displayName: getLoverName(state.loverState),
      detailItems: [
        { label: "科研", value: state.loverProgressState.research, max: 20 },
        { label: "亲密度", value: state.loverProgressState.intimacy, max: 20 },
      ],
      knownMonths: Math.max(0, state.totalMonths - (state.loverState.startTotalMonths ?? state.totalMonths)),
      taskProgress: state.loverProgressState.taskProgress,
      taskMax: state.loverProgressState.taskMax,
      relationProgress: state.loverProgressState.relationProgress,
      relationMax: state.loverProgressState.relationMax,
      relationGrowthPerMonth: Math.max(0, state.loverProgressState.intimacy),
      taskRewardText: "亲密度 +1、特殊效果",
      taskLabel: "约会",
      taskCostLabel: "",
      taskUsedThisMonth: state.loverProgressState.taskUsedThisMonth,
      canInteract: state.loverProgressState.canInteract,
    };
  }

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
        <button class="rel-switch-btn locked${isActive ? " active" : ""}" type="button" data-ui-relationship-index="${slotIndex}" aria-label="关系槽位 ${slotIndex + 1} 未解锁：${escapeHtml(getRelationshipLockedText(slotIndex))}">
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

    const badge = card.canInteract ? '<span class="rel-switch-badge is-chat">!</span>' : "";

    return `
      <button class="rel-switch-btn${isActive ? " active" : ""}" type="button" data-ui-relationship-index="${slotIndex}">
        <span>${escapeHtml(card.buttonLabel)}</span>
        ${badge}
      </button>
    `;
  }).join("");
}

function renderRelationshipCurrentCard(
  state: GameState,
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

  return `
    <div class="rel-card filled">
      <div class="rel-card-head rel-card-header">
        <span class="rel-type" data-rel-type-pill="${card.type}">${escapeHtml(card.displayType)}</span>
        <strong class="rel-name">${escapeHtml(card.displayName)}</strong>
      </div>
      <div class="rel-detail-row">
        ${card.detailItems.map((item) => `<span class="rel-detail-item">${escapeHtml(item.label)} ${item.value}</span>`).join("")}
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
          ${getDeferredGameplayActionAttributes(state)}
        >${escapeHtml(card.taskUsedThisMonth ? "✓ 本月已用" : `${card.taskLabel}（${card.taskCostLabel}）`)}</button>
        <button
          class="btn-sm rel-action-btn is-chat"
          type="button"
          ${getDeferredGameplayActionAttributes(state)}
        >交流</button>
      </div>
    </div>
  `;
}

function renderRelationshipSection(state: GameState, uiState: PlayRenderUiState = {}): string {
  return renderRelationshipGridSection(state);
  const rel = state.relationshipState;
  const activeRelationshipIndex = getSafeRelationshipSlotIndex(uiState.activeRelationshipIndex);
  const cards = buildRelationshipCards(state);
  const preEnrollment = isGameplayModuleLocked(state);

  return `
    <div class="right-section relationship-section" id="relationship-section">
      <div class="rel-switch-btns" id="rel-switch-btns" ${preEnrollment ? "hidden" : ""}>
        ${preEnrollment ? "" : renderRelationshipSwitchButtons(cards, activeRelationshipIndex, rel.unlockedSlots)}
      </div>
      <div class="rel-current-card" id="rel-current-card">
        ${preEnrollment
          ? `<div class="section-empty play-module-lock-state">入学后开放</div>`
          : renderRelationshipCurrentCard(state, cards, activeRelationshipIndex, rel.unlockedSlots)}
      </div>
    </div>
  `;
}

function renderFellowPaper(state: GameState, profile: FellowProgressProfile): string {
  const paper = getFellowCurrentPaper(state, profile.id);
  return `
    <div class="rel-paper-section">
      ${paper ? `
        <div class="rel-paper-title-block">
          <strong class="paper-title">${escapeHtml(paper.title)}</strong>
          ${renderPaperTopicMeta({ ...paper, ...getFellowResearchTopic(profile) }, false, true)}
        </div>
        ${paper.status === "reviewing" ? renderFellowReviewStatus(paper) : `<div class="paper-score-strip rel-paper-scores" aria-label="idea ${paper.idea}，实验 ${paper.experiment}，写作 ${paper.writing}，总分 ${getPaperTotalScore(paper)}">
          <span><small>idea</small><strong ${animationNumberAttributes(`paper:${paper.id}:fellow:idea:total`, paper.idea)}>${paper.idea}</strong></span>
          <span><small>实验</small><strong ${animationNumberAttributes(`paper:${paper.id}:fellow:experiment:total`, paper.experiment)}>${paper.experiment}</strong></span>
          <span><small>写作</small><strong ${animationNumberAttributes(`paper:${paper.id}:fellow:writing:total`, paper.writing)}>${paper.writing}</strong></span>
          <span class="paper-score-total"><small>总分</small><strong ${animationNumberAttributes(`paper:${paper.id}:fellow:total`, getPaperTotalScore(paper))}>${getPaperTotalScore(paper)}</strong></span>
        </div>`}
      ` : '<span class="rel-progress-note">暂无在研论文</span>'}
    </div>
  `;
}

function renderFellowReviewStatus(paper: Paper): string {
  const conference = getPaperReviewConference(paper);
  return `
    <div class="rel-paper-review-status is-reviewing">
      <span class="paper-card-status is-reviewing">${escapeHtml(`${paper.target ?? "待定"}类 · ${conference?.name ?? "会议"}审稿中`)}</span>
      <span class="paper-review-remaining">剩余 ${renderAnimatedNumber(`paper:${paper.id}:fellow:review-months`, paper.reviewMonthsLeft)} 月</span>
      <span class="rel-paper-review-total">总分 ${renderAnimatedNumber(`paper:${paper.id}:fellow:total`, getPaperTotalScore(paper))}</span>
    </div>
  `;
}

function renderRelationshipIcon(icon: string): string {
  return `<span class="rel-inline-icon" aria-hidden="true">${icon}</span>`;
}

function renderFellowCooperationButton(state: GameState, profile: FellowProgressProfile): string {
  const relationshipId = escapeHtml(profile.id);
  const sanCost = getFellowDiscussionSanCost(state, profile);
  const blocked = isGameplayModuleLocked(state) ? "入学后开放"
    : state.phase !== "playing" ? "本轮已结束" : "";
  const paidReason = blocked || (profile.taskUsedThisMonth ? "本月已协作，下月恢复" : state.player.san < sanCost ? `SAN不足，需要${sanCost}` : "");
  return `
      <button class="btn-sm rel-action-btn rel-cooperation-btn" type="button" data-action="relationship-task" data-relationship-id="${relationshipId}"${paidReason ? ` disabled aria-disabled="true" aria-label="科研协作：${escapeHtml(paidReason)}"` : ""}>
        <span class="rel-action-label">${renderRelationshipIcon("🤝")}科研协作</span>${profile.taskUsedThisMonth ? "" : `<span class="rel-action-cost">SAN-${renderAnimatedNumber(`person:${profile.id}:cooperation:san-cost`, sanCost)}</span>`}
      </button>
  `;
}

function getFellowCooperationSummaryText(state: GameState, profile: FellowProgressProfile): string {
  const target = profile.type === "senior" ? "最高项" : profile.type === "junior" ? "最低项" : "随机项";
  return `进度满：你的论文${target}+${Math.floor(profile.research)}分，对方论文最低项+${Math.floor(state.player.research)}分`;
}

function renderAdvisorFundSummary(state: GameState): string {
  const advisor = state.advisorProgressState;
  const calendarYear = getAcademicCalendarYear(state.year, state.month);
  const quotaGrants = getActiveAdvisorGrants(advisor, calendarYear);
  const awards = advisor.awards.map((award) => {
    const grant = ADVISOR_GRANTS.find((definition) => definition.id === award.id);
    if (!grant) return "";
    const active = award.startYear !== null && award.endYear !== null
      && calendarYear >= award.startYear && calendarYear <= award.endYear;
    const period = award.startYear !== null && award.endYear !== null
      ? `${award.startYear}–${award.endYear}年，${active ? "在研" : calendarYear < award.startYear ? "待启动" : "已结题"}`
      : "每月经费+1";
    return `${grant.name}：${award.awardedYear}年获批；${period}`;
  }).filter(Boolean);
  return `<span class="rel-advisor-grants" title="${escapeHtml(awards.length ? awards.join("\n") : "暂无获批基金")}">${renderRelationshipIcon("📋")}在研基金<strong>${renderAnimatedNumber("person:advisor:grants", quotaGrants.length)}/${renderAnimatedNumber("person:advisor:grant-cap", getAdvisorGrantLimit(advisor))}</strong></span>`;
}

function renderAdvisorStatus(state: GameState): string {
  const advisor = state.advisorProgressState;
  const sanCost = Math.max(0, ADVISOR_TASK_SAN_COST + getActiveOperationSanDelta(state.buffs));
  const monthlyGrowth = getAdvisorMonthlyResearchGrowth(state);
  const calendarYear = getAcademicCalendarYear(state.year, state.month);
  const calendarMonth = getAcademicCalendarMonth(state.month);
  const monthsToApplication = (3 - calendarMonth + 12) % 12 || 12;
  const academician = advisor.awards.some((award) => award.id === "academician");
  const score = advisor.researchAccumulation;
  const nextTier = ADVISOR_GRANTS.find((grant) => grant.threshold > score);
  const reachedTier = [...ADVISOR_GRANTS].reverse().find((grant) => grant.threshold <= score);
  const researchMax = (nextTier ?? ADVISOR_GRANTS[ADVISOR_GRANTS.length - 1]!).threshold;
  const pending = advisor.pendingApplication;
  const pendingGrant = pending ? ADVISOR_GRANTS.find((grant) => grant.id === pending.id) : null;
  const applicationYear = calendarYear + Number(calendarMonth >= 3);
  const limited = !academician && !advisor.awards.some((award) => award.id === "distinguished")
    && getActiveAdvisorGrants(advisor, applicationYear).length >= getAdvisorGrantLimit(advisor);
  const applicationText = academician ? "已当选院士"
    : pendingGrant ? `${pendingGrant.name}申请中 · ${(8 - calendarMonth + 12) % 12 || 12}个月后公布`
    : `${monthsToApplication}个月后${limited ? "基金申请 · 限项" : "可申请基金"}`;
  const progressBar = (label: string, value: number, max: number): string => `
    <div class="rel-progress-bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(value, max)}" aria-valuetext="${value}/${max}">
      <div class="rel-progress-fill task ${label === "科研积累" ? "research" : "funding"}" ${animationBarAttribute(`person:advisor:${label === "科研积累" ? "research" : "funding"}`)} style="width:${clampPercent(value / max * 100)}%"></div>
    </div>`;
  const blocked = state.phase !== "playing" ? "本轮未在进行"
    : !state.selectedAdvisorName || state.relationshipState.advisorCount <= 0 ? "请先选择导师"
    : advisor.lastHorizontalTotalMonths === state.totalMonths ? "本月已做横向，下月恢复"
    : state.player.san < sanCost ? `SAN不足，需要${sanCost}`
    : advisor.funding >= ADVISOR_FUNDING_CAP ? "科研经费已满" : "";
  return `
    <div class="rel-advisor-status">
      <div class="rel-advisor-application${pendingGrant ? " is-pending" : academician ? " is-achieved" : ""}">
        <span class="rel-advisor-countdown">${academician ? applicationText : applicationText.replace(/\d+/, (display) => renderAnimatedNumber(`person:advisor:${pendingGrant ? "result" : "application"}:months`, Number(display)))}</span>
      </div>
      <div class="paper-score-strip rel-advisor-growth-sources" aria-label="本月科研积累增长">
          <span><small>经费收益</small><strong>+${renderAnimatedNumber("person:advisor:growth:funding", monthlyGrowth.funding ?? 0)}</strong></span>
          <span><small>论文累计</small><strong>+${renderAnimatedNumber("person:advisor:growth:papers", monthlyGrowth.papers)}</strong></span>
          <span><small>本月积累</small><strong>+${renderAnimatedNumber("person:advisor:growth:total", (monthlyGrowth.funding ?? 0) + monthlyGrowth.papers)}</strong></span>
      </div>
      <div class="rel-advisor-research">
        <span class="rel-detail-label">${renderRelationshipIcon("💡")}科研积累</span>
        ${progressBar("科研积累", score, researchMax)}
        <span class="rel-progress-val rel-advisor-thresholds">${nextTier ? `<span>${renderAnimatedNumber("person:advisor:research:next", score)}/${renderAnimatedNumber("person:advisor:research:next-threshold", nextTier.threshold)}${nextTier.name}</span>` : ""}${reachedTier ? `<span class="is-reached">【${renderAnimatedNumber("person:advisor:research:reached", score)}/${renderAnimatedNumber("person:advisor:research:reached-threshold", reachedTier.threshold)}${reachedTier.name}】</span>` : ""}</span>
      </div>
    </div>
    <div class="rel-advisor-action rel-resource-row">
      <span class="rel-detail-label">${renderRelationshipIcon("💰")}科研经费</span>
      ${progressBar("科研经费", advisor.funding, ADVISOR_FUNDING_CAP)}
      <strong class="rel-progress-val">${renderAnimatedNumber("person:advisor:funding", advisor.funding)}/${ADVISOR_FUNDING_CAP}</strong>
      <button class="btn-sm rel-action-btn rel-cooperation-btn" type="button" data-action="advisor-horizontal" title="不消耗行动点，每月限一次"${blocked ? ` disabled aria-disabled="true" aria-label="做横向：${escapeHtml(blocked)}"` : ""}>
        <span class="rel-action-label">${renderRelationshipIcon("🛠️")}做横向</span>${advisor.lastHorizontalTotalMonths === state.totalMonths ? "" : `<span class="rel-action-cost">SAN-${renderAnimatedNumber("person:advisor:horizontal:san-cost", sanCost)}</span>`}
      </button>
    </div>
  `;
}

function renderLoverRoutes(state: GameState): string {
  const identity = `person:lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}`;
  const icons = { play: "🎡", study: "📖", shopping: "🛍️" };
  const labels = { play: "玩耍", study: "学习", shopping: "购物" };
  const passive = getLoverPassiveGains(state);
  const used = state.loverProgressState.taskUsedThisMonth
    || state.loverProgressState.lastDateTotalMonths === state.totalMonths;
  return `<div class="rel-lover-routes" aria-label="约会每月三选一">
    ${LOVER_ROUTES.map((route) => {
      const label = labels[route];
      const progress = clampPercent(getLoverRouteProgress(state, route));
      const cost = getLoverRouteCost(state, route);
      const costLabel = [cost.money > 0 ? `金币-${renderAnimatedNumber(`${identity}:${route}:money-cost`, cost.money)}` : "", cost.san > 0 ? `SAN-${renderAnimatedNumber(`${identity}:${route}:san-cost`, cost.san)}` : ""].filter(Boolean).join(" / ");
  const blocked = isGameplayModuleLocked(state) ? "入学后开放"
        : state.phase !== "playing" ? "本轮已结束"
          : used ? "下月可再次约会"
            : isDevelopmentPreEnrollmentPreview(state) ? null : getLoverDateFailure(state, route);
      const gain = getLoverRouteGain(state, route);
      const monthlyGain = route === "shopping" ? 0 : passive[route];
      const passiveHint = route === "shopping" ? "每月自动+0（无自动进度）" : `恋爱次月起每月自动+${monthlyGain}`;
      const hint = `约会进度+${gain}；${passiveHint}`;
      return `<div class="rel-lover-route" data-lover-route="${route}">
        <span class="rel-detail-label">${renderRelationshipIcon(icons[route])}${label}</span>
        <div class="rel-progress-bar play-tooltip" role="progressbar" aria-label="${escapeHtml(`${label}：${hint}`)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" title="${escapeHtml(hint)}" data-tooltip="${escapeHtml(hint)}" tabindex="0">
          <div class="rel-progress-fill task lover-${route}" ${animationBarAttribute(`${identity}:${route}:progress`)} style="width:${progress}%"></div>
        </div>
        <span class="rel-progress-val">${renderAnimatedNumber(`${identity}:${route}:progress`, progress)}/100</span>
        <button class="btn-sm rel-action-btn rel-cooperation-btn" type="button" data-action="lover-${route}"${blocked ? ` disabled aria-disabled="true" aria-label="${label}：${escapeHtml(blocked)}"` : ""}>
          <span class="rel-action-label">${renderRelationshipIcon(icons[route])}${label}</span>${used || !costLabel ? "" : `<span class="rel-action-cost">${costLabel}</span>`}
        </button>
      </div>`;
    }).join("")}
  </div>`;
}

function renderRelationshipFootnote(state: GameState, card: RelationshipRenderCard, fellow: FellowProgressProfile | undefined): string {
  if (fellow) {
    return `<p class="rel-card-footnote">${escapeHtml(getFellowCooperationSummaryText(state, fellow))}</p>`;
  }
  if (card.type === "advisor") {
    const advisor = state.advisorProgressState;
    const incomingGrant = getAcademicCalendarMonth(state.month) === 7 && advisor.pendingApplication
      ? ADVISOR_GRANTS.find((grant) => grant.id === advisor.pendingApplication?.id) : undefined;
    const academician = advisor.awards.some((award) => award.id === "academician") || incomingGrant?.id === "academician";
    const text = academician ? "下月经费+1、投入-1，科研积累+5%（下取整）"
      : advisor.funding > 0 ? "下月科研经费-1，科研积累+5%（下取整）"
        : incomingGrant && incomingGrant.funding > 0 ? "下月基金到账后，经费-1、科研积累+5%（下取整）"
          : "下月经费不足，暂停科研积累的自然增长";
    return `<p class="rel-card-footnote">${text}</p>`;
  }
  const labels = { play: "玩耍", study: "学习", shopping: "购物" };
  const notes = LOVER_ROUTES.map((route) => `${labels[route]}条满：${getLoverNextReward(state, route)
    .replace("永久idea、实验、写作各+1分", "论文三项分数永久+1")
    .replace("双方科研较低者+1，相同不提升", "科研能力较低者+1")}`);
  return `<div class="rel-card-footnote rel-lover-reward-ticker" data-lover-reward-identity="${escapeHtml(`${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}`)}" role="group" aria-label="恋人条满奖励">
    <button class="rel-reward-nav" type="button" data-ui-lover-reward-step="-1" aria-label="上一条奖励" aria-controls="lover-reward-messages">‹</button>
    <div class="rel-lover-reward-window" id="lover-reward-messages" aria-label="${escapeHtml(notes.join("；"))}">
      <div class="rel-lover-reward-track" aria-hidden="true">${[...notes, notes[0]!].map((note) => `<span>${escapeHtml(note)}</span>`).join("")}</div>
    </div>
    <button class="rel-reward-nav" type="button" data-ui-lover-reward-step="1" aria-label="下一条奖励" aria-controls="lover-reward-messages">›</button>
  </div>`;
}

function renderRelationshipGridCard(state: GameState, card: RelationshipRenderCard): string {
  const identity = card.type === "lover" ? `person:lover:${state.loverState.startTotalMonths}:${getLoverName(state.loverState)}` : `person:${card.relationshipId}`;
  const fellow = state.fellowProgressState.find((profile) => profile.id === card.relationshipId);
  const advisor = card.type === "advisor";
  const attributes: RelationshipRenderCard["detailItems"] = fellow
    ? [{ label: "科研", value: fellow.research, max: 20 }, { label: "默契", value: fellow.affinity, max: 20 }]
    : card.detailItems.map((item) => ({ ...item, label: item.label === "亲密度" ? "亲密" : item.label }));
  const renderAttributes = (): string => attributes.map((item) => `
    <span class="rel-detail-item"><span class="rel-detail-label">${renderRelationshipIcon(item.label === "科研" ? "💡" : card.type === "lover" ? "💕" : "🤝")}${escapeHtml(item.label)}</span> <strong class="rel-detail-value">${renderAnimatedNumber(`${identity}:${item.label === "科研" ? "research" : card.type === "lover" ? "intimacy" : "affinity"}`, item.value)}${item.max === undefined ? "" : `/${item.max}`}</strong></span>
  `).join("");
  return `
    <article class="rel-card filled rel-card-compact${fellow ? " rel-card-fellow" : card.type === "lover" ? " rel-card-lover" : ""}" data-relationship-type="${card.type}" data-relationship-id="${escapeHtml(card.relationshipId)}">
      <div class="rel-card-identity">
        <div class="rel-card-head rel-card-header paper-card-header">
          <div class="rel-header-main">
            <span class="rel-type" data-rel-type-pill="${card.type}">${escapeHtml(card.displayType)}</span>
            <strong class="rel-name">${escapeHtml(card.displayName)}</strong>
            ${advisor ? "" : renderAttributes()}
          </div>
          ${advisor ? renderAdvisorFundSummary(state) : `<div class="rel-card-meta">
            <span class="rel-known-time">${renderRelationshipIcon("🗓️")}认识<strong class="rel-detail-value" ${animationNumberAttributes(`${identity}:known-months`, card.knownMonths)}>${card.knownMonths}</strong>月</span>
            <button class="rel-end-compact" data-card-icon-action type="button" title="${fellow ? "停止合作" : "分手"}" aria-label="${fellow ? "停止合作" : "分手"}" data-action="end-relationship" data-relationship-id="${escapeHtml(card.relationshipId)}"><span aria-hidden="true">${fellow ? "✂️" : "💔"}</span></button>
          </div>`}
        </div>
      </div>
      ${fellow ? renderFellowPaper(state, fellow) : ""}
      ${advisor ? renderAdvisorStatus(state) : card.type === "lover" ? renderLoverRoutes(state) : `<div class="rel-progress-section rel-resource-row">
        <div class="rel-progress-item">
          <div class="rel-progress-header">
            <span class="rel-detail-label">${renderRelationshipIcon("🤝")}协作进度</span><span class="rel-progress-val">${renderAnimatedNumber(`${identity}:cooperation:progress`, card.taskProgress)}/${card.taskMax}</span>${fellow ? renderFellowCooperationButton(state, fellow) : ""}
          </div>
          <div class="rel-progress-bar" role="progressbar" aria-label="协作进度" aria-valuemin="0" aria-valuemax="${card.taskMax}" aria-valuenow="${card.taskProgress}">
            <div class="rel-progress-fill task cooperation" ${animationBarAttribute(`${identity}:cooperation:progress`)} style="width:${clampPercent(card.taskProgress / Math.max(1, card.taskMax) * 100)}%"></div>
          </div>
        </div>
      </div>`}
      ${renderRelationshipFootnote(state, card, fellow)}
    </article>
  `;
}

function renderRelationshipGridSlot(
  state: GameState,
  card: RelationshipRenderCard | null,
  slotIndex: number,
  unlockedSlots: number,
): string {
  if (slotIndex === 5) {
    if (card) return renderRelationshipGridCard(state, card);
    return `
      <article class="rel-card locked rel-card-lover-locked">
        <div class="rel-lover-lock-icon" aria-hidden="true">💕</div>
        <span class="rel-lover-lock-text">恋爱后解锁</span>
      </article>
    `;
  }
  if (slotIndex >= unlockedSlots) {
    const threshold = RELATIONSHIP_SLOT_UNLOCK_THRESHOLDS[slotIndex] ?? 18;
    const tierName = getAttrTierName("social", threshold);
    return `
      <article class="rel-card locked">
        <div class="paper-card-lock-message relationship-card-lock-message">
          <strong>社交达到${threshold}<span class="new-attr-level attr-level-social relationship-lock-tier">${tierName}</span>解锁</strong>
        </div>
      </article>
    `;
  }
  if (!card) {
    return `<article class="rel-card empty"${slotIndex === 0 ? ' data-relationship-type="advisor"' : ""}><div class="section-empty">${getRelationshipEmptyText(slotIndex)}</div></article>`;
  }
  return renderRelationshipGridCard(state, card);
}

function renderRelationshipGridSection(state: GameState): string {
  const rel = state.relationshipState;
  const cards = buildRelationshipCards(state);
  const preEnrollment = isGameplayModuleLocked(state);
  return `
    <div class="right-section relationship-section" id="relationship-section">
      <div class="rel-card-grid" id="rel-card-grid">
        ${preEnrollment
          ? '<div class="section-empty play-module-lock-state">\u5165\u5b66\u540e\u5f00\u653e</div>'
          : [0, 5, 1, 2, 3, 4].map((slotIndex) => renderRelationshipGridSlot(state, cards[slotIndex] ?? null, slotIndex, rel.unlockedSlots)).join("")}
      </div>
    </div>
  `;
}

function getPublishedPapers(state: GameState): Paper[] {
  return [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
}

const NAME_PINYIN: Readonly<Record<string, string>> = {
  李: "Li", 旭: "Xu", 霖: "Lin", 阳: "Yang", 沁: "Qin", 宏: "Hong", 佳: "Jia", 择: "Ze",
  庄: "Zhuang", 婉: "Wan", 仪: "Yi", 赵: "Zhao", 志: "Zhi", 伟: "Wei", 陆: "Lu", 岩: "Yan",
  刘: "Liu", 斌: "Bin", 储: "Chu", 琪: "Qi", 张: "Zhang", 雅: "Ya", 俞: "Yu", 能: "Neng", 海: "Hai",
  余: "Yu", 涵: "Han", 蕾: "Lei", 徐: "Xu", 寅: "Yin", 虎: "Hu", 罗: "Luo", 子: "Zi", 祥: "Xiang",
  郑: "Zheng", 啟: "Qi", 嘉: "Jia", 马: "Ma", 泽: "Ze", 坤: "Kun", 梦: "Meng", 欣: "Xin", 可: "Ke",
  心: "Xin", 嫣: "Yan", 梁: "Liang", 哲: "Zhe", 铭: "Ming", 明: "Ming", 聪: "Cong", 临: "Lin", 风: "Feng",
  方: "Fang", 婷: "Ting", 长: "Chang", 雷: "Lei", 王: "Wang", 卓: "Zhuo", 丰: "Feng", 魏: "Wei", 叶: "Ye",
  林: "Lin", 谭: "Tan", 杰: "Jie", 森: "Sen", 姚: "Yao", 骏: "Jun", 晨: "Chen", 禹: "Yu", 博: "Bo",
  谢: "Xie", 天: "Tian", 江: "Jiang", 小: "Xiao", 红: "Hong", 丽: "Li", 芳: "Fang", 燕: "Yan", 雪: "Xue",
  刚: "Gang", 强: "Qiang", 龙: "Long",
};

function getNamePinyin(name: string, abbreviated = true): string {
  if (name === "导师") return "Advisor";
  if (name === "合作者") return "Collaborator";
  if (!/^[\p{Script=Han}]+$/u.test(name)) {
    const parts = name.trim().split(/\s+/);
    return abbreviated && parts.length > 1 ? `${parts[0]!.charAt(0).toUpperCase()} ${parts.slice(1).join(" ")}` : name;
  }
  if ([...name].some((char) => !NAME_PINYIN[char])) return name;
  const chars = [...name].map((char) => NAME_PINYIN[char]!);
  if (chars.length <= 1) return chars.join("");
  const givenName = chars.slice(1).join("").toLowerCase();
  return `${abbreviated ? givenName.charAt(0).toUpperCase() : givenName.charAt(0).toUpperCase() + givenName.slice(1)} ${chars[0]}`;
}

function getStableNameSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getPendingStudentName(state: GameState): string | null {
  for (const event of state.eventQueue) {
    for (const choice of event.choices) {
      const resolution = choice.effects.fixedEventResolution;
      if (resolution?.kind === "student-name-confirm") {
        const name = resolution.studentName?.trim();
        if (name) return name;
      }
    }
  }
  return null;
}

function getPendingAdvisorName(state: GameState): string | null {
  const queuedEvents = state.eventQueue.flatMap((event) => [
    event,
    ...event.choices.flatMap((choice) => choice.effects.enqueueEvents ?? []),
  ]);
  for (const event of queuedEvents) {
    for (const choice of event.choices) {
      const resolution = choice.effects.fixedEventResolution;
      if (resolution?.kind === "advisor-confirm" || resolution?.kind === "advisor-reroll") {
        const name = resolution.advisorCandidate?.advisorName?.trim();
        if (name) return name;
      }
    }
  }
  return null;
}

function generatePaperAuthorName(seed: string, excludedNames: ReadonlySet<string>): string {
  const surnames = [...new Set(RANDOM_ADVISOR_SURNAMES)];
  const givenChars = [...new Set(RANDOM_ADVISOR_GIVEN_CHARS)];
  const seedValue = getStableNameSeed(seed);
  const isAvailable = (name: string): boolean => (
    !excludedNames.has(name)
    && !RANDOM_ADVISOR_NAMES.some((knownName) => knownName === name)
  );

  for (let attempt = 0; attempt < 256; attempt += 1) {
    const mixed = (seedValue + Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const surname = surnames[mixed % Math.max(1, surnames.length)] ?? "李";
    const first = givenChars[(mixed >>> 8) % Math.max(1, givenChars.length)] ?? "明";
    const second = givenChars[(mixed >>> 16) % Math.max(1, givenChars.length)] ?? "远";
    const candidate = `${surname}${first}${second}`;
    if (isAvailable(candidate)) return candidate;
  }

  for (const surname of surnames) {
    for (const first of givenChars) {
      for (const second of givenChars) {
        const candidate = `${surname}${first}${second}`;
        if (isAvailable(candidate)) return candidate;
      }
    }
  }

  return "李明远";
}

type ResearchAuthor = { name: string; isPlayer: boolean };

function getPaperAuthors(state: GameState, paper: Paper): ResearchAuthor[] {
  const pendingStudentName = getPendingStudentName(state);
  const pendingAdvisorName = getPendingAdvisorName(state);
  const enrollmentIdentitySeed = `${state.selectedRoleId}:${state.totalMonths}:enrollment`;
  const reservedNames = new Set<string>();
  const playerName = state.playerName?.trim()
    || pendingStudentName
    || generatePaperAuthorName(`${enrollmentIdentitySeed}:player`, reservedNames);
  reservedNames.add(playerName);
  const advisorName = state.selectedAdvisorName?.trim()
    || pendingAdvisorName
    || generatePaperAuthorName(`${enrollmentIdentitySeed}:advisor`, reservedNames);
  reservedNames.add(advisorName);
  if (paper.collaborators !== undefined) {
    const collaboratorNames = [...new Set(paper.collaborators
      .filter((collaborator) => collaborator.id !== "player")
      .map((collaborator) => collaborator.name.trim()))]
      .filter((name) => name && name !== "你" && !reservedNames.has(name));
    const leadName = paper.nonFirstAuthor === true
      ? paper.leadAuthorName?.trim() || collaboratorNames[0] || generatePaperAuthorName(`${paper.id}:lead`, reservedNames)
      : undefined;
    const collaborators = collaboratorNames
      .filter((name) => name !== leadName)
      .map((name) => ({ name, isPlayer: false }));
    return paper.nonFirstAuthor === true
      ? [
        ...(leadName ? [{ name: leadName, isPlayer: false }] : []),
        ...collaborators,
        { name: playerName, isPlayer: true },
        { name: advisorName, isPlayer: false },
      ]
      : [
        { name: playerName, isPlayer: true },
        ...collaborators,
        { name: advisorName, isPlayer: false },
      ];
  }
  const fellows = state.fellowProgressState
    .map(getFellowName)
    .filter((name, index, names) => name && names.indexOf(name) === index)
    .sort((left, right) => getStableNameSeed(`${paper.id}:${left}`) - getStableNameSeed(`${paper.id}:${right}`));

  if (paper.nonFirstAuthor !== true) {
    const visibleFellows = fellows
      .filter((name) => getStableNameSeed(`${paper.id}:show:${name}`) % 3 !== 0)
      .slice(0, 3)
      .map((name) => ({ name, isPlayer: false }));
    return [
      { name: playerName, isPlayer: true },
      ...visibleFellows,
      { name: advisorName, isPlayer: false },
    ];
  }

  const relationLead = paper.leadAuthorName?.trim();
  const fallbackLead = generatePaperAuthorName(`${paper.id}:lead`, new Set([
    ...reservedNames,
    ...fellows,
  ]));
  const leadName = relationLead || fallbackLead;
  const middleFellows = fellows
    .filter((name) => name !== leadName && getStableNameSeed(`${paper.id}:middle:${name}`) % 2 === 0)
    .slice(0, 2);
  const authorsBeforePlayer = middleFellows
    .map((name) => ({ name, isPlayer: false }));
  return [
    { name: leadName, isPlayer: false },
    ...authorsBeforePlayer,
    { name: playerName, isPlayer: true },
    { name: advisorName, isPlayer: false },
  ];
}

const JOURNAL_FULL_NAMES: Readonly<Record<JournalTarget, string>> = {
  nature: "Nature",
  nmi: "Nature Machine Intelligence",
  pami: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
};

function getPaperVenue(state: GameState, paper: Paper): { marker: string; short: string; full: string; year: number; influence: number; journal: boolean } {
  const acceptedCalendar = paper.acceptedTotalMonths === undefined ? state : getCalendarForTotalMonths(paper.acceptedTotalMonths);
  const fallbackYear = getAcademicCalendarYear(acceptedCalendar.year, acceptedCalendar.month);
  if (paper.journalTarget) {
    const journal = getJournalDefinition(paper.journalTarget);
    return {
      marker: "J",
      short: journal.name.replace(/^(?:子刊|顶刊)/u, ""),
      full: JOURNAL_FULL_NAMES[paper.journalTarget],
      year: typeof paper.submittedYear === "number" && typeof paper.submittedMonth === "number"
        ? getAcademicCalendarYear(paper.submittedYear, paper.submittedMonth)
        : fallbackYear,
      influence: paper.publication?.influence ?? journal.citationInfluence,
      journal: true,
    };
  }

  const target = paper.target ?? "C";
  const conference = paper.submittedMonth && paper.submittedYear
    ? getConferenceInfo(paper.submittedMonth, target, paper.submittedYear)
    : null;
  return {
    marker: target,
    short: conference?.name ?? "会议",
    full: conference?.fullName ?? "学术会议",
    year: conference?.year ?? fallbackYear,
    influence: paper.publication?.influence ?? conference?.influence ?? 0,
    journal: false,
  };
}

const RESEARCH_PROMOTION_IDS: readonly PaperPromotionId[] = ["arxiv", "github", "xiaohongshu"];

function renderResearchPromotionActions(state: GameState, paper: Paper): string {
  if (paper.status !== "published" || !paper.publication || paper.nonFirstAuthor === true) return "";

  const promotions = paper.publication.promotions ?? {
    arxiv: false,
    github: false,
    xiaohongshu: false,
  };
  const visiblePromotionIds = ((paper.journalTarget ?? paper.publication?.journalTarget)
    ? ["github", "xiaohongshu", "quantum"]
    : RESEARCH_PROMOTION_IDS).filter((promotionId) => {
    if (promotionId !== "arxiv") return true;
    return promotions.arxiv === true
      || (paper.target !== null
      && paper.conferenceHandled !== true
      && (paper.publication?.monthsSincePublish ?? 0) < 3);
  }) as PaperPromotionId[];
  if (visiblePromotionIds.length === 0) return "";
  const promotionLabels: Record<PaperPromotionId, string> = {
    arxiv: "arXiv",
    github: "GitHub",
    xiaohongshu: "小红书",
    quantum: "量子位",
  };
  const promotionIcons: Record<PaperPromotionId, string> = {
    arxiv: "▤",
    github: "⌘",
    xiaohongshu: "✦",
    quantum: "◇",
  };
  const promotionEffects: Record<PaperPromotionId, string> = {
    arxiv: "提前公开",
    github: "当前分 +25%",
    xiaohongshu: `引用倍率 +${Math.round(getPaperPromotionMultiplierBonus("xiaohongshu") * 100)}%`,
    quantum: `引用倍率 +${Math.round(getPaperPromotionMultiplierBonus("quantum") * 100)}%`,
  };

  return `
    <div class="research-promotion-block">
      <div class="research-promotion-actions">
        ${visiblePromotionIds.map((promotionId) => {
          const cost = getPaperPromotionCost(promotionId, state.buffs);
          const moneyCost = getPaperPromotionMoneyCost(promotionId);
          const used = promotions[promotionId] === true;
          const affordable = state.player.san >= cost && state.player.money >= moneyCost;
          return `
            <button
              class="research-promotion-btn${used ? " is-used" : ""}"
              type="button"
              data-promotion-id="${promotionId}"
              ${used ? "disabled aria-disabled='true'" : ""}
              ${affordable
                ? `data-action="promote-paper" data-paper-id="${escapeHtml(paper.id)}" data-promotion-id="${promotionId}"`
                : `disabled aria-disabled="true" title="${moneyCost > 0 ? `金币不足，需要 ${moneyCost}` : `SAN 不足，需要 ${cost}`}"`}
            >
              <span class="research-promotion-topline">
                <span>${promotionIcons[promotionId]} ${escapeHtml(promotionLabels[promotionId])}${used ? " ✓" : ""}</span>
                ${used ? "" : `<small>${moneyCost > 0 ? `金币 -${moneyCost}` : `SAN -${renderAnimatedNumber(`paper:${paper.id}:promotion:${promotionId}:san-cost`, cost)}`}</small>`}
              </span>
              ${used ? "" : `<small class="research-promotion-effect">${promotionEffects[promotionId]}</small>`}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function getCitationAxisMax(maxCitations: number): number {
  const value = Math.max(5, maxCitations);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatCitationAxisValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderCitationProfile(state: GameState, publishedPapers: Paper[]): string {
  const currentCalendarYear = getAcademicCalendarYear(state.year, state.month);
  const stats = getCitationStats(
    publishedPapers,
    state.totalCitations,
    state.citationHistoryByYear,
    currentCalendarYear,
  );
  const maxAnnualCitations = Math.max(0, ...stats.annualCitations.map((item) => item.citations));
  const axisMax = getCitationAxisMax(maxAnnualCitations);
  const axisMid = axisMax / 2;
  const chartLabel = stats.annualCitations
    .map((item) => `${item.year} 年 ${item.citations} 次`)
    .join("，");
  return `
    <section class="citation-profile-panel" aria-labelledby="citation-profile-title">
      <div class="citation-chart-wrap">
        <div class="citation-chart${maxAnnualCitations === 0 ? " is-empty" : ""}" role="img" aria-label="年度引用次数：${escapeHtml(chartLabel)}">
          <div class="citation-profile-overlay">
            <h3 class="citation-profile-title" id="citation-profile-title">引用统计</h3>
            <span>${stats.startYear} 年至今</span>
          </div>
          <div class="citation-chart-grid" aria-hidden="true">
            <span class="citation-grid-line is-top"></span>
            <span class="citation-grid-line is-middle"></span>
            <span class="citation-grid-line is-bottom"></span>
          </div>
          <div class="citation-axis-labels" aria-hidden="true">
            <span ${animationNumberAttributes("citations:axis:max", axisMax)}>${formatCitationAxisValue(axisMax)}</span>
            <span ${animationNumberAttributes("citations:axis:mid", axisMid)}>${formatCitationAxisValue(axisMid)}</span>
            <span>0</span>
          </div>
          <div class="citation-bar-columns">
            ${stats.annualCitations.map((item) => {
              const percent = axisMax > 0 ? Math.max(0, Math.min(100, item.citations / axisMax * 100)) : 0;
              return `
                <div class="citation-bar-column">
                  <div class="citation-bar-slot">
                    <span
                      class="citation-bar${item.citations === 0 ? " is-zero" : ""}"
                      ${animationBarAttribute(`citations:year:${item.year}`)}
                      style="height:${percent.toFixed(2)}%"
                      title="${item.year} 年：${item.citations} 次引用"
                    ></span>
                  </div>
                  <span class="citation-bar-year">${item.year}</span>
                </div>
              `;
            }).join("")}
          </div>
          ${maxAnnualCitations === 0 ? '<span class="citation-chart-empty">暂无引用</span>' : ""}
        </div>
      </div>
      <div class="citation-count-strip" aria-label="引用数量统计">
        <span><strong ${animationNumberAttributes("citations:total", stats.totalCitations)}>${stats.totalCitations}</strong><small>引用</small></span>
        <span><strong ${animationNumberAttributes("citations:h-index", stats.hIndex)}>${stats.hIndex}</strong><small>h 指数</small></span>
        <span><strong ${animationNumberAttributes("citations:i10-index", stats.i10Index)}>${stats.i10Index}</strong><small>i10 指数</small></span>
      </div>
    </section>
  `;
}

function renderResearchGlobalSummary(state: GameState, publishedPapers: Paper[]): string {
  const items = [
    ["科研分", state.totalResearchScore, null],
    ["A", publishedPapers.filter((paper) => paper.target === "A").length, SCORE_BY_TARGET.A],
    ["B", publishedPapers.filter((paper) => paper.target === "B").length, SCORE_BY_TARGET.B],
    ["C", publishedPapers.filter((paper) => paper.target === "C").length, SCORE_BY_TARGET.C],
    ["Nature", publishedPapers.filter((paper) => paper.journalTarget === "nature").length, getJournalDefinition("nature").researchScore],
    ["NMI", publishedPapers.filter((paper) => paper.journalTarget === "nmi").length, getJournalDefinition("nmi").researchScore],
    ["PAMI", publishedPapers.filter((paper) => paper.journalTarget === "pami").length, getJournalDefinition("pami").researchScore],
  ] as const;

  return `
    <div class="citation-venue-grid research-global-summary" aria-label="科研分与论文发表统计">
      ${items.map(([label, count, score]) => `
        <span class="citation-venue-cell" data-summary-kind="${score === null ? "score" : ["A", "B", "C"].includes(label) ? "conference" : "journal"}"${count === 0 ? ' data-empty="true"' : ""}>
          <strong ${animationNumberAttributes(`achievements:publication:${label}`, count)}>${count}</strong>
          <small>${label}${score === null ? "" : `<span>（${score}分）</span>`}</small>
        </span>
      `).join("")}
    </div>
  `;
}

function renderResearchPaperRow(
  state: GameState,
  paper: Paper,
  index: number,
  selected: boolean,
): string {
  const venue = getPaperVenue(state, paper);
  const authors = getPaperAuthors(state, paper)
    .map((author) => author.isPlayer
      ? `<strong class="research-paper-author is-player">${escapeHtml(getNamePinyin(author.name))}</strong>`
      : `<span class="research-paper-author">${escapeHtml(getNamePinyin(author.name))}</span>`)
    .join('<span class="research-paper-author-separator">, </span>');
  const citations = paper.publication?.citations ?? 0;
  return `
    <button
      class="research-paper-row${selected ? " active" : ""}"
      type="button"
      data-ui-research-index="${index}"
      data-research-grade="${venue.marker}"
      aria-pressed="${selected ? "true" : "false"}"
      aria-label="查看第 ${index + 1} 篇论文 ${escapeHtml(paper.title)}"
    >
      <span class="research-paper-row-main">
        <strong class="research-paper-title" title="${escapeHtml(paper.title)}">${escapeHtml(paper.title)}</strong>${paper.publication?.highlyCited === true ? '<span class="research-paper-achievement">🏆ESI高被引</span>' : ""}
        <span class="research-paper-authors">${authors}</span>
        <span class="research-paper-venue" title="${escapeHtml(`${venue.full} (${venue.short})`)}">${escapeHtml(venue.full)} <span>(${escapeHtml(venue.short)})</span></span>
      </span>
      <span class="research-paper-row-meta">
        <span class="research-paper-row-stat" aria-label="引用 ${citations}"><strong ${animationNumberAttributes(`paper:${paper.id}:research-list:citations`, citations)}>${citations}</strong><small>引用</small></span>
        <span class="research-paper-row-stat" aria-label="年份 ${venue.year}"><strong>${venue.year}</strong><small>年份</small></span>
      </span>
    </button>
  `;
}

function renderResearchPaperAuthors(state: GameState, paper: Paper): string {
  return getPaperAuthors(state, paper)
    .map((author) => author.isPlayer
      ? `<strong class="research-paper-author is-player">${escapeHtml(getNamePinyin(author.name, false))}</strong>`
      : `<span class="research-paper-author">${escapeHtml(getNamePinyin(author.name, false))}</span>`)
    .join('<span class="research-paper-author-separator">, </span>');
}

function renderSelectedResearchPaper(state: GameState, paper: Paper | null): string {
  if (!paper) {
    return '<div class="research-detail-empty">选择一篇论文查看详情</div>';
  }

  const venue = getPaperVenue(state, paper);
  const acceptedScore = getAcceptedPaperScore(paper);
  const currentScore = paper.publication?.effectiveScore ?? acceptedScore;
  const citations = paper.publication?.citations ?? 0;
  const citationMultiplier = getPaperCitationMultiplier(state, paper);
  const citationExposurePending = paper.target !== null
    && paper.conferenceHandled !== true
    && paper.publication?.preprintExposed !== true;
  const displayedCitationMultiplier = citationExposurePending ? 0 : citationMultiplier;
  const publicationLabel = venue.journal
    ? "\u671f\u520a"
    : paper.conferenceHandled !== true
      ? paper.publication?.preprintExposed === true ? "arXiv" : "\u672a\u5f00\u4f1a"
      : paper.publication?.acceptType ?? "Poster";
  const publicationMultiplier = venue.journal
    ? 1
    : paper.conferenceHandled !== true
      ? paper.publication?.preprintExposed === true ? 1 : 0
      : getPaperConferencePromotionMultiplier(paper.publication?.acceptType);
  const durationMonths = paper.publication?.monthsSincePublish ?? 0;
  return `
    <section class="research-current-card" aria-labelledby="research-current-title">
      <div class="research-card">
        <div class="research-card-header">
          <div class="research-detail-heading">
            <h3 class="research-title" id="research-current-title">${escapeHtml(paper.title)}</h3>
          </div>
        </div>
        <div class="research-paper-authors">${renderResearchPaperAuthors(state, paper)}</div>
        <div class="research-paper-conference">
          <span>${escapeHtml(venue.full)}</span>
          <strong>(${escapeHtml(`${venue.short} ${venue.year}`)})</strong>
        </div>
        <div class="research-paper-lifecycle">
          <span>${venue.year} 年</span>
          <span>${renderAnimatedNumber(`paper:${paper.id}:research-lifecycle:citations`, citations)} 引用</span>
          <span>热度 ×${paper.heatMultiplier.toFixed(2)}</span>
        </div>
        <div class="research-metric-grid research-metric-grid-legacy">
          <div class="research-metric-item"><span>录用分</span><strong>${acceptedScore}</strong></div>
          <div class="research-metric-item"><span>当前分</span><strong ${animationNumberAttributes(`paper:${paper.id}:research-legacy:score`, currentScore)}>${currentScore}</strong></div>
          <div class="research-metric-item"><span>引用倍率</span><strong>×${renderAnimatedNumber(`paper:${paper.id}:research-legacy:citation-multiplier`, citationMultiplier, citationMultiplier.toFixed(2))}</strong></div>
        </div>
        <div class="research-metric-grid research-metric-grid-expanded">
          <div class="research-metric-item"><span>\u5f15\u7528</span><strong ${animationNumberAttributes(`paper:${paper.id}:research-detail:citations`, citations)}>${citations}</strong></div>
          <div class="research-metric-item"><span>\u5f55\u7528\u5206</span><strong>${acceptedScore}</strong></div>
          <div class="research-metric-item"><span>\u5f53\u524d\u5206</span><strong ${animationNumberAttributes(`paper:${paper.id}:research-detail:score`, currentScore)}>${currentScore}</strong></div>
          <div class="research-metric-item"><span>\u5386\u65f6</span><strong>${renderAnimatedNumber(`paper:${paper.id}:research-detail:months`, durationMonths)}\u4e2a\u6708</strong></div>
          <div class="research-metric-item research-metric-item-publication-type">
            <span class="research-publication-label">${publicationLabel === "Best Paper Candidate"
              ? '<span>Best Paper</span><span>Candidate</span>'
              : escapeHtml(publicationLabel)}</span><strong>\u00d7${renderAnimatedNumber(`paper:${paper.id}:research-detail:publication-multiplier`, publicationMultiplier, venue.journal ? publicationMultiplier.toFixed(1) : String(publicationMultiplier))}</strong>
          </div>
          <div class="research-metric-item"><span>\u70ed\u5ea6${renderPaperHistoryBadges(paper, false, "research-detail")}</span><strong>\u00d7${renderAnimatedNumber(`paper:${paper.id}:research-detail:heat`, paper.heatMultiplier, paper.heatMultiplier.toFixed(2))}</strong></div>
          <div class="research-metric-item"><span>\u5f71\u54cd\u529b</span><strong>\u00d7${venue.influence.toFixed(2)}</strong></div>
          <div class="research-metric-item"><span>\u603b\u5f15\u7528\u500d\u7387</span><strong>${displayedCitationMultiplier === 0 ? renderAnimatedNumber(`paper:${paper.id}:research-detail:citation-multiplier`, 0) : `\u00d7${renderAnimatedNumber(`paper:${paper.id}:research-detail:citation-multiplier`, displayedCitationMultiplier, displayedCitationMultiplier.toFixed(2))}`}</strong></div>
        </div>
        ${renderResearchPromotionActions(state, paper)}
      </div>
    </section>
  `;
}

function renderResearchSection(state: GameState, uiState: PlayRenderUiState = {}): string {
  const preEnrollment = isGameplayModuleLocked(state);
  if (preEnrollment) {
    return `
      <div class="right-section research-section" id="research-section">
        <div class="section-empty play-module-lock-state">入学后开放</div>
      </div>
    `;
  }

  const publishedPapers = getPublishedPapers(state);
  const authorshipFilter = uiState.researchAuthorshipFilter === "first" || uiState.researchAuthorshipFilter === "coauthor"
    ? uiState.researchAuthorshipFilter
    : "all";
  const filteredPapers = publishedPapers.filter((paper) => authorshipFilter === "all"
    || (authorshipFilter === "first" ? paper.nonFirstAuthor !== true : paper.nonFirstAuthor === true));
  const sortMode: ResearchSortMode = uiState.researchSortMode === "citations" ? "citations" : "year";
  const publicationIndices = new Map(publishedPapers.map((paper, index) => [paper.id, index]));
  const sortedPapers = [...filteredPapers].sort((left, right) => {
    const leftVenue = getPaperVenue(state, left);
    const rightVenue = getPaperVenue(state, right);
    if (sortMode === "citations") {
      return (right.publication?.citations ?? 0) - (left.publication?.citations ?? 0)
        || rightVenue.year - leftVenue.year;
    }
    return rightVenue.year - leftVenue.year
      || (right.acceptedTotalMonths ?? 0) - (left.acceptedTotalMonths ?? 0)
      || (right.acceptedOrder ?? 0) - (left.acceptedOrder ?? 0)
      || publicationIndices.get(right.id)! - publicationIndices.get(left.id)!;
  });
  const currentPaperIndex = sortedPapers.length === 0
    ? 0
    : Math.min(Math.max(uiState.currentResearchPaperIndex ?? 0, 0), sortedPapers.length - 1);
  const researchPageCount = Math.max(1, Math.ceil(sortedPapers.length / RESEARCH_PAGE_SIZE));
  const researchPageIndex = sortedPapers.length === 0
    ? 0
    : Math.min(Math.floor(currentPaperIndex / RESEARCH_PAGE_SIZE), researchPageCount - 1);
  const researchPageStart = researchPageIndex * RESEARCH_PAGE_SIZE;
  const visiblePapers = sortedPapers.slice(researchPageStart, researchPageStart + RESEARCH_PAGE_SIZE);
  const selectedPaper = sortedPapers[currentPaperIndex] ?? null;

  return `
    <div class="right-section research-section" id="research-section">
      ${renderResearchGlobalSummary(state, publishedPapers)}
      <div class="research-compact-layout">
        <section class="research-library" aria-labelledby="research-library-title">
          <div class="research-library-header">
            <div class="research-library-heading" aria-hidden="true"></div>
            ${researchPageCount > 1 ? `
              <div class="research-pagination" role="group" aria-label="论文分页">
                <button type="button" data-ui-research-page="${Math.max(0, researchPageStart - RESEARCH_PAGE_SIZE)}"${researchPageIndex === 0 ? " disabled" : ""} aria-label="上一页"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
                <span><strong>${researchPageIndex + 1}</strong> / ${researchPageCount}</span>
                <button type="button" data-ui-research-page="${Math.min((researchPageCount - 1) * RESEARCH_PAGE_SIZE, researchPageStart + RESEARCH_PAGE_SIZE)}"${researchPageIndex >= researchPageCount - 1 ? " disabled" : ""} aria-label="下一页"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
              </div>
            ` : ""}
            <div class="research-sort-controls" role="group" aria-label="论文排序">
              <button class="research-sort-btn${sortMode === "citations" ? " active" : ""}" type="button" data-ui-research-sort="citations" aria-pressed="${sortMode === "citations" ? "true" : "false"}">引用</button>
              <button class="research-sort-btn${sortMode === "year" ? " active" : ""}" type="button" data-ui-research-sort="year" aria-pressed="${sortMode === "year" ? "true" : "false"}">年份</button>
            </div>
          </div>
          <div class="research-switch-btns research-paper-list" id="research-switch-btns">
            ${sortedPapers.length > 0
              ? visiblePapers.map((paper, index) => renderResearchPaperRow(state, paper, researchPageStart + index, researchPageStart + index === currentPaperIndex)).join("")
              : '<div class="no-papers">暂无已发表论文</div>'}
          </div>
        </section>
        <aside class="research-results-primary">
          ${renderCitationProfile(state, publishedPapers)}
          ${sortedPapers.length > 0 ? renderSelectedResearchPaper(state, selectedPaper) : ""}
        </aside>
      </div>
    </div>
  `;
}

function normalizeTalentPanelTab(tabId: TalentPanelTabId | undefined): TalentPanelTabId {
  return tabId === "relation" || tabId === "equip" || tabId === "growth" || tabId === "publication" ? tabId : "character";
}

function renderTalentTabButton(tabId: TalentPanelTabId, icon: string, label: string, active: boolean): string {
  return `
    <button
    class="panel-switch-btn shop-tab-btn${active ? " active" : ""}"
      type="button"
      data-ui-talent-tab="${tabId}"
      aria-pressed="${active ? "true" : "false"}"
    ><span class="talent-tab-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>
  `;
}

function renderTalentPanelItem(item: TalentPanelItem, showStatus = true): string {
  const progress = item.progress;
  const progressLabel = progress ? progress.valueLabel.replace(/\d+(?:\.\d+)?/, (display) => renderAnimatedNumber(`talent:${item.id}:progress:value`, progress.displayValue ?? progress.value, display))
    .replace(/(?<=\/)\+?\d+(?:\.\d+)?/, (display) => progress.animateMax ? `${display.startsWith("+") ? "+" : ""}${renderAnimatedNumber(`talent:${item.id}:progress:cap`, progress.max)}` : display) : "";
  const progressPercent = progress
    ? clampPercent(progress.value / Math.max(1, progress.max) * 100)
    : 0;
  return `
    <article
      class="talent-item talent-item-row${item.active ? " is-active" : " is-inactive"}${item.ruleCard ? " talent-rule-card" : ""}"
      data-talent-item-id="${escapeHtml(item.id)}"
    >
      <div class="talent-item-head">
        <span class="talent-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <div class="talent-item-heading">
          <strong class="talent-item-title">${escapeHtml(item.name)}</strong>
        </div>
        ${showStatus && !item.hideStatus ? `<span class="talent-item-tag${item.advisorSalaryPager || item.loverRewardPager ? " talent-item-status" : ""}${item.active ? " is-active" : " is-inactive"}">${escapeHtml(item.tagLabel ?? (item.active ? "已激活" : "未激活"))}</span>` : ""}
        ${item.advisorSalaryPager ? `<div class="research-pagination" role="group" aria-label="查看导师职称">
          <button type="button" data-ui-advisor-salary-start="${item.advisorSalaryPager.startIndex - 1}"${item.advisorSalaryPager.startIndex === 0 ? " disabled" : ""} title="查看较低职称" aria-label="查看较低职称"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <button type="button" data-ui-advisor-salary-start="${item.advisorSalaryPager.startIndex + 1}"${item.advisorSalaryPager.startIndex === item.advisorSalaryPager.lastStartIndex ? " disabled" : ""} title="查看较高职称" aria-label="查看较高职称"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>` : item.loverRewardPager ? `<div class="research-pagination" role="group" aria-label="查看恋人奖励">
          <button type="button" data-ui-lover-reward-page="${item.loverRewardPager.page - 1}"${item.loverRewardPager.page === 0 ? " disabled" : ""} title="上一条奖励" aria-label="上一条奖励"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
          <button type="button" data-ui-lover-reward-page="${item.loverRewardPager.page + 1}"${item.loverRewardPager.page === 2 ? " disabled" : ""} title="下一条奖励" aria-label="下一条奖励"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
        </div>` : ""}
      </div>
      ${item.metrics ? `
        <div class="talent-item-metrics">
          ${item.metrics.map((metric) => `
            <div class="talent-item-metric">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${metric.animation ? renderAnimatedTemplate(`talent:${item.id}:metric:${metric.label}`, metric.animation.template, metric.animation.values, metric.animation.displays) : escapeHtml(metric.value)}</strong>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${item.rewardTable ? `
        <table class="talent-item-rewards" aria-label="${escapeHtml(item.rewardTable.label)}">
          ${item.id === "lover" ? "" : `<thead><tr>${item.rewardTable.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead>`}
          <tbody>${item.rewardTable.rows.map((row, rowIndex) => `
            <tr${item.rewardTable?.currentRow === rowIndex ? ' class="is-current" aria-current="true"' : ""}>${row.map((value, index) => index === 0
              ? `<th scope="row">${escapeHtml(value)}</th>`
              : `<td>${escapeHtml(value)}</td>`).join("")}</tr>
          `).join("")}</tbody>
        </table>
      ` : ""}
      ${progress ? `
        <div class="talent-item-progress">
          <div class="talent-item-progress-head">
            <div class="talent-item-progress-track" role="progressbar" aria-label="${escapeHtml(`${progress.label} ${progress.valueLabel}`)}" aria-valuemin="0" aria-valuemax="${progress.max}" aria-valuenow="${progress.value}" aria-valuetext="${escapeHtml(progress.valueLabel)}">
              <span ${animationBarAttribute(`talent:${item.id}:progress`)} style="width:${progressPercent.toFixed(1)}%"></span>
            </div>
            <strong>${progressLabel}</strong>
          </div>
        </div>
      ` : ""}
      ${item.description ? `<p class="talent-item-desc">${item.descriptionAnimation ? renderAnimatedTemplate(`talent:${item.id}:description`, item.descriptionAnimation.template, item.descriptionAnimation.values) : escapeHtml(item.description)}</p>` : ""}
      ${item.rewardRules ? `
        <details class="talent-item-reward-rules">
          <summary>奖励规则</summary>
          <ul>${item.rewardRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
        </details>
      ` : ""}
      ${item.detail ? `<p class="talent-item-note">${escapeHtml(item.detail)}</p>` : ""}
      ${!item.active && item.requirement ? `<p class="talent-item-note is-requirement">${escapeHtml(item.requirement)}</p>` : ""}
    </article>
  `;
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

  return items;
}

function buildLoverTalentItem(state: GameState, requestedPage = 0): TalentPanelItem {
  const page = Number.isFinite(requestedPage) ? Math.min(2, Math.max(0, Math.floor(requestedPage))) : 0;
  const route = LOVER_ROUTES[page]!;
  const active = state.loverState.active && state.loverProgressState.active;
  const nextReward = route === "shopping" ? 0 : (state.loverProgressState.routes?.[route].completed ?? 0) % 3;
  const labels = { play: "玩耍", study: "学习", shopping: "购物" };
  const rows = route === "play"
    ? [["玩耍奖励Ⅰ", "SAN+6"], ["玩耍奖励Ⅱ", "SAN上限+1"], ["玩耍奖励Ⅲ", "下月SAN消耗-1"]]
    : route === "study"
      ? [["学习奖励Ⅰ", "论文随机一项+恋人科研"], ["学习奖励Ⅱ", "论文三项分数永久+1"], ["学习奖励Ⅲ", "科研能力较低者+1"]]
      : [["购物奖励", "礼物券+1、亲密+2"]];
  return {
    id: "lover",
    icon: "💕",
    name: "恋人",
    active,
    ruleCard: true,
    loverRewardPager: { page },
    rewardTable: {
      label: `${labels[route]}进度满100奖励`,
      columns: [],
      rows,
      currentRow: active ? nextReward : undefined,
    },
    description: "对应进度条满100后，循环获得奖励",
  };
}

function buildRelationTalentItems(state: GameState, requestedSalaryStart?: number | null, loverRewardPage = 0): TalentPanelItem[] {
  const salaryRows = [null, ...ADVISOR_GRANTS].map((grant) => {
    const advisor = {
      ...state.advisorProgressState,
      awards: grant ? [{ id: grant.id, awardedYear: 0, startYear: null, endYear: null }] : [],
    };
    return [getAdvisorRankLabel(advisor), grant?.name ?? "—", String(getAdvisorMonthlySalary(advisor, "master")), String(getAdvisorMonthlySalary(advisor, "phd"))];
  });
  const currentRank = salaryRows.findIndex((row) => row[0] === getAdvisorRankLabel(state.advisorProgressState));
  const lastStartIndex = salaryRows.length - 2;
  const startIndex = Math.max(0, Math.min(lastStartIndex, Math.floor(
    typeof requestedSalaryStart === "number" && Number.isFinite(requestedSalaryStart) ? requestedSalaryStart : currentRank,
  )));
  return [
    {
      id: "advisor",
      icon: "👨‍🏫",
      name: "导师晋升",
      active: true,
      ruleCard: true,
      advisorSalaryPager: { startIndex, lastStartIndex },
      rewardTable: {
        label: "各职称每月补助，单位金币",
        columns: ["职称", "晋升条件", "硕士/月", "博士/月"],
        rows: salaryRows.slice(startIndex, startIndex + 2),
        currentRow: currentRank - startIndex,
      },
      description: "晋升后下月加薪；小数累计，发放整数金币",
    },
    {
      id: "lab-mutual-growth",
      icon: "🧪",
      name: "实验室传承",
      active: true,
      hideStatus: true,
      ruleCard: true,
      metrics: [
        { label: "认识周期", value: "12个月" },
        { label: "同学科研", value: "+⌊n/2⌋" },
      ],
      description: "n为科研比自己高的人数，比较玩家和其他同学；导师视为1人，恋人不计",
    },
    {
      id: "fellow-paper-cooperation",
      icon: "🤝",
      name: "论文合作",
      active: true,
      hideStatus: true,
      ruleCard: true,
      metrics: [
        { label: "共同发表", value: "每篇" },
        { label: "默契增加", value: "+1" },
      ],
      description: "双方任一人一作均可，中稿后提升与参与同学的默契",
    },
    buildLoverTalentItem(state, loverRewardPage),
    ...[
      { id: "joint-training", icon: "🧠", name: "大牛联培" },
      { id: "internship", icon: "💼", name: "企业实习" },
    ].map((item) => ({
      ...item,
      active: false,
      tagLabel: "待定",
      description: "具体天赋效果待定",
    })),
  ];
}

function getChairTalentItem(state: GameState): TalentPanelItem | null {
  if (!state.shopState.chairOwned) return null;

  const chairSanRecovered = Math.max(0, Math.floor(state.shopState.chairSanRecovered ?? 0));
  const recoveryMetrics = (effect: string): NonNullable<TalentPanelItem["metrics"]> => [
    { label: "累计回复 SAN", value: `+${chairSanRecovered}`, animation: { template: "+{recovered}", values: { recovered: chairSanRecovered } } },
    { label: "当前效果", value: effect, ...(state.shopState.chairUpgrade === "massage" || state.shopState.chairUpgrade === "torture"
      ? { animation: { template: "每月 +{recovery}", values: { recovery: getChairMonthlyRecovery(state.shopState, state.player.san, state.sanCap) } } } : {}) },
  ];
  const currentRecovery = getChairMonthlyRecovery(state.shopState, state.player.san, state.sanCap);
  if (state.shopState.chairUpgrade === "advanced") {
    return {
      id: "chair",
      icon: "🪑",
      name: "人体工学椅",
      active: true,
      description: "效果：每月 SAN +2。",
      metrics: recoveryMetrics("每月 +2"),
    };
  }
  if (state.shopState.chairUpgrade === "massage") {
    return {
      id: "chair",
      icon: "🪑",
      name: "电动按摩椅",
      active: true,
      description: `效果：每月恢复已损 SAN 的 20%（下取整，当前 +${currentRecovery}）。`,
      descriptionAnimation: { template: "效果：每月恢复已损 SAN 的 20%（下取整，当前 +{recovery}）。", values: { recovery: currentRecovery } },
      metrics: recoveryMetrics(`每月 +${currentRecovery}`),
    };
  }
  if (state.shopState.chairUpgrade === "torture") {
    return {
      id: "chair",
      icon: "🪑",
      name: "沙发",
      active: true,
      description: `效果：每月恢复当前 SAN 的 20%（下取整，当前 +${currentRecovery}）。`,
      descriptionAnimation: { template: "效果：每月恢复当前 SAN 的 20%（下取整，当前 +{recovery}）。", values: { recovery: currentRecovery } },
      metrics: recoveryMetrics(`每月 +${currentRecovery}`),
    };
  }
  if (state.shopState.chairUpgrade === "spike") {
    return {
      id: "chair",
      icon: "🪑",
      name: "锥刺股椅",
      active: true,
      description: "效果：SAN 小于等于 0 时恢复到 3。",
      metrics: recoveryMetrics("SAN≤0 → +3"),
    };
  }
  if (state.shopState.chairUpgrade === "hammock") {
    return {
      id: "chair",
      icon: "🪑",
      name: "吊床",
      active: true,
      description: "效果：休息动作从 SAN +2 提升为 SAN +5。",
      metrics: recoveryMetrics("休息 +5"),
    };
  }

  return {
    id: "chair",
    icon: "🪑",
    name: "办公椅",
    active: true,
    description: "效果：每月 SAN +1。",
    metrics: recoveryMetrics("每月 +1"),
  };
}

function getBikeTalentItem(state: GameState): TalentPanelItem | null {
  if (!state.shopState.bikeOwned) return null;
  const tier = getBikeTierDefinition(state.shopState.bikeLevel);
  const capLimit = getBikeSanCapLimit(state.shopState);
  const sanSpent = Math.max(0, Math.floor(state.shopState.bikeSanSpent ?? 0));
  const capGains = Math.max(0, Math.min(capLimit, Math.floor(state.shopState.bikeSanCapGains ?? 0)));
  const capReached = capLimit > 0 && capGains >= capLimit;
  return {
    id: "bike",
    icon: "🚲",
    name: tier?.name ?? "自行车",
    active: true,
    description: tier
      ? capReached
        ? "效果：SAN 上限已满，后续每月不再消耗 SAN。"
        : `效果：每月 SAN -${tier.monthlySanCost}；每 -6 SAN，上限 +1（最多 +${capLimit}）。`
      : "效果：购入后逐级提升骑行消耗与 SAN 上限成长。",
    metrics: tier
      ? [
          { label: "累计消耗 SAN", value: `${sanSpent}`, animation: { template: "{spent}", values: { spent: sanSpent } } },
          { label: "每月消耗", value: capReached ? "0" : `-${tier.monthlySanCost}`, animation: { template: capReached ? "{cost}" : "-{cost}", values: { cost: capReached ? 0 : tier.monthlySanCost } } },
        ]
      : undefined,
    progress: tier
      ? {
          label: "SAN 上限成长",
          value: capGains,
          max: Math.max(1, capLimit),
          valueLabel: `+${capGains}/+${capLimit}`,
          animateMax: true,
        }
      : undefined,
  };
}

function renderPublicationTalentReward(reward: ReturnType<typeof getPublicationTalentChecklist>[number]["reward"]): string {
  const rewards = [
    { label: "SAN", value: reward.san },
    { label: "好感", value: reward.favor },
    { label: "社交", value: reward.social },
    { label: "科研", value: reward.research },
    { label: "科研上限", value: reward.researchCap },
  ].filter((entry) => entry.value !== 0);
  return `<div class="publication-talent-reward">${rewards.map((entry) =>
    `<span class="publication-reward-item"><span>${entry.label}</span><strong>+${entry.value}</strong></span>`).join("")}</div>`;
}

function renderPublicationTalentCards(state: GameState): string {
  return getPublicationTalentChecklist(state).map((item) => `
    <article class="talent-item talent-item-row publication-talent-card${item.completed ? " is-completed" : ""}" data-talent-item-id="publication-talent-${item.id}">
      <div class="publication-talent-heading">
        <span class="publication-talent-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="talent-item-tag ${item.completed ? "is-active" : "is-inactive"}">${item.completed ? "已达成" : "未达成"}</span>
      </div>
      ${renderPublicationTalentReward(item.reward)}
      <p class="talent-item-desc publication-talent-condition">${escapeHtml(item.description)}</p>
    </article>
  `).join("");
}

function buildGrowthTalentItems(state: GameState): TalentPanelItem[] {
  const readCount = Math.max(0, Math.floor(state.readingState.readCount));
  const workCount = Math.max(0, Math.floor(state.partTimeWorkCount));
  const meetingCount = Math.max(0, Math.floor(state.eventCounters.meetingCount));
  const workPreview = previewPartTimeWork(state);
  const meetingDiscounts = [2, 4, 6].map((cost) => getMeetingSelfPayDiscount(meetingCount, cost));
  const nextReadingIdeaBonus = getReadingIdeaBonus(readCount + 1);
  const badmintonCount = Math.max(0, Math.floor(state.eventCounters.badmintonCount));
  const pokerCount = Math.max(0, Math.floor(state.eventCounters.pokerCount));
  const pokerProfit = state.eventCounters.pokerProfit ?? 0;
  const badmintonStrength = getBadmintonStrength(
    state.player.san,
    badmintonCount,
    state.eventSupport.hasBadmintonRacket,
  );
  const pokerRate = getPokerWinRate(pokerCount);
  return [
    {
      id: "reading-growth",
      icon: "📖",
      name: "阅读积累",
      active: true,
      description: "每 10 次阅读，科研 +1；idea buff 效果 +1",
      metrics: [
        { label: "已看", value: `${readCount} 次`, animation: { template: "{count} 次", values: { count: readCount } } },
        { label: "下次想 idea", value: `+${nextReadingIdeaBonus}`, animation: { template: "+{bonus}", values: { bonus: nextReadingIdeaBonus } } },
      ],
      progress: {
        label: "升档进度",
        value: readCount % 10,
        max: 10,
        valueLabel: `${readCount % 10}/10`,
      },
    },
    {
      id: "part-time-growth",
      icon: "💼",
      name: "兼职熟练度",
      active: true,
      description: "每 8 次打工，金币收入 +1，SAN 消耗 +1",
      metrics: [
        { label: "已打工", value: `${workCount} 次`, animation: { template: "{count} 次", values: { count: workCount } } },
        { label: "下次金币", value: `+${workPreview.moneyReward}`, animation: { template: "+{reward}", values: { reward: workPreview.moneyReward } } },
        { label: "下次 SAN", value: `-${workPreview.sanCost}`, animation: { template: "-{cost}", values: { cost: workPreview.sanCost } } },
      ],
      progress: {
        label: "升档进度",
        value: workCount % 8,
        max: 8,
        valueLabel: `${workCount % 8}/8`,
      },
    },
    {
      id: "meeting-experience",
      icon: "🧳",
      name: "会议经验",
      active: true,
      description: "每 4 次参会，参会减免 +1 金币（最多半价）",
      metrics: [
        { label: "已参会", value: `${meetingCount} 次`, animation: { template: "{count} 次", values: { count: meetingCount } } },
        ...["国内", "亚太", "欧美"].map((label, index) => ({ label, value: `-${meetingDiscounts[index]}`, animation: { template: "-{discount}", values: { discount: meetingDiscounts[index]! } } })),
      ],
      progress: {
        label: "升级进度",
        value: meetingCount % 4,
        max: 4,
        valueLabel: `${meetingCount % 4}/4`,
      },
    },
    {
      id: "badminton-growth",
      icon: "🏸",
      name: "羽毛球水平",
      active: true,
      description: `获胜：SAN×（参加次数 + 3）+ 球拍 40达${BADMINTON_VICTORY_THRESHOLD}`,
      metrics: [
        { label: "获胜后每月 SAN +1", value: state.eventSupport.hasStrongBodyTalent ? "✅" : "—" },
        { label: "已参加", value: `${badmintonCount} 次`, animation: { template: "{count} 次", values: { count: badmintonCount } } },
      ],
      progress: {
        label: "水平进度",
        value: Math.min(badmintonStrength, BADMINTON_VICTORY_THRESHOLD),
        max: BADMINTON_VICTORY_THRESHOLD,
        valueLabel: `${badmintonStrength}/${BADMINTON_VICTORY_THRESHOLD}`,
        displayValue: badmintonStrength,
      },
    },
    {
      id: "poker-growth",
      icon: "🃏",
      name: "牌局策略",
      active: true,
      description: "胜率 = 40 + 参加次数 × 10%",
      metrics: [
        { label: "累计赚取金币", value: `${pokerProfit >= 0 ? "+ " : "- "}${Math.abs(pokerProfit)}`, animation: { template: "{profit}", values: { profit: pokerProfit }, displays: { profit: `${pokerProfit >= 0 ? "+ " : "- "}${Math.abs(pokerProfit)}` } } },
        { label: "已参加", value: `${pokerCount} 次`, animation: { template: "{count} 次", values: { count: pokerCount } } },
      ],
      progress: {
        label: "策略进度",
        value: pokerRate,
        max: ACTIVITY_WIN_RATE_CAP,
        valueLabel: `${pokerRate}%`,
      },
    },
  ];
}

function buildEquipTalentItems(state: GameState): TalentPanelItem[] {
  const aiCollaboration = getAiCollaborationStatus(state.aiShopState);
  const fullGearActive = hasFullGear(state.shopState, state.eventSupport);
  const items: TalentPanelItem[] = [
    {
      id: "full-gear",
      icon: "🎒",
      name: "整装待发",
      active: fullGearActive,
      description: "激活后小电驴效果改为春夏秋冬 SAN +1",
      detail: undefined,
      metrics: [
        { label: "小电驴", value: state.shopState.ebikeOwned ? "✅" : "—" },
        { label: "遮阳伞", value: state.eventSupport.hasParasol ? "✅" : "—" },
        { label: "羽绒服", value: state.eventSupport.hasDownJacket ? "✅" : "—" },
      ],
    },
    {
      id: "ai-collaboration",
      icon: "🤖",
      name: "AI 协作",
      active: aiCollaboration.active,
      description: "激活后可额外进行 1 次科研操作，额外操作不消耗行动点，但 SAN 消耗 +2",
      metrics: [
        { label: "GPT/Claude", value: aiCollaboration.hasCoreModel ? "✅" : "—" },
        { label: "AI·Ⅱ", value: aiCollaboration.activeAiCount >= 2 ? "✅" : "—" },
        { label: "AI·Ⅲ", value: aiCollaboration.activeAiCount >= 3 ? "✅" : "—" },
      ],
    },
  ];

  const chairItem = getChairTalentItem(state);
  if (chairItem) items.push(chairItem);

  const bikeItem = getBikeTalentItem(state);
  if (bikeItem) items.push(bikeItem);

  if (state.shopState.ebikeOwned) {
    items.push({
      id: "ebike",
      icon: "🛵",
      name: "小电驴",
      active: true,
      description: "效果：春季、秋季每月 SAN +1；整装待发后四季每月 SAN +1。",
      detail: hasFullGear(state.shopState, state.eventSupport) ? "当前四季每月 SAN +1。" : "当前春、秋每月 SAN +1。",
    });
  }

  if (state.coffeeState.machineOwned) {
    const coffeeUpgrade = state.coffeeState.machineUpgrade;
    const coffeeBonus = getCurrentCoffeeBonus(state.coffeeState);
    const trackedCoffeeCount = Math.max(0, Math.floor(state.coffeeState.machineTrackedCoffeeCount ?? 0));
    const detail = coffeeUpgrade === "manual"
      ? "冰美式价格降低 1 金币"
      : coffeeUpgrade === "automatic"
        ? "每月初额外生产一杯冰美式"
        : coffeeUpgrade === "advanced"
          ? undefined
          : coffeeUpgrade === "unlimited"
            ? "每月可无限生产冰美式，价格逐杯递增"
            : "可以生产冰美式，每月 1 杯";
    items.push({
      id: "coffee-machine",
      icon: "☕",
      name: "咖啡机",
      active: true,
      description: coffeeUpgrade === "advanced"
        ? "效果：每累计生产 10 杯冰美式，额外 SAN +1，最多 +5。"
        : `${getCoffeeMachineOwnedText(state.coffeeState)}。`,
      detail: detail ? `${detail}。` : undefined,
      metrics: coffeeUpgrade === "advanced"
        ? [
            { label: "累计生产", value: `${trackedCoffeeCount} 杯`, animation: { template: "{count} 杯", values: { count: trackedCoffeeCount } } },
            { label: "当前额外 SAN", value: `+${coffeeBonus}`, animation: { template: "+{bonus}", values: { bonus: coffeeBonus } } },
          ]
        : undefined,
      progress: coffeeUpgrade === "advanced"
        ? {
            label: "效果提升",
            value: Math.min(50, trackedCoffeeCount),
            max: 50,
            valueLabel: `${Math.min(50, trackedCoffeeCount)}/50 杯`,
          }
        : undefined,
    });
  }

  if (state.shopState.gpuLevel > 0) {
    const experimentModifier = getShopPaperActionModifier(state.shopState, "experiment");
    const gpuTier = getGpuTierDefinition(state.shopState.gpuLevel);
    items.push({
      id: "gpu",
      icon: "🖥️",
      name: gpuTier?.name ?? "显卡",
      active: true,
      description: `效果：做实验 +${experimentModifier.extraActions} 次，做实验 +${experimentModifier.bonus} 分。`,
      descriptionAnimation: { template: "效果：做实验 +{actions} 次，做实验 +{bonus} 分。", values: { actions: experimentModifier.extraActions, bonus: experimentModifier.bonus } },
    });
  }

  return items;
}

function renderTalentSection(
  state: GameState,
  role: RoleDefinition,
  activeTalentTab: TalentPanelTabId | undefined,
  advisorSalaryStartIndex?: number | null,
  loverRewardPage?: number,
): string {
  const tabId = normalizeTalentPanelTab(activeTalentTab);
  const items = tabId === "relation"
    ? buildRelationTalentItems(state, advisorSalaryStartIndex, loverRewardPage)
    : tabId === "equip"
      ? buildEquipTalentItems(state)
      : tabId === "publication"
        ? []
      : tabId === "growth"
        ? buildGrowthTalentItems(state)
        : buildCharacterTalentItems(state, role);

  return `
    <div class="talent-panel">
      <div class="talent-header-row">
        <div class="panel-switch-btns shop-tab-btns talent-tab-switches">
          ${renderTalentTabButton("character", "👤", "角色", tabId === "character")}
          ${renderTalentTabButton("relation", "🤝", "关系", tabId === "relation")}
          ${renderTalentTabButton("equip", "🎒", "装备", tabId === "equip")}
          ${renderTalentTabButton("growth", "🌱", "成长", tabId === "growth")}
          ${renderTalentTabButton("publication", "📜", "发表", tabId === "publication")}
        </div>
      </div>
      <div class="talent-items-list" id="talent-items-list" data-talent-panel-tab="${tabId}">
        ${tabId === "publication" ? renderPublicationTalentCards(state) : items.map((item) => renderTalentPanelItem(item, tabId !== "growth")).join("")}
      </div>
    </div>
  `;
}


function renderSettingsSection(state: GameState): string {
  return `
    <div class="settings-panel">
      <div class="settings-quick-actions" id="settings-panel-content">
        <button class="settings-primary-btn" type="button" data-ui-open-debug-window>
          <span aria-hidden="true">🛠️</span><span>打开调试面板</span>
        </button>
        <button class="settings-primary-btn is-restart" type="button" data-action="restart-game">
          <i data-lucide="rotate-ccw" aria-hidden="true"></i>
          <span>重开</span>
        </button>
        <button class="settings-primary-btn is-return" type="button" data-action="reset-game">
          <i data-lucide="house" aria-hidden="true"></i>
          <span>返回开始页</span>
        </button>
        <button class="settings-community-button" type="button" data-ui-open-feedback>
          <i data-lucide="message-square" aria-hidden="true"></i>
          <span>留言反馈</span>
        </button>
      </div>
      <section class="settings-plan" aria-labelledby="settings-plan-title">
        <div class="settings-plan-header">
          <strong id="settings-plan-title">🗺️ 后续计划</strong>
          <span>当前：事件与人际联动</span>
        </div>
        <ol class="settings-plan-list">
          <li class="is-complete"><span>✓</span><strong>游戏内基础系统</strong><small>科研三项、论文槽、会议与期刊投稿、审稿与引用、商店、事件、日志、结局和访问统计</small></li>
          <li class="is-current"><span>→</span><strong>事件与人际联动</strong><small>让师兄师姐、师弟师妹、同门和恋人事件接入真实关系、人物论文、合作署名、互助结算与关系变更</small></li>
          <li><span>3</span><strong>导师成长与会议事件</strong><small>补齐导师科研积累、科研经费、基金申请与公布、职称晋升、组会、开会和导师项目结果</small></li>
          <li><span>4</span><strong>联培、实习、求职与大论文</strong><small>修复联培和企业实习的触发条件，补充求职选择、学位论文、答辩流程和毕业前后衔接</small></li>
          <li><span>5</span><strong>成就、经验与角色天赋</strong><small>完成跨局成就、经验结算、天赋解锁与持久化，让论文发表、拒稿、合作和结局都有可追踪反馈</small></li>
          <li><span>6</span><strong>六年数值平衡与内容审校</strong><small>复核论文分数、热度衰减、引用倍率、导师与恋人收益、事件频率、作者显示、中文文案和移动端布局</small></li>
          <li><span>7</span><strong>完整测试与发布整理</strong><small>补齐跨系统回归测试，清理调试入口与中间文件，检查正式模式的入学前隐藏规则和上传文件清单</small></li>
        </ol>
      </section>
      ${state.phase === "playing" && state.totalMonths > 0 ? '<div class="settings-quit-row"><button type="button" data-action="quit-game">🚪 主动退学</button></div>' : ""}
    </div>
  `;
}


function renderCenterShell(state: GameState, uiState: PlayRenderUiState = {}): string {
  const role = getRoleDefinition(state.selectedRoleId);
  const blockingEventCount = state.eventQueue.filter((event) => isEventBlocking(state, event)).length;
  const aiResearchActionAvailable = state.phase === "playing" && !isGameplayModuleLocked(state)
    && getActiveOperationAllowance(state, "idea").usesAiResearchBonus;
  const aiResearchActionCount = aiResearchActionAvailable ? 1 : 0;
  const researchActionCount = aiResearchActionCount + getSubmittablePaperCount(state);
  const researchActionLabel = `AI行动 ${aiResearchActionCount} 次 · 可投稿 ${getSubmittablePaperCount(state)} 篇`;
  const relationshipActionCount = getAvailableRelationshipActionCount(state);
  const availablePromotionCount = getAvailablePromotionCount(state);
  const activeEventId = uiState.isEventContentOpen ? (uiState.activeEventId ?? null) : null;
  const activeEventHistoryId = uiState.isEventContentOpen ? (uiState.activeEventHistoryId ?? null) : null;
  const dateDisplayMode = getDateDisplayMode(uiState);
  const openEvent = activeEventId ? getCurrentEvent(state.eventQueue, activeEventId) : null;
  const openHistoryEvent = activeEventHistoryId
    ? state.eventHistory.find((event) => event.id === activeEventHistoryId && !event.stages.some((stage) => stage.talentTrigger)) ?? null
    : null;
  const logPages = buildLogPages(state.log, state.degree, dateDisplayMode, state.totalMonths);
  if (state.phase === "finished") {
    logPages.push({ kind: "ending", monthKey: state.totalMonths, label: "结局", entries: [] });
  }
  const latestLogPageIndex = Math.max(0, logPages.length - 1);
  const currentLogPageIndex = logPages.findIndex((logPage) => logPage.monthKey === state.totalMonths);
  const hasFutureLogEntriesAtInitialMonth = state.totalMonths === 0 && logPages.some((logPage) => (
    logPage.monthKey > state.totalMonths && logPage.entries.length > 0
  ));
  const defaultLogPageIndex = state.phase === "finished" || hasFutureLogEntriesAtInitialMonth
    ? latestLogPageIndex
    : currentLogPageIndex >= 0 ? currentLogPageIndex : latestLogPageIndex;
  const resolvedLogPageIndex = logPages.length === 0
    ? 0
    : Math.min(Math.max(uiState.activeLogPage ?? defaultLogPageIndex, 0), latestLogPageIndex);
  const activeLogPage = logPages[resolvedLogPageIndex] ?? null;
  const activePlayTab = uiState.activePlayTab ?? "events";
  const getTabActiveClass = (tabId: PlayTabId): string => activePlayTab === tabId ? " active" : "";
  const getTabAriaPressed = (tabId: PlayTabId): string => activePlayTab === tabId ? "true" : "false";
  const getTabPanelHidden = (tabId: PlayTabId): string => activePlayTab === tabId ? "" : " hidden";

  const renderTabBadge = (count: number, tone: "blocking" | "available", label: string): string => (
    count > 0
      ? `<span class="center-tab-badge is-${tone}" aria-label="${escapeHtml(label)}">${count}</span>`
      : ""
  );
  const shopUpgradeBadge = uiState.showShopUpgradeNotice
    ? '<span class="center-tab-badge is-available shop-upgrade-badge" aria-label="商店内有提升">↑</span>'
    : "";
  return `
    <section class="play-center-column game-main-area">
      <div class="center-shell" id="center-shell">
        <div class="center-main-tabs" id="center-main-tabs">
          <button class="center-tab-btn${getTabActiveClass("events")}" type="button" aria-pressed="${getTabAriaPressed("events")}" data-ui-play-tab="events">
            <span class="center-tab-icon" aria-hidden="true">🔔</span>
            <span>事件</span>
          </button>
          <button class="center-tab-btn${getTabActiveClass("workstation")}" type="button" aria-pressed="${getTabAriaPressed("workstation")}" data-ui-play-tab="workstation"><span class="center-tab-icon" aria-hidden="true">🔬</span><span>科研</span>${renderTabBadge(researchActionCount, "available", researchActionLabel)}</button>
          <button class="center-tab-btn${getTabActiveClass("relationship")}" type="button" aria-pressed="${getTabAriaPressed("relationship")}" data-ui-play-tab="relationship"><span class="center-tab-icon" aria-hidden="true">🤝</span><span>人际</span>${renderTabBadge(relationshipActionCount, "available", `${relationshipActionCount} 个可用操作`)}</button>
          <button class="center-tab-btn${getTabActiveClass("shop")}" type="button" aria-pressed="${getTabAriaPressed("shop")}" data-ui-play-tab="shop"><span class="center-tab-icon" aria-hidden="true">🛒</span><span>商店</span>${shopUpgradeBadge}</button>
          <button class="center-tab-btn${getTabActiveClass("research")}" type="button" aria-pressed="${getTabAriaPressed("research")}" data-ui-play-tab="research"><span class="center-tab-icon" aria-hidden="true">🏆</span><span>成果</span>${renderTabBadge(availablePromotionCount, "available", `${availablePromotionCount} 个可推广操作`)}</button>
          <button class="center-tab-btn${getTabActiveClass("talent")}" type="button" aria-pressed="${getTabAriaPressed("talent")}" data-ui-play-tab="talent"><span class="center-tab-icon" aria-hidden="true">🌱</span><span>天赋</span></button>
          <button class="center-tab-btn${getTabActiveClass("settings")}" type="button" aria-pressed="${getTabAriaPressed("settings")}" data-ui-play-tab="settings"><span class="center-tab-icon" aria-hidden="true">⚙️</span><span>设置</span></button>
          <button
            class="center-tab-btn center-tab-btn-next"
            type="button"
            data-action="next-month"
            ${state.phase === "finished" ? 'disabled aria-disabled="true" title="本轮已结束，可继续查看各栏目"' : blockingEventCount > 0 ? 'disabled aria-disabled="true" title="请先处理本月事件"' : ""}
          >
            <span class="center-tab-next-label">下一月</span>
            <span class="center-tab-next-arrow" aria-hidden="true">→</span>
          </button>
        </div>

        <div class="center-main-panels" id="center-main-panels">
          <section class="center-main-panel${getTabActiveClass("events")}" data-tab-panel="events"${getTabPanelHidden("events")}>
            <div class="event-panel${openEvent || openHistoryEvent ? " showing-content" : ""}" id="event-panel">
              ${renderEventLogSection(
                activeLogPage,
                resolvedLogPageIndex,
                state.eventHistory,
                logPages,
                openEvent || openHistoryEvent
                  ? renderEventContentBox(openEvent, openHistoryEvent, uiState.activeEventHistoryIndex ?? null)
                  : activeLogPage?.kind === "ending"
                    ? uiState.isEndingContentOpen === false ? renderEndingLog(state) : renderEndingScreen(state)
                    : "",
              )}
            </div>
          </section>

          <section class="center-main-panel${getTabActiveClass("workstation")}" data-tab-panel="workstation"${getTabPanelHidden("workstation")}>
            ${renderEnhancedWorkstationSection(state)}
          </section>

          <section class="center-main-panel${getTabActiveClass("relationship")}" data-tab-panel="relationship"${getTabPanelHidden("relationship")}>
            ${renderRelationshipSection(state, uiState)}
          </section>

          <section class="center-main-panel${getTabActiveClass("shop")}" data-tab-panel="shop"${getTabPanelHidden("shop")}>
            ${renderInteractiveShopSection(
              state,
              uiState.activeShopTab,
              uiState.selectedChairUpgradeId,
              uiState.selectedCoffeeUpgradeId,
              uiState.shopUpgradeNoticeTabs,
            )}
          </section>

          <section class="center-main-panel${getTabActiveClass("research")}" data-tab-panel="research"${getTabPanelHidden("research")}>
            ${renderResearchSection(state, uiState)}
          </section>

          <section class="center-main-panel${getTabActiveClass("talent")}" data-tab-panel="talent"${getTabPanelHidden("talent")}>
            ${renderTalentSection(state, role, uiState.activeTalentTab, uiState.advisorSalaryStartIndex, uiState.loverRewardPage)}
          </section>

          <section class="center-main-panel${getTabActiveClass("settings")}" data-tab-panel="settings"${getTabPanelHidden("settings")}>
            ${renderSettingsSection(state)}
          </section>
        </div>
      </div>
    </section>
  `;
}

function sortTodoPreviewItems(items: TodoPreviewItem[]): TodoPreviewItem[] {
  return [...items].sort((left, right) => {
    if (left.monthsLater !== right.monthsLater) {
      return left.monthsLater - right.monthsLater;
    }
    return left.sortOrder - right.sortOrder;
  });
}

function renderTodoPreviewRow(item: TodoPreviewItem): string {
  return `
    <article class="todo-item todo-preview-item todo-preview-future">
      <div class="todo-preview-name"><strong class="todo-title">${escapeHtml(item.title)}</strong></div>
      <div class="event-row-status">
        <span class="event-auto-slot" aria-hidden="true"></span>
        <span class="todo-deadline" data-deadline="future">${escapeHtml(item.timeText)}</span>
      </div>
    </article>
  `;
}

type PendingAgendaItem =
  | { kind: "pending"; event: GameState["eventQueue"][number] }
  | { kind: "future"; preview: TodoPreviewItem };

type PendingAgendaPage = {
  items: PendingAgendaItem[];
  pageIndex: number;
  pageCount: number;
};

function buildPendingAgendaPage(state: GameState, requestedPageIndex = 0): PendingAgendaPage {
  const pendingItems: PendingAgendaItem[] = getSortedEventQueue(state.eventQueue)
    .map((event) => ({ kind: "pending" as const, event, linear: isLinearEvent(state, event) }))
    .sort((left, right) => left.event.deadlineMonths - right.event.deadlineMonths || Number(left.linear) - Number(right.linear));
  const futureItems: PendingAgendaItem[] = sortTodoPreviewItems(buildFutureTodoPreviewItems(state))
    .map((preview) => ({ kind: "future" as const, preview }));
  const allItems = [...pendingItems, ...futureItems];
  const pageCount = Math.max(1, Math.ceil(allItems.length / PENDING_PAGE_SIZE));
  const pageIndex = Math.max(0, Math.min(Math.floor(requestedPageIndex), pageCount - 1));

  return {
    items: allItems.slice(pageIndex * PENDING_PAGE_SIZE, (pageIndex + 1) * PENDING_PAGE_SIZE),
    pageIndex,
    pageCount,
  };
}

function renderPendingAgendaList(state: GameState, page: PendingAgendaPage): string {
  if (page.items.length === 0) {
    return `<div class="todo-empty">暂无待办事件</div>`;
  }

  return `
    <div class="new-todo-list">
      <div class="todo-group">${page.items.map((item) => item.kind === "pending"
        ? `
          <article class="pending-event-row">
            <button class="event-card" type="button" data-ui-open-event-id="${escapeHtml(item.event.id)}" aria-describedby="agenda-status-${escapeHtml(item.event.id)}">
              <span class="event-title">${escapeHtml(getEventRootTitle(item.event.title))}</span>
            </button>
            <div class="event-row-status" id="agenda-status-${escapeHtml(item.event.id)}">
              <span class="event-auto-slot">${canAutoResolveLinearEvent(state, item.event) ? '<span class="event-auto-indicator" role="img" aria-label="可自动处理" title="下一月自动处理">⏩</span>' : ""}</span>
              <span class="event-ddl-badge" data-deadline="${getEventDeadlineTone(state, item.event)}">期限 ${item.event.deadlineMonths > 0 ? `${renderAnimatedNumber(`event:${item.event.id}:agenda:deadline-months`, item.event.deadlineMonths)}月后` : renderAnimatedNumber(`event:${item.event.id}:agenda:deadline-months`, item.event.deadlineMonths, "本月")}</span>
            </div>
          </article>
        `
        : renderTodoPreviewRow(item.preview)).join("")}</div>
    </div>
  `;
}

function getLogPageLabel(
  totalMonths: number,
  degree: GameState["degree"],
  dateDisplayMode: DateDisplayMode,
): string {
  if (totalMonths <= 0) {
    return "入学前";
  }
  const calendar = getCalendarForTotalMonths(totalMonths, degree);
  return formatGameDate(calendar.year, calendar.month, dateDisplayMode);
}

const MONTH_ADVANCE_LOG_TITLE_PATTERN = /^\u8FDB\u5165\u7B2C\s*\d+\s*\u5E74\s*\d+\s*\u6708[\u3002.]?$/u;

function isEmptyMonthAdvanceLog(text: string): boolean {
  const parsed = splitLogEntryText(text);
  return MONTH_ADVANCE_LOG_TITLE_PATTERN.test(parsed.title) && parsed.result.length === 0;
}

function buildLogPages(
  logEntries: GameLogEntry[],
  degree: GameState["degree"],
  dateDisplayMode: DateDisplayMode,
  currentTotalMonths = 0,
): LogPage[] {
  const visibleEntries = logEntries.filter((entry) => (
    !isTransientUiHintLog(entry.text) && !isEmptyMonthAdvanceLog(entry.text) && !isEndingSystemLog(entry.text)
    && !/^(?:测试|调试)/u.test(entry.text.trim())
    && !/^(?:科研：在论文槽\s*\d+\s*开启|丢弃论文：|论文时效：)/u.test(entry.text.trim())
  ));

  const pageMap = new Map<number, LogPage>();
  for (const entry of [...visibleEntries].reverse()) {
    const monthKey = Math.max(0, entry.month);
    const existing = pageMap.get(monthKey);
    if (existing) {
      existing.entries.push(entry);
    } else {
      pageMap.set(monthKey, {
        monthKey,
        label: getLogPageLabel(monthKey, degree, dateDisplayMode),
        entries: [entry],
      });
    }
  }

  const highestLoggedMonth = [...pageMap.keys()].reduce((highest, monthKey) => Math.max(highest, monthKey), 0);
  const highestMonth = Math.max(0, currentTotalMonths, highestLoggedMonth);
  for (let monthKey = 0; monthKey <= highestMonth; monthKey += 1) {
    if (!pageMap.has(monthKey)) {
      pageMap.set(monthKey, {
        monthKey,
        label: getLogPageLabel(monthKey, degree, dateDisplayMode),
        entries: [],
      });
    }
  }

  return [...pageMap.values()].sort((left, right) => left.monthKey - right.monthKey);
}

function getLogEntryClassName(text: string): string {
  const normalized = text.trim();
  const isAchievement = /^(?:成就|角色解锁|通关|Nature(?:论文)?)\s*[：:]/u.test(normalized);
  const isNegative = /(?:拒稿|拒绝|失败|落选|不足|无法|不能|未能|未达到|暂停|SAN -\d|金币 -\d|好感 -\d|社交 -\d)/u.test(normalized);
  const isSystem = /^(?:进入第|正式入学|月初结算|系统|论文时效|测试)/u.test(normalized);
  return [
    "log-entry",
    isAchievement ? "achievement" : "",
    isNegative ? "is-negative" : "",
    isSystem ? "is-system" : "",
  ].filter(Boolean).join(" ");
}

const LOG_VALUE_CHANGE_PATTERN = /(?:(?:SAN\s*(?:值|上限)?)|金币|导师好感(?:度)?|好感(?:度)?|默契度|亲密度|亲和度|社交(?:能力)?|科研(?:能力|积累|经费|上限|分)?|生病概率|每月实验次数|参加次数|idea|实验|写作|引用)\s*[+＋\-−]\s*\d+(?:\.\d+)?%?/giu;

function renderLogLineHtml(text: string): string {
  let cursor = 0;
  let html = "";

  for (const match of text.matchAll(LOG_VALUE_CHANGE_PATTERN)) {
    const index = match.index;
    if (index === undefined) continue;
    html += escapeHtml(text.slice(cursor, index));
    const valueChange = match[0];
    const tone = /[\-−]/u.test(valueChange) ? "is-negative" : "is-positive";
    html += `<span class="log-value-change ${tone}">${escapeHtml(valueChange)}</span>`;
    cursor = index + valueChange.length;
  }

  return html + escapeHtml(text.slice(cursor));
}

function renderLogResultHtml(text: string): string {
  const lines = text.split(/\r?\n|[｜；]/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return renderLogLineHtml(lines[0] ?? "");
  }
  return lines
    .map((line) => `<span class="log-result-line">${renderLogLineHtml(line)}</span>`)
    .join('<span class="log-result-divider" aria-hidden="true">|</span>');
}

function splitLogEntryText(text: string): { title: string; result: string } {
  const separatorIndex = text.indexOf("：");
  const firstLineBreak = text.search(/\r?\n/u);
  if (separatorIndex < 0 && firstLineBreak < 0) {
    return { title: text, result: "" };
  }
  if (separatorIndex < 0 || (firstLineBreak >= 0 && firstLineBreak < separatorIndex)) {
    return {
      title: text.slice(0, firstLineBreak).trim(),
      result: text.slice(firstLineBreak + (text[firstLineBreak] === "\r" ? 2 : 1)).trim(),
    };
  }
  return {
    title: text.slice(0, separatorIndex).trim(),
    result: text.slice(separatorIndex + 1).trim(),
  };
}

const GENERIC_EVENT_CHOICE_LABELS = new Set([
  "继续",
  "确定",
  "确认",
  "完成",
  "知道了",
  "准备报到",
]);

function getEventLogPresentation(
  entry: GameLogEntry,
  eventHistory: readonly GameState["eventHistory"][number][],
): { title: string; result: string } {
  const parsed = splitLogEntryText(entry.text);
  const monthAdvancePresentation = MONTH_ADVANCE_LOG_TITLE_PATTERN.test(parsed.title)
    ? {
      title: parsed.result ? "\u6708\u521D\u7ED3\u7B97" : parsed.title,
      result: parsed.result,
    }
    : parsed;
  if (!entry.eventHistoryId) return monthAdvancePresentation;
  const record = eventHistory.find((event) => event.id === entry.eventHistoryId);
  if (!record) return monthAdvancePresentation;
  const talentTrigger = record.stages.find((stage) => stage.talentTrigger)?.talentTrigger;
  if (talentTrigger) {
    return {
      title: parsed.title,
      result: [talentTrigger.recipient, talentTrigger.reason, ...talentTrigger.effects, ...(talentTrigger.details ?? [])].filter(Boolean).join("；"),
    };
  }

  const selectedChoices = record.stages.flatMap((stage) => {
    const selected = stage.choices.find((choice) => choice.id === stage.selectedChoiceId);
    return selected ? [{ label: normalizeGameDisplayText(selected.label), optionCount: stage.choices.length }] : [];
  });
  const decisionChoices = selectedChoices.filter((choice) => choice.optionCount > 1);
  const visibleChoices = (decisionChoices.length > 0
    ? decisionChoices
    : selectedChoices.filter((choice) => !GENERIC_EVENT_CHOICE_LABELS.has(choice.label)))
    .map((choice) => choice.label)
    .filter((label, index, labels) => labels.indexOf(label) === index);
  let result = monthAdvancePresentation.result;
  for (const choice of [...visibleChoices].reverse()) {
    const prefix = `${choice}：`;
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length).trim();
      break;
    }
  }
  return {
    title: visibleChoices.length > 0
      ? `${monthAdvancePresentation.title} - ${visibleChoices.join(" · ")}`
      : monthAdvancePresentation.title,
    result,
  };
}

function renderLogList(
  page: LogPage | null,
  eventHistory: readonly GameState["eventHistory"][number][],
): string {
  if (!page || page.entries.length === 0) {
    return `<div class="no-logs">暂无日志</div>`;
  }

  return [...page.entries]
    .reverse()
    .map((entry) => {
      const { title, result } = getEventLogPresentation(entry, eventHistory);
      const record = eventHistory.find((event) => event.id === entry.eventHistoryId);
      const canReplay = Boolean(entry.eventHistoryId) && !record?.stages.some((stage) => stage.talentTrigger);
      const eventHistoryAttributes = canReplay && entry.eventHistoryId
        ? ` data-ui-open-event-history-id="${escapeHtml(entry.eventHistoryId)}" aria-label="回看${escapeHtml(normalizeGameDisplayText(title))}"`
        : "";
      const entryTag = canReplay ? "button" : "div";
      const entryTypeAttributes = canReplay ? ' type="button"' : "";
      return `
        <${entryTag} class="${getLogEntryClassName(entry.text)}${canReplay ? " event-history-log-entry" : ""}"${entryTypeAttributes}${eventHistoryAttributes}>
          <div class="event"><span class="log-entry-title${result ? "" : " log-entry-title-only"}">${escapeHtml(normalizeGameDisplayText(title))}</span></div>
          ${result ? `<div class="result">${renderLogResultHtml(result)}</div>` : ""}
        </${entryTag}>
      `;
    })
    .join("");
}

function renderEventLogSection(
  page: LogPage | null,
  pageIndex: number,
  eventHistory: readonly GameState["eventHistory"][number][],
  logPages: readonly LogPage[],
  eventContentHtml = "",
): string {
  return `
    <div class="event-log-panel log-panel" id="event-log-panel" data-log-page-index="${pageIndex}" data-log-page-count="${logPages.length}">
      <div class="event-timeline-track" role="list" aria-label="日志月份时间轴">
        ${(logPages.length > 0 ? logPages : [{ monthKey: 0, label: page?.label ?? "暂无日志", entries: [] } satisfies LogPage]).map((timelinePage, index) => {
          const isCurrent = index === pageIndex;
          const firstEntry = timelinePage.entries[0];
          const markerTitle = firstEntry ? getEventLogPresentation(firstEntry, eventHistory).title : "暂无记录";
          return `
            <button
              class="event-timeline-marker${isCurrent ? " is-current" : ""}"
              type="button"
              role="listitem"
              data-ui-log-page-index="${index}"
              ${timelinePage.kind === "ending" ? 'data-ui-ending-page aria-label="结局"' : `aria-label="${escapeHtml(`${timelinePage.label}：${markerTitle}`)}"`}
              aria-pressed="${isCurrent ? "true" : "false"}"
              >
                <span class="event-timeline-node" aria-hidden="true"></span>
                <span class="event-timeline-marker-label">${escapeHtml(timelinePage.label)}</span>
              </button>
          `;
        }).join("")}
      </div>
      ${eventContentHtml}
      ${page?.kind === "ending" ? "" : `<div class="log-content event-log-content" id="log-content">
        ${renderLogList(page, eventHistory)}
      </div>`}
    </div>
  `;
}


function renderRightRail(state: GameState, uiState: PlayRenderUiState = {}): string {
  const dateDisplayMode = getDateDisplayMode(uiState);
  const preEnrollment = isPreEnrollmentState(state);
  const pendingEvents = getSortedEventQueue(state.eventQueue);
  const pendingBlockingCount = pendingEvents.filter((event) => isEventBlocking(state, event)).length;
  const pendingPage = buildPendingAgendaPage(state, uiState.activePendingPage ?? 0);
  const atFirstPendingPage = pendingPage.pageIndex <= 0;
  const atLastPendingPage = pendingPage.pageIndex >= pendingPage.pageCount - 1;
  const seasonLabel = getSeasonLabel(state);
  const blockLinearEvents = state.blockLinearEvents !== false;
  const eventBlockingHint = blockLinearEvents
    ? "无分支事件：阻塞，需手动处理。\n点击切换为不阻塞"
    : "无分支事件：不阻塞，下一月自动结算到期事件。\n点击切换为阻塞";

  return `
    <aside class="play-right-rail new-right-container" id="new-right-container">
      <div class="new-time-panel" id="new-time-panel">
        <div class="new-time-row">
          ${preEnrollment
            ? '<span class="new-time-item new-time-enrollment" id="new-time-month">入学前</span>'
            : `
              <span class="new-time-item" id="new-time-year">${getYearText(state, dateDisplayMode)}</span>
              <span class="new-time-item" id="new-time-month">${getMonthText(state, dateDisplayMode)}</span>
              <button
                class="new-time-display-toggle"
                data-card-icon-action
                type="button"
                data-action="set-date-display-mode"
                data-date-display-mode="${dateDisplayMode === "academic" ? "calendar" : "academic"}"
                aria-label="切换日期显示"
                title="切换日期显示"
              ><span aria-hidden="true">🔄</span></button>
              ${seasonLabel ? `<span class="new-time-item new-time-season play-tooltip" id="new-time-season" tabindex="0" aria-label="${escapeHtml(getSeasonEffectText(state))}" data-tooltip="${escapeHtml(getSeasonEffectText(state))}" title="${escapeHtml(getSeasonEffectText(state))}">${seasonLabel}</span>` : ""}
              <span class="new-time-item new-time-remaining" id="new-time-remaining">${getRemainingMonthsText(state)}</span>
            `}
        </div>
        <div
          class="new-calendar-section new-pending-event-section"
          data-pending-page-index="${pendingPage.pageIndex}"
          data-pending-page-count="${pendingPage.pageCount}"
        >
          <div class="new-calendar-header">
            <span class="new-calendar-title">
              <span class="new-calendar-title-icon" aria-hidden="true">🔔</span>
              <span>待办事件</span>
              ${pendingEvents.length > 0
                ? `<span class="center-tab-badge is-${pendingBlockingCount > 0 ? "blocking" : "available"}" aria-label="${pendingEvents.length} 个待办事件">${pendingEvents.length}</span>`
                : ""}
            </span>
            <div class="todo-nav-btns" aria-label="待办事件操作">
              <button
                class="pending-event-blocking-toggle play-tooltip"
                data-card-icon-action
                type="button"
                data-action="set-linear-event-blocking"
                data-ui-event-blocking="linear"
                data-block-linear-events="${!blockLinearEvents}"
                aria-label="无分支事件阻塞"
                aria-pressed="${blockLinearEvents}"
                data-tooltip="${eventBlockingHint}"
              ><span aria-hidden="true">${blockLinearEvents ? "⏸️" : "▶️"}</span></button>
              <button class="todo-nav-btn" id="pending-nav-prev" type="button" data-ui-pending-nav="prev" aria-label="上一页" ${atFirstPendingPage ? "disabled" : ""}>&lt;</button>
              <button class="todo-nav-btn" id="pending-nav-next" type="button" data-ui-pending-nav="next" aria-label="下一页" ${atLastPendingPage ? "disabled" : ""}>&gt;</button>
            </div>
          </div>
          <div class="new-calendar-content new-pending-event-content event-queue" id="pending-event-list">
            ${renderPendingAgendaList(state, pendingPage)}
          </div>
        </div>
      </div>
      ${renderPlayHelpPanel(uiState)}
    </aside>
  `;
}

export function renderPlayScreen(state: GameState, uiState: PlayRenderUiState = {}): string {
  return `
    <main class="play-page" data-phase="${state.phase}" data-scale-mode="fixed">
      <section class="play-stage-shell">
        <div class="play-stage-scale">
          <section class="play-stage">
            <section class="play-workbench">
              <div class="play-workbench-body">
                ${renderLeftRail(state)}
                ${renderCenterShell(state, uiState)}
                ${renderRightRail(state, uiState)}
              </div>
            </section>
          </section>
        </div>
      </section>
      ${uiState.isFeedbackOpen ? renderGameFeedbackOverlay() : ""}
    </main>
  `;
}
