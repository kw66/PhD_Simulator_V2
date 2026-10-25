import { getEventQueuePriority, getSortedEventQueue } from "../core/v2-event-queue";
import { isLinearEvent } from "../core/v2-event-auto-resolution";
import type { GameState } from "../core/v2-types";
import type { PlayRenderUiState } from "./v2-render-types";
import { getPlayHelpContext, getPlayHelpPageIndex } from "./v2-play-help";

export interface ReplayNavigationStep {
  selector: string;
  patch: Partial<PlayRenderUiState>;
  paperId?: string;
}
const attr = (name: string, value: string | number): string => `[data-${name}="${CSS.escape(String(value))}"]`;
const closedEvent = { isEventContentOpen: false, activeEventId: null, activeEventHistoryId: null, activeEventHistoryIndex: null };

/** One real interface button at a time. No simulation commands run here. */
export function getReplayNavigationStep(root: ParentNode, state: GameState, current: PlayRenderUiState,
  desired: PlayRenderUiState, paperId?: string, viewedPaperId?: string | null): ReplayNavigationStep | null {
  const step = (selector: string, patch: Partial<PlayRenderUiState>, selectedPaper?: string): ReplayNavigationStep => ({ selector, patch, paperId: selectedPaper });
  const tab = current.activePlayTab ?? "events";
  const nextTab = desired.activePlayTab ?? tab;
  if (current.isHelpOpen && (!desired.isHelpOpen || tab !== nextTab)) return step('#play-help-panel [data-ui-help-toggle]', { isHelpOpen: false });
  if (current.isQuitConfirmationOpen && !desired.isQuitConfirmationOpen) return step("[data-ui-cancel-quit]", { isQuitConfirmationOpen: false });
  if (current.isEndingContentOpen && (!desired.isEndingContentOpen || tab !== nextTab)) return step("[data-ui-close-ending-content]", { isEndingContentOpen: false });
  if (current.isEventContentOpen && (!desired.isEventContentOpen || current.activeEventId !== desired.activeEventId
    || current.activeEventHistoryId !== desired.activeEventHistoryId || tab !== nextTab)) {
    if (root.querySelector("#event-content-box:not([hidden]) [data-ui-close-event-content]")) return step("#event-content-box:not([hidden]) [data-ui-close-event-content]", closedEvent);
  }
  if (tab !== nextTab) return step(attr("ui-play-tab", nextTab), { activePlayTab: nextTab, ...closedEvent, isEndingContentOpen: false });
  if (nextTab === "shop" && (current.activeShopTab ?? "gear") !== (desired.activeShopTab ?? "gear")) {
    return step(attr("ui-shop-tab", desired.activeShopTab ?? "gear"), { activeShopTab: desired.activeShopTab, selectedChairUpgradeId: null, selectedCoffeeUpgradeId: null });
  }
  if (nextTab === "talent" && (current.activeTalentTab ?? "character") !== (desired.activeTalentTab ?? "character")) {
    return step(attr("ui-talent-tab", desired.activeTalentTab ?? "character"), { activeTalentTab: desired.activeTalentTab });
  }
  if (desired.isEndingContentOpen && !current.isEndingContentOpen) return step("[data-ui-open-ending-content]", { isEndingContentOpen: true });
  if (desired.isEventContentOpen && desired.activeEventId && (!current.isEventContentOpen || current.activeEventId !== desired.activeEventId)) {
    const entry = attr("ui-open-event-id", desired.activeEventId);
    if (root.querySelector(entry)) return step(entry, { ...closedEvent, isEventContentOpen: true, activeEventId: desired.activeEventId });
    const events = getSortedEventQueue(state.eventQueue).sort((left, right) => getEventQueuePriority(left) - getEventQueuePriority(right)
      || left.deadlineMonths - right.deadlineMonths || Number(isLinearEvent(state, left)) - Number(isLinearEvent(state, right)));
    const index = events.findIndex(event => event.id === desired.activeEventId);
    const page = Number(root.querySelector<HTMLElement>("[data-pending-page-index]")?.dataset.pendingPageIndex ?? 0);
    const targetPage = Math.floor(index / 6);
    if (index >= 0 && page !== targetPage) return step(attr("ui-pending-nav", page < targetPage ? "next" : "prev"), { activePendingPage: page + (page < targetPage ? 1 : -1) });
  }
  if (desired.isEventContentOpen && desired.activeEventHistoryId && !current.isEventContentOpen) {
    return step(attr("ui-open-event-history-id", desired.activeEventHistoryId), { ...closedEvent, isEventContentOpen: true, activeEventHistoryId: desired.activeEventHistoryId });
  }
  if (desired.isEventContentOpen && (desired.activeEventHistoryIndex ?? null) !== (current.activeEventHistoryIndex ?? null)) {
    const targetIndex = desired.activeEventHistoryIndex ?? state.eventQueue.find(event => event.id === desired.activeEventId)?.history?.length ?? 0;
    return step(attr("ui-event-scene-index", targetIndex), { activeEventHistoryIndex: desired.activeEventHistoryIndex });
  }
  if (desired.isEventContentOpen && desired.activeRewinderAct && (current.activeRewinderAct ?? "attributes") !== desired.activeRewinderAct
    && root.querySelector("[data-ui-rewinder-act]")) return step(attr("ui-rewinder-act", desired.activeRewinderAct), { activeRewinderAct: desired.activeRewinderAct });
  if (desired.academicArchiveAct !== undefined && (current.academicArchiveAct ?? 0) !== desired.academicArchiveAct
    && root.querySelector("[data-ui-academic-archive-act]")) {
    const at = current.academicArchiveAct ?? 0;
    const next = at + (at < desired.academicArchiveAct ? 1 : -1);
    return step(attr("ui-academic-archive-act", next), { academicArchiveAct: next as PlayRenderUiState["academicArchiveAct"] });
  }
  if (nextTab === "workstation" && paperId && (viewedPaperId ?? state.selectedPaperId) !== paperId) {
    return step(attr("ui-select-workstation-paper", paperId), {}, paperId);
  }
  if (nextTab === "shop") {
    if (desired.activeShopTab === "rest" && desired.selectedChairUpgradeId && desired.selectedChairUpgradeId !== current.selectedChairUpgradeId) return step(attr("ui-select-chair-upgrade", desired.selectedChairUpgradeId), { selectedChairUpgradeId: desired.selectedChairUpgradeId });
    if (desired.activeShopTab === "coffee" && desired.selectedCoffeeUpgradeId && desired.selectedCoffeeUpgradeId !== current.selectedCoffeeUpgradeId) return step(attr("ui-select-coffee-upgrade", desired.selectedCoffeeUpgradeId), { selectedCoffeeUpgradeId: desired.selectedCoffeeUpgradeId });
  }
  if (nextTab === "research") {
    if ((current.researchSortMode ?? "year") !== (desired.researchSortMode ?? "year")) return step(attr("ui-research-sort", desired.researchSortMode ?? "year"), { researchSortMode: desired.researchSortMode, currentResearchPaperIndex: null, researchPageIndex: 0 });
    const paper = desired.currentResearchPaperIndex;
    if (paper != null) {
      const page = current.researchPageIndex ?? Math.floor((current.currentResearchPaperIndex ?? 0) / 5);
      const nextPage = Math.floor(paper / 5);
      if (page !== nextPage) {
        const next = page + (page < nextPage ? 1 : -1);
        return step(attr("ui-research-page", next * 5), { researchPageIndex: next, currentResearchPaperIndex: null });
      }
      if (current.currentResearchPaperIndex !== paper && !(current.currentResearchPaperIndex === undefined && paper === 0)) return step(attr("ui-research-index", paper), { currentResearchPaperIndex: paper });
    }
  }
  if (desired.isQuitConfirmationOpen && !current.isQuitConfirmationOpen) return step('[data-action="quit-game"]', { isQuitConfirmationOpen: true });
  if (desired.isHelpOpen) {
    if (!current.isHelpOpen) return step('[data-replay-help] > [data-ui-help-toggle]', { isHelpOpen: true });
    const context = getPlayHelpContext(desired);
    const at = getPlayHelpPageIndex(context, current.helpPageByContext?.[context.key]);
    const to = getPlayHelpPageIndex(context, desired.helpPageByContext?.[context.key]);
    if (at !== to) {
      const next = at + (at < to ? 1 : -1);
      return step(attr("ui-help-page", next), { helpPageByContext: { ...current.helpPageByContext, [context.key]: next } });
    }
  }
  return null;
}
