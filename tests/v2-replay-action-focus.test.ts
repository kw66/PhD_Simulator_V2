import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import type { ReplayCommand } from "../src/core/v2-run-replay";
import { getReplayActionTiming, prepareReplayActionView } from "../src/app/v2-replay-action-focus";

describe("replay action presentation", () => {
  it("leaves an old event view and selects the recorded paper without mutating the game", () => {
    const state = createInitialState();
    const original = structuredClone(state);
    const view = prepareReplayActionView(state, { kind: "action", actionId: "research-paper", payload: { paperId: "second-paper", paperActionType: "experiment" } },
      { activePlayTab: "events", activeEventId: "old-event", activeEventHistoryIndex: 1, isEventContentOpen: true, isHelpOpen: true });
    expect(view.paperId).toBe("second-paper");
    expect(view.ui).toMatchObject({ activePlayTab: "workstation", activeEventId: null, activeEventHistoryIndex: null, isEventContentOpen: false, isHelpOpen: false });
    expect(state).toEqual(original);
  });

  it("shows the historical choice when replaying it, but the current scene for the return button", () => {
    const state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    const eventId = state.eventQueue[0]!.id;
    const command: ReplayCommand = { kind: "action", actionId: "replay-event", payload: { eventId, eventHistoryIndex: 1, eventChoiceId: "choice" } };
    expect(prepareReplayActionView(state, command, {}).ui).toMatchObject({ activePlayTab: "events", activeEventId: eventId, activeEventHistoryIndex: 1, isEventContentOpen: true });
    delete command.payload.eventChoiceId;
    expect(prepareReplayActionView(state, command, {}).ui.activeEventHistoryIndex).toBeNull();
  });

  it.each([
    ["buy-shop-item", { shopItemId: "bike" }, "life"],
    ["sell-shop-item", { shopItemId: "gpu_buy" }, "gear"],
    ["toggle-ai-subscription", { aiSlotId: "deepseek" }, "ai"],
    ["buy-coffee", {}, "coffee"],
    ["buy-shop-item", { shopItemId: "chair" }, "rest"],
  ] as const)("reveals the correct shop page for %s", (actionId, payload, tab) => {
    const command = { kind: "action", actionId, payload } as ReplayCommand;
    expect(prepareReplayActionView(createInitialState(), command, { activePlayTab: "events" }).ui).toMatchObject({ activePlayTab: "shop", activeShopTab: tab });
  });

  it("shows choices in their actual academic archive acts", () => {
    const state = createInitialState();
    expect(prepareReplayActionView(state, { kind: "action", actionId: "select-rewinder-archive-papers", payload: { rewinderPaperSource: "previous" } }, {}).ui.academicArchiveAct).toBe(1);
    expect(prepareReplayActionView(state, { kind: "action", actionId: "toggle-rewinder-archive-person", payload: { rewinderPersonKey: "current:advisor" } }, {}).ui.academicArchiveAct).toBe(2);
  });

  it("gives non-event operations more viewing time than each individual event act", () => {
    const action = getReplayActionTiming({ kind: "action", actionId: "rest", payload: {} });
    const event = getReplayActionTiming({ kind: "action", actionId: "resolve-event", payload: {} });
    expect(action.previewMs).toBeGreaterThan(event.previewMs);
    expect(action.resultMs).toBeGreaterThan(event.resultMs);
    expect(action.resultMs).toBeGreaterThan(action.previewMs);
    expect(getReplayActionTiming({ kind: "action", actionId: "next-month", payload: {} })).toEqual({ previewMs: 0, resultMs: 0 });
    expect(getReplayActionTiming({ kind: "action", actionId: "select-paper", payload: { paperId: "paper-1" } }).resultMs).toBe(0);
  });
});
