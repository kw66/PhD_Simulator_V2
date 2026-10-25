import { afterEach, describe, expect, it, vi } from "vitest";
import { getReplayNavigationStep } from "../src/app/v2-replay-navigation";
import { createInitialState } from "../src/core/v2-engine";
import type { PlayRenderUiState } from "../src/app/v2-render-types";

describe("visible replay navigation", () => {
  afterEach(() => vi.unstubAllGlobals());
  function next(current: PlayRenderUiState, desired: PlayRenderUiState, selectors: string[] = []) {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    const root = { querySelector: (selector: string) => selectors.includes(selector) ? {} : null } as unknown as ParentNode;
    return getReplayNavigationStep(root, createInitialState(), current, desired);
  }
  it("closes an event, clicks the main tab, then the shop subtab before selecting an upgrade", () => {
    const desired: PlayRenderUiState = { activePlayTab: "shop", activeShopTab: "rest", selectedChairUpgradeId: "chair-massage" };
    let current: PlayRenderUiState = { activePlayTab: "events", activeEventId: "event", isEventContentOpen: true };
    const selectors = ['#event-content-box:not([hidden]) [data-ui-close-event-content]'];
    const actions: string[] = [];
    for (let count = 0; count < 4; count++) {
      const step = next(current, desired, selectors)!;
      actions.push(step.selector); current = { ...current, ...step.patch };
    }
    expect(actions).toEqual([selectors[0], '[data-ui-play-tab="shop"]', '[data-ui-shop-tab="rest"]', '[data-ui-select-chair-upgrade="chair-massage"]']);
    expect(next(current, desired)).toBeNull();
  });
  it("does not select an old chair route while switching to AI", () => {
    expect(next({ activePlayTab: "shop", activeShopTab: "ai" }, {
      activePlayTab: "shop", activeShopTab: "ai", selectedChairUpgradeId: "chair-massage",
    })).toBeNull();
  });
  it("opens the event through its actual pending button", () => {
    const entry = '[data-ui-open-event-id="event"]';
    const step = next({ activePlayTab: "events" }, { activePlayTab: "events", activeEventId: "event", isEventContentOpen: true }, [entry]);
    expect(step?.selector).toBe(entry);
    expect(step?.patch).toMatchObject({ isEventContentOpen: true, activeEventId: "event" });
  });
  it("opens quit confirmation before confirming the recorded action", () => {
    expect(next({ activePlayTab: "settings" }, { activePlayTab: "settings", isQuitConfirmationOpen: true })?.selector).toBe('[data-action="quit-game"]');
  });
  it("turns publication pages one at a time before selecting a paper", () => {
    const desired: PlayRenderUiState = { activePlayTab: "research", currentResearchPaperIndex: 12 };
    let current: PlayRenderUiState = { activePlayTab: "research", currentResearchPaperIndex: 0 };
    const actions: string[] = [];
    for (let count = 0; count < 3; count++) {
      const step = next(current, desired)!;
      actions.push(step.selector); current = { ...current, ...step.patch };
    }
    expect(actions).toEqual(['[data-ui-research-page="5"]', '[data-ui-research-page="10"]', '[data-ui-research-index="12"]']);
  });
  it("opens recorded help and turns its pages through buttons", () => {
    const desired: PlayRenderUiState = { activePlayTab: "workstation", isHelpOpen: true, helpPageByContext: { workstation: 2 } };
    let current: PlayRenderUiState = { activePlayTab: "workstation" };
    const actions: string[] = [];
    for (let count = 0; count < 3; count++) {
      const step = next(current, desired)!;
      actions.push(step.selector); current = { ...current, ...step.patch };
    }
    expect(actions).toEqual(['[data-replay-help] > [data-ui-help-toggle]', '[data-ui-help-page="1"]', '[data-ui-help-page="2"]']);
  });
});
