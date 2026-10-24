import { getAcademicCalendarYear } from "../core/v2-calendar";
import { getConferenceInfo } from "../core/v2-conference-catalog";
import { getCalendarForTotalMonths } from "../core/v2-progression";
import type { ReplayCommand } from "../core/v2-run-replay";
import type { DispatchPayload, GameState, Paper } from "../core/v2-types";
import type { PlayRenderUiState } from "./v2-render-types";

const eventActions = new Set(["resolve-event", "replay-event", "rewinder-replay-event"]);
const workstationActions = new Set(["create-paper", "select-paper", "research-paper", "submit-paper", "submit-journal-paper", "withdraw-paper", "discard-paper", "reroll-paper-topic", "advance-thesis-point", "prepare-career", "read-paper", "part-time-work", "rest"]);

function publicationYear(state: GameState, paper: Paper): number {
  const calendar = paper.acceptedTotalMonths === undefined ? state : getCalendarForTotalMonths(paper.acceptedTotalMonths);
  const fallback = getAcademicCalendarYear(calendar.year, calendar.month);
  if (paper.journalTarget) return typeof paper.submittedYear === "number" && typeof paper.submittedMonth === "number"
    ? getAcademicCalendarYear(paper.submittedYear, paper.submittedMonth) : fallback;
  return paper.submittedMonth && paper.submittedYear
    ? getConferenceInfo(paper.submittedMonth, paper.target ?? "C", paper.submittedYear)?.year ?? fallback : fallback;
}

/** Reveal the recorded control before executing it, without changing simulation state. */
export function prepareReplayActionView(state: GameState, command: ReplayCommand, previous: PlayRenderUiState): { ui: PlayRenderUiState; paperId?: string } {
  const ui: PlayRenderUiState = { ...previous, activeLogPage: null, activeEventId: null,
    isReplay: true,
    activeEventHistoryId: null, activeEventHistoryIndex: null, isEventContentOpen: false,
    isEndingContentOpen: false, isHelpOpen: false, isQuitConfirmationOpen: false, isRunSavePanelOpen: false };
  if (command.kind === "help") return { ui: { ...ui, isHelpOpen: true } };
  const { actionId: action, payload } = command;
  if (eventActions.has(action)) {
    ui.activePlayTab = "events";
    ui.isEventContentOpen = true;
    ui.activeEventId = payload.eventId ?? state.eventQueue[0]?.id;
    // A rewind without a choice clicks the current result's return button.
    if (action !== "resolve-event" && payload.eventChoiceId) ui.activeEventHistoryIndex = payload.eventHistoryIndex ?? null;
    ui.activeRewinderAct = "relationships";
  } else if (workstationActions.has(action)) {
    ui.activePlayTab = "workstation";
  } else if (action === "promote-paper") {
    ui.activePlayTab = "research";
    ui.researchAuthorshipFilter = "all";
    ui.researchSortMode = "year";
    const papers = [...state.papers, ...state.externalPublications].filter(paper => paper.status === "published");
    const order = new Map(papers.map((paper, index) => [paper.id, index]));
    papers.sort((left, right) => publicationYear(state, right) - publicationYear(state, left)
      || (right.acceptedTotalMonths ?? 0) - (left.acceptedTotalMonths ?? 0)
      || (right.acceptedOrder ?? 0) - (left.acceptedOrder ?? 0)
      || order.get(right.id)! - order.get(left.id)!);
    ui.currentResearchPaperIndex = Math.max(0, papers.findIndex(paper => paper.id === payload.paperId));
    ui.researchPageIndex = undefined;
  } else if (["relationship-task", "advisor-project", "end-relationship"].includes(action) || action.startsWith("lover-")) {
    ui.activePlayTab = "relationship";
  } else if (action.includes("rewinder-archive")) {
    ui.academicArchiveAct = action === "select-rewinder-archive-papers" || action === "select-rewinder-archive-coffee" ? 1 : 2;
  } else if (action === "toggle-rewinder-person") {
    ui.activePlayTab = "events";
    ui.isEventContentOpen = true;
    ui.activeEventId = state.eventQueue.find(event => event.rewinderPresentation)?.id;
    ui.activeRewinderAct = "relationships";
  } else if (action.startsWith("buy-") || action.startsWith("sell-") || action.startsWith("upgrade-") || action.endsWith("-subscription")) {
    ui.activePlayTab = "shop";
    if (action.includes("coffee")) {
      ui.activeShopTab = "coffee";
      if (action === "upgrade-coffee-machine") ui.selectedCoffeeUpgradeId = payload.shopUpgradeId as PlayRenderUiState["selectedCoffeeUpgradeId"];
    } else if (action.includes("ai-")) ui.activeShopTab = "ai";
    else if (action === "upgrade-shop-item" || payload.shopItemId === "chair") {
      ui.activeShopTab = "rest";
      ui.selectedChairUpgradeId = payload.shopUpgradeId as PlayRenderUiState["selectedChairUpgradeId"];
    } else if (payload.supportItemId || ["bike", "ebike", "down_jacket"].includes(payload.shopItemId ?? "")) ui.activeShopTab = "life";
    else ui.activeShopTab = "gear";
  } else if (["quit-game", "set-date-display-mode"].includes(action)
    || action === "repay-debt" && payload.debtRepayment === undefined) {
    ui.activePlayTab = "settings";
    ui.isQuitConfirmationOpen = action === "quit-game";
  } else if (["set-linear-event-blocking", "set-event-intro-skipping"].includes(action)) ui.activePlayTab = "events";
  return { ui, paperId: payload.paperId };
}

const targetFields: readonly (keyof DispatchPayload)[] = ["paperId", "paperSlotIndex", "thesisPointIndex", "careerType", "paperActionType", "paperTarget", "journalTarget", "promotionId", "eventId", "eventChoiceId", "eventHistoryIndex", "relationshipId", "projectType", "rewinderPersonKey", "rewinderPaperSource", "rewinderCoffeeSource", "shopItemId", "shopUpgradeId", "aiSlotId", "supportItemId", "delta", "dateDisplayMode", "blockLinearEvents", "skipBranchEventIntro"];

function visible(element: HTMLElement): boolean {
  return !element.closest("[hidden]") && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== "hidden";
}

/** Match payload identity rather than the first button with the same action. */
export function getReplayActionTarget(root: ParentNode, command: ReplayCommand): HTMLElement | null {
  if (command.kind !== "action") return null;
  const { actionId, payload } = command;
  if (actionId === "select-paper") return [...root.querySelectorAll<HTMLElement>("[data-ui-select-workstation-paper]")]
    .find(element => element.dataset.uiSelectWorkstationPaper === payload.paperId && visible(element)) ?? null;
  const action = actionId === "rewinder-replay-event" ? "replay-event" : actionId;
  const candidates = [...root.querySelectorAll<HTMLElement>("[data-action]")].filter(element => element.dataset.action === action && visible(element));
  return candidates.find(element => targetFields.every(field => {
    const value = field === "delta" && actionId === "repay-debt" ? payload.debtRepayment ?? payload.delta : payload[field];
    if (value !== undefined) return element.dataset[field] === String(value);
    // Distinguish 'return to choices' from replaying an option, and full repayment from 1 coin.
    return field !== "eventChoiceId" && field !== "delta" || element.dataset[field] === undefined;
  })) ?? null;
}

export function getReplayActionTiming(command: ReplayCommand): { previewMs: number; resultMs: number } {
  if (command.kind === "action" && command.actionId === "next-month") return { previewMs: 0, resultMs: 0 };
  if (command.kind === "action" && ["select-paper", "set-date-display-mode", "set-linear-event-blocking", "set-event-intro-skipping"].includes(command.actionId)) {
    return { previewMs: 200, resultMs: 0 };
  }
  return command.kind === "action" && eventActions.has(command.actionId)
    ? { previewMs: 300, resultMs: 900 }
    : { previewMs: 450, resultMs: 1800 };
}
