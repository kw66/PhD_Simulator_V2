import { getCoffeeMachineOwnedText, getCurrentCoffeeBonus } from "../core/v2-coffee-system";
import { getActiveOperationAllowance, getAiCollaborationStatus } from "../core/v2-ai-shop";
import { PAPER_SLOT_RESEARCH_THRESHOLDS } from "../core/v2-content";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { getCitationStats } from "../core/v2-citation-stats";
import { getConferenceInfo, getConferenceLocation } from "../core/v2-conference-catalog";
import type { ConferenceRegionId } from "../core/v2-conference-system";
import { DEBUG_EVENT_GROUPS, DEBUG_MONTH_DELTAS, DEBUG_STAT_GROUPS } from "../core/v2-debug-tools";
import { getCurrentEvent, getSortedEventQueue } from "../core/v2-event-queue";
import { isTransientUiHintLog } from "../core/v2-engine-helpers";
import { getJointTrainingCitationCapBonus } from "../core/v2-joint-training-system";
import { getLabTalentActionBonus, getLabTalentTeamSize, isLabTalentActive } from "../core/v2-lab-talent";
import { getMeetingSelfPayDiscount, hasFullGear } from "../core/v2-meeting-system";
import {
  ACTIVITY_WIN_RATE_CAP,
  getBadmintonWinRate,
  getPokerWinRate,
} from "../core/v2-growth-system";
import { getBikeSanCapLimit, getBikeTierDefinition } from "../core/v2-bike-system";
import { previewNextMonthEffects } from "../core/v2-monthly-effects";
import { getFellowRoleLabel, getFellowTaskSanCost } from "../core/v2-fellow-progression";
import { getInternshipMonthlyIncome, getPublishedAPaperCount } from "../core/v2-internship-system";
import { LOVER_DATE_MONEY_COST } from "../core/v2-lover-progression";
import { previewPartTimeWork } from "../core/v2-part-time-work";
import { getBeautifulMonthlyRecovery } from "../core/v2-lover-system";
import {
  getAcceptedPaperScore,
  getPaperPromotionCost,
  getPaperPromotionMultiplierBonus,
} from "../core/v2-publication-rules";
import {
  CITATION_SETTLEMENT_INTERVAL_MONTHS,
  PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS,
  PUBLISHED_SCORE_DECAY_RATE,
  getPaperCitationMultiplier,
} from "../core/v2-publication-system";
import { getAvailablePaperSlotCount, getPaperSubmissionFailure, getWorkstationPaperSlotMap } from "../core/v2-paper-rules";
import { getPaperHeatTier } from "../core/v2-paper-topics";
import { ADVISOR_TASK_SAN_COST } from "../core/v2-advisor-progress";
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
import { getSeasonByMonth, getTierResistChance } from "../core/v2-sanity-rules";
import {
  getChairMonthlyRecovery,
  getShopPaperActionModifier,
  getShopReadSanDiscount,
  getShopRestSanGain,
} from "../core/v2-shop-items-effects";
import { getGpuTierDefinition } from "../core/v2-shop-items";
import type { DateDisplayMode, DebugStatId, FellowProgressProfile, GameLogEntry, GameState, LoverTypeId, Paper, PaperActionType, PaperPromotionId, PaperReviewEventPresentation, PaperReviewerReport, RoleDefinition } from "../core/v2-types";
import {
  type PlayRenderUiState,
  type PlayTabId,
  type TalentPanelTabId,
} from "./v2-render-types";
import { renderShopSection as renderInteractiveShopSection } from "./v2-render-shop-panel";
import { buildBuffDisplayBuckets } from "./v2-render-buffs";
import { renderGameFeedbackOverlay } from "./v2-render-community";
import { SHOW_ALL_MODULES_DURING_DEVELOPMENT } from "../core/v2-development-flags";

const ATTR_TIER_THRESHOLDS = [6, 12, 18] as const;
const DISEASE_MONTH_END_CHANGE_PERCENT = [2, 1, 0, -1] as const;
const RESEARCH_CHORE_SAN_DISCOUNT = [0, 1, 2, 3] as const;
const FUTURE_MONTH_LOOKAHEAD = 6;
const PENDING_PAGE_SIZE = 5;
const RELATIONSHIP_SLOT_UNLOCK_THRESHOLDS = [0, 0, 6, 12, 18] as const;
const DEFERRED_GAMEPLAY_ACTION_ATTRIBUTES = 'disabled aria-disabled="true" data-gameplay-status="deferred"';

function isGameplayModuleLocked(state: GameState): boolean {
  return isPreEnrollmentState(state) && !SHOW_ALL_MODULES_DURING_DEVELOPMENT;
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
  description: string;
  detail?: string;
  requirement?: string;
  metrics?: Array<{ label: string; value: string }>;
  progress?: { label: string; value: number; max: number; valueLabel: string };
};

type LogPage = {
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
    .replace(/\*\*([^*\n]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
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

function getAttrTierTooltip(kind: AttrTierId, value: number, illnessProbability = 4): string {
  const tier = getAttrTier(value);
  const currentChance = Math.round(getTierResistChance(value) * 100);
  if (kind === "san") {
    const monthEndChange = DISEASE_MONTH_END_CHANGE_PERCENT[tier];
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
  illnessProbability = 4,
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

  return (Object.keys(labels) as Array<keyof typeof labels>).flatMap((statId) => {
    const sources = resolution.items.flatMap((item) => {
      const value = item.appliedStats[statId] ?? 0;
      if (!Object.hasOwn(item.stats, statId)) return [];
      const note = item.note ? `（${normalizeGameDisplayText(item.note)}）` : "";
      return [`${normalizeGameDisplayText(item.source)}：${normalizeGameDisplayText(item.name)} ${formatSignedNumber(value)}${note}`];
    });
    const value = resolution.totals[statId];
    const alwaysShow = statId === "san" || statId === "money";
    if (!alwaysShow && (sources.length === 0 || value === 0)) return [];
    return [{
      id: `next-month-${statId}`,
      label: `${labels[statId]} ${formatSignedNumber(value)}`,
      sources,
      isDebuff: value < 0,
    }];
  });
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

  return `
    <aside class="play-left-rail new-left-container">
      <div class="new-attr-panel" id="new-attr-panel">
        ${renderAttrItem("🧠", "SAN值", state.player.san, state.sanCap, "san", "san", state.illnessProbability)}
        ${renderAttrItem("💡", "科研能力", state.player.research, Math.max(researchCap, 20), "research", "research")}
        ${renderAttrItem("🤝", "社交能力", state.player.social, 20, "social", "social")}
        ${renderAttrItem("👨‍🏫", "导师好感", state.player.favor, 20, "favor", "favor")}
        <div class="new-attr-item new-currency-item" data-player-stat="money" data-stat-value="${state.player.money}" aria-label="金币">
          <div class="new-attr-header">
            <span class="new-attr-icon">💰</span>
            <span class="new-currency-value">${state.player.money}</span>
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

function getDeadlineText(deadlineMonths: number): string {
  if (deadlineMonths <= 0) return "本月";
  return `${deadlineMonths}月后`;
}

function getDeadlineTone(deadlineMonths: number): "due" | "soon" | "later" {
  if (deadlineMonths <= 0) return "due";
  if (deadlineMonths === 1) return "soon";
  return "later";
}

function getFutureOccurrenceText(monthsLater: number): string {
  return `${Math.max(1, monthsLater)}月后`;
}

function getEventRootTitle(title: string): string {
  return normalizeGameDisplayText(title.split("➜")[0]?.trim() || title.trim());
}

export function buildFutureTodoPreviewItems(state: GameState): TodoPreviewItem[] {
  const items: TodoPreviewItem[] = [];
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

function renderEventDescriptionHtml(description: string): string {
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
  const storyHtml = storyParagraphs
    .map((paragraph) => {
      if (/^-{3,}$/u.test(paragraph)) {
        return '<hr class="event-description-divider" role="separator">';
      }
      const isTip = /^(?:备注|小提示)：/u.test(paragraph);
      const displayText = paragraph.replace(/^备注：/u, "小提示：");
      const className = isTip ? ' class="event-description-note"' : "";
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
      conditions.push(...normalized.slice(3).split(/[｜，；]/u).map((part) => part.trim()).filter(Boolean));
      continue;
    }
    if (normalized.startsWith("结果：")) {
      addResults(normalized.slice(3).split(/[｜，；]/u).map((part) => part.trim()).filter(Boolean));
      continue;
    }

    const parts = normalized.split(/[｜，；]/u).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1 && parts[0] && isEventSettlementCondition(parts[0])) {
      conditions.push(parts[0]);
      addResults(parts.slice(1));
    } else {
      addResults(parts);
    }
  }

  return { conditions, results };
}

function renderEventSettlementValues(values: string[]): string {
  return values
    .map((value) => `<span class="event-settlement-item">${escapeHtml(normalizeGameDisplayText(value))}</span>`)
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
  if (report.sanChange) {
    improvements.push(`SAN ${formatSignedNumber(report.sanChange)}`);
  }
  return improvements.join(" · ");
}

function renderPaperReviewEvent(presentation: PaperReviewEventPresentation): string {
  if (presentation.kind === "overview") {
    return `
      <section class="paper-review-event is-overview">
        <div class="paper-review-event-heading">
          <span>投稿论文</span>
          <strong>《${escapeHtml(presentation.paperTitle)}》</strong>
        </div>
        <div class="paper-review-overview-grid">
          <span><small>投稿会议</small><strong>${presentation.target}类 · ${escapeHtml(presentation.conferenceName)} ${presentation.conferenceYear}</strong></span>
          <span><small>会议影响力</small><strong>${presentation.venueInfluence.toFixed(2)}</strong></span>
          <span><small>审稿标准</small><strong>×${presentation.reviewStrictnessMultiplier.toFixed(2)}</strong></span>
          <span><small>投稿总分</small><strong>${presentation.submittedScore}</strong></span>
        </div>
        <p>三个月的审稿期结束，三份意见已经返回。先看看审稿人怎么评价这篇论文。</p>
      </section>
    `;
  }

  if (presentation.kind === "reviewers") {
    return `
      <section class="paper-review-event is-reviewers">
        <div class="paper-review-event-heading">
          <span>审稿意见</span>
          <strong>《${escapeHtml(presentation.paperTitle)}》</strong>
        </div>
        <div class="paper-reviewer-grid">
          ${presentation.reports.map((report, index) => {
            const improvement = getPaperReviewImprovementText(report);
            const tone = report.decision === "Accept" ? "accept" : report.decision === "Borderline" ? "borderline" : "reject";
            return `
              <article class="paper-reviewer-card is-${tone}">
                <div class="paper-reviewer-card-head">
                  <span>审稿人 ${index + 1}</span>
                  <strong>${escapeHtml(formatPaperReviewDecision(report))} ${formatSignedNumber(report.reviewScore)}</strong>
                </div>
                <h3>${escapeHtml(report.reviewer)}</h3>
                <p>${escapeHtml(report.comment ?? "未留下具体意见")}</p>
                <div class="paper-reviewer-meta">
                  <span>有效分 ${report.effectiveScore}</span>
                  ${improvement ? `<span>${escapeHtml(improvement)}</span>` : ""}
                </div>
              </article>
            `;
          }).join("")}
        </div>
        <p class="paper-review-event-footnote">三位审稿人的意见已经齐了，接下来由 PC 给出最终决定。</p>
      </section>
    `;
  }

  const resultItems = presentation.rewardText.split("；").map((item) => item.trim()).filter(Boolean);
  return `
    <section class="paper-review-event is-decision ${presentation.accepted ? "is-accepted" : "is-rejected"}">
      <div class="paper-review-decision-head">
        <div>
          <span>PC 最终决定</span>
          <strong>${presentation.accepted
            ? `${presentation.target}类 · ${escapeHtml(presentation.acceptType ?? "Poster")}`
            : "未录用"}</strong>
        </div>
        <div class="paper-review-total-score">
          <small>总评</small>
          <strong>${formatSignedNumber(presentation.totalReviewScore)}</strong>
        </div>
      </div>
      <p>${escapeHtml(presentation.resultText)}</p>
      ${presentation.borderlineChance === null ? "" : `<div class="paper-review-borderline">边缘录用概率 ${Math.round(presentation.borderlineChance * 100)}%</div>`}
      ${presentation.rewardReductionCount > 0
        ? `<div class="paper-review-reduction">已有 ${presentation.rewardReductionCount} 篇同级或更高等级论文，本次奖励有所递减</div>`
        : ""}
      <div class="paper-review-result-strip">
        ${resultItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
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
          ? renderPaperReviewEvent(paperReviewPresentation)
          : renderEventDescriptionHtml(displayEvent.description)}
      </div>
      ${displayEvent.choices.length > 0 ? `
        <div class="event-content-buttons" id="event-content-buttons">
          ${displayEvent.choices.map((choice) => {
            const disabledReason = choice.disabledReason?.trim() ?? "";
            const isDisabled = historicalPage !== null || disabledReason !== "";
            const titleAttribute = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : "";
            const buttonAttributes = isDisabled
              ? `disabled aria-disabled="true"${titleAttribute}`
              : `data-action="resolve-event" data-event-id="${escapeHtml(currentEventId)}" data-event-choice-id="${escapeHtml(choice.id)}"`;
            return `
              <button
                class="event-choice-btn event-action-btn${choice.id === selectedChoiceId ? " is-selected" : ""}"
                type="button"
                ${buttonAttributes}
              ><span>${escapeHtml(normalizeGameDisplayText(choice.label))}</span>${choice.id === selectedChoiceId ? '<i data-lucide="check" aria-label="已选择"></i>' : ""}</button>
            `;
          }).join("")}
        </div>
      ` : ""}
    </div>
  `;
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

function renderPaperReviewHeader(paper: Paper): string {
  if (paper.status !== "reviewing") return "";
  const conference = getPaperReviewConference(paper);
  const conferenceText = conference && paper.target
    ? `${paper.target}类 · ${conference.name}审稿中`
    : `${paper.target ?? "待定"} 类审稿中`;
  return `
    <div class="paper-card-header paper-review-card-header">
      <div class="paper-card-header-main">
        <span class="paper-card-status is-reviewing">${escapeHtml(conferenceText)}</span>
        <span class="paper-review-remaining">剩余 ${paper.reviewMonthsLeft} 月</span>
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
        <span class="paper-review-remaining">已修改 ${revisedMonths} 月 · <span class="paper-journal-score" aria-label="期刊修改分数 ${score}/${journal.acceptanceScore}">${score}/${journal.acceptanceScore}</span></span>
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

function renderPaperTopicMeta(state: GameState, paper: Paper): string {
  const heatTier = getPaperHeatTier(paper.heatMultiplier);
  const decayText = paper.status === "journal-reviewing"
    ? "送审后不衰减"
    : `发表前衰减 ${formatPaperDecayRate(paper.prepublicationDecayRate)}/月`;
  return `
    <span class="paper-topic-meta">
      <span class="paper-topic-tag">${escapeHtml(paper.topicLabel)}</span>
      <span
        class="paper-heat-badge is-${heatTier}"
        title="${escapeHtml(`${decayText} · 引用倍率 ×${getPaperCitationMultiplier(state, paper).toFixed(2)}`)}"
      >热度 ×${paper.heatMultiplier.toFixed(2)}</span>
    </span>
  `;
}

function renderPaperTitleWithMeta(state: GameState, paper: Paper, trailingAction = ""): string {
  return `
    <div class="paper-title-meta-row${trailingAction ? " has-trailing-action" : ""}">
      <div class="paper-title-meta-content">
        <strong class="paper-title">${escapeHtml(paper.title)}</strong>
        ${renderPaperTopicMeta(state, paper)}
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
        type="button"
        ${canReroll
          ? `data-action="reroll-paper-topic" data-paper-id="${escapeHtml(paper.id)}"`
          : 'disabled aria-disabled="true" title="论文已有进度，不能更换选题"'}
        aria-label="换个选题"
        title="换个选题"
      >🔄</button>
      <button class="paper-draft-action-btn is-discard" type="button" aria-label="丢弃论文" title="丢弃论文" data-action="discard-paper" data-paper-id="${escapeHtml(paper.id)}">🚮</button>
    </div>
  `;
}

function renderPaperReviewSummary(paper: Paper): string {
  const review = paper.lastReview;
  if (!review) return "";
  const decisionLabel = { Accept: "接收", Borderline: "边缘", Reject: "拒稿" } as const;
  const totalText = review.totalReviewScore > 0 ? `+${review.totalReviewScore}` : String(review.totalReviewScore);
  const chanceText = review.borderlineChance === null
    ? ""
    : ` · 边缘录用 ${Math.round(review.borderlineChance * 100)}%`;
  return `
    <div class="paper-review-summary ${review.accepted ? "is-accepted" : "is-rejected"}">
      <div><strong>${review.accepted ? "本轮录用" : "上轮退稿"}</strong><span>总评 ${totalText}${chanceText}</span></div>
      <p>${review.reports.map((report) => `${report.reviewer} ${decisionLabel[report.decision]} ${report.effectiveScore}分`).join("｜")}</p>
    </div>
  `;
}

function renderPaperStats(paper: Paper): string {
  return renderPaperStatsValues(paper.idea, paper.experiment, paper.writing, getPaperTotalScore(paper), renderPaperReviewSummary(paper));
}

function renderPaperStatsValues(
  idea: number,
  experiment: number,
  writing: number,
  total = idea + experiment + writing,
  reviewSummary = "",
): string {
  return `
    <div class="paper-score-strip" aria-label="idea ${idea}，实验 ${experiment}，写作 ${writing}，总分 ${total}">
      <span><small>idea</small><strong>${idea}</strong></span>
      <span><small>实验</small><strong>${experiment}</strong></span>
      <span><small>写作</small><strong>${writing}</strong></span>
      <span class="paper-score-total"><small>总分</small><strong>${total}</strong></span>
    </div>
    ${reviewSummary}
  `;
}

function getWorkstationPaperByPanelIndex(state: GameState, panelIndex: number): Paper | null {
  if (panelIndex < 0 || panelIndex >= PAPER_SLOT_RESEARCH_THRESHOLDS.length) {
    return null;
  }
  return getWorkstationPaperSlotMap(state.papers).get(panelIndex) ?? null;
}

function renderPaperReviewAction(paper: Paper): string {
  if (paper.status === "reviewing") {
    return `<button class="paper-withdraw-btn" type="button" data-action="withdraw-paper" data-paper-id="${escapeHtml(paper.id)}">撤稿</button>`;
  }
  if (paper.status === "journal-reviewing") {
    return `<button class="paper-withdraw-btn" type="button" data-action="withdraw-paper" data-paper-id="${escapeHtml(paper.id)}">撤稿</button>`;
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
    const effectText = `SAN-${preview.sanCost}${preview.usesAiResearchBonus ? " · AI行动" : ""}`;
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

const RESEARCH_PROMOTION_IDS: readonly PaperPromotionId[] = ["arxiv", "github", "xiaohongshu"];

function renderResearchPromotionActions(state: GameState, paper: Paper): string {
  if (paper.status !== "published" || !paper.publication || paper.nonFirstAuthor === true) return "";
  const promotions = paper.publication.promotions ?? {
    arxiv: false,
    github: false,
    xiaohongshu: false,
  };
  const labels: Record<PaperPromotionId, string> = {
    arxiv: "arXiv",
    github: "GitHub",
    xiaohongshu: "小红书",
  };
  return `
    <div class="research-promotion-block">
      <div class="research-promotion-heading">论文推广</div>
      <div class="research-promotion-actions">
        ${RESEARCH_PROMOTION_IDS.map((promotionId) => {
          const used = promotions[promotionId];
          const cost = getPaperPromotionCost(promotionId);
          const canAfford = state.player.san >= cost;
          const bonus = getPaperPromotionMultiplierBonus(promotionId);
          const arxivIsUseful = promotionId !== "arxiv" || (
            paper.target !== null
            && paper.conferenceHandled !== true
            && (paper.publication?.monthsSincePublish ?? 0) < 3
          );
          const disabled = used || !canAfford || !arxivIsUseful;
          const effect = promotionId === "arxiv"
            ? "提前公开"
            : promotionId === "github"
              ? "当前分 +25%"
              : `引用倍率 +${Math.round(bonus * 100)}%`;
          return `
            <button
              class="research-promotion-btn${used ? " is-used" : ""}"
              type="button"
              ${disabled
                ? `disabled aria-disabled="true"${!used && !canAfford
                  ? ` title="SAN不足，需要 ${cost}"`
                  : !used && !arxivIsUseful
                    ? ' title="论文已经公开，arXiv 不再带来提前曝光"'
                    : ""}`
                : `data-action="promote-paper" data-paper-id="${escapeHtml(paper.id)}" data-promotion-id="${promotionId}"`}
            >
              <span>${used ? "✓ " : ""}${labels[promotionId]}</span>
              <small>${used ? "已完成" : `SAN -${cost} · ${effect}`}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderLockedWorkstationSlot(slotIndex: number): string {
  const threshold = PAPER_SLOT_RESEARCH_THRESHOLDS[slotIndex] ?? 0;
  const tierName = getAttrTierName("research", threshold);
  return `
    <article class="paper-card paper-slot-card paper-card-empty paper-card-locked paper-slot-compact" data-paper-slot-index="${slotIndex}">
      <div class="paper-empty-body paper-locked-body">
        <div class="paper-card-lock-message">
          <strong>科研能力达到${threshold}<span class="new-attr-level attr-level-research paper-lock-tier">${tierName}</span>解锁</strong>
        </div>
      </div>
      ${renderPaperStatsValues(0, 0, 0)}
    </article>
  `;
}

function renderEmptyWorkstationSlot(state: GameState, slotIndex: number): string {
  const preEnrollment = isGameplayModuleLocked(state);
  const canCreate = !preEnrollment && getWorkstationPaperByPanelIndex(state, slotIndex) === null;
  return `
    <article class="paper-card paper-slot-card paper-card-empty paper-slot-compact" data-paper-slot-index="${slotIndex}">
      <div class="paper-empty-body">
        <button
          class="paper-action-btn is-primary paper-empty-create-btn"
          type="button"
          ${canCreate
            ? `data-action="create-paper" data-paper-slot-index="${slotIndex}"`
            : `disabled aria-disabled="true"`}
        ><span aria-hidden="true">＋</span> 新建论文</button>
      </div>
      ${renderPaperStatsValues(0, 0, 0)}
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
        data-ui-select-workstation-paper="${escapeHtml(selectedPaper.id)}"
      >
        <div class="paper-card-header">
          <div class="paper-card-header-main">
            ${renderPaperSelectionToggle(selectedPaper, selected, "论文")}
            <span class="paper-card-status is-${getPaperDisplayStatus(selectedPaper)}">${getPaperStatusBadgeText(selectedPaper)}</span>
          </div>
          ${renderPaperDraftActions(selectedPaper, canReroll)}
        </div>
        ${renderPaperTitleWithMeta(state, selectedPaper)}
        ${renderPaperStats(selectedPaper)}
      </article>
    `;
  }

  if (selectedPaper.status === "journal-reviewing") {
    const selected = selectedPaper.id === getSelectedWorkstationPaper(state)?.id;
    return `
      <article class="paper-card paper-slot-card paper-card-filled paper-card-selectable is-journal-reviewing${selected ? " is-selected" : ""}" data-paper-id="${escapeHtml(selectedPaper.id)}" data-paper-slot-index="${panelIndex}" data-ui-select-workstation-paper="${escapeHtml(selectedPaper.id)}">
        ${renderPaperJournalHeader(state, selectedPaper, selected)}
        ${renderPaperTitleWithMeta(state, selectedPaper)}
      </article>
    `;
  }

  return `
    <article class="paper-card paper-slot-card paper-card-filled is-${selectedPaper.status}" data-paper-id="${escapeHtml(selectedPaper.id)}" data-paper-slot-index="${panelIndex}">
      ${selectedPaper.status === "reviewing"
        ? renderPaperReviewHeader(selectedPaper)
        : `<div class="paper-card-header"><span class="paper-card-header-tail"><span class="paper-card-status is-${selectedPaper.status}">${getPaperStatusBadgeText(selectedPaper)}</span></span></div>`}
      ${renderPaperTitleWithMeta(state, selectedPaper)}
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

  return `
    <div class="right-section workstation-section" id="workstation-section">
      <div class="workstation-action-toolbar" ${preEnrollment ? "hidden" : ""}>
      <div class="workstation-main-row">
          <div class="workstation-main-actions" id="workstation-main-actions">
            <button class="compact-action-btn workstation-main-action-btn is-read" type="button" ${readActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">📚</span>
                <span class="btn-desc">看论文${readPreview.readCount > 1 ? ` ×${readPreview.readCount}` : ""}</span>
              </span>
              <span class="btn-effect">SAN-${readPreview.sanCost}</span>
            </button>
            <button class="compact-action-btn workstation-main-action-btn is-work" type="button" ${workActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">💼</span>
                <span class="btn-desc">打工</span>
              </span>
              <span class="btn-effect">SAN-${workPreview.sanCost} · 金币+${workPreview.moneyReward}</span>
            </button>
            <button class="compact-action-btn workstation-main-action-btn is-rest" type="button" ${restActionAttributes}>
              <span class="workstation-action-main">
                <span class="workstation-action-icon" aria-hidden="true">🛋</span>
                <span class="btn-desc">休息</span>
              </span>
              <span class="btn-effect">SAN+${restSanGain}</span>
            </button>
            ${renderWorkstationPaperResearchActions(state, selectedPaper)}
          </div>
          <div class="workstation-action-points" aria-label="行动点 ${remainingActions}/${state.actionState.limit}">
            <span>行动点</span>
            <strong>${remainingActions}/${state.actionState.limit}</strong>
          </div>
        </div>
      </div>
      ${preEnrollment ? "" : '<p class="workstation-tip-note panel-tip-note">💡 小提示：想 idea、做实验、写论文会重掷对应分数，取新分数与当前分数 +1 中的较大值；每月按热度标注的比例衰减（期刊送审后除外），最低保留 1 分。</p>'}
      <div class="workstation-paper-grid" id="workstation-paper-grid">
        ${preEnrollment
          ? '<div class="section-empty play-module-lock-state">入学后开放</div>'
          : renderWorkstationPaperCards(state)}
      </div>
      ${preEnrollment ? "" : renderWorkstationPaperActions(state, selectedPaper)}
    </div>
  `;
}

type RelationshipRenderCard = {
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
  return `需要社交达到 ${threshold} 解锁该槽位。`;
}

function getRelationshipSortValue(startTotalMonths: number | null | undefined, fallback: number): number {
  return typeof startTotalMonths === "number" ? startTotalMonths : 1000 + fallback;
}

function getRenderedFellowTypeLabel(profile: FellowProgressProfile): string {
  return getFellowRoleLabel(profile.type, profile.gender);
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
  const cards: Array<RelationshipRenderCard | null> = Array.from({ length: 5 }, () => null);

  if (state.selectedAdvisorName && state.relationshipState.advisorCount > 0) {
    cards[0] = {
      type: "advisor",
      buttonLabel: "导师",
      displayType: "导师",
      displayName: `${state.selectedAdvisorName ?? "导师"} / 讲师`,
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
      taskUsedThisMonth: state.advisorProgressState.taskUsedThisMonth,
      canInteract: state.advisorProgressState.canInteract,
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
      const fellowLabel = getRenderedFellowTypeLabel(profile);
      const fallbackName = `${fellowLabel} ${fellowFallbackCounts[profile.type]}`;
      return ({
      sortValue: getRelationshipSortValue(profile.startTotalMonths, index),
      card: {
        type: profile.type,
        buttonLabel: fellowLabel,
        displayType: fellowLabel,
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
        taskUsedThisMonth: profile.taskUsedThisMonth,
        canInteract: profile.canInteract,
      } satisfies RelationshipRenderCard,
    });
    }),
    ...((state.loverState.active && state.loverProgressState.active && state.loverState.type)
      ? [{
        sortValue: getRelationshipSortValue(state.loverState.startTotalMonths, state.fellowProgressState.length),
        card: {
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
          taskCostLabel: `金币-${LOVER_DATE_MONEY_COST}`,
          taskUsedThisMonth: state.loverProgressState.taskUsedThisMonth,
          canInteract: state.loverProgressState.canInteract,
        } satisfies RelationshipRenderCard,
      }]
      : []),
  ]
    .sort((left, right) => left.sortValue - right.sortValue)
    .map((item) => item.card)
    .slice(0, 4);

  otherCards.forEach((card, index) => {
    cards[index + 1] = card;
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
          ${DEFERRED_GAMEPLAY_ACTION_ATTRIBUTES}
        >${escapeHtml(card.taskUsedThisMonth ? "✓ 本月已用" : `${card.taskLabel}（${card.taskCostLabel}）`)}</button>
        <button
          class="btn-sm rel-action-btn is-chat"
          type="button"
          ${DEFERRED_GAMEPLAY_ACTION_ATTRIBUTES}
        >交流</button>
      </div>
    </div>
  `;
}

function renderRelationshipSection(state: GameState, uiState: PlayRenderUiState = {}): string {
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
          : renderRelationshipCurrentCard(cards, activeRelationshipIndex, rel.unlockedSlots)}
      </div>
    </div>
  `;
}

function getPublishedPapers(state: GameState): Paper[] {
  return [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
}

function getResearchAuthorshipLabel(paper: Paper): string {
  return paper.nonFirstAuthor === true ? "合作" : "一作";
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
            <span>${formatCitationAxisValue(axisMax)}</span>
            <span>${formatCitationAxisValue(axisMid)}</span>
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
        <span><strong>${stats.totalCitations}</strong><small>引用</small></span>
        <span><strong>${stats.hIndex}</strong><small>h 指数</small></span>
        <span><strong>${stats.i10Index}</strong><small>i10 指数</small></span>
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
  const firstAuthorCount = publishedPapers.filter((paper) => paper.nonFirstAuthor !== true).length;
  const coauthorCount = publishedPapers.length - firstAuthorCount;
  const currentPaperIndex = publishedPapers.length === 0
    ? 0
    : Math.min(Math.max(uiState.currentResearchPaperIndex ?? 0, 0), publishedPapers.length - 1);
  const currentPaper = publishedPapers[currentPaperIndex] ?? null;
  const currentPaperConference = currentPaper?.target && currentPaper.submittedMonth && currentPaper.submittedYear
    ? getConferenceInfo(currentPaper.submittedMonth, currentPaper.target, currentPaper.submittedYear)
    : null;
  const currentPaperJournal = currentPaper?.publication?.journalTarget
    ? getJournalDefinition(currentPaper.publication.journalTarget)
    : null;
  const currentPaperInfluence = currentPaper?.publication?.influence
    ?? currentPaperConference?.influence
    ?? currentPaperJournal?.citationInfluence
    ?? null;
  const currentPaperAge = Math.max(0, Math.floor(currentPaper?.publication?.monthsSincePublish ?? 0));
  const monthsUntilCitationSettlement = CITATION_SETTLEMENT_INTERVAL_MONTHS;
  const monthsUntilScoreDecay = PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS - currentPaperAge % PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS;
  const currentPaperAgeText = currentPaperAge === 0 ? "刚发表" : `发表后 ${currentPaperAge} 月`;
  const conferencePending = currentPaper !== null
    && currentPaper.target !== null
    && currentPaper.conferenceHandled !== true;
  const preprintExposed = currentPaper?.publication?.preprintExposed === true;
  const conferenceStatusText = conferencePending && preprintExposed
    ? "已提前公开"
    : !conferencePending
      ? "已公开"
      : currentPaper?.conferenceAvailableAtTotalMonths !== undefined
      && currentPaper.conferenceAvailableAtTotalMonths > state.totalMonths
      ? `${currentPaper.conferenceAvailableAtTotalMonths - state.totalMonths} 月后参会`
      : "待参会";

  return `
    <div class="right-section research-section" id="research-section">
      <div class="research-compact-layout">
        <section class="research-library" aria-labelledby="research-library-title">
          <div class="research-library-header">
            <h3 id="research-library-title">论文 ${publishedPapers.length}</h3>
            <div class="research-library-totals">
              <span>${firstAuthorCount} 一作</span>
              <span>${coauthorCount} 合作</span>
            </div>
          </div>

          <div class="research-switch-btns research-paper-list" id="research-switch-btns">
            ${publishedPapers.length > 0
              ? publishedPapers.map((paper, index) => `
              <button
                class="research-switch-btn research-paper-row${index === currentPaperIndex ? " active" : ""}"
                type="button"
                data-ui-research-index="${index}"
                data-research-grade="${paper.target ?? "none"}"
                aria-pressed="${index === currentPaperIndex ? "true" : "false"}"
                aria-label="查看第 ${index + 1} 篇论文"
              >
                <span class="research-paper-grade grade-${paper.target ?? "none"}">${paper.target ?? "-"}</span>
                <span class="research-paper-row-main">
                  <strong title="${escapeHtml(paper.title)}">${escapeHtml(paper.title)}</strong>
                  <small>${getResearchAuthorshipLabel(paper)}${paper.publication?.acceptType ? ` · ${paper.publication.acceptType}` : ""}</small>
                </span>
                <span class="research-paper-row-metrics">
                  <span aria-label="引用 ${paper.publication?.citations ?? 0}"><strong>${paper.publication?.citations ?? 0}</strong><small>引用</small></span>
                  <span aria-label="中稿分 ${getAcceptedPaperScore(paper)}"><strong>${getAcceptedPaperScore(paper)}</strong><small>中稿</small></span>
                </span>
              </button>
            `).join("")
              : '<div class="no-papers">暂无已发表论文</div>'}
          </div>
        </section>

        <aside class="research-results-side">
          ${renderCitationProfile(state, publishedPapers)}
          <section class="research-current-card" id="research-current-card" aria-label="当前论文详情">
            ${currentPaper
              ? `
                <article class="research-card">
                  <div class="research-card-header">
                    <strong class="research-title">${escapeHtml(currentPaper.title)}</strong>
                  <div class="research-paper-tags">
                      <span class="research-paper-tag is-grade">${currentPaperJournal?.name ?? (currentPaper.target ? `${currentPaper.target} 类` : "未分类")}</span>
                      <span class="research-paper-tag is-authorship">${getResearchAuthorshipLabel(currentPaper)}</span>
                      ${currentPaper.publication?.acceptType ? `<span class="research-paper-tag is-accept">${currentPaper.publication.acceptType}</span>` : ""}
                    </div>
                  </div>
                  ${currentPaperConference ? `
                    <div class="research-paper-conference">
                      <strong title="${escapeHtml(currentPaperConference.fullName)}">${escapeHtml(currentPaperConference.name)}</strong>
                      <span>${currentPaperConference.year}</span>
                    </div>
                  ` : ""}
                  ${currentPaperJournal ? `
                    <div class="research-paper-conference">
                      <strong>${escapeHtml(currentPaperJournal.name)}</strong>
                      <span>期刊论文</span>
                    </div>
                  ` : ""}
                  <div class="research-paper-lifecycle">
                    <span>方向 ${escapeHtml(currentPaper.topicLabel)}</span>
                    <span>${conferenceStatusText}</span>
                    <span>${currentPaperAgeText}</span>
                    <span>${monthsUntilCitationSettlement} 月后结算</span>
                    <span>每月结算引用；当前分每 ${PUBLISHED_SCORE_DECAY_INTERVAL_MONTHS} 月 -${Math.round(PUBLISHED_SCORE_DECAY_RATE * 100)}%（${monthsUntilScoreDecay} 月后）</span>
                  </div>
                  <div class="research-metric-grid">
                    <div class="research-metric-item"><span>中稿分</span><strong>${getAcceptedPaperScore(currentPaper)}</strong></div>
                    <div class="research-metric-item"><span>当前分</span><strong>${currentPaper.publication?.effectiveScore ?? getAcceptedPaperScore(currentPaper)}</strong></div>
                    <div class="research-metric-item"><span>引用</span><strong>${currentPaper.publication?.citations ?? 0}</strong></div>
                    <div class="research-metric-item"><span>热度</span><strong>×${currentPaper.heatMultiplier.toFixed(2)}</strong></div>
                    <div class="research-metric-item"><span>影响力</span><strong>${currentPaperInfluence === null ? "-" : currentPaperInfluence.toFixed(2)}</strong></div>
                    <div class="research-metric-item"><span>引用倍率</span><strong>×${getPaperCitationMultiplier(state, currentPaper).toFixed(2)}</strong></div>
                  </div>
                  ${renderPaperReviewSummary(currentPaper)}
                  ${renderResearchPromotionActions(state, currentPaper)}
                </article>
              `
              : `
                <div class="research-detail-empty">
                  <span>${publishedPapers.length === 0 ? "发表论文后显示详情" : "选择一篇论文"}</span>
                </div>
              `}
          </section>
        </aside>
      </div>
    </div>
  `;
}

function normalizeTalentPanelTab(tabId: TalentPanelTabId | undefined): TalentPanelTabId {
  return tabId === "relation" || tabId === "equip" || tabId === "growth" ? tabId : "character";
}

function renderTalentTabButton(tabId: TalentPanelTabId, label: string, active: boolean): string {
  return `
    <button
      class="panel-switch-btn${active ? " active" : ""}"
      type="button"
      data-ui-talent-tab="${tabId}"
      aria-pressed="${active ? "true" : "false"}"
    >${label}</button>
  `;
}

function renderTalentPanelItem(item: TalentPanelItem): string {
  const progress = item.progress;
  const progressPercent = progress
    ? clampPercent(progress.value / Math.max(1, progress.max) * 100)
    : 0;
  return `
    <article
      class="talent-item talent-item-row${item.active ? " is-active" : " is-inactive"}"
      data-talent-item-id="${escapeHtml(item.id)}"
    >
      <div class="talent-item-head">
        <span class="talent-item-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
        <div class="talent-item-heading">
          <strong class="talent-item-title">${escapeHtml(item.name)}</strong>
        </div>
        <span class="talent-item-tag${item.active ? " is-active" : " is-inactive"}">${item.active ? "已激活" : "未激活"}</span>
      </div>
      ${item.metrics ? `
        <div class="talent-item-metrics">
          ${item.metrics.map((metric) => `
            <div class="talent-item-metric">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${progress ? `
        <div class="talent-item-progress">
          <div class="talent-item-progress-head">
            <span>${escapeHtml(progress.label)}</span>
            <strong>${escapeHtml(progress.valueLabel)}</strong>
          </div>
          <div class="talent-item-progress-track" role="progressbar" aria-label="${escapeHtml(progress.label)}" aria-valuemin="0" aria-valuemax="${progress.max}" aria-valuenow="${progress.value}">
            <span style="width:${progressPercent.toFixed(1)}%"></span>
          </div>
        </div>
      ` : ""}
      <p class="talent-item-desc">${escapeHtml(item.description)}</p>
      ${item.detail ? `<p class="talent-item-note">${escapeHtml(item.detail)}</p>` : ""}
      ${!item.active && item.requirement ? `<p class="talent-item-note is-requirement">${escapeHtml(item.requirement)}</p>` : ""}
    </article>
  `;
}

function getTalentFellowTypeLabel(profile: FellowProgressProfile): string {
  return getFellowRoleLabel(profile.type, profile.gender);
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
  const mentoringBuffs = state.buffs.filter((buff) => (
    buff.name === "长期带教"
    && buff.source === "指导师弟师妹"
    && buff.scheduledPublication !== undefined
  ));
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
      name: `${getTalentFellowTypeLabel(profile)}·${profile.name ?? getTalentFellowTypeLabel(profile)}`,
      active: true,
      description: `效果：帮忙${getTalentFellowTaskLabel(profile.taskType)} +${profile.research}。`,
      detail: `当前亲和 ${profile.affinity}，任务进度 ${profile.taskProgress}/${profile.taskMax}。`,
    })),
    ...mentoringBuffs.map((buff) => {
      const schedule = buff.scheduledPublication!;
      const interval = Math.max(1, Math.floor(schedule.intervalMonths));
      const elapsed = Math.max(0, Math.min(interval - 1, Math.floor(schedule.elapsedMonths ?? 0)));
      return {
        id: `mentoring-${buff.id}`,
        icon: "🧑‍🏫",
        name: "长期带教",
        active: true,
        description: `效果：每月 SAN -2；每 ${interval} 月自动生成一篇非一作合作论文。`,
        detail: `当前周期进度 ${elapsed}/${interval} 月。`,
      };
    }),
    {
      id: "joint-training",
      icon: "🧠",
      name: "大牛联培",
      active: state.conferenceEncounterState.bigBullCooperation,
      description: state.conferenceEncounterState.bigBullCooperation
        ? `效果：每次想 idea +5、做实验 +5；导师科研资源 +2；联培引用成长带来科研上限 +${jointTrainingBonus}。`
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
        ? `效果：做实验 ×${formatMonthlyValue(state.internshipState.experimentMultiplier)}，每月工资 +${formatMonthlyValue(internshipIncome)} 金币，SAN -2。`
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
        description: "效果：科研 +2，约会开销 -2；每次想 idea、做实验、写论文各多 1 次。",
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
        description: `效果：SAN 上限 +4，约会开销 -2；每月恢复已损 SAN 的 ${recoveryRate}%。`,
        detail: `已约会 ${state.loverProgressState.completedTaskCount} 次，当前月结按现状可恢复 SAN ${currentRecovery}。`,
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

  const chairSanRecovered = Math.max(0, Math.floor(state.shopState.chairSanRecovered ?? 0));
  const recoveryMetrics = (effect: string) => [
    { label: "累计回复 SAN", value: `+${chairSanRecovered}` },
    { label: "当前效果", value: effect },
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
      description: "效果：休息动作改为 SAN +5。",
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
        : `效果：每月 SAN -${tier.monthlySanCost}；每累计消耗 6 点 SAN，SAN 上限 +1（最多 +${capLimit}）。`
      : "效果：购入后逐级提升骑行消耗与 SAN 上限成长。",
    metrics: tier
      ? [
          { label: "累计消耗 SAN", value: `${sanSpent}` },
          { label: "每月消耗", value: capReached ? "0" : `-${tier.monthlySanCost}` },
        ]
      : undefined,
    progress: tier
      ? {
          label: "SAN 上限成长",
          value: capGains,
          max: Math.max(1, capLimit),
          valueLabel: `+${capGains}/+${capLimit}`,
        }
      : undefined,
  };
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
  const badmintonRate = getBadmintonWinRate(
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
        { label: "已看", value: `${readCount} 次` },
        { label: "下次想 idea", value: `+${nextReadingIdeaBonus}` },
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
        { label: "已打工", value: `${workCount} 次` },
        { label: "下次金币", value: `+${workPreview.moneyReward}` },
        { label: "下次 SAN", value: `-${workPreview.sanCost}` },
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
        { label: "已参会", value: `${meetingCount} 次` },
        { label: "国内", value: `-${meetingDiscounts[0]}` },
        { label: "亚太", value: `-${meetingDiscounts[1]}` },
        { label: "欧美", value: `-${meetingDiscounts[2]}` },
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
      description: "首次胜率 40%，每参加一次提高 10%，球拍额外 +30%，最高 90%",
      metrics: [
        { label: "当前胜率", value: `${badmintonRate}%` },
        { label: "已参加", value: `${badmintonCount} 次` },
      ],
      progress: {
        label: "水平进度",
        value: badmintonRate,
        max: ACTIVITY_WIN_RATE_CAP,
        valueLabel: `${badmintonRate}%`,
      },
    },
    {
      id: "poker-growth",
      icon: "🃏",
      name: "牌局策略",
      active: true,
      description: "首次胜率 40%，每参加一次提高 10%，最高 90%",
      metrics: [
        { label: "当前胜率", value: `${pokerRate}%` },
        { label: "已参加", value: `${pokerCount} 次` },
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
      description: fullGearActive
        ? "效果：小电驴四季每月 SAN +1。"
        : "效果：小电驴、遮阳伞和羽绒服组成完整出行装备。",
      detail: fullGearActive ? "春、夏、秋、冬每月 SAN +1。" : undefined,
      requirement: "条件：小电驴 + 遮阳伞 + 羽绒服。",
    },
    {
      id: "ai-collaboration",
      icon: "🤖",
      name: "AI 协作",
      active: aiCollaboration.active,
      description: "效果：行动点耗尽后，可额外进行 1 次科研操作；不消耗行动点，但 SAN +2。",
      detail: `当前已启用 ${aiCollaboration.activeAiCount}/3 个 AI 模型；GPT/Claude ${aiCollaboration.hasCoreModel ? "已启用" : "未启用"}。`,
      requirement: "条件：本月启用至少 3 个 AI 模型，且其中包含 GPT 或 Claude。",
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
            { label: "累计生产", value: `${trackedCoffeeCount} 杯` },
            { label: "当前额外 SAN", value: `+${coffeeBonus}` },
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
      : tabId === "growth"
        ? buildGrowthTalentItems(state)
        : buildCharacterTalentItems(state, role);

  return `
    <div class="talent-panel">
      <div class="talent-header-row">
        <div class="panel-switch-btns">
          ${renderTalentTabButton("character", "角色", tabId === "character")}
          ${renderTalentTabButton("relation", "关系", tabId === "relation")}
          ${renderTalentTabButton("equip", "装备", tabId === "equip")}
          ${renderTalentTabButton("growth", "成长", tabId === "growth")}
        </div>
      </div>
      <div class="talent-items-list" id="talent-items-list" data-talent-panel-tab="${tabId}">
        ${items.map((item) => renderTalentPanelItem(item)).join("")}
      </div>
    </div>
  `;
}

function renderDebugStatButtons(filter: "all" | "without-money" | "money" | DebugStatId = "all"): string {
  return DEBUG_STAT_GROUPS
    .filter((group) => (
      filter === "all"
      || (filter === "money" ? group.statId === "money" : filter === "without-money" ? group.statId !== "money" : group.statId === filter)
    ))
    .flatMap((group) =>
    group.deltas.map((delta) => `
      <button
        class="debug-tool-btn"
        type="button"
        data-action="debug-adjust-stat"
        data-debug-stat-id="${group.statId}"
        data-delta="${delta}"
      >${escapeHtml(`${group.label}${formatSignedNumber(delta)}`)}</button>
    `),
    ).join("");
}

function renderDebugMonthButtons(): string {
  const shiftButtons = DEBUG_MONTH_DELTAS.map((delta) => `
    <button
      class="debug-tool-btn"
      type="button"
      data-action="debug-shift-month"
      data-delta="${delta}"
      aria-label="调整时间 ${formatSignedNumber(delta)}月"
    >${escapeHtml(`${formatSignedNumber(delta)}月`)}</button>
  `).join("");
  return `${shiftButtons}
    <button
      class="debug-tool-btn is-force-next"
      type="button"
      data-action="force-next-month"
      title="删除当前阻塞事件并真实结算下一月"
      aria-label="删除当前阻塞事件并真实结算下一月"
    >下一月</button>
  `;
}

function renderDebugPaperButtons(): string {
  return ([
    ...(["A", "B", "C"] as const).map((target) => ({ target, authorship: "first" as const, label: `${target}一作` })),
    ...(["A", "B", "C"] as const).map((target) => ({ target, authorship: "coauthor" as const, label: `${target}合作` })),
  ]).map((button) => `
    <button
      class="debug-tool-btn"
      type="button"
      data-action="debug-add-paper"
      data-debug-paper-target="${button.target}"
      data-debug-paper-authorship="${button.authorship}"
    >${button.label}</button>
  `).join("");
}

function renderDebugEventGroups(): string {
  return DEBUG_EVENT_GROUPS
    .map((group, index) => `
      <div class="debug-event-group${index > 0 ? " is-separated" : ""}">
        ${group.buttons.map((button) => `
          <button
            class="debug-tool-btn"
            type="button"
            data-action="debug-trigger-event"
            data-event-id="${button.id}"
          >${escapeHtml(normalizeGameDisplayText(button.label))}</button>
        `).join("")}
      </div>
    `)
    .join("");
}

function renderDebugBottomBar(): string {
  return `
    <aside class="debug-bottom-bar" id="debug-bottom-bar" aria-label="开发测试工具">
      <div class="debug-bottom-bar-inner">
        <div class="debug-bottom-column">
          <div class="debug-bottom-group">
            <div class="debug-bottom-stat-grid">
              ${renderDebugStatButtons("san")}
            </div>
          </div>
          <div class="debug-bottom-group">
            <div class="debug-bottom-stat-grid">
              ${renderDebugStatButtons("research")}
            </div>
          </div>
        </div>
        <div class="debug-bottom-column">
          <div class="debug-bottom-group">
            <div class="debug-bottom-stat-grid">
              ${renderDebugStatButtons("social")}
            </div>
          </div>
          <div class="debug-bottom-group">
            <div class="debug-bottom-stat-grid">
              ${renderDebugStatButtons("favor")}
            </div>
          </div>
        </div>
        <div class="debug-bottom-column">
          <div class="debug-bottom-group">
            <div class="debug-bottom-stat-grid">
              ${renderDebugStatButtons("money")}
            </div>
          </div>
          <div class="debug-bottom-group">
            <div class="debug-bottom-time-grid">
              ${renderDebugMonthButtons()}
            </div>
          </div>
        </div>
        <div class="debug-bottom-column debug-bottom-paper-column">
          <div class="debug-bottom-group">
            <div class="debug-bottom-paper-grid">
              ${renderDebugPaperButtons()}
            </div>
          </div>
          <div class="debug-bottom-group">
            <button class="debug-tool-btn debug-buff-btn" type="button" data-action="debug-add-all-buffs">全部buff</button>
          </div>
        </div>
        <div class="debug-bottom-actions">
          <button class="settings-primary-btn is-restart" type="button" data-action="restart-game">
            <i data-lucide="rotate-ccw" aria-hidden="true"></i>
            <span>重开</span>
          </button>
          <button class="settings-primary-btn is-return" type="button" data-action="reset-game">
            <i data-lucide="house" aria-hidden="true"></i>
            <span>返回开始页</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}

function renderSettingsSection(): string {
  return `
    <div class="settings-panel">
      <div class="settings-quick-actions" id="settings-panel-content">
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
    </div>
  `;
}

function renderFinishedCenterShell(state: GameState): string {
  const endingCopy = {
    master: ["硕士毕业", "你达到了硕士毕业要求，本轮结束。"],
    phd: ["博士毕业", "你达到了博士毕业要求，本轮结束。"],
    delay: ["延期毕业", "培养期限已到，但科研分还没有达到毕业要求。"],
    burnout: ["SAN 耗尽", "SAN 跌破 0，本轮提前结束。"],
    poor: ["金币耗尽", "金币跌破 0，本轮提前结束。"],
    expelled: ["被退学", "导师好感跌破 0，本轮提前结束。"],
    isolated: ["被孤立", "社交能力跌破 0，本轮提前结束。"],
  } as const;
  const [title, description] = state.ending
    ? endingCopy[state.ending]
    : ["本轮结束", "本轮已经结束。"];
  const scoreText = state.graduationScoreTarget === null
    ? `科研分 ${state.totalResearchScore}`
    : `科研分 ${state.totalResearchScore}/${state.graduationScoreTarget}`;

  return `
    <section class="play-center-column game-main-area">
      <div class="center-shell ending-shell" id="center-shell">
        <div class="ending-panel">
          <span class="ending-kicker">本轮结束</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="ending-score">${escapeHtml(scoreText)}</div>
          <div class="ending-actions">
            <button class="settings-primary-btn is-restart" type="button" data-action="restart-game">
              <i data-lucide="rotate-ccw" aria-hidden="true"></i>
              <span>重开</span>
            </button>
            <button class="settings-primary-btn is-return" type="button" data-action="reset-game">
              <i data-lucide="house" aria-hidden="true"></i>
              <span>返回开始页</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCenterShell(state: GameState, uiState: PlayRenderUiState = {}): string {
  if (state.phase === "finished") return renderFinishedCenterShell(state);

  const role = getRoleDefinition(state.selectedRoleId);
  const blockingEventCount = state.eventQueue.filter((event) => event.blocking && event.deadlineMonths <= 0).length;
  const researchPreview = isGameplayModuleLocked(state) ? null : previewReadPaperAction(state);
  const regularResearchActionCount = researchPreview?.canRead
    ? Math.max(0, state.actionState.limit - state.actionState.used)
    : 0;
  const aiResearchActionAvailable = !isGameplayModuleLocked(state)
    && getActiveOperationAllowance(state, "idea").usesAiResearchBonus;
  const aiResearchActionCount = aiResearchActionAvailable ? 1 : 0;
  const researchActionCount = regularResearchActionCount + aiResearchActionCount;
  const researchActionLabel = aiResearchActionCount > 0
    ? `AI行动可用 ${aiResearchActionCount} 次`
    : `本月看论文可用 ${regularResearchActionCount} 次`;
  const relationshipActionCount = 0;
  const shopActionCount = 0;
  const activeEventId = uiState.isEventContentOpen ? (uiState.activeEventId ?? null) : null;
  const activeEventHistoryId = uiState.isEventContentOpen ? (uiState.activeEventHistoryId ?? null) : null;
  const dateDisplayMode = getDateDisplayMode(uiState);
  const openEvent = activeEventId ? getCurrentEvent(state.eventQueue, activeEventId) : null;
  const openHistoryEvent = activeEventHistoryId
    ? state.eventHistory.find((event) => event.id === activeEventHistoryId) ?? null
    : null;
  const logPages = buildLogPages(state.log, state.degree, dateDisplayMode);
  const latestLogPageIndex = Math.max(0, logPages.length - 1);
  const resolvedLogPageIndex = logPages.length === 0
    ? 0
    : Math.min(Math.max(uiState.activeLogPage ?? latestLogPageIndex, 0), latestLogPageIndex);
  const activeLogPage = logPages[resolvedLogPageIndex] ?? null;
  const atFirstLogPage = resolvedLogPageIndex <= 0;
  const atLastLogPage = resolvedLogPageIndex >= latestLogPageIndex;
  const activePlayTab = uiState.activePlayTab ?? "events";
  const getTabActiveClass = (tabId: PlayTabId): string => activePlayTab === tabId ? " active" : "";
  const getTabAriaPressed = (tabId: PlayTabId): string => activePlayTab === tabId ? "true" : "false";
  const getTabPanelHidden = (tabId: PlayTabId): string => activePlayTab === tabId ? "" : " hidden";

  const renderTabBadge = (count: number, tone: "blocking" | "available", label: string): string => (
    count > 0
      ? `<span class="center-tab-badge is-${tone}" aria-label="${escapeHtml(label)}">${count}</span>`
      : ""
  );
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
          <button class="center-tab-btn${getTabActiveClass("shop")}" type="button" aria-pressed="${getTabAriaPressed("shop")}" data-ui-play-tab="shop"><span class="center-tab-icon" aria-hidden="true">🛒</span><span>商店</span>${renderTabBadge(shopActionCount, "available", `${shopActionCount} 个可用操作`)}</button>
          <button class="center-tab-btn${getTabActiveClass("research")}" type="button" aria-pressed="${getTabAriaPressed("research")}" data-ui-play-tab="research"><span class="center-tab-icon" aria-hidden="true">🏆</span><span>成果</span></button>
          <button class="center-tab-btn${getTabActiveClass("talent")}" type="button" aria-pressed="${getTabAriaPressed("talent")}" data-ui-play-tab="talent"><span class="center-tab-icon" aria-hidden="true">🌱</span><span>天赋</span></button>
          <button class="center-tab-btn${getTabActiveClass("settings")}" type="button" aria-pressed="${getTabAriaPressed("settings")}" data-ui-play-tab="settings"><span class="center-tab-icon" aria-hidden="true">⚙️</span><span>设置</span></button>
          <button
            class="center-tab-btn center-tab-btn-next"
            type="button"
            data-action="next-month"
            ${blockingEventCount > 0 ? 'disabled aria-disabled="true" title="请先处理本月事件"' : ""}
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
                logPages.length,
                atFirstLogPage,
                atLastLogPage,
                state.eventHistory,
                openEvent || openHistoryEvent
                  ? renderEventContentBox(openEvent, openHistoryEvent, uiState.activeEventHistoryIndex ?? null)
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
            )}
          </section>

          <section class="center-main-panel${getTabActiveClass("research")}" data-tab-panel="research"${getTabPanelHidden("research")}>
            ${renderResearchSection(state, uiState)}
          </section>

          <section class="center-main-panel${getTabActiveClass("talent")}" data-tab-panel="talent"${getTabPanelHidden("talent")}>
            ${renderTalentSection(state, role, uiState.activeTalentTab)}
          </section>

          <section class="center-main-panel${getTabActiveClass("settings")}" data-tab-panel="settings"${getTabPanelHidden("settings")}>
            ${renderSettingsSection()}
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
      <strong class="todo-title">${escapeHtml(item.title)}</strong>
      <span class="todo-deadline" data-deadline="${getDeadlineTone(item.monthsLater)}">${escapeHtml(item.timeText)}</span>
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
    .map((event) => ({ kind: "pending" as const, event }));
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

function renderPendingAgendaList(page: PendingAgendaPage): string {
  if (page.items.length === 0) {
    return `<div class="todo-empty">暂无待办事件</div>`;
  }

  return `
    <div class="new-todo-list">
      <div class="todo-group">${page.items.map((item) => item.kind === "pending"
        ? `
          <button class="event-card" type="button" data-ui-open-event-id="${escapeHtml(item.event.id)}">
            <div class="event-card-header">
              <span class="event-title">${escapeHtml(getEventRootTitle(item.event.title))}</span>
              <span class="event-ddl-badge" data-deadline="${getDeadlineTone(item.event.deadlineMonths)}">期限 ${getDeadlineText(item.event.deadlineMonths)}</span>
            </div>
          </button>
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

function buildLogPages(
  logEntries: GameLogEntry[],
  degree: GameState["degree"],
  dateDisplayMode: DateDisplayMode,
): LogPage[] {
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
        label: getLogPageLabel(monthKey, degree, dateDisplayMode),
        entries: [entry],
      });
    }
  }

  return [...pageMap.values()];
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

const LOG_VALUE_CHANGE_PATTERN = /(?:(?:SAN\s*(?:值|上限)?)|金币|导师好感(?:度)?|好感(?:度)?|亲和度|社交(?:能力)?|科研(?:能力|资源|上限|分)?|生病概率|每月实验次数|参加次数|idea|实验|写作|引用)\s*[+＋\-−]\s*\d+(?:\.\d+)?%?/giu;

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
  if (!entry.eventHistoryId) return parsed;
  const record = eventHistory.find((event) => event.id === entry.eventHistoryId);
  if (!record) return parsed;

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
  let result = parsed.result;
  for (const choice of [...visibleChoices].reverse()) {
    const prefix = `${choice}：`;
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length).trim();
      break;
    }
  }
  return {
    title: visibleChoices.length > 0 ? `${parsed.title} - ${visibleChoices.join(" · ")}` : parsed.title,
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
      const eventHistoryAttributes = entry.eventHistoryId
        ? ` data-ui-open-event-history-id="${escapeHtml(entry.eventHistoryId)}" aria-label="回看${escapeHtml(normalizeGameDisplayText(title))}"`
        : "";
      const entryTag = entry.eventHistoryId ? "button" : "div";
      const entryTypeAttributes = entry.eventHistoryId ? ' type="button"' : "";
      return `
        <${entryTag} class="${getLogEntryClassName(entry.text)}${entry.eventHistoryId ? " event-history-log-entry" : ""}"${entryTypeAttributes}${eventHistoryAttributes}>
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
  pageCount: number,
  atFirstLogPage: boolean,
  atLastLogPage: boolean,
  eventHistory: readonly GameState["eventHistory"][number][],
  eventContentHtml = "",
): string {
  return `
    <div class="event-log-panel log-panel" id="event-log-panel" data-log-page-index="${pageIndex}" data-log-page-count="${pageCount}">
      <div class="log-header-row event-log-header-row">
        <div class="log-header-controls-row">
          <div class="log-nav-btns log-page-selector" aria-label="日志分页">
            <button class="log-nav-btn" id="log-nav-prev-year" type="button" data-ui-log-nav="first" aria-label="最早日志" ${atFirstLogPage ? "disabled" : ""}>«</button>
            <button class="log-nav-btn" id="log-nav-prev-month" type="button" data-ui-log-nav="prev" aria-label="上一月日志" ${atFirstLogPage ? "disabled" : ""}>‹</button>
            <span class="log-time" id="log-time-header">${escapeHtml(page?.label ?? "暂无日志")}</span>
            <button class="log-nav-btn" id="log-nav-next-month" type="button" data-ui-log-nav="next" aria-label="下一月日志" ${atLastLogPage ? "disabled" : ""}>›</button>
            <button class="log-nav-btn" id="log-nav-next-year" type="button" data-ui-log-nav="last" aria-label="最新日志" ${atLastLogPage ? "disabled" : ""}>»</button>
          </div>
        </div>
      </div>
      ${eventContentHtml}
      <div class="log-content event-log-content" id="log-content">
        ${renderLogList(page, eventHistory)}
      </div>
    </div>
  `;
}

function renderDebugEventRail(): string {
  return `
    <section class="debug-event-rail" id="debug-event-rail" aria-label="开发事件">
      <div class="debug-event-list">
        ${renderDebugEventGroups()}
      </div>
    </section>
  `;
}

function renderRightRail(state: GameState, uiState: PlayRenderUiState = {}): string {
  const dateDisplayMode = getDateDisplayMode(uiState);
  const preEnrollment = isPreEnrollmentState(state);
  const seasonLabel = getSeasonLabel(state);
  const pendingEvents = getSortedEventQueue(state.eventQueue);
  const pendingBlockingCount = pendingEvents.filter((event) => event.blocking && event.deadlineMonths <= 0).length;
  const pendingPage = buildPendingAgendaPage(state, uiState.activePendingPage ?? 0);
  const atFirstPendingPage = pendingPage.pageIndex <= 0;
  const atLastPendingPage = pendingPage.pageIndex >= pendingPage.pageCount - 1;

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
                type="button"
                data-action="set-date-display-mode"
                data-date-display-mode="${dateDisplayMode === "academic" ? "calendar" : "academic"}"
                aria-label="切换日期显示"
                title="切换日期显示"
              >🔄</button>
              ${seasonLabel ? `<span class="new-time-item new-time-season" id="new-time-season" tabindex="0" aria-label="${escapeHtml(getSeasonEffectText(state))}" data-tooltip="${escapeHtml(getSeasonEffectText(state))}" title="${escapeHtml(getSeasonEffectText(state))}">${seasonLabel}</span>` : ""}
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
            <div class="todo-nav-btns" aria-label="待办事件分页">
              <button class="todo-nav-btn" id="pending-nav-prev" type="button" data-ui-pending-nav="prev" aria-label="上一页" ${atFirstPendingPage ? "disabled" : ""}>&lt;</button>
              <button class="todo-nav-btn" id="pending-nav-next" type="button" data-ui-pending-nav="next" aria-label="下一页" ${atLastPendingPage ? "disabled" : ""}>&gt;</button>
            </div>
          </div>
          <div class="new-calendar-content new-pending-event-content event-queue" id="pending-event-list">
            ${renderPendingAgendaList(pendingPage)}
          </div>
        </div>
      </div>
    </aside>
  `;
}

export function renderPlayScreen(state: GameState, uiState: PlayRenderUiState = {}): string {
  return `
    <main class="play-page${SHOW_ALL_MODULES_DURING_DEVELOPMENT && state.phase === "playing" ? " has-debug-bar" : ""}" data-phase="${state.phase}" data-scale-mode="fixed">
      <section class="play-stage-shell">
        <div class="play-stage-scale">
          <section class="play-stage">
            <section class="play-workbench">
              <div class="play-workbench-body">
                ${renderLeftRail(state)}
                ${renderCenterShell(state, uiState)}
                ${renderRightRail(state, uiState)}
                ${SHOW_ALL_MODULES_DURING_DEVELOPMENT && state.phase === "playing" ? renderDebugEventRail() : ""}
              </div>
            </section>
          </section>
        </div>
      </section>
      ${SHOW_ALL_MODULES_DURING_DEVELOPMENT && state.phase === "playing" ? renderDebugBottomBar() : ""}
      ${uiState.isFeedbackOpen ? renderGameFeedbackOverlay() : ""}
    </main>
  `;
}
