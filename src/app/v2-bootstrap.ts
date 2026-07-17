import { createStore } from "../core/v2-store";
import { getCurrentEvent, getSortedEventQueue } from "../core/v2-event-queue";
import { getRoleOptions } from "../core/v2-progression";
import type {
  AdvisorId,
  DebugStatId,
  GameActionId,
  GameState,
  ManualSlotId,
  RoleId,
  ShopItemId,
  ShopUpgradeId,
  SupportItemId,
} from "../core/v2-types";
import {
  renderApp,
  type TalentPanelTabId,
  WORKSTATION_CONFERENCE_PANEL_INDEX,
  WORKSTATION_GRADUATION_PANEL_INDEX,
  type ResearchPaperFilterId,
} from "./v2-render";
import { normalizeShopTab, type ShopTabId } from "./v2-render-shop-panel";
import { warmRoleDetailPortraits } from "./v2-role-portrait-assets";

const ROLE_IDS = new Set<RoleId>(getRoleOptions().map((role) => role.id));
const ROLE_IDS_IN_DISPLAY_ORDER = getRoleOptions().map((role) => role.id);
const PLAY_TAB_IDS = new Set(["events", "workstation", "relationship", "shop", "research", "talent", "settings"] as const);
const SHOP_TAB_IDS = new Set(["ai", "rest", "coffee", "display", "outdoor", "misc"] as const);
const TALENT_PANEL_TAB_IDS = new Set(["character", "relation", "equip"] as const);
const RESEARCH_PAPER_FILTER_IDS = new Set(["S", "A", "B", "C"] as const);
const DEFAULT_RESEARCH_PAPER_FILTER: ResearchPaperFilterId = "C";
const SETUP_STAGE_WIDTH = 1460;
const PLAY_STAGE_WIDTH = 1540;

function isRoleId(value: string | undefined): value is RoleId {
  return Boolean(value) && ROLE_IDS.has(value as RoleId);
}

type PlayTabId = "events" | "workstation" | "relationship" | "shop" | "research" | "talent" | "settings";

function isPlayTabId(value: string | undefined): value is PlayTabId {
  return Boolean(value) && PLAY_TAB_IDS.has(value as PlayTabId);
}

function isShopTabId(value: string | undefined): value is ShopTabId {
  return Boolean(value) && SHOP_TAB_IDS.has(value as ShopTabId);
}

function isTalentPanelTabId(value: string | undefined): value is TalentPanelTabId {
  return Boolean(value) && TALENT_PANEL_TAB_IDS.has(value as TalentPanelTabId);
}

function isResearchPaperFilterId(value: string | undefined): value is ResearchPaperFilterId {
  return Boolean(value) && RESEARCH_PAPER_FILTER_IDS.has(value as ResearchPaperFilterId);
}

function getResearchPaperFilter(paper: Pick<GameState["papers"][number], "target">): ResearchPaperFilterId {
  return paper.target ?? "S";
}

function getFilteredResearchPapers(
  state: Pick<GameState, "papers" | "externalPublications">,
  filter: ResearchPaperFilterId,
): GameState["papers"] {
  return [...state.papers, ...state.externalPublications].filter(
    (paper) => paper.status === "published" && getResearchPaperFilter(paper) === filter,
  );
}

export function bootstrapApp(root: HTMLDivElement): void {
  const store = createStore();
  let queuedSetupPortraitWarmup = false;
  let fixedStageScaleFrame = 0;
  let activePlayTab: PlayTabId = "events";
  let activeShopTab: ShopTabId = "ai";
  let activeTalentTab: TalentPanelTabId = "character";
  let activeWorkstationPanelIndex = WORKSTATION_CONFERENCE_PANEL_INDEX;
  let conferenceMonthOffset = 0;
  let isEventContentOpen = false;
  let activeEventId: string | null = null;
  let activeEventChainId: string | null = null;
  let activeLogPage: number | null = null;
  let activeRelationshipIndex = 0;
  let currentResearchPaperFilter: ResearchPaperFilterId = DEFAULT_RESEARCH_PAPER_FILTER;
  let currentResearchPaperIndex = 0;
  let lastLogSignature = "";
  let lastPhase = store.getState().phase;

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
    });
  };

  const resizeObserver = new ResizeObserver(() => {
    scheduleAllFixedStageScales();
  });
  resizeObserver.observe(root);
  window.addEventListener("resize", scheduleAllFixedStageScales);
  window.visualViewport?.addEventListener("resize", scheduleAllFixedStageScales);

  const syncPlayTabUi = (): void => {
    if (store.getState().phase !== "playing") {
      return;
    }

    root.querySelectorAll<HTMLButtonElement>("button[data-ui-play-tab]").forEach((button) => {
      const isActive = button.dataset.uiPlayTab === activePlayTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    root.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach((panel) => {
      const isActive = panel.dataset.tabPanel === activePlayTab;
      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });
  };

  const resetEffectSourceUi = (): void => {
    root.querySelectorAll<HTMLElement>(".new-effect-list .effect-chip.is-selected").forEach((chip) => {
      chip.classList.remove("is-selected");
      chip.setAttribute("aria-pressed", "false");
    });

    const sourceBox = root.querySelector<HTMLElement>("#new-effect-source-box");
    if (!sourceBox) return;
    sourceBox.innerHTML = '<div class="effect-source-text effect-source-text-empty">点击上方效果查看来源</div>';
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
    if (sources.length === 0) {
      sources = ["暂无来源"];
    }

    root.querySelectorAll<HTMLElement>(".new-effect-list .effect-chip.is-selected").forEach((node) => {
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
    activeEventChainId = null;
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

  const openEventContent = (eventId: string): void => {
    if (isEventContentOpen) {
      return;
    }

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
    activeEventChainId = nextEvent.chainId;
    render();
  };

  const closeEventContent = (): void => {
    const state = store.getState();
    const openEvent = getActiveQueueEvent(state) ?? getActiveChainEvent(state);
    if (openEvent?.stage === "result") {
      return;
    }

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
      return;
    }

    const activeQueueEvent = getActiveQueueEvent(state);
    if (activeQueueEvent) {
      activeEventChainId = activeQueueEvent.chainId;
      return;
    }

    const nextChainEvent = getActiveChainEvent(state);
    if (nextChainEvent) {
      activeEventId = nextChainEvent.id;
      return;
    }

    resetEventContentUiState();
  };

  const syncLogUiState = (): void => {
    const state = store.getState();
    const nextLogSignature = `${state.log.length}:${state.log[0]?.id ?? ""}:${state.log[state.log.length - 1]?.id ?? ""}`;
    if (nextLogSignature !== lastLogSignature) {
      activeLogPage = null;
      lastLogSignature = nextLogSignature;
    }
  };

  const syncResearchUiState = (): void => {
    const state = store.getState();
    if (state.phase !== "playing") {
      currentResearchPaperFilter = DEFAULT_RESEARCH_PAPER_FILTER;
      currentResearchPaperIndex = 0;
      return;
    }

    const filteredPapers = getFilteredResearchPapers(state, currentResearchPaperFilter);
    if (filteredPapers.length === 0) {
      currentResearchPaperIndex = 0;
      return;
    }

    currentResearchPaperIndex = Math.min(
      Math.max(currentResearchPaperIndex, 0),
      filteredPapers.length - 1,
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
    if (state.phase !== lastPhase) {
      if (state.phase === "playing") {
        activePlayTab = "events";
        activeShopTab = "ai";
        activeTalentTab = "character";
        activeWorkstationPanelIndex = WORKSTATION_CONFERENCE_PANEL_INDEX;
        conferenceMonthOffset = 0;
        resetEventContentUiState();
        activeLogPage = null;
        activeRelationshipIndex = 0;
        currentResearchPaperFilter = DEFAULT_RESEARCH_PAPER_FILTER;
        currentResearchPaperIndex = 0;
      } else if (state.phase === "setup") {
        activePlayTab = "events";
        activeShopTab = "ai";
        activeTalentTab = "character";
        activeWorkstationPanelIndex = WORKSTATION_CONFERENCE_PANEL_INDEX;
        conferenceMonthOffset = 0;
        resetEventContentUiState();
        activeLogPage = null;
        activeRelationshipIndex = 0;
        currentResearchPaperFilter = DEFAULT_RESEARCH_PAPER_FILTER;
        currentResearchPaperIndex = 0;
      }
      lastPhase = state.phase;
    }

    syncEventContentUiState();
    syncLogUiState();
    syncResearchUiState();
    syncRelationshipUiState();
    root.dataset.phase = state.phase;
    root.innerHTML = renderApp(state, store.getAccountProfile(), {
      isEventContentOpen,
      activeEventId,
      activeLogPage,
      activeRelationshipIndex,
      activeShopTab,
      activeTalentTab,
      activeWorkstationPanelIndex,
      conferenceMonthOffset,
      currentResearchPaperFilter,
      currentResearchPaperIndex,
    });
    syncPlayTabUi();
    resetEffectSourceUi();
    scheduleAllFixedStageScales();

    if (!queuedSetupPortraitWarmup && state.phase === "setup") {
      queuedSetupPortraitWarmup = true;
      window.setTimeout(() => {
        warmRoleDetailPortraits(ROLE_IDS_IN_DISPLAY_ORDER);
      }, 0);
    }
  };

  store.subscribe(render);

  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const playTabButton = target.closest<HTMLButtonElement>("button[data-ui-play-tab]");
    if (playTabButton && !playTabButton.disabled && isPlayTabId(playTabButton.dataset.uiPlayTab)) {
      activePlayTab = playTabButton.dataset.uiPlayTab;
      syncPlayTabUi();
      return;
    }

    const shopTabButton = target.closest<HTMLButtonElement>("button[data-ui-shop-tab]");
    if (shopTabButton && !shopTabButton.disabled && isShopTabId(shopTabButton.dataset.uiShopTab)) {
      activeShopTab = normalizeShopTab(shopTabButton.dataset.uiShopTab);
      render();
      return;
    }

    const talentTabButton = target.closest<HTMLButtonElement>("button[data-ui-talent-tab]");
    if (talentTabButton && !talentTabButton.disabled && isTalentPanelTabId(talentTabButton.dataset.uiTalentTab)) {
      activeTalentTab = talentTabButton.dataset.uiTalentTab;
      render();
      return;
    }

    const researchFilterButton = target.closest<HTMLButtonElement>("button[data-ui-research-filter]");
    if (
      researchFilterButton
      && !researchFilterButton.disabled
      && isResearchPaperFilterId(researchFilterButton.dataset.uiResearchFilter)
    ) {
      const nextFilter = researchFilterButton.dataset.uiResearchFilter;
      if (currentResearchPaperFilter !== nextFilter) {
        currentResearchPaperFilter = nextFilter;
        currentResearchPaperIndex = 0;
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

    const closeEventButton = target.closest<HTMLButtonElement>("button[data-ui-close-event-content]");
    if (closeEventButton && !closeEventButton.disabled) {
      closeEventContent();
      return;
    }

    const logNavButton = target.closest<HTMLButtonElement>("button[data-ui-log-nav]");
    if (logNavButton && !logNavButton.disabled) {
      const logPanel = root.querySelector<HTMLElement>(".log-panel[data-log-page-index][data-log-page-count]");
      const pageIndex = Number(logPanel?.dataset.logPageIndex ?? "0");
      const pageCount = Number(logPanel?.dataset.logPageCount ?? "0");
      const lastPageIndex = Math.max(0, pageCount - 1);
      const currentPageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.min(pageIndex, lastPageIndex)) : 0;
      const navType = logNavButton.dataset.uiLogNav;

      if (navType === "first") {
        activeLogPage = 0;
      } else if (navType === "prev") {
        activeLogPage = Math.max(0, currentPageIndex - 1);
      } else if (navType === "next") {
        activeLogPage = Math.min(lastPageIndex, currentPageIndex + 1);
      } else if (navType === "last") {
        activeLogPage = lastPageIndex;
      }

      render();
      return;
    }

    const workstationPanelButton = target.closest<HTMLButtonElement>("button[data-ui-workstation-panel-index]");
    if (workstationPanelButton && !workstationPanelButton.disabled) {
      const nextPanelIndex = Number(workstationPanelButton.dataset.uiWorkstationPanelIndex ?? "");
      if (!Number.isInteger(nextPanelIndex)) {
        return;
      }

      activeWorkstationPanelIndex = nextPanelIndex;

      if (nextPanelIndex === WORKSTATION_CONFERENCE_PANEL_INDEX || nextPanelIndex === WORKSTATION_GRADUATION_PANEL_INDEX) {
        render();
        return;
      }

      const state = store.getState();
      const paper = state.papers[nextPanelIndex] ?? null;
      if (paper) {
        store.dispatch("select-paper", { paperId: paper.id });
        return;
      }

      render();
      return;
    }

    const conferenceOffsetButton = target.closest<HTMLButtonElement>("button[data-ui-conference-offset]");
    if (conferenceOffsetButton && !conferenceOffsetButton.disabled) {
      const delta = Number(conferenceOffsetButton.dataset.uiConferenceOffset ?? "");
      if (!Number.isFinite(delta) || delta === 0) {
        return;
      }

      conferenceMonthOffset = Math.max(0, Math.min(11, conferenceMonthOffset + Math.trunc(delta)));
      render();
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.disabled) return;

    const actionId = button.dataset.action as GameActionId | undefined;
    if (!actionId) return;

    store.dispatch(actionId, {
      roleId: isRoleId(button.dataset.roleId) ? button.dataset.roleId : undefined,
      advisorId: typeof button.dataset.advisorId === "string" ? button.dataset.advisorId as AdvisorId : undefined,
      paperId: typeof button.dataset.paperId === "string" ? button.dataset.paperId : undefined,
      eventId: typeof button.dataset.eventId === "string" ? button.dataset.eventId : undefined,
      eventChoiceId: typeof button.dataset.eventChoiceId === "string" ? button.dataset.eventChoiceId : undefined,
      manualSlot: typeof button.dataset.manualSlot === "string" ? Number(button.dataset.manualSlot) as ManualSlotId : undefined,
      relationshipId: typeof button.dataset.relationshipId === "string" ? button.dataset.relationshipId : undefined,
      shopItemId: typeof button.dataset.shopItemId === "string" ? button.dataset.shopItemId as ShopItemId : undefined,
      shopUpgradeId: typeof button.dataset.shopUpgradeId === "string" ? button.dataset.shopUpgradeId as ShopUpgradeId : undefined,
      supportItemId: typeof button.dataset.supportItemId === "string" ? button.dataset.supportItemId as SupportItemId : undefined,
      debugStatId: typeof button.dataset.debugStatId === "string" ? button.dataset.debugStatId as DebugStatId : undefined,
      delta: typeof button.dataset.delta === "string" ? Number(button.dataset.delta) : undefined,
    });
  });
}
