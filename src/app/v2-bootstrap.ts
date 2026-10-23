import { formatAttributeDetail } from "../core/v2-attribute-format";
import { captureReplayRecording } from "../core/v2-local-replay";
import { createReplayLibrary } from "./v2-replay-library";
import { downloadReplayRecording } from "./v2-replay-download";
import {
  Activity,
  ArrowRight,
  Award,
  Backpack,
  BadgeCheck,
  BadgeDollarSign,
  Bell,
  BookOpen,
  Brain,
  Briefcase,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  CircleHelp,
  CircleDollarSign,
  Clock3,
  Coffee,
  Coins,
  Cpu,
  createIcons,
  Crown,
  Database,
  Download,
  Dumbbell,
  Eye,
  Feather,
  FastForward,
  Files,
  FileHeart,
  FileCheck2,
  FileText,
  FilePlus2,
  Flame,
  FlaskConical,
  Footprints,
  Gamepad2,
  Gem,
  Gift,
  GitFork,
  GraduationCap,
  HandCoins,
  HandHelping,
  Handshake,
  Heart,
  HeartCrack,
  HeartHandshake,
  HeartPlus,
  HeartPulse,
  History,
  House,
  Hourglass,
  Infinity,
  Laptop,
  Lightbulb,
  Lock,
  LogOut,
  Medal,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Microscope,
  Microchip,
  Monitor,
  MoveUpRight,
  Network,
  NotebookPen,
  Presentation,
  PiggyBank,
  Pause,
  Play,
  RefreshCw,
  Reply,
  RotateCcw,
  Rocket,
  Send,
  Settings,
  Shield,
  ShieldPlus,
  Skull,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Sunrise,
  Target,
  Trophy,
  TrendingUp,
  Users,
  UsersRound,
  ShoppingCart,
  UserRound,
  UserRoundPlus,
  Wallet,
  Utensils,
  Wrench,
  X,
  Zap,
} from "lucide";

import { DEBUG_RELATIONSHIP_TYPES, DEBUG_STAT_IDS, GAME_ACTION_IDS } from "../core/v2-action-ids";
import { AI_SLOT_IDS, getAiModelForTotalMonths } from "../core/v2-ai-shop";
import { getCurrentCoffeeBonus } from "../core/v2-coffee-system";
import { createStore } from "../core/v2-store";
import { getSelectedCurseDifficulty } from "../core/v2-curse-progress";
import { createVisitStats } from "./v2-visit-stats";
import { createConferenceStats } from "./v2-conference-stats";
import { createJournalStats } from "./v2-journal-stats";
import { createThesisStats } from "./v2-thesis-stats";
import { createStatisticsClient } from "./v2-statistics-client";
import { isRemoteWriteEnabled } from "./v2-remote-access";
import type { RewinderAct } from "./v2-render-rewinder-event";
import type { AcademicArchiveAct } from "./v2-render-rewinder-academic";
import { getAvailableAcademicYears, isAcademicArchivePending } from "../core/v2-rewinder-academic";
import { createAchievementStats } from "./v2-achievement-stats";
import { countMessageCharacters, createCommunityMessages, MESSAGE_MAX_LENGTH, NICKNAME_MAX_LENGTH, refreshCommunityComposerLayout, refreshCommunityContentOverflow, renderCommunityMessages } from "./v2-community-messages";
import { createValueAnimations, getVisibleValueDelta } from "./v2-value-animations";
import { createEventLayout } from "./v2-event-layout";
import { createRelationshipTooltips } from "./v2-relationship-tooltips";
import { createDebugWindow } from "./v2-debug-window";
import { RESEARCH_PAGE_SIZE, renderEventLayoutSamples, renderRelationTalentCard } from "./v2-render-play";
import { getCurrentEvent, getEventRootId, getSortedEventQueue } from "../core/v2-event-queue";
import { getBranchEventIntroChoice } from "../core/v2-event-auto-resolution";
import { getRoleOptions, isPreEnrollmentState } from "../core/v2-progression";
import { getAttributeTier } from "../core/v2-random-event-rules";
import { getAvailablePaperSlotCount } from "../core/v2-paper-rules";
import type {
  DebugRelationshipType,
  DebugStatId,
  DateDisplayMode,
  GameActionId,
  GameState,
  PlayerStats,
  PaperActionType,
  PaperTarget,
  JournalTarget,
  PaperPromotionId,
  RoleId,
  AiSlotId,
  CoffeeMachineUpgradeId,
  ShopItemId,
  ShopUpgradeId,
  SupportItemId,
} from "../core/v2-types";
import {
  renderApp,
} from "./v2-render";
import { renderRoleRail } from "./v2-render-setup-screen";
import { getAnnouncementPageIndex } from "./v2-announcements";
import { bindAnnouncementCollapse, renderAnnouncementPage } from "./v2-render-announcements";
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import {
  type RoleRailViewId,
  type PlayTabId,
  type ResearchAuthorshipFilter,
  type ResearchSortMode,
  type ShopUpgradeNoticeTab,
  type TalentPanelTabId,
} from "./v2-render-types";
import { warmRoleDetailPortraits } from "./v2-role-portrait-assets";
import { getAllPlayHelpPageIds, getPlayHelpContext, getPlayHelpPageIndex } from "./v2-play-help";
import { createResponsiveScoreCharts } from "./v2-responsive-score-charts";
import { bindLobbyPortrait } from "./v2-lobby-portrait";
import { getStartTalentReminderPoints, renderStartTalentReminder } from "./v2-start-talent-reminder";
import { createRoleLevelStats } from "./v2-role-level-stats";
import { renderRoleLevelStatsOverlay } from "./v2-render-role-level-stats";
import "../styles/role-level-stats.css";
import "../styles/mobile-base.css";
import "../styles/mobile-lobby.css";
import "../styles/mobile-panels.css";
import "../styles/mobile-events.css";
import "../styles/community-mobile.css";

const ROLE_IDS: ReadonlySet<string> = new Set(getRoleOptions().map((role) => role.id));
const ROLE_IDS_IN_DISPLAY_ORDER = getRoleOptions().map((role) => role.id);
const PLAY_TAB_IDS: ReadonlySet<string> = new Set(["events", "workstation", "relationship", "shop", "research", "talent", "settings"]);
const ROLE_RAIL_VIEW_IDS: ReadonlySet<string> = new Set(["achievements", "messages", "announcements"]);
const SHOP_TAB_IDS: ReadonlySet<string> = new Set(["ai", "coffee", "gear", "life", "rest"]);
const TALENT_PANEL_TAB_IDS: ReadonlySet<string> = new Set(["character", "relation", "equip", "growth", "publication"]);
const DATE_DISPLAY_MODES: ReadonlySet<string> = new Set(["academic", "calendar"]);
const GAME_ACTION_ID_SET: ReadonlySet<string> = new Set(GAME_ACTION_IDS);
const DEBUG_STAT_ID_SET: ReadonlySet<string> = new Set(DEBUG_STAT_IDS);
const PAPER_ACTION_TYPE_SET: ReadonlySet<string> = new Set(["idea", "experiment", "writing"]);
const PAPER_TARGET_SET: ReadonlySet<string> = new Set(["A", "B", "C"]);
const JOURNAL_TARGET_SET: ReadonlySet<string> = new Set(["nature", "nmi", "pami"]);
const PAPER_PROMOTION_SET: ReadonlySet<string> = new Set(["arxiv", "github", "xiaohongshu"]);
const DEBUG_PAPER_AUTHORSHIP_SET: ReadonlySet<string> = new Set(["first", "coauthor"]);
const DEBUG_RELATIONSHIP_TYPE_SET: ReadonlySet<string> = new Set(DEBUG_RELATIONSHIP_TYPES);
const CHAIR_UPGRADE_ID_SET: ReadonlySet<string> = new Set([
  "chair-advanced",
  "chair-massage",
  "chair-torture",
  "chair-spike",
  "chair-hammock",
]);
const COFFEE_UPGRADE_ID_SET: ReadonlySet<string> = new Set(["manual", "automatic", "advanced", "unlimited"]);
const SETUP_STAGE_WIDTH = 1540;
const PLAY_STAGE_WIDTH = 1540;
const ANIMATED_ATTRIBUTE_IDS = ["san", "research", "social", "favor"] as const;

type ShopUpgradeNotice = {
  key: string;
  tab: ShopUpgradeNoticeTab;
};

function getAiModelSignature(state: Pick<GameState, "totalMonths">): string {
  return AI_SLOT_IDS.map((slot) => getAiModelForTotalMonths(state.totalMonths, slot).id).join("|");
}

function getAttributeFillPercent(value: number, cap: number): number {
  if (cap <= 0) return 0;
  const percent = ((value + (value > 0 ? 1 : 0)) / (cap + 1)) * 100;
  return Math.max(0, Math.min(100, percent));
}

function isRoleId(value: string | undefined): value is RoleId {
  return value !== undefined && ROLE_IDS.has(value);
}

function isPlayTabId(value: string | undefined): value is PlayTabId {
  return value !== undefined && PLAY_TAB_IDS.has(value);
}

function isChairUpgradeId(value: string | undefined): value is ShopUpgradeId {
  return value !== undefined && CHAIR_UPGRADE_ID_SET.has(value);
}


function isCoffeeUpgradeId(value: string | undefined): value is Exclude<CoffeeMachineUpgradeId, null> {
  return value !== undefined && COFFEE_UPGRADE_ID_SET.has(value);
}

function isRoleRailViewId(value: string | undefined): value is RoleRailViewId {
  return value !== undefined && ROLE_RAIL_VIEW_IDS.has(value);
}

function isShopTabId(value: string | undefined): value is ShopTabId {
  return value !== undefined && SHOP_TAB_IDS.has(value);
}

function isTalentPanelTabId(value: string | undefined): value is TalentPanelTabId {
  return value !== undefined && TALENT_PANEL_TAB_IDS.has(value);
}

function isDateDisplayMode(value: string | undefined): value is DateDisplayMode {
  return value !== undefined && DATE_DISPLAY_MODES.has(value);
}

function isGameActionId(value: string | undefined): value is GameActionId {
  return value !== undefined && GAME_ACTION_ID_SET.has(value);
}

function isDebugStatId(value: string | undefined): value is DebugStatId {
  return value !== undefined && DEBUG_STAT_ID_SET.has(value);
}

function isPaperActionType(value: string | undefined): value is PaperActionType {
  return value !== undefined && PAPER_ACTION_TYPE_SET.has(value);
}

function isPaperTarget(value: string | undefined): value is PaperTarget {
  return value !== undefined && PAPER_TARGET_SET.has(value);
}

function isJournalTarget(value: string | undefined): value is JournalTarget {
  return value !== undefined && JOURNAL_TARGET_SET.has(value);
}

function isPaperPromotionId(value: string | undefined): value is PaperPromotionId {
  return value !== undefined && PAPER_PROMOTION_SET.has(value);
}

function isDebugPaperAuthorship(value: string | undefined): value is "first" | "coauthor" {
  return value !== undefined && DEBUG_PAPER_AUTHORSHIP_SET.has(value);
}

function isDebugRelationshipType(value: string | undefined): value is DebugRelationshipType {
  return value !== undefined && DEBUG_RELATIONSHIP_TYPE_SET.has(value);
}

export function bootstrapApp(root: HTMLDivElement): void {
  const store = createStore();
  const replayLibrary = createReplayLibrary();
  store.setReplayArchiver(async capture => {
    await replayLibrary.save(captureReplayRecording(capture.replay, capture.state, { id: capture.id }));
  });
  const statisticsUploadEnabled = isRemoteWriteEnabled();
  const statistics = createStatisticsClient({ uploadEnabled: statisticsUploadEnabled, onChange: (rpc) => {
    if (rpc === "get_phd_simulator_v2_activity_stats") {
      visitStats.render(root);
      scheduleAllFixedStageScales();
    } else if (root.querySelector('[data-conference-stats-name], .journal-run-stats, [data-thesis-stats-degree]')) {
      render();
    }
  } });
  const visitStats = createVisitStats({ client: statistics, recordVisit: statisticsUploadEnabled });
  const statisticsOptions = { client: statistics, onChange: () => render() };
  const conferenceStats = createConferenceStats(statisticsOptions);
  const journalStats = createJournalStats(statisticsOptions);
  const thesisStats = createThesisStats(statisticsOptions);
  const achievementStats = createAchievementStats({ uploadEnabled: statisticsUploadEnabled,
    onChange: () => { if (store.getState().phase === "setup") render(); },
  });
  const roleLevelStats = createRoleLevelStats({ uploadEnabled: statisticsUploadEnabled,
    onChange: () => { if (isRoleLevelStatsOpen) render(); },
  });
  const community = createCommunityMessages({ writeEnabled: statisticsUploadEnabled, onChange: () => syncCommunityView() });
  function syncCommunityView(): void {
    renderCommunityMessages(root, community);
    createIcons({
      icons: { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Gamepad2, MessagesSquare, Reply, Send, Users, X },
      root,
    });
  }
  let queuedSetupPortraitWarmup = false;
  let fixedStageScaleFrame = 0;
  let activePlayTab: PlayTabId = "events";
  const playTabOrder: readonly PlayTabId[] = ["events", "workstation", "relationship", "shop", "research", "talent", "settings"];
  let playTabTransitionDirection: "from-left" | "from-right" | null = null;
  const shopTabOrder: readonly ShopTabId[] = ["ai", "coffee", "gear", "life", "rest"];
  let shopTabTransitionDirection: "from-left" | "from-right" | null = null;
  let helpPageByContext: Record<string, number> = {};
  let isHelpOpen = false;
  let activeRoleRailView: RoleRailViewId = "announcements";
  let announcementPageIndex = 0;
  let roleHistoryPageIndex = 0;
  let talentTreePageIndex = 0;
  const talentTreeSelectedNodeByPage: number[] = [0];
  let refreshTalentTree = false;
  let isFeedbackOpen = false;
  let isQuitConfirmationOpen = false;
  let isRoleLevelStatsOpen = false;
  let pendingTalentStart: { dataset: DOMStringMap; points: number; continuing: boolean } | null = null;
  let isRunSavePanelOpen = false;
  let activeShopTab: ShopTabId = "ai";
  let selectedChairUpgradeId: ShopUpgradeId | null = null;
  let selectedCoffeeUpgradeId: Exclude<CoffeeMachineUpgradeId, null> | null = null;
  let activeTalentTab: TalentPanelTabId = "character";
  const talentTabOrder: readonly TalentPanelTabId[] = ["character", "relation", "equip", "growth", "publication"];
  let talentTabTransitionDirection: "from-left" | "from-right" | null = null;
  type TabSliderOrigin = { left: number; top: number; width: number; height: number };
  const pendingTabSliderOrigins = new Map<string, TabSliderOrigin>();
  const tabSliderConfigs = [
    { key: "center", container: ".center-main-tabs", active: ".center-tab-btn.active" },
    { key: "shop", container: ".shop-panel > .shop-tab-btns", active: ".shop-tab-btn.active" },
    { key: "talent", container: ".talent-tab-switches", active: ".panel-switch-btn.active" },
  ] as const;

  const getTabSliderRect = (container: HTMLElement, active: HTMLElement): TabSliderOrigin | null => {
    if (container.offsetWidth <= 0 || container.offsetHeight <= 0) return null;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.width <= 0 || activeRect.height <= 0) return null;
    const scaleX = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
    const scaleY = container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
    return {
      left: (activeRect.left - containerRect.left - container.clientLeft) / scaleX,
      top: (activeRect.top - containerRect.top - container.clientTop) / scaleY,
      width: activeRect.width / scaleX,
      height: activeRect.height / scaleY,
    };
  };

  const rememberTabSliderOrigin = (key: string): void => {
    const config = tabSliderConfigs.find((item) => item.key === key);
    if (!config) return;
    const container = root.querySelector<HTMLElement>(config.container);
    const active = container?.querySelector<HTMLElement>(config.active);
    if (!container || !active) return;
    const origin = getTabSliderRect(container, active);
    if (origin) pendingTabSliderOrigins.set(key, origin);
  };

  const mountTabSliders = (): void => {
    for (const config of tabSliderConfigs) {
      const container = root.querySelector<HTMLElement>(config.container);
      const active = container?.querySelector<HTMLElement>(config.active);
      if (!container || !active) continue;
      const target = getTabSliderRect(container, active);
      if (!target) continue;
      const origin = pendingTabSliderOrigins.get(config.key);
      const slider = document.createElement("span");
      slider.className = `ui-tab-slider ui-tab-slider-${config.key}`;
      slider.setAttribute("aria-hidden", "true");
      slider.style.left = `${origin?.left ?? target.left}px`;
      slider.style.top = `${origin?.top ?? target.top}px`;
      slider.style.width = `${origin?.width ?? target.width}px`;
      slider.style.height = `${origin?.height ?? target.height}px`;
      container.append(slider);
      if (origin && (
        origin.left !== target.left
        || origin.top !== target.top
        || origin.width !== target.width
        || origin.height !== target.height
      ) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        slider.getBoundingClientRect();
        slider.addEventListener("transitionend", () => {
          slider.classList.remove("is-moving");
        }, { once: true });
        window.requestAnimationFrame(() => {
          slider.classList.add("is-moving");
          slider.style.left = `${target.left}px`;
          slider.style.top = `${target.top}px`;
          slider.style.width = `${target.width}px`;
          slider.style.height = `${target.height}px`;
        });
      }
      pendingTabSliderOrigins.delete(config.key);
    }
  };

  const syncMountedTabSliders = (): void => {
    for (const config of tabSliderConfigs) {
      const container = root.querySelector<HTMLElement>(config.container);
      const active = container?.querySelector<HTMLElement>(config.active);
      const slider = container?.querySelector<HTMLElement>(`.ui-tab-slider-${config.key}`);
      if (!container || !active || !slider) continue;
      if (slider.classList.contains("is-moving")) continue;
      const target = getTabSliderRect(container, active);
      if (!target) continue;
      slider.classList.remove("is-moving");
      slider.style.left = `${target.left}px`;
      slider.style.top = `${target.top}px`;
      slider.style.width = `${target.width}px`;
      slider.style.height = `${target.height}px`;
    }
  };

  const selectPlayTab = (nextPlayTab: PlayTabId): void => {
    isRunSavePanelOpen = false;
    if (nextPlayTab === activePlayTab) return;
    rememberTabSliderOrigin("center");
    playTabTransitionDirection = playTabOrder.indexOf(nextPlayTab) > playTabOrder.indexOf(activePlayTab)
      ? "from-right"
      : "from-left";
    activePlayTab = nextPlayTab;
  };
  let advisorSalaryStartIndex: number | null = null;
  let labInheritancePage = 0;
  let loverRewardPage = 0;
  let internshipPage = 0;
  let gameGrowthPage = 0;
  let advisorSalaryContext = "";
  let isEventContentOpen = false;
  let isEndingContentOpen = true;
  let activeEventId: string | null = null;
  let activeEventHistoryId: string | null = null;
  let activeEventChainId: string | null = null;
  let activeEventRootId: string | null = null;
  let activeEventHistoryIndex: number | null = null;
  let activeRewinderAct: RewinderAct = "attributes";
  let academicArchiveAct: AcademicArchiveAct = 0;
  let academicArchiveWasOpen = false;
  let rewinderStartYear: number | undefined;
  let activeLogPage: number | null = null;
  let timelineScrollLeft = 0;
  const syncTimelineLabels = (track: HTMLElement): void => {
    const bounds = track.getBoundingClientRect();
    const rightEdge = bounds.right - 74;
    for (const label of track.querySelectorAll<HTMLElement>(".event-timeline-marker-label")) {
      const box = label.getBoundingClientRect();
      label.classList.toggle("is-edge-clipped", box.left < bounds.left + 7 || box.right > rightEdge);
    }
  };
  let isSanChartOpen = false;
  let activePendingPage = 0;
  let activeRelationshipIndex = 0;
  let currentResearchPaperIndex: number | null = null;
  let researchPageIndex = 0;
  let researchSortMode: ResearchSortMode = "year";
  let researchAuthorshipFilter: ResearchAuthorshipFilter = "all";
  let timelineDrag: {
    track: HTMLElement;
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null = null;
  let suppressTimelineClick = false;
  let lastLogSignature = "";
  let lastPhase = store.getState().phase;
  let lastRenderedPlayer: PlayerStats | null = null;
  let lastRenderedSetupRoleId: RoleId | null = null;
  const animatePanelValues = createValueAnimations(root);
  let lastRenderedPaperSlotCount: number | null = null;
  let animateEventPanelAfterNextMonth = false;
  let skipNextPlayerAnimation = false;
  let seenAiModelSignature = getAiModelSignature(store.getState());
  let seenAdvancedCoffeeBonus = getCurrentCoffeeBonus(store.getState().coffeeState);
  let acknowledgedShopUpgradeKeys = new Set<string>();
  let lastShopNoticePhase = store.getState().phase;
  let lastShopNoticeTotalMonths = store.getState().totalMonths;

  const getShopUpgradeNotices = (state: GameState): ShopUpgradeNotice[] => {
    if (state.phase !== "playing") return [];
    const notices: ShopUpgradeNotice[] = [];
    const aiModelSignature = getAiModelSignature(state);
    if (state.totalMonths > 1 && aiModelSignature !== seenAiModelSignature) {
      notices.push({ key: `ai:${aiModelSignature}`, tab: "ai" });
    }
    const advancedCoffeeBonus = getCurrentCoffeeBonus(state.coffeeState);
    if (advancedCoffeeBonus > seenAdvancedCoffeeBonus) {
      notices.push({ key: `coffee:${advancedCoffeeBonus}`, tab: "coffee" });
    }
    return notices;
  };

  const resetShopUpgradeNotices = (state: GameState): void => {
    seenAiModelSignature = getAiModelSignature(state);
    seenAdvancedCoffeeBonus = getCurrentCoffeeBonus(state.coffeeState);
    acknowledgedShopUpgradeKeys = new Set<string>();
  };

  const syncShopUpgradeNotices = (state: GameState): void => {
    if (
      state.phase !== "playing"
      || lastShopNoticePhase !== "playing"
      || state.totalMonths < lastShopNoticeTotalMonths
    ) {
      resetShopUpgradeNotices(state);
    }
    lastShopNoticePhase = state.phase;
    lastShopNoticeTotalMonths = state.totalMonths;
  };

  const acknowledgeShopTabNotice = (state: GameState, tab: ShopUpgradeNoticeTab): void => {
    for (const notice of getShopUpgradeNotices(state)) {
      if (notice.tab === tab) acknowledgedShopUpgradeKeys.add(notice.key);
    }
    if (tab === "ai") {
      seenAiModelSignature = getAiModelSignature(state);
    } else {
      seenAdvancedCoffeeBonus = Math.max(seenAdvancedCoffeeBonus, getCurrentCoffeeBonus(state.coffeeState));
    }
  };

  const animatePlayerStatChanges = (previous: PlayerStats, current: PlayerStats): void => {
    if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animateValue = (statId: keyof PlayerStats): void => {
      const delta = getVisibleValueDelta(
        { value: previous[statId], visible: true },
        { value: current[statId], visible: true },
        statId !== "money",
      );
      const item = root.querySelector<HTMLElement>(`[data-player-stat="${statId}"]`);
      if (!item || item.getClientRects().length === 0 || delta === 0) return;

      const direction = delta > 0 ? "increase" : "decrease";
      const value = item.querySelector<HTMLElement>(statId === "money" ? ".new-currency-value" : ".new-attr-value");
      const floatingChange = document.createElement("span");
      floatingChange.className = `stat-floating-change is-${direction}`;
      const displayedDelta = statId === "money" ? String(delta) : formatAttributeDetail(delta);
      floatingChange.textContent = delta > 0 ? `+${displayedDelta}` : displayedDelta;
      value?.appendChild(floatingChange);
      value?.classList.add(`is-value-${direction}`);
      item.classList.add(`is-stat-${direction}`);

      if (statId !== "money") {
        const cap = Number(item.dataset.statCap ?? "0");
        const fill = item.querySelector<HTMLElement>(".progress-fill");
        if (fill && Number.isFinite(cap) && cap > 0) {
          const targetWidth = fill.style.width;
          fill.style.transition = "none";
          fill.style.width = `${getAttributeFillPercent(previous[statId], cap).toFixed(1)}%`;
          void fill.offsetWidth;
          fill.style.removeProperty("transition");
          fill.style.width = targetWidth;
          fill.classList.add(`is-stat-${direction}`);
        }

        const previousTier = getAttributeTier(previous[statId]);
        const currentTier = getAttributeTier(current[statId]);
        if (previousTier !== currentTier) {
          const tierLabel = item.querySelector<HTMLElement>(".new-attr-level");
          if (tierLabel) {
            const tierChange = document.createElement("span");
            const tierDirection = currentTier > previousTier ? "up" : "down";
            tierChange.className = `tier-floating-change is-${tierDirection}`;
            tierChange.textContent = `${tierDirection === "up" ? "升至" : "降至"}${tierLabel.textContent?.trim() ?? "新档位"}`;
            tierLabel.classList.add(`is-tier-${tierDirection}`);
            tierLabel.appendChild(tierChange);
          }
        }
      }

      window.setTimeout(() => {
        value?.classList.remove("is-value-increase", "is-value-decrease");
        item.classList.remove("is-stat-increase", "is-stat-decrease");
        item.querySelector<HTMLElement>(".progress-fill")?.classList.remove("is-stat-increase", "is-stat-decrease");
        item.querySelector<HTMLElement>(".new-attr-level")?.classList.remove("is-tier-up", "is-tier-down");
        floatingChange.remove();
        item.querySelector<HTMLElement>(".tier-floating-change")?.remove();
      }, 1000);
    };

    for (const statId of ANIMATED_ATTRIBUTE_IDS) {
      animateValue(statId);
    }
    animateValue("money");
  };

  const showNewPaperSlotUnlocks = (state: GameState): void => {
    const currentCount = getAvailablePaperSlotCount(state);
    const previousCount = lastRenderedPaperSlotCount;
    lastRenderedPaperSlotCount = currentCount;
    if (previousCount === null || currentCount <= previousCount || isPreEnrollmentState(state)) return;

    for (let slotIndex = previousCount; slotIndex < currentCount; slotIndex += 1) {
      const card = root.querySelector<HTMLElement>(`[data-paper-slot-index="${slotIndex}"]`);
      if (!card) continue;
      card.classList.add("is-newly-unlocked");
      window.setTimeout(() => {
        card.classList.remove("is-newly-unlocked");
      }, 1800);
    }
  };

  const syncFixedStageScale = (
    shellSelector: string,
    stageSelector: string,
    scaleVarName: string,
    contentHeightVarName: string,
    stageWidth: number,
  ): void => {
    const shell = root.querySelector<HTMLElement>(shellSelector);
    const stage = root.querySelector<HTMLElement>(stageSelector);
    if (!shell || !stage) {
      root.style.removeProperty(scaleVarName);
      root.style.removeProperty(contentHeightVarName);
      return;
    }

    const shellWidth = shell.clientWidth;
    if (!shellWidth) {
      return;
    }

    if (window.getComputedStyle(stage).position !== "absolute") {
      root.style.setProperty(scaleVarName, "1");
      root.style.setProperty(contentHeightVarName, `${stage.scrollHeight}px`);
      return;
    }

    const scale = Math.min(1, shellWidth / stageWidth);
    root.style.setProperty(scaleVarName, scale.toFixed(4));
    root.style.setProperty(contentHeightVarName, `${stage.scrollHeight}px`);
  };

  const eventLayout = createEventLayout(root);
  const relationshipTooltips = createRelationshipTooltips(root);
  const responsiveScoreCharts = createResponsiveScoreCharts(root);
  bindLobbyPortrait(root);
  const syncAllFixedStageScales = (): void => {
    eventLayout.sync();
    relationshipTooltips.sync();
    responsiveScoreCharts.sync();
    syncFixedStageScale(
      '.lobby-page[data-scale-mode="fixed"] .lobby-stage-shell',
      '.lobby-page[data-scale-mode="fixed"] .lobby-stage',
      "--setup-stage-scale",
      "--setup-stage-content-height",
      SETUP_STAGE_WIDTH,
    );
    syncFixedStageScale(
      '.play-page[data-scale-mode="fixed"] .play-stage-shell',
      '.play-page[data-scale-mode="fixed"] .play-stage',
      "--play-stage-scale",
      "--play-stage-content-height",
      PLAY_STAGE_WIDTH,
    );
  };

  const scheduleAllFixedStageScales = (): void => {
    if (fixedStageScaleFrame) {
      window.cancelAnimationFrame(fixedStageScaleFrame);
    }

    fixedStageScaleFrame = window.requestAnimationFrame(() => {
      fixedStageScaleFrame = 0;
      syncAllFixedStageScales();
      syncMountedTabSliders();
      refreshCommunityContentOverflow(root);
    });
  };

  const resizeObserver = new ResizeObserver(() => {
    scheduleAllFixedStageScales();
  });
  resizeObserver.observe(root);
  window.addEventListener("resize", scheduleAllFixedStageScales);
  window.visualViewport?.addEventListener("resize", scheduleAllFixedStageScales);

  const resetEffectSourceUi = (): void => {
    root.querySelectorAll<HTMLElement>(".new-effect-list .effect-chip.is-selected").forEach((chip) => {
      chip.classList.remove("is-selected");
      chip.setAttribute("aria-pressed", "false");
    });

    const sourceBox = root.querySelector<HTMLElement>("#new-effect-source-box");
    if (!sourceBox) return;
    sourceBox.replaceChildren();
  };

  const showEffectSource = (chip: HTMLButtonElement): void => {
    const sourceBox = root.querySelector<HTMLElement>("#new-effect-source-box");
    if (!sourceBox) return;

    const rawSources = chip.dataset.effectSources?.trim() ?? "[]";
    let sources: string[] = [];
    try {
      const parsed = JSON.parse(rawSources);
      if (Array.isArray(parsed)) {
        sources = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      sources = [];
    }
    root.querySelectorAll<HTMLElement>(".new-effect-list .effect-chip").forEach((node) => {
      const isActive = node === chip;
      node.classList.toggle("is-selected", isActive);
      node.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    const textNode = document.createElement("div");
    textNode.className = "effect-source-text";
    for (const source of sources) {
      const lineNode = document.createElement("div");
      lineNode.className = "effect-source-line";
      if (source.startsWith("收入：")) {
        lineNode.classList.add("is-income");
      } else if (source.startsWith("支出：")) {
        lineNode.classList.add("is-expense");
      } else if (source.startsWith("净变化：")) {
        lineNode.classList.add("is-summary");
      }
      lineNode.textContent = source;
      textNode.appendChild(lineNode);
    }
    sourceBox.replaceChildren(textNode);
  };

  const resetEventContentUiState = (): void => {
    eventLayout.reset();
    activeRewinderAct = "attributes";
    isEventContentOpen = false;
    activeEventId = null;
    activeEventHistoryId = null;
    activeEventChainId = null;
    activeEventRootId = null;
    activeEventHistoryIndex = null;
  };

  const getActiveQueueEvent = (state: GameState): GameState["eventQueue"][number] | null => {
    if (!activeEventId) {
      return null;
    }

    return getCurrentEvent(state.eventQueue, activeEventId);
  };

  const getActiveChainEvent = (state: GameState): GameState["eventQueue"][number] | null => {
    if (!activeEventChainId || !activeEventRootId) {
      return null;
    }

    return getSortedEventQueue(state.eventQueue).find((event) =>
      event.chainId === activeEventChainId && getEventRootId(event) === activeEventRootId) ?? null;
  };

  const getActiveHistoryEvent = (state: GameState): GameState["eventHistory"][number] | null => {
    if (!activeEventHistoryId) {
      return null;
    }

    return state.eventHistory.find((event) => event.id === activeEventHistoryId) ?? null;
  };

  const openEventContent = (eventId: string): void => {
    const state = store.getState();
    if (state.phase === "setup") {
      return;
    }

    const nextEvent = getCurrentEvent(state.eventQueue, eventId);
    if (!nextEvent) {
      return;
    }

    selectPlayTab("events");
    isEventContentOpen = true;
    if (state.phase === "finished") activeLogPage = state.totalMonths;
    eventLayout.reset();
    activeEventId = nextEvent.id;
    activeRewinderAct = "attributes";
    activeEventHistoryId = null;
    activeEventChainId = nextEvent.chainId;
    activeEventRootId = getEventRootId(nextEvent);
    activeEventHistoryIndex = null;
    const introChoice = getBranchEventIntroChoice(state, nextEvent);
    if (introChoice) store.dispatch("resolve-event", { eventId: nextEvent.id, eventChoiceId: introChoice.id });
    render();
    scrollToEventContent();
  };

  const scrollToEventContent = (): void => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    requestAnimationFrame(() => {
      const content = root.querySelector<HTMLElement>("#event-content-box:not([hidden])");
      if (!content) return;
      const tabs = root.querySelector<HTMLElement>(".center-main-tabs");
      const offset = (tabs?.getBoundingClientRect().height ?? 0) + 12;
      const top = content.getBoundingClientRect().top;
      // Keep the event heading visible below the sticky operation bar.
      if (top < offset || top > offset + 24) window.scrollBy({ top: top - offset,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
  };

  const openEventHistoryContent = (eventHistoryId: string): void => {
    const state = store.getState();
    const historyEvent = state.eventHistory.find((event) => event.id === eventHistoryId);
    if (state.phase === "setup" || !historyEvent || historyEvent.stages.some((stage) => stage.talentTrigger)) {
      return;
    }

    selectPlayTab("events");
    isEventContentOpen = true;
    if (state.phase === "finished") activeLogPage = historyEvent.completedAtTotalMonths;
    eventLayout.reset();
    activeEventId = null;
    activeEventHistoryId = historyEvent.id;
    activeRewinderAct = "attributes";
    activeEventChainId = null;
    activeEventRootId = null;
    activeEventHistoryIndex = null;
    render();
    scrollToEventContent();
  };

  const closeEventContent = (): void => {
    resetEventContentUiState();
    render();
  };

  const syncEventContentUiState = (): void => {
    const state = store.getState();
    if (state.phase === "setup") {
      resetEventContentUiState();
      return;
    }

    if (!isEventContentOpen) {
      if (activeEventId && !state.eventQueue.some((event) => event.id === activeEventId)) {
        activeEventId = null;
      }
      if (activeEventChainId && !state.eventQueue.some((event) => event.chainId === activeEventChainId)) {
        activeEventChainId = null;
      }
      if (activeEventHistoryId && !state.eventHistory.some((event) => event.id === activeEventHistoryId)) {
        activeEventHistoryId = null;
      }
      return;
    }

    const activeQueueEvent = getActiveQueueEvent(state);
    if (activeQueueEvent) {
      activeEventChainId = activeQueueEvent.chainId;
      activeEventRootId = getEventRootId(activeQueueEvent);
      if (
        activeEventHistoryIndex !== null
        && (activeEventHistoryIndex < 0 || activeEventHistoryIndex >= (activeQueueEvent.history?.length ?? 0))
      ) {
        activeEventHistoryIndex = null;
      }
      return;
    }

    const nextChainEvent = getActiveChainEvent(state);
    if (nextChainEvent) {
      activeEventId = nextChainEvent.id;
      activeEventRootId = getEventRootId(nextChainEvent);
      activeEventHistoryIndex = null;
      return;
    }

    const activeHistoryEvent = getActiveHistoryEvent(state);
    if (activeHistoryEvent) {
      const lastSceneIndex = Math.max(0, activeHistoryEvent.stages.length - 1);
      if (
        activeEventHistoryIndex !== null
        && (activeEventHistoryIndex < 0 || activeEventHistoryIndex > lastSceneIndex)
      ) {
        activeEventHistoryIndex = null;
      }
      return;
    }

    if (activeEventChainId) {
      const completedEvent = [...state.eventHistory].reverse().find((event) => event.chainId === activeEventChainId);
      if (completedEvent) {
        resetEventContentUiState();
        return;
      }
    }

    resetEventContentUiState();
  };

  const syncLogUiState = (): void => {
    const state = store.getState();
    const nextLogSignature = `${state.totalMonths}:${state.log.length}:${state.log[0]?.id ?? ""}:${state.log[state.log.length - 1]?.id ?? ""}`;
    if (nextLogSignature !== lastLogSignature) {
      activeLogPage = null;
      lastLogSignature = nextLogSignature;
    }
  };

  const syncResearchUiState = (): void => {
    const state = store.getState();
    if (state.phase === "setup") {
      currentResearchPaperIndex = null;
      researchPageIndex = 0;
      return;
    }

    const publishedPaperCount = [...state.papers, ...state.externalPublications]
      .filter((paper) => paper.status === "published")
      .filter((paper) => researchAuthorshipFilter === "all"
        || (researchAuthorshipFilter === "first" ? paper.nonFirstAuthor !== true : paper.nonFirstAuthor === true))
      .length;
    if (publishedPaperCount === 0) {
      currentResearchPaperIndex = null;
      researchPageIndex = 0;
      return;
    }

    if (currentResearchPaperIndex !== null) {
      currentResearchPaperIndex = Math.min(Math.max(currentResearchPaperIndex, 0), publishedPaperCount - 1);
    }
    researchPageIndex = Math.min(researchPageIndex, Math.ceil(publishedPaperCount / RESEARCH_PAGE_SIZE) - 1);
  };

  const syncRelationshipUiState = (): void => {
    const state = store.getState();
    if (state.phase === "setup") {
      activeRelationshipIndex = 0;
      return;
    }

    activeRelationshipIndex = Math.min(Math.max(activeRelationshipIndex, 0), 4);
  };

  const renderRelationCardPage = (cardId: "advisor" | "lab-mutual-growth" | "lover" | "internship" | "game-growth", button: HTMLButtonElement): void => {
    const card = button.closest<HTMLElement>(`[data-talent-item-id="${cardId}"]`);
    if (!card) return;
    const buttons = [...card.querySelectorAll<HTMLButtonElement>(".research-pagination button")];
    const focusedIndex = document.activeElement === button ? buttons.indexOf(button) : -1;
    const template = document.createElement("template");
    template.innerHTML = renderRelationTalentCard(store.getState(), cardId, {
      advisorSalaryStartIndex,
      labInheritancePage,
      loverRewardPage,
      internshipPage,
      gameGrowthPage,
    });
    const updatedCard = template.content.firstElementChild;
    if (!updatedCard) return;
    card.replaceChildren(...updatedCard.childNodes);
    createIcons({ icons: { ChevronLeft, ChevronRight }, root: card });
    if (focusedIndex >= 0) {
      const updatedButtons = [...card.querySelectorAll<HTMLButtonElement>(".research-pagination button")];
      const focusTarget = updatedButtons[focusedIndex]?.disabled
        ? updatedButtons.find((entry) => !entry.disabled)
        : updatedButtons[focusedIndex];
      focusTarget?.focus({ preventScroll: true });
    }
  };

  const render = (): void => {
    const state = store.getState();
    const previousRenderedPlayer = lastRenderedPlayer;
    const salaryContext = `${state.phase}:${state.selectedAdvisorName}:${state.advisorProgressState.awards.map((award) => award.id).join(",")}`;
    if (salaryContext !== advisorSalaryContext) {
      advisorSalaryStartIndex = null;
      advisorSalaryContext = salaryContext;
    }
    const shouldAnimatePlayer = !skipNextPlayerAnimation && lastPhase === "playing" && state.phase === "playing";
    skipNextPlayerAnimation = false;
    if (state.phase !== lastPhase) {
      isQuitConfirmationOpen = false;
      isRoleLevelStatsOpen = false;
      pendingTalentStart = null;
      isRunSavePanelOpen = false;
      isEndingContentOpen = true;
      labInheritancePage = 0;
      loverRewardPage = 0;
      internshipPage = 0;
      gameGrowthPage = 0;
      helpPageByContext = {};
      isHelpOpen = false;
      if (state.phase === "playing") {
        activeRoleRailView = "announcements";
        isFeedbackOpen = false;
        activePlayTab = "events";
        activeShopTab = "ai";
        selectedChairUpgradeId = null;
        selectedCoffeeUpgradeId = null;
        activeTalentTab = "character";
        resetEventContentUiState();
        activeLogPage = null;
        isSanChartOpen = false;
        activePendingPage = 0;
        activeRelationshipIndex = 0;
        currentResearchPaperIndex = null;
        researchPageIndex = 0;
        researchSortMode = "year";
        researchAuthorshipFilter = "all";
      } else if (state.phase === "finished") {
        activePlayTab = "events";
        resetEventContentUiState();
        activeLogPage = null;
        isSanChartOpen = false;
      } else if (state.phase === "setup") {
        activeRoleRailView = "announcements";
        announcementPageIndex = 0;
        talentTreePageIndex = 0;
        talentTreeSelectedNodeByPage.length = 1;
        talentTreeSelectedNodeByPage[0] = 0;
        isFeedbackOpen = false;
        activePlayTab = "events";
        activeShopTab = "ai";
        selectedChairUpgradeId = null;
        selectedCoffeeUpgradeId = null;
        activeTalentTab = "character";
        resetEventContentUiState();
        activeLogPage = null;
        activePendingPage = 0;
        activeRelationshipIndex = 0;
        currentResearchPaperIndex = null;
        researchPageIndex = 0;
        researchSortMode = "year";
        researchAuthorshipFilter = "all";
      }
      lastPhase = state.phase;
    }

    syncEventContentUiState();
    syncLogUiState();
    syncResearchUiState();
    syncRelationshipUiState();
    syncShopUpgradeNotices(state);
    const shopUpgradeNotices = getShopUpgradeNotices(state);
    const lobby = store.getLobbyState();
    const academicArchiveOpen = isAcademicArchivePending(state);
    if (academicArchiveOpen && !academicArchiveWasOpen) academicArchiveAct = 0;
    academicArchiveWasOpen = academicArchiveOpen;
    if (isHelpOpen && state.phase === "playing") {
      const context = getPlayHelpContext({ activePlayTab, activeShopTab, activeTalentTab });
      const index = getPlayHelpPageIndex(context, helpPageByContext[context.key]);
      store.recordHelpPageRead(`${context.key}:${index}`, getAllPlayHelpPageIds());
    }
    const previousTalentTree = !refreshTalentTree && state.phase === "setup" && lobby.selectedLobbyRoleId === lastRenderedSetupRoleId
      ? root.querySelector<HTMLElement>(".lobby-talent-tree")
      : null;
    const previousTimelineTrack = root.querySelector<HTMLElement>(".event-timeline-track");
    const previousArchiveBody = root.querySelector<HTMLElement>(".academic-archive-body");
    const previousArchiveAct = previousArchiveBody?.dataset.academicActPage;
    const previousArchiveScroll = previousArchiveBody?.scrollTop ?? 0;
    const previousArchiveButton = document.activeElement instanceof HTMLButtonElement
      && document.activeElement.closest(".academic-archive-overlay") ? { ...document.activeElement.dataset } : undefined;
    if (state.phase === "setup") {
      timelineScrollLeft = 0;
    } else if (previousTimelineTrack && previousTimelineTrack.clientWidth > 0) {
      timelineScrollLeft = previousTimelineTrack.scrollLeft;
    }
    root.dataset.phase = state.phase;
    root.innerHTML = renderApp(state, lobby, {
      activePlayTab,
      runSaves: store.getRunSaves(),
      saveStatus: store.getSaveStatus(),
      isRunSavePanelOpen,
      hasRoleSave: store.hasRoleSave(lobby.selectedLobbyRoleId),
      isSaveLoading: !store.isReady(),
      roleExperienceAward: store.getEndingExperienceAward(),
      helpPageByContext,
      isHelpOpen,
      activeRoleRailView,
      announcementPageIndex,
      roleHistoryPageIndex,
      rewinderStartYear: state.phase === "setup" && lobby.selectedLobbyRoleId === "rewinder" && store.hasRoleSave("rewinder")
        ? store.getRunSaves("rewinder").find(save => save.kind === "latest")?.year ?? rewinderStartYear : rewinderStartYear,
      talentTreePageIndex,
      talentTreeSelectedNodeByPage,
      talentAllocation: store.getLobbyState().talentAllocation,
      isFeedbackOpen,
      isQuitConfirmationOpen,
      isEventContentOpen,
      isEndingContentOpen,
      activeEventId,
      activeEventHistoryId,
      activeEventHistoryIndex,
      activeRewinderAct,
      academicArchiveAct,
      activeLogPage,
      isSanChartOpen,
      activePendingPage,
      activeRelationshipIndex,
      activeShopTab,
      showShopUpgradeNotice: shopUpgradeNotices.some((notice) => !acknowledgedShopUpgradeKeys.has(notice.key)),
      shopUpgradeNoticeTabs: [...new Set(shopUpgradeNotices.map((notice) => notice.tab))],
      selectedChairUpgradeId,
      selectedCoffeeUpgradeId,
      activeTalentTab,
      currentResearchPaperIndex,
      researchPageIndex,
      advisorSalaryStartIndex,
      labInheritancePage,
      loverRewardPage,
      internshipPage,
      gameGrowthPage,
      researchSortMode,
      researchAuthorshipFilter,
    });
    if (store.isReplaySavePending() || store.getSaveStatus().startsWith("本地回放保存失败")) {
      const notice = document.createElement("p");
      notice.className = "local-replay-save-notice";
      notice.setAttribute("role", "status");
      notice.textContent = store.getSaveStatus();
      root.append(notice);
    }
    if (pendingTalentStart && state.phase === "setup") {
      root.querySelector<HTMLElement>(".lobby-page")?.setAttribute("inert", "");
      root.insertAdjacentHTML("beforeend", renderStartTalentReminder(pendingTalentStart.points, pendingTalentStart.continuing));
    }
    if (isRoleLevelStatsOpen && state.phase === "setup") {
      root.querySelector<HTMLElement>(".lobby-page")?.setAttribute("inert", "");
      root.insertAdjacentHTML("beforeend", renderRoleLevelStatsOverlay(lobby, roleLevelStats.read(lobby.selectedLobbyRoleId)));
    }
    if (previousTalentTree) {
      // Keep the preview stable when a different part of the setup screen rerenders.
      previousTalentTree.querySelector(".lobby-talent-tree-page.is-entering")?.classList.remove("is-entering");
      root.querySelector(".lobby-talent-tree")?.replaceWith(previousTalentTree);
    }
    if (academicArchiveOpen) {
      const archiveBody = root.querySelector<HTMLElement>(".academic-archive-body");
      const sameAct = previousArchiveAct === archiveBody?.dataset.academicActPage;
      if (sameAct && archiveBody) archiveBody.scrollTop = previousArchiveScroll;
      const restoreFocus = sameAct && previousArchiveButton?.action
        ? [...root.querySelectorAll<HTMLButtonElement>(".academic-archive-overlay button[data-action]")].find(button =>
          button.dataset.action === previousArchiveButton.action
          && button.dataset.rewinderPersonKey === previousArchiveButton.rewinderPersonKey
          && button.dataset.rewinderPaperSource === previousArchiveButton.rewinderPaperSource
          && button.dataset.rewinderCoffeeSource === previousArchiveButton.rewinderCoffeeSource)
        : undefined;
      (restoreFocus ?? root.querySelector<HTMLElement>("#academic-archive-title"))?.focus({ preventScroll: true });
    }
    refreshTalentTree = false;
    lastRenderedSetupRoleId = state.phase === "setup" ? lobby.selectedLobbyRoleId : null;
    mountTabSliders();
    if (playTabTransitionDirection) {
      root.querySelector<HTMLElement>(`[data-tab-panel="${activePlayTab}"]`)?.classList.add(`is-tab-entering-${playTabTransitionDirection}`);
      playTabTransitionDirection = null;
    }
    if (shopTabTransitionDirection) {
      root.querySelector<HTMLElement>(".shop-items-list")?.classList.add(`is-tab-entering-${shopTabTransitionDirection}`);
      shopTabTransitionDirection = null;
    }
    if (talentTabTransitionDirection) {
      root.querySelector<HTMLElement>(".talent-items-list")?.classList.add(`is-tab-entering-${talentTabTransitionDirection}`);
      talentTabTransitionDirection = null;
    }
    visitStats.render(root);
    renderCommunityMessages(root, community);
    bindAnnouncementCollapse(root);
    if (state.phase === "finished") {
      for (const button of root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
        if (["settle-and-return", "reset-game", "set-date-display-mode"].includes(button.dataset.action ?? "")) continue;
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }
    }
    if (animateEventPanelAfterNextMonth) {
      animateEventPanelAfterNextMonth = false;
      if (state.phase === "playing" && activePlayTab === "events") {
        const eventPanel = root.querySelector<HTMLElement>('[data-tab-panel="events"] .event-panel');
        eventPanel?.classList.add("is-month-entering");
      }
    }
    createIcons({
      icons: {
        Activity,
        ArrowRight,
        Award,
        Backpack,
        BadgeCheck,
        BadgeDollarSign,
        Bell,
        BookOpen,
        Brain,
        Briefcase,
        BriefcaseBusiness,
        CalendarDays,
        ChartNoAxesCombined,
        ChartNoAxesColumn,
        Check,
        ChevronDown,
        ChevronRight,
        ChevronLeft,
        ChevronUp,
        CircleHelp,
        CircleDollarSign,
        Clock3,
        Coffee,
        Coins,
        Cpu,
        Crown,
        Database,
        Download,
        Dumbbell,
        Eye,
        Feather,
        FastForward,
        Files,
        FileHeart,
        FileCheck2,
        FileText,
        FilePlus2,
        Flame,
        FlaskConical,
        Footprints,
        Gamepad2,
        Gem,
        Gift,
        GitFork,
        GraduationCap,
        HandCoins,
        HandHelping,
        Handshake,
        Heart,
        HeartCrack,
        HeartHandshake,
        HeartPlus,
        HeartPulse,
        History,
        House,
        Hourglass,
        Infinity,
        Laptop,
        Lightbulb,
        Lock,
        LogOut,
        Medal,
        MessageCircle,
        MessageSquare,
        MessagesSquare,
        Microscope,
        Microchip,
        Monitor,
        MoveUpRight,
        Network,
        NotebookPen,
        Presentation,
        PiggyBank,
        Pause,
        Play,
        RefreshCw,
        Reply,
        RotateCcw,
        Rocket,
        Send,
        Settings,
        Shield,
        ShieldPlus,
        Skull,
        Smile,
        Sparkles,
        Sprout,
        Star,
        Store,
        Sun,
        Sunrise,
        Target,
        Trophy,
        TrendingUp,
        Users,
        UsersRound,
        ShoppingCart,
        UserRound,
        UserRoundPlus,
        Wallet,
        Utensils,
        Wrench,
        X,
        Zap,
      },
      root,
    });
    if (state.phase !== "setup") {
      const timelineTrack = root.querySelector<HTMLElement>(".event-timeline-track");
      const currentMarker = timelineTrack?.querySelector<HTMLElement>(".event-timeline-marker.is-current");
      if (timelineTrack && timelineTrack.clientWidth > 0) {
        if (activeLogPage === null && currentMarker) {
          const centeredScrollLeft = currentMarker.offsetLeft - (timelineTrack.clientWidth - currentMarker.offsetWidth) / 2;
          timelineScrollLeft = Math.max(0, Math.min(centeredScrollLeft, timelineTrack.scrollWidth - timelineTrack.clientWidth));
          activeLogPage = Number(currentMarker.dataset.uiLogPageIndex ?? "0");
        }
        timelineTrack.scrollLeft = timelineScrollLeft;
        timelineScrollLeft = timelineTrack.scrollLeft;
        syncTimelineLabels(timelineTrack);
      }
    }
    showNewPaperSlotUnlocks(state);
    resetEffectSourceUi();
    eventLayout.update(isEventContentOpen ? renderEventLayoutSamples(getActiveQueueEvent(state), getActiveHistoryEvent(state), state) : []);
    scheduleAllFixedStageScales();
    animatePanelValues(shouldAnimatePlayer);
    if (shouldAnimatePlayer && previousRenderedPlayer) {
      animatePlayerStatChanges(previousRenderedPlayer, state.player);
    }
    lastRenderedPlayer = { ...state.player };

    if (isQuitConfirmationOpen) {
      root.querySelector<HTMLButtonElement>("[data-quit-initial-focus]")?.focus({ preventScroll: true });
    }
    if (pendingTalentStart) {
      root.querySelector<HTMLButtonElement>("[data-talent-reminder-initial-focus]")?.focus({ preventScroll: true });
    }

    if (!queuedSetupPortraitWarmup && state.phase === "setup") {
      queuedSetupPortraitWarmup = true;
      window.setTimeout(() => {
        warmRoleDetailPortraits(ROLE_IDS_IN_DISPLAY_ORDER);
      }, 0);
    }
  };

  function executeButtonAction(dataset: DOMStringMap, skipTalentReminder = false): void {
    const actionId = dataset.action;
    if (!isGameActionId(actionId)) return;
    if (actionId === "settle-and-return") {
      skipNextPlayerAnimation = true;
      void store.settleAndReturn(dataset.saveReplay === "true");
      return;
    }
    if (actionId === "confirm-rewinder-archive") {
      rewinderStartYear = undefined;
      refreshTalentTree = true;
      skipNextPlayerAnimation = true;
      void store.confirmAcademicYearArchive(dataset.saveReplay === "true");
      return;
    }
    if (actionId === "start-game" && !skipTalentReminder && store.getState().phase === "setup") {
      const roleId = isRoleId(dataset.roleId) ? dataset.roleId : store.getLobbyState().selectedLobbyRoleId;
      const continuing = store.hasRoleSave(roleId);
      const points = getStartTalentReminderPoints(store.getLobbyState(), roleId, continuing, store.getRoleSaveTalentState(roleId));
      if (points !== null) {
        pendingTalentStart = { dataset: { ...dataset }, points, continuing };
        render();
        return;
      }
    }
    if (actionId === "quit-game") {
      if (store.getState().phase !== "playing" || store.getState().totalMonths <= 0) return;
      isQuitConfirmationOpen = true;
      render();
      return;
    }

    if (actionId === "next-month" || actionId === "force-next-month") {
      animateEventPanelAfterNextMonth = activePlayTab === "events";
    }
    if (actionId === "debug-replay-event" || actionId === "replay-event" || actionId === "rewinder-replay-event") {
      selectPlayTab("events");
      isEventContentOpen = true;
      activeEventHistoryId = null;
      activeEventHistoryIndex = null;
      const replaySourceEvent = dataset.eventId
        ? store.getState().eventQueue.find((event) => event.id === dataset.eventId)
        : undefined;
      activeEventId = null;
      activeEventChainId = replaySourceEvent?.chainId ?? null;
      activeEventRootId = replaySourceEvent ? getEventRootId(replaySourceEvent) : null;
    }
    if (actionId === "upgrade-shop-item" && dataset.shopUpgradeId?.startsWith("chair-")) {
      selectedChairUpgradeId = null;
    }
    if (actionId === "upgrade-coffee-machine") {
      selectedCoffeeUpgradeId = null;
    }
    if (actionId === "sell-shop-item" && dataset.shopItemId === "chair") {
      selectedChairUpgradeId = null;
    }
    if (actionId === "sell-coffee-machine") {
      selectedCoffeeUpgradeId = null;
    }

    if (actionId === "start-game") {
      isRunSavePanelOpen = false;
      conferenceStats.resetRun();
      journalStats.resetRun();
      thesisStats.resetRun();
    }
    if (actionId.startsWith("debug-") || actionId === "force-next-month") { conferenceStats.markDebug(); journalStats.markDebug(); thesisStats.markDebug(); }
    if (actionId === "debug-trigger-ending") {
      isEndingContentOpen = true;
      activePlayTab = "events";
      activeLogPage = null;
      resetEventContentUiState();

    }
    store.dispatch(actionId, {
      curseDifficulty: actionId === "start-game" ? getSelectedCurseDifficulty(store.getLobbyState(), isRoleId(dataset.roleId) ? dataset.roleId : store.getState().selectedRoleId) : undefined,
      debtRepayment: typeof dataset.delta === "string" ? Number(dataset.delta) : undefined,
      roleId: isRoleId(dataset.roleId) ? dataset.roleId : undefined,
      paperId: typeof dataset.paperId === "string" ? dataset.paperId : undefined,
      paperSlotIndex: typeof dataset.paperSlotIndex === "string" ? Number(dataset.paperSlotIndex) : undefined,
      thesisPointIndex: typeof dataset.thesisPointIndex === "string" ? Number(dataset.thesisPointIndex) : undefined,
      careerType: dataset.careerType === "internet" || dataset.careerType === "stateOwned"
        || dataset.careerType === "civilService" || dataset.careerType === "academic" ? dataset.careerType : undefined,
      paperActionType: isPaperActionType(dataset.paperActionType) ? dataset.paperActionType : undefined,
      paperTarget: isPaperTarget(dataset.paperTarget) ? dataset.paperTarget : undefined,
      journalTarget: isJournalTarget(dataset.journalTarget) ? dataset.journalTarget : undefined,
      promotionId: isPaperPromotionId(dataset.promotionId) ? dataset.promotionId : undefined,
      eventId: typeof dataset.eventId === "string" ? dataset.eventId : undefined,
      eventChoiceId: typeof dataset.eventChoiceId === "string" ? dataset.eventChoiceId : undefined,
      eventHistoryIndex: typeof dataset.eventHistoryIndex === "string" ? Number(dataset.eventHistoryIndex) : undefined,
      relationshipId: typeof dataset.relationshipId === "string" ? dataset.relationshipId : undefined,
      rewinderPersonKey: typeof dataset.rewinderPersonKey === "string" ? dataset.rewinderPersonKey : undefined,
      rewinderStartYear: actionId === "start-game" && typeof dataset.rewinderStartYear === "string" ? Number(dataset.rewinderStartYear) : undefined,
      rewinderPaperSource: dataset.rewinderPaperSource === "current" || dataset.rewinderPaperSource === "previous" ? dataset.rewinderPaperSource : undefined,
      rewinderCoffeeSource: dataset.rewinderCoffeeSource === "current" || dataset.rewinderCoffeeSource === "previous" ? dataset.rewinderCoffeeSource : undefined,
      projectType: dataset.projectType === "horizontal" || dataset.projectType === "vertical" ? dataset.projectType : undefined,
      debugStatId: isDebugStatId(dataset.debugStatId) ? dataset.debugStatId : undefined,
      debugPaperTarget: isPaperTarget(dataset.debugPaperTarget) ? dataset.debugPaperTarget : undefined,
      debugJournalTarget: isJournalTarget(dataset.debugJournalTarget) ? dataset.debugJournalTarget : undefined,
      debugPaperAuthorship: isDebugPaperAuthorship(dataset.debugPaperAuthorship) ? dataset.debugPaperAuthorship : undefined,
      debugRelationshipType: isDebugRelationshipType(dataset.debugRelationshipType) ? dataset.debugRelationshipType : undefined,
      debugEventReplayEnabled: dataset.debugEventReplayEnabled === undefined ? undefined : dataset.debugEventReplayEnabled === "true",
      delta: typeof dataset.delta === "string" ? Number(dataset.delta) : undefined,
      dateDisplayMode: isDateDisplayMode(dataset.dateDisplayMode) ? dataset.dateDisplayMode : undefined,
      blockLinearEvents: dataset.blockLinearEvents === undefined ? undefined : dataset.blockLinearEvents === "true",
      skipBranchEventIntro: dataset.skipBranchEventIntro === undefined ? undefined : dataset.skipBranchEventIntro === "true",
      shopItemId: typeof dataset.shopItemId === "string" ? dataset.shopItemId as ShopItemId : undefined,
      shopUpgradeId: typeof dataset.shopUpgradeId === "string"
        ? dataset.shopUpgradeId as ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null>
        : undefined,
      aiSlotId: typeof dataset.aiSlotId === "string" ? dataset.aiSlotId as AiSlotId : undefined,
      supportItemId: typeof dataset.supportItemId === "string" ? dataset.supportItemId as SupportItemId : undefined,
    });
    if (actionId === "debug-trigger-event" && dataset.eventId === "rewinder-year") {
      const event = store.getState().eventQueue.find(item => item.rewinderPresentation);
      if (event) openEventContent(event.id);
    }
    if (actionId === "resolve-event" && dataset.eventChoiceId === "before-grad-school-finish") {
      const afterEnrollmentConfirmation = store.getState();
      if (afterEnrollmentConfirmation.phase === "playing" && isPreEnrollmentState(afterEnrollmentConfirmation)) {
        animateEventPanelAfterNextMonth = activePlayTab === "events";
        store.dispatch("next-month");
      }
    }
    if (actionId === "start-game") {
      const openingEvent = store.getState().eventQueue.find((event) => event.chainId === "before-grad-school");
      if (openingEvent) openEventContent(openingEvent.id);
    }
    if ((actionId === "set-linear-event-blocking" || actionId === "set-event-intro-skipping")
      && window.matchMedia("(hover: none)").matches) {
      requestAnimationFrame(() => {
        const toggle = root.querySelector<HTMLElement>(`[data-action="${actionId}"]`);
        if (toggle) relationshipTooltips.showActionHint(toggle);
      });
    }
  }

  const debugWindow = createDebugWindow(
    () => store.getState(),
    executeButtonAction,
  );

  const publishFinalizedRun = async (record: ReturnType<typeof store.getFinalizedOutbox>[number]): Promise<void> => {
    if (record.debugUsed || !statisticsUploadEnabled) { store.acknowledgeFinalizedRun(record.runId); return; }
    const achievementQueued = achievementStats.recordFinalizedRun(record);
    const finished = record.state;
    const runKey = JSON.stringify([finished.conferenceLocationSeed, finished.selectedRoleId]);
    for (const result of finished.pendingRunStatistics ?? []) {
      statistics.enqueue(result.kind, runKey, result.fingerprint, result.payload, record.runId);
    }
    await visitStats.trackGamePhase("finished", { runKey, roleId: finished.selectedRoleId,
      ending: finished.ending, totalMonths: finished.totalMonths, degree: finished.degree,
      finalized: true, finalizedRunId: record.runId, disqualifiedByDebug: false });
    if (statistics.persistPending() && achievementQueued && achievementStats.persistPending()) store.acknowledgeFinalizedRun(record.runId);
    void statistics.flush();
    void achievementStats.flush();
  };
  store.subscribeFinalized(record => {
    void roleLevelStats.syncAccount(store.getLobbyState());
    void publishFinalizedRun(record);
  });
  void store.ready().then(() => {
    for (const record of store.getFinalizedOutbox()) void publishFinalizedRun(record);
    void roleLevelStats.syncAccount(store.getLobbyState(), { missingOnly: true });
    render();
  });

  let previousConferenceState = store.getState();
  let previousRunDisqualified = store.isCurrentRunDisqualified();
  const knownUnlockedRoles = new Set(getRoleOptions().filter(role => store.getLobbyState().roleProgress[role.id].unlocked).map(role => role.id));
  store.subscribe((state) => {
    const account = store.getLobbyState();
    const newlyUnlocked = getRoleOptions().filter(role => account.roleProgress[role.id].unlocked && !knownUnlockedRoles.has(role.id));
    if (newlyUnlocked.length) {
      newlyUnlocked.forEach(role => knownUnlockedRoles.add(role.id));
      void roleLevelStats.syncAccount(account);
    }
    const before = previousConferenceState;
    previousConferenceState = state;
    const wasDisqualified = previousRunDisqualified;
    const debugUsed = store.isCurrentRunDisqualified();
    previousRunDisqualified = debugUsed;
    const runKey = JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]);
    if (state.phase !== "setup" && !debugUsed && (wasDisqualified || before.phase === "setup"
      || before.conferenceLocationSeed !== state.conferenceLocationSeed || before.selectedRoleId !== state.selectedRoleId)) {
      statistics.restoreRunQualification(runKey);
      conferenceStats.restoreRun(state, { debugUsed });
      journalStats.restoreRun(state, { debugUsed });
      thesisStats.restoreRun(state, { debugUsed });
      visitStats.restoreRun(runKey, { debugUsed });
    }
    if (state.phase === "setup") void achievementStats.load();
    if (state.phase !== "setup" && (before.phase === "setup"
      || before.conferenceLocationSeed !== state.conferenceLocationSeed || before.selectedRoleId !== state.selectedRoleId)) {
      void statistics.startRun(JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]));
    }
    if (state.phase === "playing" && !debugUsed && (before.phase !== "playing"
      || wasDisqualified || before.conferenceLocationSeed !== state.conferenceLocationSeed || before.selectedRoleId !== state.selectedRoleId)) {
      achievementStats.recordStartedPlayer();
    }
    void conferenceStats.track(before, state, { debugUsed });
    void journalStats.track(before, state, { debugUsed });
    void thesisStats.track(before, state, { debugUsed });
    debugWindow.update();
    render();
    void visitStats.trackGamePhase(state.phase, {
      runKey: JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId]),
      roleId: state.selectedRoleId,
      ending: state.ending,
      disqualifiedByDebug: debugUsed,
    }).then(() => {
      visitStats.render(root);
      scheduleAllFixedStageScales();
    });
  });

  window.addEventListener("online", () => {
    for (const record of store.getFinalizedOutbox()) void publishFinalizedRun(record);
    void statistics.flush(); void achievementStats.flush();
    if (store.getState().phase === "setup") void achievementStats.load();
  });
  window.addEventListener("pagehide", () => { void store.flushSaves(); void statistics.flush(); void achievementStats.flush(); void roleLevelStats.flush(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { void store.flushSaves(); void statistics.flush(); void achievementStats.flush(); }
  });
  void visitStats.load().then(() => {
    visitStats.render(root);
    scheduleAllFixedStageScales();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) visitStats.render(root);
  });

  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.dataset.communityNickname === "board" || target.dataset.communityNickname === "feedback")) {
      community.setNickname(target.value);
      const counter = target.closest(".community-compose")?.querySelector<HTMLElement>("[data-community-nickname-count]");
      const length = countMessageCharacters(target.value);
      if (counter) counter.textContent = `${length}/${NICKNAME_MAX_LENGTH}`;
      target.setAttribute("aria-invalid", String(countMessageCharacters(target.value.trim()) > NICKNAME_MAX_LENGTH));
    } else if (target instanceof HTMLTextAreaElement && (target.dataset.communityContent === "board" || target.dataset.communityContent === "feedback")) {
      community.setContent(target.dataset.communityContent, target.value);
      const counter = target.closest(".community-compose")?.querySelector<HTMLElement>("[data-community-char-count]");
      const length = countMessageCharacters(target.value);
      if (counter) counter.textContent = `${length}/${MESSAGE_MAX_LENGTH}`;
      target.setAttribute("aria-invalid", String(length > MESSAGE_MAX_LENGTH));
      refreshCommunityComposerLayout(target.parentElement!);
    } else if (target instanceof HTMLTextAreaElement && target.hasAttribute("data-community-edit-content")) {
      community.setEditContent(target.value);
      const length = countMessageCharacters(target.value);
      const editor = target.closest("[data-community-editor]");
      const counter = editor?.querySelector<HTMLElement>("[data-community-edit-count]");
      if (counter) counter.textContent = `${length}/${MESSAGE_MAX_LENGTH}`;
      target.setAttribute("aria-invalid", String(length > MESSAGE_MAX_LENGTH));
      const notice = editor?.querySelector<HTMLElement>("[data-community-edit-notice]");
      if (notice) notice.textContent = "";
    }
    if (target instanceof HTMLElement && (target.hasAttribute("data-community-nickname") || target.hasAttribute("data-community-content"))) {
      const notice = target.closest(".community-compose")?.querySelector<HTMLElement>("[data-community-notice]");
      if (notice) notice.textContent = "";
    }
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const track = target.closest<HTMLElement>(".event-timeline-track");
    if (!track) return;
    timelineDrag = {
      track,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: track.scrollLeft,
      moved: false,
    };
    track.classList.add("is-dragging");
  });

  root.addEventListener("scroll", (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains("event-timeline-track")) {
      syncTimelineLabels(event.target);
    }
  }, true);
  window.addEventListener("resize", () => {
    const track = root.querySelector<HTMLElement>(".event-timeline-track");
    if (track) syncTimelineLabels(track);
  });

  window.addEventListener("pointermove", (event) => {
    if (!timelineDrag || event.pointerId !== timelineDrag.pointerId) return;
    const distance = event.clientX - timelineDrag.startX;
    if (!timelineDrag.moved && Math.abs(distance) < 4) return;
    timelineDrag.moved = true;
    event.preventDefault();
    timelineDrag.track.scrollLeft = timelineDrag.startScrollLeft - distance;
  });

  const finishTimelineDrag = (event: PointerEvent): void => {
    if (!timelineDrag || event.pointerId !== timelineDrag.pointerId) return;
    const drag = timelineDrag;
    timelineDrag = null;
    drag.track.classList.remove("is-dragging");
    if (drag.moved) {
      suppressTimelineClick = true;
      window.setTimeout(() => {
        suppressTimelineClick = false;
      }, 400);
    }
  };

  window.addEventListener("pointerup", finishTimelineDrag);
  window.addEventListener("pointercancel", finishTimelineDrag);

  function closeQuitConfirmation(): void {
    isQuitConfirmationOpen = false;
    render();
    root.querySelector<HTMLButtonElement>('[data-action="quit-game"]')?.focus({ preventScroll: true });
  }

  function closeTalentReminder(goToTree = false): void {
    pendingTalentStart = null;
    render();
    const target = root.querySelector<HTMLButtonElement>(goToTree
      ? '.lobby-talent-tree-node[data-fixed="false"]:not(:disabled)'
      : '[data-action="start-game"]');
    target?.focus({ preventScroll: !goToTree });
    if (goToTree) target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function closeRoleLevelStats(): void {
    isRoleLevelStatsOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("[data-ui-open-level-stats]")?.focus({ preventScroll: true });
  }

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-ui-download-replay]")) {
      const button = target.closest<HTMLButtonElement>("[data-ui-download-replay]")!;
      const capture = store.getLocalReplayCapture();
      if (!capture) { window.alert("本局暂无可下载的正常操作记录"); return; }
      button.disabled = true;
      void Promise.resolve().then(() => downloadReplayRecording(captureReplayRecording(capture.replay, capture.state, { id: capture.id })))
        .catch(error => { window.alert(error instanceof Error ? error.message : "回放下载失败"); })
        .finally(() => { button.disabled = false; });
      return;
    }
    if (target.closest("[data-ui-open-local-replays]")) {
      window.open("?replay=library", "_blank", "noopener");
      return;
    }

    if (isRoleLevelStatsOpen) {
      if (target.closest("[data-ui-close-level-stats]")) closeRoleLevelStats();
      return;
    }
    if (target.closest("[data-ui-open-level-stats]") && store.getState().phase === "setup") {
      isRoleLevelStatsOpen = true;
      void roleLevelStats.load();
      render();
      root.querySelector<HTMLElement>(".role-level-stats-dialog")?.focus({ preventScroll: true });
      return;
    }

    if (pendingTalentStart) {
      if (target.closest("button[data-ui-restart-allocate-talents]")) {
        const roleId = pendingTalentStart.dataset.roleId;
        pendingTalentStart = null;
        if (isRoleId(roleId)) {
          const retired = store.retireUnallocatedRoleSave(roleId);
          void store.whenIdle().then(() => {
            if (retired || (store.getState().phase === "setup" && !store.hasRoleSave(roleId))) closeTalentReminder(true);
            else render();
          });
        } else render();
      } else if (target.closest("button[data-ui-go-allocate-talents]")) {
        closeTalentReminder(true);
      } else if (target.closest("button[data-ui-close-talent-reminder]")) {
        closeTalentReminder();
      } else if (target.closest("button[data-ui-start-without-talents]")) {
        const { dataset } = pendingTalentStart;
        pendingTalentStart = null;
        executeButtonAction(dataset, true);
      }
      return;
    }

    const academicActButton = target.closest<HTMLButtonElement>("button[data-ui-academic-archive-act]");
    if (academicActButton && isAcademicArchivePending(store.getState())) {
      const nextAct = Number(academicActButton.dataset.uiAcademicArchiveAct);
      if (nextAct === 0 || nextAct === 1 || nextAct === 2) {
        academicArchiveAct = nextAct;
        render();
        root.querySelector<HTMLElement>("#academic-archive-title")?.focus({ preventScroll: true });
      }
      return;
    }
    const academicYearButton = target.closest<HTMLButtonElement>("button[data-ui-rewinder-start-year]");
    if (academicYearButton && !academicYearButton.disabled && store.getState().phase === "setup") {
      const nextYear = Number(academicYearButton.dataset.uiRewinderStartYear);
      if (getAvailableAcademicYears(store.getLobbyState().rewinderAcademicArchive).includes(nextYear)) {
        rewinderStartYear = nextYear;
        refreshTalentTree = true;
        render();
        root.querySelector<HTMLButtonElement>(`button[data-ui-rewinder-start-year="${nextYear}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    const rewinderButton = target.closest<HTMLButtonElement>("button[data-ui-rewinder-act]");
    const rewinderAct = rewinderButton?.dataset.uiRewinderAct;
    if (rewinderAct === "attributes" || rewinderAct === "growth" || rewinderAct === "relationships") {
      activeRewinderAct = rewinderAct;
      render();
      root.querySelector<HTMLElement>("#event-content-body")?.scrollTo({ top: 0 });
      root.querySelector<HTMLButtonElement>(`.rewinder-event button[data-ui-rewinder-act="${rewinderAct}"]`)?.focus({ preventScroll: true });
      return;
    }

    if (target.closest("button[data-ui-open-run-saves]")) {
      isRunSavePanelOpen = true;
      activePlayTab = "settings";
      render();
      return;
    }
    if (target.closest("button[data-ui-close-run-saves]")) {
      isRunSavePanelOpen = false;
      if (store.getState().phase === "finished") { activePlayTab = "events"; isEndingContentOpen = true; }
      render();
      return;
    }
    const loadSaveButton = target.closest<HTMLButtonElement>("button[data-ui-load-run-save]");
    if (loadSaveButton && !loadSaveButton.disabled) {
      isRunSavePanelOpen = false;
      resetEventContentUiState();
      activeLogPage = null;
      timelineScrollLeft = 0;
      skipNextPlayerAnimation = true;
      activePlayTab = "events";
      isEndingContentOpen = true;
      store.loadRunSave(loadSaveButton.dataset.uiLoadRunSave ?? "latest");
      return;
    }
    if (isQuitConfirmationOpen) {
      if (target.closest("button[data-ui-cancel-quit]")) {
        closeQuitConfirmation();
      } else if (target.closest("button[data-ui-confirm-quit]")) {
        isQuitConfirmationOpen = false;
        store.dispatch("quit-game");
      }
      return;
    }

    if (target.closest("button[data-ui-role-history-page]") && store.getState().phase === "setup") {
      roleHistoryPageIndex = roleHistoryPageIndex === 0 ? 1 : 0;
      render();
      root.querySelector<HTMLButtonElement>("button[data-ui-role-history-page]")?.focus({ preventScroll: true });
      return;
    }

    const talentResetButton = target.closest<HTMLButtonElement>("button[data-ui-talent-reset]");
    if (talentResetButton && !talentResetButton.disabled && store.getState().phase === "setup") {
      const roleId = talentResetButton.dataset.uiTalentReset as RoleId;
      refreshTalentTree = true;
      store.resetRoleTalents(roleId);
      return;
    }

    const talentTreePageButton = target.closest<HTMLButtonElement>("button[data-ui-talent-tree-page-delta]");
    if (talentTreePageButton && !talentTreePageButton.disabled) {
      const tree = talentTreePageButton.closest<HTMLElement>(".lobby-talent-tree");
      const pages = tree?.querySelectorAll<HTMLElement>(".lobby-talent-tree-page");
      const currentPage = Number(tree?.dataset.activePage);
      const nextPage = currentPage + Number(talentTreePageButton.dataset.uiTalentTreePageDelta);
      if (tree && pages && Number.isInteger(nextPage) && nextPage >= 0 && nextPage < pages.length) {
        talentTreePageIndex = nextPage;
        tree.dataset.activePage = String(nextPage);
        tree.dataset.direction = nextPage > currentPage ? "forward" : "backward";
        pages.forEach((page, index) => {
          page.hidden = index !== nextPage;
          page.classList.toggle("is-active", index === nextPage);
          page.classList.remove("is-entering");
          if (index === nextPage && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            page.classList.add("is-entering");
            page.addEventListener("animationend", () => page.classList.remove("is-entering"), { once: true });
          }
        });
        tree.querySelectorAll<HTMLButtonElement>("button[data-ui-talent-tree-page-delta]").forEach((button) => {
          button.disabled = nextPage + Number(button.dataset.uiTalentTreePageDelta) < 0
            || nextPage + Number(button.dataset.uiTalentTreePageDelta) >= pages.length;
        });
        tree.querySelectorAll<HTMLElement>(".lobby-talent-tree-page-dots span").forEach((dot, index) => {
          dot.classList.toggle("is-active", index === nextPage);
        });
      }
      return;
    }

    const talentTreeNode = target.closest<HTMLButtonElement>("button[data-ui-talent-tree-node]");
    if (talentTreeNode) {
      if (talentTreeNode.disabled || talentTreeNode.closest('[data-curse-read-only="true"]')) return;
      const page = talentTreeNode.closest<HTMLElement>(".lobby-talent-tree-page");
      const nodes = page?.querySelectorAll<HTMLButtonElement>("button[data-ui-talent-tree-node]");
      const pageIndex = Number(page?.dataset.treePage);
      const nodeIndex = nodes ? [...nodes].indexOf(talentTreeNode) : -1;
      const alreadySelected = talentTreeNode.classList.contains("is-selected");
      if (Number.isInteger(pageIndex) && nodeIndex >= 0) talentTreeSelectedNodeByPage[pageIndex] = nodeIndex;
      if (talentTreeNode.dataset.curseDifficulty && store.getState().phase === "setup") {
        refreshTalentTree = true;
        store.selectCurseDifficulty(store.getLobbyState().selectedLobbyRoleId, Number(talentTreeNode.dataset.curseDifficulty));
        return;
      }
      if (alreadySelected && talentTreeNode.dataset.talentId && store.getState().phase === "setup") {
        const roleId = store.getLobbyState().selectedLobbyRoleId;
        const talentId = talentTreeNode.dataset.talentId;
        refreshTalentTree = true;
        store.upgradeRoleTalent(roleId, talentId);
        return;
      }
      nodes?.forEach((node) => {
        const selected = node === talentTreeNode;
        node.classList.toggle("is-selected", selected);
        node.setAttribute("aria-pressed", String(selected));
      });
      page?.querySelectorAll<HTMLElement>(".lobby-normal-tree-detail").forEach((detail, index) => {
        detail.hidden = index !== nodeIndex;
      });
      return;
    }

    const sendMessageButton = target.closest<HTMLButtonElement>("button[data-community-send]");
    if (sendMessageButton && !sendMessageButton.disabled) {
      const source = sendMessageButton.dataset.communitySend;
      if (source === "board" || source === "feedback") void community.submit(source);
      return;
    }

    const toggleContentButton = target.closest<HTMLButtonElement>("button[data-community-toggle-content]");
    if (toggleContentButton && !toggleContentButton.disabled) {
      const id = Number(toggleContentButton.dataset.communityToggleContent);
      if (Number.isSafeInteger(id)) {
        const list = toggleContentButton.closest("[data-community-list]");
        community.toggleContent(id);
        list?.querySelector<HTMLButtonElement>(`[data-community-toggle-content="${id}"]`)?.focus({ preventScroll: true });
      }
      return;
    }

    const editButton = target.closest<HTMLButtonElement>("button[data-community-edit]");
    if (editButton && !editButton.disabled) {
      const id = Number(editButton.dataset.communityEdit);
      if (Number.isSafeInteger(id)) {
        const source = editButton.closest(".community-feedback-overlay") ? "feedback" : "board";
        community.openEdit(id, source);
        root.querySelector<HTMLTextAreaElement>("[data-community-edit-content]")?.focus({ preventScroll: false });
      }
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>("button[data-community-delete]");
    if (deleteButton && !deleteButton.disabled) {
      const id = Number(deleteButton.dataset.communityDelete);
      if (Number.isSafeInteger(id) && window.confirm("确定删除这条留言吗？删除后正文将无法恢复。")) {
        void community.deleteMessage(id);
      }
      return;
    }

    const cancelEditButton = target.closest<HTMLButtonElement>("button[data-community-cancel-edit]");
    if (cancelEditButton && !cancelEditButton.disabled) {
      community.cancelEdit();
      return;
    }

    const saveEditButton = target.closest<HTMLButtonElement>("button[data-community-save-edit]");
    if (saveEditButton && !saveEditButton.disabled) {
      void community.saveEdit();
      return;
    }

    const replyButton = target.closest<HTMLButtonElement>("button[data-community-reply-to]");
    if (replyButton && !replyButton.disabled) {
      const id = Number(replyButton.dataset.communityReplyTo);
      if (Number.isSafeInteger(id)) {
        const source = replyButton.closest(".community-feedback-overlay") ? "feedback" : "board";
        community.openReply(id, source);
        root.querySelector<HTMLTextAreaElement>(`textarea[data-community-content="${source}"]`)?.focus({ preventScroll: false });
      }
      return;
    }

    const cancelReplyButton = target.closest<HTMLButtonElement>("button[data-community-cancel-reply]");
    if (cancelReplyButton && !cancelReplyButton.disabled) {
      const source = cancelReplyButton.dataset.communityCancelReply;
      if (source === "board" || source === "feedback") community.cancelReply(source);
      return;
    }

    const toggleRepliesButton = target.closest<HTMLButtonElement>("button[data-community-toggle-replies]");
    if (toggleRepliesButton && !toggleRepliesButton.disabled) {
      const id = Number(toggleRepliesButton.dataset.communityToggleReplies);
      if (Number.isSafeInteger(id)) community.toggleReplies(id);
      return;
    }

    const messagePageButton = target.closest<HTMLButtonElement>("button[data-community-page-delta]");
    if (messagePageButton && !messagePageButton.disabled) {
      const delta = Number(messagePageButton.dataset.communityPageDelta);
      if (delta === -1 || delta === 1) void community.loadPage(community.snapshot().page + delta);
      return;
    }

    const retryMessagesButton = target.closest<HTMLButtonElement>("button[data-community-retry]");
    if (retryMessagesButton && !retryMessagesButton.disabled) {
      void community.loadPage(community.snapshot().page);
      return;
    }

    if (suppressTimelineClick && target.closest(".event-timeline-track")) {
      suppressTimelineClick = false;
      return;
    }
    suppressTimelineClick = false;

    const roleRailViewButton = target.closest<HTMLButtonElement>("button[data-ui-role-rail-view]");
    if (
      roleRailViewButton
      && !roleRailViewButton.disabled
      && isRoleRailViewId(roleRailViewButton.dataset.uiRoleRailView)
    ) {
      if (activeRoleRailView === roleRailViewButton.dataset.uiRoleRailView) return;
      activeRoleRailView = roleRailViewButton.dataset.uiRoleRailView;
      const rail = root.querySelector<HTMLElement>(".lobby-profile-achievement-rail");
      if (!rail) {
        render();
        return;
      }
      const lobby = store.getLobbyState();
      rail.outerHTML = renderRoleRail(lobby, lobby.selectedLobbyRoleId, activeRoleRailView, announcementPageIndex);
      root.querySelectorAll<HTMLButtonElement>("button[data-ui-role-rail-view]").forEach((button) => {
        const selected = button.dataset.uiRoleRailView === activeRoleRailView;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-selected", String(selected));
      });
      visitStats.render(root);
      syncCommunityView();
      bindAnnouncementCollapse(root);
      scheduleAllFixedStageScales();
      if (activeRoleRailView === "messages") void community.loadPage(community.snapshot().page);
      return;
    }

    const announcementPageButton = target.closest<HTMLButtonElement>("button[data-ui-announcement-page]");
    if (announcementPageButton && !announcementPageButton.disabled && activeRoleRailView === "announcements") {
      const requestedPage = Number(announcementPageButton.dataset.uiAnnouncementPage);
      const content = root.querySelector<HTMLElement>("[data-announcement-content]");
      if (!content || !Number.isInteger(requestedPage)) return;
      const nextPage = getAnnouncementPageIndex(requestedPage);
      if (nextPage === announcementPageIndex) return;
      const direction = nextPage > announcementPageIndex ? 1 : -1;
      const restoreFocus = document.activeElement === announcementPageButton;
      announcementPageIndex = nextPage;
      content.innerHTML = renderAnnouncementPage(announcementPageIndex);
      bindAnnouncementCollapse(root);
      createIcons({ icons: { ChevronLeft, ChevronRight }, root: content });
      if (restoreFocus) {
        const nextButton = content.querySelector<HTMLButtonElement>(`[data-ui-announcement-page="${announcementPageIndex + direction}"]:not(:disabled)`)
          ?? content.querySelector<HTMLButtonElement>("button:not(:disabled)");
        nextButton?.focus({ preventScroll: true });
      }
      scheduleAllFixedStageScales();
      return;
    }

    const openFeedbackButton = target.closest<HTMLButtonElement>("button[data-ui-open-feedback]");
    if (openFeedbackButton && !openFeedbackButton.disabled) {
      isFeedbackOpen = true;
      render();
      void community.loadPage(community.snapshot().page);
      return;
    }

    const closeFeedbackButton = target.closest<HTMLButtonElement>("button[data-ui-close-feedback]");
    if (closeFeedbackButton && !closeFeedbackButton.disabled) {
      isFeedbackOpen = false;
      render();
      return;
    }

    const helpToggle = target.closest<HTMLButtonElement>("button[data-ui-help-toggle]");
    if (helpToggle && !helpToggle.disabled) {
      isHelpOpen = !isHelpOpen;
      render();
      root.querySelector<HTMLButtonElement>(isHelpOpen ? ".play-help-close" : ".play-help-toggle")?.focus({ preventScroll: true });
      return;
    }

    const helpPageButton = target.closest<HTMLButtonElement>("button[data-ui-help-page]");
    if (helpPageButton && !helpPageButton.disabled) {
      const requestedPage = Number(helpPageButton.dataset.uiHelpPage);
      const context = getPlayHelpContext({ activePlayTab, activeShopTab, activeTalentTab });
      helpPageByContext[context.key] = getPlayHelpPageIndex(context, requestedPage);
      render();
      root.querySelector<HTMLElement>(".play-help-body")?.focus({ preventScroll: true });
      return;
    }

    const playTabButton = target.closest<HTMLButtonElement>("button[data-ui-play-tab]");
    if (playTabButton && !playTabButton.disabled && isPlayTabId(playTabButton.dataset.uiPlayTab)) {
      selectPlayTab(playTabButton.dataset.uiPlayTab);
      if (activePlayTab === "shop") {
        for (const notice of getShopUpgradeNotices(store.getState())) {
          acknowledgedShopUpgradeKeys.add(notice.key);
        }
      }
      if (activePlayTab !== "shop") {
        selectedChairUpgradeId = null;
        selectedCoffeeUpgradeId = null;
      }
      render();
      return;
    }

    const paperSelectionCard = target.closest<HTMLElement>("[data-ui-select-workstation-paper]");
    if (
      paperSelectionCard
      && !target.closest("button[data-action]")
      && !target.closest("button[data-ui-select-workstation-paper]")
    ) {
      const paperId = paperSelectionCard.dataset.uiSelectWorkstationPaper?.trim();
      if (paperId) {
        store.dispatch("select-paper", { paperId });
      }
      return;
    }

    const shopTabButton = target.closest<HTMLButtonElement>("button[data-ui-shop-tab]");
    if (shopTabButton && !shopTabButton.disabled && isShopTabId(shopTabButton.dataset.uiShopTab)) {
      rememberTabSliderOrigin("shop");
      const nextShopTab = normalizeShopTab(shopTabButton.dataset.uiShopTab);
      if (nextShopTab !== activeShopTab) {
        shopTabTransitionDirection = shopTabOrder.indexOf(nextShopTab) > shopTabOrder.indexOf(activeShopTab)
          ? "from-right"
          : "from-left";
      }
      activeShopTab = nextShopTab;
      if (activeShopTab === "ai" || activeShopTab === "coffee") {
        acknowledgeShopTabNotice(store.getState(), activeShopTab);
      }
      selectedChairUpgradeId = null;
      selectedCoffeeUpgradeId = null;
      render();
      return;
    }

    const chairUpgradeOption = target.closest<HTMLButtonElement>("button[data-ui-select-chair-upgrade]");
    if (chairUpgradeOption && !chairUpgradeOption.disabled && isChairUpgradeId(chairUpgradeOption.dataset.uiSelectChairUpgrade)) {
      const upgradeId = chairUpgradeOption.dataset.uiSelectChairUpgrade;
      selectedChairUpgradeId = selectedChairUpgradeId === upgradeId ? null : upgradeId;
      render();
      return;
    }


    const coffeeUpgradeOption = target.closest<HTMLButtonElement>("button[data-ui-select-coffee-upgrade]");
    if (coffeeUpgradeOption && !coffeeUpgradeOption.disabled && isCoffeeUpgradeId(coffeeUpgradeOption.dataset.uiSelectCoffeeUpgrade)) {
      const upgradeId = coffeeUpgradeOption.dataset.uiSelectCoffeeUpgrade;
      selectedCoffeeUpgradeId = selectedCoffeeUpgradeId === upgradeId ? null : upgradeId;
      render();
      return;
    }

    const labInheritanceButton = target.closest<HTMLButtonElement>("button[data-ui-lab-inheritance-page]");
    if (labInheritanceButton && !labInheritanceButton.disabled) {
      const page = Number(labInheritanceButton.dataset.uiLabInheritancePage);
      if (Number.isInteger(page) && page >= 0 && page < 2) {
        labInheritancePage = page;
        renderRelationCardPage("lab-mutual-growth", labInheritanceButton);
      }
      return;
    }

    const loverRewardButton = target.closest<HTMLButtonElement>("button[data-ui-lover-reward-page]");
    if (loverRewardButton && !loverRewardButton.disabled) {
      const page = Number(loverRewardButton.dataset.uiLoverRewardPage);
      if (Number.isInteger(page) && page >= 0 && page < 3) {
        loverRewardPage = page;
        renderRelationCardPage("lover", loverRewardButton);
      }
      return;
    }

    const advisorSalaryButton = target.closest<HTMLButtonElement>("button[data-ui-advisor-salary-start]");
    if (advisorSalaryButton && !advisorSalaryButton.disabled) {
      const startIndex = Number(advisorSalaryButton.dataset.uiAdvisorSalaryStart);
      if (Number.isInteger(startIndex) && startIndex >= 0) {
        advisorSalaryStartIndex = startIndex;
        renderRelationCardPage("advisor", advisorSalaryButton);
      }
      return;
    }

    const internshipPageButton = target.closest<HTMLButtonElement>("button[data-ui-internship-page]");
    if (internshipPageButton && !internshipPageButton.disabled) {
      const page = Number(internshipPageButton.dataset.uiInternshipPage);
      if (Number.isInteger(page) && page >= 0 && page < 2) {
        internshipPage = page;
        renderRelationCardPage("internship", internshipPageButton);
      }
      return;
    }

    const gameGrowthButton = target.closest<HTMLButtonElement>("button[data-ui-game-growth-page]");
    if (gameGrowthButton && !gameGrowthButton.disabled) {
      const page = Number(gameGrowthButton.dataset.uiGameGrowthPage);
      if (Number.isInteger(page) && page >= 0 && page < 3) {
        gameGrowthPage = page;
        renderRelationCardPage("game-growth", gameGrowthButton);
      }
      return;
    }

    const talentTabButton = target.closest<HTMLButtonElement>("button[data-ui-talent-tab]");
    if (talentTabButton && !talentTabButton.disabled && isTalentPanelTabId(talentTabButton.dataset.uiTalentTab)) {
      rememberTabSliderOrigin("talent");
      const nextTalentTab = talentTabButton.dataset.uiTalentTab;
      if (nextTalentTab !== activeTalentTab) {
        talentTabTransitionDirection = talentTabOrder.indexOf(nextTalentTab) > talentTabOrder.indexOf(activeTalentTab)
          ? "from-right"
          : "from-left";
      }
      activeTalentTab = nextTalentTab;
      render();
      return;
    }

    const researchPageButton = target.closest<HTMLButtonElement>("button[data-ui-research-page]");
    if (researchPageButton && !researchPageButton.disabled) {
      const nextIndex = Number(researchPageButton.dataset.uiResearchPage ?? "");
      if (Number.isFinite(nextIndex) && nextIndex >= 0) {
        researchPageIndex = Math.floor(nextIndex / RESEARCH_PAGE_SIZE);
        currentResearchPaperIndex = null;
        render();
      }
      return;
    }

    const researchIndexButton = target.closest<HTMLButtonElement>("button[data-ui-research-index]");
    if (researchIndexButton && !researchIndexButton.disabled) {
      const nextIndex = Number(researchIndexButton.dataset.uiResearchIndex ?? "");
      if (Number.isFinite(nextIndex) && nextIndex >= 0) {
        currentResearchPaperIndex = currentResearchPaperIndex === Math.floor(nextIndex) ? null : Math.floor(nextIndex);
        researchPageIndex = Math.floor(nextIndex / RESEARCH_PAGE_SIZE);
        render();
      }
      return;
    }

    const researchSortButton = target.closest<HTMLButtonElement>("button[data-ui-research-sort]");
    if (researchSortButton) {
      const nextMode = researchSortButton.dataset.uiResearchSort;
      if (nextMode === "year" || nextMode === "citations") {
        researchSortMode = nextMode;
        currentResearchPaperIndex = null;
        researchPageIndex = 0;
        render();
      }
      return;
    }

    const researchAuthorshipButton = target.closest<HTMLButtonElement>("button[data-ui-research-authorship]");
    if (researchAuthorshipButton) {
      const nextFilter = researchAuthorshipButton.dataset.uiResearchAuthorship;
      if (nextFilter === "first" || nextFilter === "coauthor") {
        researchAuthorshipFilter = researchAuthorshipFilter === nextFilter ? "all" : nextFilter;
        currentResearchPaperIndex = null;
        researchPageIndex = 0;
        render();
      }
      return;
    }

    const relationshipIndexButton = target.closest<HTMLButtonElement>("button[data-ui-relationship-index]");
    if (relationshipIndexButton && !relationshipIndexButton.disabled) {
      const nextIndex = Number(relationshipIndexButton.dataset.uiRelationshipIndex ?? "");
      if (Number.isFinite(nextIndex) && nextIndex >= 0) {
        activeRelationshipIndex = Math.floor(nextIndex);
        render();
      }
      return;
    }

    const effectChip = target.closest<HTMLButtonElement>("button.effect-chip[data-effect-id]");
    if (effectChip) {
      const isSelected = effectChip.classList.contains("is-selected");
      if (isSelected) {
        resetEffectSourceUi();
      } else {
        showEffectSource(effectChip);
      }
      return;
    }

    const openEventButton = target.closest<HTMLButtonElement>("button[data-ui-open-event-id]");
    if (openEventButton && !openEventButton.disabled) {
      const nextEventId = openEventButton.dataset.uiOpenEventId?.trim();
      if (nextEventId) {
        openEventContent(nextEventId);
      }
      return;
    }

    const openEventHistoryButton = target.closest<HTMLButtonElement>("button[data-ui-open-event-history-id]");
    if (openEventHistoryButton && !openEventHistoryButton.disabled) {
      const eventHistoryId = openEventHistoryButton.dataset.uiOpenEventHistoryId?.trim();
      if (eventHistoryId) {
        openEventHistoryContent(eventHistoryId);
      }
      return;
    }

    const openEndingButton = target.closest<HTMLButtonElement>("button[data-ui-open-ending-content]");
    if (openEndingButton && !openEndingButton.disabled) {
      resetEventContentUiState();
      isEndingContentOpen = true;
      render();
      return;
    }

    const closeEndingButton = target.closest<HTMLButtonElement>("button[data-ui-close-ending-content]");
    if (closeEndingButton && !closeEndingButton.disabled) {
      resetEventContentUiState();
      isEndingContentOpen = false;
      render();
      root.querySelector<HTMLButtonElement>("[data-ui-open-ending-content]")?.focus({ preventScroll: true });
      return;
    }

    const closeEventButton = target.closest<HTMLButtonElement>("button[data-ui-close-event-content]");
    if (closeEventButton && !closeEventButton.disabled) {
      closeEventContent();
      return;
    }

    const eventSceneTab = target.closest<HTMLButtonElement>("button[data-ui-event-scene-index]");
    if (eventSceneTab && !eventSceneTab.disabled) {
      const state = store.getState();
      const activeEvent = getActiveQueueEvent(state) ?? getActiveChainEvent(state);
      const activeHistoryEvent = getActiveHistoryEvent(state);
      const currentPageIndex = activeEvent
        ? (activeEvent.history?.length ?? 0)
        : Math.max(0, (activeHistoryEvent?.stages.length ?? 1) - 1);
      if (!activeEvent && !activeHistoryEvent) return;
      const selectedPageIndex = Number(eventSceneTab.dataset.uiEventSceneIndex ?? "");
      if (Number.isFinite(selectedPageIndex) && selectedPageIndex >= 0 && selectedPageIndex <= currentPageIndex) {
        activeEventHistoryIndex = selectedPageIndex === currentPageIndex ? null : Math.floor(selectedPageIndex);
        render();
      }
      return;
    }

    const sanChartToggle = target.closest<HTMLButtonElement>("button[data-ui-san-chart-toggle]");
    if (sanChartToggle) {
      isSanChartOpen = !isSanChartOpen;
      render();
      return;
    }

    const timelineMarker = target.closest<HTMLButtonElement>("button[data-ui-log-page-index]");
    if (timelineMarker && !timelineMarker.disabled) {
      const nextPageIndex = Number(timelineMarker.dataset.uiLogPageIndex ?? "");
      if (Number.isFinite(nextPageIndex) && nextPageIndex >= 0) {
        resetEventContentUiState();
        activeLogPage = Math.floor(nextPageIndex);
        render();
      }
      return;
    }

    const pendingNavButton = target.closest<HTMLButtonElement>("button[data-ui-pending-nav]");
    if (pendingNavButton && !pendingNavButton.disabled) {
      const pendingPanel = root.querySelector<HTMLElement>(".new-pending-event-section[data-pending-page-index][data-pending-page-count]");
      const pageIndex = Number(pendingPanel?.dataset.pendingPageIndex ?? "0");
      const pageCount = Number(pendingPanel?.dataset.pendingPageCount ?? "1");
      const lastPageIndex = Math.max(0, pageCount - 1);
      const currentPageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.min(pageIndex, lastPageIndex)) : 0;

      activePendingPage = pendingNavButton.dataset.uiPendingNav === "next"
        ? Math.min(lastPageIndex, currentPageIndex + 1)
        : Math.max(0, currentPageIndex - 1);
      render();
      return;
    }

    const debugOpenButton = target.closest<HTMLButtonElement>("button[data-ui-open-debug-window]");
    if (debugOpenButton) {
      if (!debugWindow.open()) {
        window.alert("调试窗口被浏览器拦截，请允许本站弹出窗口后重试");
      }
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) return;

    executeButtonAction(button.dataset);
  });

  window.addEventListener("keydown", (event) => {
    if (isRoleLevelStatsOpen) {
      if (event.key === "Escape") { event.preventDefault(); closeRoleLevelStats(); }
      else if (event.key === "Tab") {
        event.preventDefault();
        root.querySelector<HTMLButtonElement>(".role-level-stats-close")?.focus();
      }
      return;
    }
    if (isAcademicArchivePending(store.getState())) {
      if (event.key === "Tab") {
        const buttons = [...root.querySelectorAll<HTMLElement>(".academic-archive-overlay button:not(:disabled), .academic-archive-overlay summary")];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement?.id === "academic-archive-title")) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
      return;
    }
    if (isQuitConfirmationOpen || pendingTalentStart) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (pendingTalentStart) closeTalentReminder();
        else closeQuitConfirmation();
      } else if (event.key === "Tab") {
        const buttons = [...root.querySelectorAll<HTMLButtonElement>(".game-confirm-dialog button")];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      return;
    }
    if (event.key === "Escape" && isHelpOpen && !isFeedbackOpen) {
      isHelpOpen = false;
      render();
      root.querySelector<HTMLButtonElement>(".play-help-toggle")?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "Escape" || !isFeedbackOpen) return;
    isFeedbackOpen = false;
    render();
  });
}
