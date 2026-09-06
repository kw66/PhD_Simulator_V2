import {
  Award,
  Bell,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CircleHelp,
  createIcons,
  FlaskConical,
  Gamepad2,
  GitFork,
  House,
  Lock,
  MessageSquare,
  MessagesSquare,
  Microchip,
  RotateCcw,
  Send,
  Settings,
  Sprout,
  Store,
  Users,
  UserRound,
  X,
} from "lucide";

import { DEBUG_STAT_IDS, GAME_ACTION_IDS } from "../core/v2-action-ids";
import { AI_SLOT_IDS, getAiModelForTotalMonths } from "../core/v2-ai-shop";
import { getCurrentCoffeeBonus } from "../core/v2-coffee-system";
import { createStore } from "../core/v2-store";
import { getCurrentEvent, getSortedEventQueue } from "../core/v2-event-queue";
import { getRoleOptions, isPreEnrollmentState } from "../core/v2-progression";
import { getAttributeTier } from "../core/v2-random-event-rules";
import { getAvailablePaperSlotCount } from "../core/v2-paper-rules";
import type {
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
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import {
  type LobbyInfoSectionId,
  type LobbyViewId,
  type PlayTabId,
  type ResearchAuthorshipFilter,
  type ResearchSortMode,
  type ShopUpgradeNoticeTab,
  type TalentPanelTabId,
} from "./v2-render-types";
import { warmRoleDetailPortraits } from "./v2-role-portrait-assets";

const ROLE_IDS: ReadonlySet<string> = new Set(getRoleOptions().map((role) => role.id));
const ROLE_IDS_IN_DISPLAY_ORDER = getRoleOptions().map((role) => role.id);
const PLAY_TAB_IDS: ReadonlySet<string> = new Set(["events", "workstation", "relationship", "shop", "research", "talent", "settings"]);
const LOBBY_VIEW_IDS: ReadonlySet<string> = new Set(["roles", "info", "messages"]);
const LOBBY_INFO_SECTION_IDS: ReadonlySet<string> = new Set(["overview", "mechanics", "values", "guide", "events", "systems", "endings", "updates"]);
const SHOP_TAB_IDS: ReadonlySet<string> = new Set(["ai", "rest", "coffee", "gear"]);
const TALENT_PANEL_TAB_IDS: ReadonlySet<string> = new Set(["character", "relation", "equip", "growth", "publication"]);
const DATE_DISPLAY_MODES: ReadonlySet<string> = new Set(["academic", "calendar"]);
const GAME_ACTION_ID_SET: ReadonlySet<string> = new Set(GAME_ACTION_IDS);
const DEBUG_STAT_ID_SET: ReadonlySet<string> = new Set(DEBUG_STAT_IDS);
const PAPER_ACTION_TYPE_SET: ReadonlySet<string> = new Set(["idea", "experiment", "writing"]);
const PAPER_TARGET_SET: ReadonlySet<string> = new Set(["A", "B", "C"]);
const JOURNAL_TARGET_SET: ReadonlySet<string> = new Set(["nature", "nmi", "pami"]);
const PAPER_PROMOTION_SET: ReadonlySet<string> = new Set(["arxiv", "github", "xiaohongshu"]);
const DEBUG_PAPER_AUTHORSHIP_SET: ReadonlySet<string> = new Set(["first", "coauthor"]);
const CHAIR_UPGRADE_ID_SET: ReadonlySet<string> = new Set([
  "chair-advanced",
  "chair-massage",
  "chair-torture",
  "chair-spike",
  "chair-hammock",
]);
const COFFEE_UPGRADE_ID_SET: ReadonlySet<string> = new Set(["manual", "automatic", "advanced", "unlimited"]);
const SETUP_STAGE_WIDTH = 1460;
const PLAY_STAGE_WIDTH = 1540;
const PLAY_DEBUG_STAGE_WIDTH = 1800;
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

function isLobbyViewId(value: string | undefined): value is LobbyViewId {
  return value !== undefined && LOBBY_VIEW_IDS.has(value);
}

function isLobbyInfoSectionId(value: string | undefined): value is LobbyInfoSectionId {
  return value !== undefined && LOBBY_INFO_SECTION_IDS.has(value);
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

export function bootstrapApp(root: HTMLDivElement): void {
  const store = createStore();
  let queuedSetupPortraitWarmup = false;
  let fixedStageScaleFrame = 0;
  let activePlayTab: PlayTabId = "events";
  let showDebugEventRail = true;
  let showDebugBottomBar = true;
  let activeLobbyView: LobbyViewId = "roles";
  let activeLobbyInfoSection: LobbyInfoSectionId = "overview";
  let isFeedbackOpen = false;
  let activeShopTab: ShopTabId = "ai";
  let selectedChairUpgradeId: ShopUpgradeId | null = null;
  let selectedCoffeeUpgradeId: Exclude<CoffeeMachineUpgradeId, null> | null = null;
  let activeTalentTab: TalentPanelTabId = "character";
  let isEventContentOpen = false;
  let activeEventId: string | null = null;
  let activeEventHistoryId: string | null = null;
  let activeEventChainId: string | null = null;
  let activeEventHistoryIndex: number | null = null;
  let activeLogPage: number | null = null;
  let activePendingPage = 0;
  let activeRelationshipIndex = 0;
  let currentResearchPaperIndex = 0;
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
  let lastRenderedPaperScores = new Map<string, [number, number, number]>();
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
    const animateValue = (statId: keyof PlayerStats, delta: number): void => {
      const item = root.querySelector<HTMLElement>(`[data-player-stat="${statId}"]`);
      if (!item || delta === 0) return;

      const direction = delta > 0 ? "increase" : "decrease";
      const value = item.querySelector<HTMLElement>(statId === "money" ? ".new-currency-value" : ".new-attr-value");
      const floatingChange = document.createElement("span");
      floatingChange.className = `stat-floating-change is-${direction}`;
      floatingChange.textContent = delta > 0 ? `+${delta}` : String(delta);
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
      animateValue(statId, current[statId] - previous[statId]);
    }
    animateValue("money", current.money - previous.money);
  };

  const animatePaperScoreChanges = (previous: Map<string, [number, number, number]>, current: GameState["papers"]): void => {
    current.forEach((paper) => {
      const before = previous.get(paper.id);
      if (!before) return;
      const after: [number, number, number] = [paper.idea, paper.experiment, paper.writing];
      const deltas = after.map((value, index) => value - before[index]);
      if (deltas.every((delta) => delta === 0)) return;
      const scoreDeltas = [deltas.reduce((sum, delta) => sum + delta, 0), ...deltas];

      const card = root.querySelector<HTMLElement>(`[data-paper-id="${CSS.escape(paper.id)}"]`);
      const scoreStrip = card?.querySelector<HTMLElement>(".paper-score-strip");
      if (!card || !scoreStrip) return;
      card.classList.add("is-score-changing");
      scoreStrip.classList.add("is-score-changing");

      scoreDeltas.forEach((delta, index) => {
        if (delta === 0) return;
        const scoreCell = scoreStrip.children[index];
        if (!(scoreCell instanceof HTMLElement)) return;
        const change = document.createElement("span");
        change.className = `paper-score-change is-${delta > 0 ? "positive" : "negative"}`;
        change.textContent = delta > 0 ? `+${delta}` : String(delta);
        scoreCell.appendChild(change);
      });

      window.setTimeout(() => {
        card.classList.remove("is-score-changing");
        scoreStrip.classList.remove("is-score-changing");
        scoreStrip.querySelectorAll(".paper-score-change").forEach((item) => item.remove());
      }, 760);
    });
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

    if (window.matchMedia("(max-width: 1180px)").matches) {
      root.style.setProperty(scaleVarName, "1");
      root.style.setProperty(contentHeightVarName, `${stage.scrollHeight}px`);
      return;
    }

    const scale = Math.min(1, shellWidth / stageWidth);
    root.style.setProperty(scaleVarName, scale.toFixed(4));
    root.style.setProperty(contentHeightVarName, `${stage.scrollHeight}px`);
  };

  const syncAllFixedStageScales = (): void => {
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
      root.querySelector<HTMLElement>('.play-page.has-debug-bar')
        && !window.matchMedia("(max-width: 1600px)").matches
        ? PLAY_DEBUG_STAGE_WIDTH
        : PLAY_STAGE_WIDTH,
    );
  };

  const scheduleAllFixedStageScales = (): void => {
    if (fixedStageScaleFrame) {
      window.cancelAnimationFrame(fixedStageScaleFrame);
    }

    fixedStageScaleFrame = window.requestAnimationFrame(() => {
      fixedStageScaleFrame = 0;
      syncAllFixedStageScales();
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
    isEventContentOpen = false;
    activeEventId = null;
    activeEventHistoryId = null;
    activeEventChainId = null;
    activeEventHistoryIndex = null;
  };

  const getActiveQueueEvent = (state: GameState): GameState["eventQueue"][number] | null => {
    if (!activeEventId) {
      return null;
    }

    return getCurrentEvent(state.eventQueue, activeEventId);
  };

  const getActiveChainEvent = (state: GameState): GameState["eventQueue"][number] | null => {
    if (!activeEventChainId) {
      return null;
    }

    return getSortedEventQueue(state.eventQueue).find((event) => event.chainId === activeEventChainId) ?? null;
  };

  const getActiveHistoryEvent = (state: GameState): GameState["eventHistory"][number] | null => {
    if (!activeEventHistoryId) {
      return null;
    }

    return state.eventHistory.find((event) => event.id === activeEventHistoryId) ?? null;
  };

  const openEventContent = (eventId: string): void => {
    const state = store.getState();
    if (state.phase !== "playing") {
      return;
    }

    const nextEvent = getCurrentEvent(state.eventQueue, eventId);
    if (!nextEvent) {
      return;
    }

    activePlayTab = "events";
    isEventContentOpen = true;
    activeEventId = nextEvent.id;
    activeEventHistoryId = null;
    activeEventChainId = nextEvent.chainId;
    activeEventHistoryIndex = null;
    render();
  };

  const openEventHistoryContent = (eventHistoryId: string): void => {
    const state = store.getState();
    const historyEvent = state.eventHistory.find((event) => event.id === eventHistoryId);
    if (state.phase !== "playing" || !historyEvent) {
      return;
    }

    activePlayTab = "events";
    isEventContentOpen = true;
    activeEventId = null;
    activeEventHistoryId = historyEvent.id;
    activeEventChainId = null;
    activeEventHistoryIndex = null;
    render();
  };

  const closeEventContent = (): void => {
    resetEventContentUiState();
    render();
  };

  const syncEventContentUiState = (): void => {
    const state = store.getState();
    if (state.phase !== "playing") {
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
    if (state.phase !== "playing") {
      currentResearchPaperIndex = 0;
      return;
    }

    const publishedPaperCount = [...state.papers, ...state.externalPublications]
      .filter((paper) => paper.status === "published")
      .filter((paper) => researchAuthorshipFilter === "all"
        || (researchAuthorshipFilter === "first" ? paper.nonFirstAuthor !== true : paper.nonFirstAuthor === true))
      .length;
    if (publishedPaperCount === 0) {
      currentResearchPaperIndex = 0;
      return;
    }

    currentResearchPaperIndex = Math.min(
      Math.max(currentResearchPaperIndex, 0),
      publishedPaperCount - 1,
    );
  };

  const syncRelationshipUiState = (): void => {
    const state = store.getState();
    if (state.phase !== "playing") {
      activeRelationshipIndex = 0;
      return;
    }

    activeRelationshipIndex = Math.min(Math.max(activeRelationshipIndex, 0), 4);
  };

  const render = (): void => {
    const state = store.getState();
    const previousRenderedPlayer = lastRenderedPlayer;
    const shouldAnimatePlayer = !skipNextPlayerAnimation && lastPhase === "playing" && state.phase === "playing";
    skipNextPlayerAnimation = false;
    if (state.phase !== lastPhase) {
      if (state.phase === "playing") {
        activeLobbyView = "roles";
        activeLobbyInfoSection = "overview";
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
        currentResearchPaperIndex = 0;
        researchSortMode = "year";
        researchAuthorshipFilter = "all";
      } else if (state.phase === "setup") {
        activeLobbyView = "roles";
        activeLobbyInfoSection = "overview";
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
        currentResearchPaperIndex = 0;
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
    root.dataset.phase = state.phase;
    root.innerHTML = renderApp(state, store.getLobbyState(), {
      activePlayTab,
      showDebugEventRail,
      showDebugBottomBar,
      activeLobbyView,
      activeLobbyInfoSection,
      isFeedbackOpen,
      isEventContentOpen,
      activeEventId,
      activeEventHistoryId,
      activeEventHistoryIndex,
      activeLogPage,
      activePendingPage,
      activeRelationshipIndex,
      activeShopTab,
      showShopUpgradeNotice: shopUpgradeNotices.some((notice) => !acknowledgedShopUpgradeKeys.has(notice.key)),
      shopUpgradeNoticeTabs: [...new Set(shopUpgradeNotices.map((notice) => notice.tab))],
      selectedChairUpgradeId,
      selectedCoffeeUpgradeId,
      activeTalentTab,
      currentResearchPaperIndex,
      researchSortMode,
      researchAuthorshipFilter,
    });
    if (animateEventPanelAfterNextMonth) {
      animateEventPanelAfterNextMonth = false;
      if (state.phase === "playing" && activePlayTab === "events") {
        const eventPanel = root.querySelector<HTMLElement>('[data-tab-panel="events"] .event-panel');
        eventPanel?.classList.add("is-month-entering");
      }
    }
    createIcons({
      icons: {
        Award,
        Bell,
        ChartNoAxesColumn,
        Check,
        ChevronDown,
        ChevronRight,
        ChevronLeft,
        CircleHelp,
        FlaskConical,
        Gamepad2,
        GitFork,
        House,
        Lock,
        MessageSquare,
        MessagesSquare,
        Microchip,
        RotateCcw,
        Send,
        Settings,
        Sprout,
        Store,
        Users,
        UserRound,
        X,
      },
      root,
    });
    if (state.phase === "playing" && activeLogPage === null) {
      const timelineTrack = root.querySelector<HTMLElement>(".event-timeline-track");
      const currentMarker = timelineTrack?.querySelector<HTMLElement>(".event-timeline-marker.is-current");
      if (timelineTrack && currentMarker) {
        const centeredScrollLeft = currentMarker.offsetLeft - (timelineTrack.clientWidth - currentMarker.offsetWidth) / 2;
        timelineTrack.scrollLeft = Math.max(
          0,
          Math.min(centeredScrollLeft, timelineTrack.scrollWidth - timelineTrack.clientWidth),
        );
        activeLogPage = Number(currentMarker.dataset.uiLogPageIndex ?? "0");
      }
    }
    animatePaperScoreChanges(lastRenderedPaperScores, state.papers);
    showNewPaperSlotUnlocks(state);
    lastRenderedPaperScores = new Map(state.papers.map((paper) => [
      paper.id,
      [paper.idea, paper.experiment, paper.writing],
    ]));
    resetEffectSourceUi();
    scheduleAllFixedStageScales();
    if (shouldAnimatePlayer && previousRenderedPlayer) {
      animatePlayerStatChanges(previousRenderedPlayer, state.player);
    }
    lastRenderedPlayer = { ...state.player };

    if (!queuedSetupPortraitWarmup && state.phase === "setup") {
      queuedSetupPortraitWarmup = true;
      window.setTimeout(() => {
        warmRoleDetailPortraits(ROLE_IDS_IN_DISPLAY_ORDER);
      }, 0);
    }
  };

  store.subscribe(render);

  root.addEventListener("toggle", (event) => {
    const openedAchievement = event.target;
    if (!(openedAchievement instanceof HTMLDetailsElement)) return;
    if (!openedAchievement.matches(".lobby-profile-achievement[open]")) return;

    root.querySelectorAll<HTMLDetailsElement>(".lobby-profile-achievement[open]").forEach((achievement) => {
      if (achievement !== openedAchievement) {
        achievement.open = false;
      }
    });
  }, true);

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

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (suppressTimelineClick && target.closest(".event-timeline-track")) {
      suppressTimelineClick = false;
      return;
    }
    suppressTimelineClick = false;

    const lobbyViewButton = target.closest<HTMLButtonElement>("button[data-ui-lobby-view]");
    if (lobbyViewButton && !lobbyViewButton.disabled && isLobbyViewId(lobbyViewButton.dataset.uiLobbyView)) {
      activeLobbyView = lobbyViewButton.dataset.uiLobbyView;
      render();
      return;
    }

    const lobbyInfoSectionButton = target.closest<HTMLButtonElement>("button[data-ui-lobby-info-section]");
    if (
      lobbyInfoSectionButton
      && !lobbyInfoSectionButton.disabled
      && isLobbyInfoSectionId(lobbyInfoSectionButton.dataset.uiLobbyInfoSection)
    ) {
      activeLobbyInfoSection = lobbyInfoSectionButton.dataset.uiLobbyInfoSection;
      render();
      return;
    }

    const openFeedbackButton = target.closest<HTMLButtonElement>("button[data-ui-open-feedback]");
    if (openFeedbackButton && !openFeedbackButton.disabled) {
      isFeedbackOpen = true;
      render();
      return;
    }

    const closeFeedbackButton = target.closest<HTMLButtonElement>("button[data-ui-close-feedback]");
    if (closeFeedbackButton && !closeFeedbackButton.disabled) {
      isFeedbackOpen = false;
      render();
      return;
    }

    const playTabButton = target.closest<HTMLButtonElement>("button[data-ui-play-tab]");
    if (playTabButton && !playTabButton.disabled && isPlayTabId(playTabButton.dataset.uiPlayTab)) {
      activePlayTab = playTabButton.dataset.uiPlayTab;
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
      activeShopTab = normalizeShopTab(shopTabButton.dataset.uiShopTab);
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

    const talentTabButton = target.closest<HTMLButtonElement>("button[data-ui-talent-tab]");
    if (talentTabButton && !talentTabButton.disabled && isTalentPanelTabId(talentTabButton.dataset.uiTalentTab)) {
      activeTalentTab = talentTabButton.dataset.uiTalentTab;
      render();
      return;
    }

    const researchPageButton = target.closest<HTMLButtonElement>("button[data-ui-research-page]");
    if (researchPageButton && !researchPageButton.disabled) {
      const nextIndex = Number(researchPageButton.dataset.uiResearchPage ?? "");
      if (Number.isFinite(nextIndex) && nextIndex >= 0) {
        currentResearchPaperIndex = Math.floor(nextIndex);
        render();
      }
      return;
    }

    const researchIndexButton = target.closest<HTMLButtonElement>("button[data-ui-research-index]");
    if (researchIndexButton && !researchIndexButton.disabled) {
      const nextIndex = Number(researchIndexButton.dataset.uiResearchIndex ?? "");
      if (Number.isFinite(nextIndex) && nextIndex >= 0) {
        currentResearchPaperIndex = Math.floor(nextIndex);
        render();
      }
      return;
    }

    const researchSortButton = target.closest<HTMLButtonElement>("button[data-ui-research-sort]");
    if (researchSortButton) {
      const nextMode = researchSortButton.dataset.uiResearchSort;
      if (nextMode === "year" || nextMode === "citations") {
        researchSortMode = nextMode;
        currentResearchPaperIndex = 0;
        render();
      }
      return;
    }

    const researchAuthorshipButton = target.closest<HTMLButtonElement>("button[data-ui-research-authorship]");
    if (researchAuthorshipButton) {
      const nextFilter = researchAuthorshipButton.dataset.uiResearchAuthorship;
      if (nextFilter === "first" || nextFilter === "coauthor") {
        researchAuthorshipFilter = researchAuthorshipFilter === nextFilter ? "all" : nextFilter;
        currentResearchPaperIndex = 0;
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

    const timelineMarker = target.closest<HTMLButtonElement>("button[data-ui-log-page-index]");
    if (timelineMarker && !timelineMarker.disabled) {
      const nextPageIndex = Number(timelineMarker.dataset.uiLogPageIndex ?? "");
      if (Number.isFinite(nextPageIndex) && nextPageIndex >= 0) {
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

    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) return;

    const actionId = button.dataset.action;
    if (!isGameActionId(actionId)) return;

    if (actionId === "next-month" || actionId === "force-next-month") {
      animateEventPanelAfterNextMonth = activePlayTab === "events";
    }
    if (actionId === "restart-game") {
      skipNextPlayerAnimation = true;
    }
    if (actionId === "upgrade-shop-item" && button.dataset.shopUpgradeId?.startsWith("chair-")) {
      selectedChairUpgradeId = null;
    }
    if (actionId === "upgrade-coffee-machine") {
      selectedCoffeeUpgradeId = null;
    }
    if (actionId === "sell-shop-item" && button.dataset.shopItemId === "chair") {
      selectedChairUpgradeId = null;
    }
    if (actionId === "sell-coffee-machine") {
      selectedCoffeeUpgradeId = null;
    }

    store.dispatch(actionId, {
      roleId: isRoleId(button.dataset.roleId) ? button.dataset.roleId : undefined,
      paperId: typeof button.dataset.paperId === "string" ? button.dataset.paperId : undefined,
      paperSlotIndex: typeof button.dataset.paperSlotIndex === "string" ? Number(button.dataset.paperSlotIndex) : undefined,
      paperActionType: isPaperActionType(button.dataset.paperActionType) ? button.dataset.paperActionType : undefined,
      paperTarget: isPaperTarget(button.dataset.paperTarget) ? button.dataset.paperTarget : undefined,
      journalTarget: isJournalTarget(button.dataset.journalTarget) ? button.dataset.journalTarget : undefined,
      promotionId: isPaperPromotionId(button.dataset.promotionId) ? button.dataset.promotionId : undefined,
      eventId: typeof button.dataset.eventId === "string" ? button.dataset.eventId : undefined,
      eventChoiceId: typeof button.dataset.eventChoiceId === "string" ? button.dataset.eventChoiceId : undefined,
      debugStatId: isDebugStatId(button.dataset.debugStatId) ? button.dataset.debugStatId : undefined,
      debugPaperTarget: isPaperTarget(button.dataset.debugPaperTarget) ? button.dataset.debugPaperTarget : undefined,
      debugJournalTarget: isJournalTarget(button.dataset.debugJournalTarget) ? button.dataset.debugJournalTarget : undefined,
      debugPaperAuthorship: isDebugPaperAuthorship(button.dataset.debugPaperAuthorship) ? button.dataset.debugPaperAuthorship : undefined,
      delta: typeof button.dataset.delta === "string" ? Number(button.dataset.delta) : undefined,
      dateDisplayMode: isDateDisplayMode(button.dataset.dateDisplayMode) ? button.dataset.dateDisplayMode : undefined,
      shopItemId: typeof button.dataset.shopItemId === "string" ? button.dataset.shopItemId as ShopItemId : undefined,
      shopUpgradeId: typeof button.dataset.shopUpgradeId === "string"
        ? button.dataset.shopUpgradeId as ShopUpgradeId | Exclude<CoffeeMachineUpgradeId, null>
        : undefined,
      aiSlotId: typeof button.dataset.aiSlotId === "string" ? button.dataset.aiSlotId as AiSlotId : undefined,
      supportItemId: typeof button.dataset.supportItemId === "string" ? button.dataset.supportItemId as SupportItemId : undefined,
    });
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.dataset.uiLayoutToggle === "debug-event-rail") {
      showDebugEventRail = target.checked;
      render();
      return;
    }
    if (target.dataset.uiLayoutToggle === "debug-bottom-bar") {
      showDebugBottomBar = target.checked;
      render();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isFeedbackOpen) return;
    isFeedbackOpen = false;
    render();
  });
}
