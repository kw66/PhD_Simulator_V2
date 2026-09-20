import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebugWindow, isDebugWindowActionData } from "../src/app/v2-debug-window";
import { renderDebugPanel } from "../src/app/v2-render-debug-panel";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { DEBUG_EVENT_GROUPS, DEBUG_MONTH_DELTAS, DEBUG_STAT_GROUPS } from "../src/core/v2-debug-tools";

afterEach(() => vi.unstubAllGlobals());

describe("independent debug window", () => {
  it("includes every former debug control and displays current game attributes", () => {
    const state = createStartedGameState("normal");
    state.player.money = 42;
    const html = renderDebugPanel(state, true);
    expect(html).toContain('data-debug-value="money">42</b>');
    for (const group of DEBUG_EVENT_GROUPS) {
      for (const item of group.buttons) expect(html).toContain(`data-event-id="${item.id}"`);
    }
    for (const group of DEBUG_STAT_GROUPS) {
      for (const delta of group.deltas) expect(html).toContain(`data-debug-stat-id="${group.statId}" data-delta="${delta}"`);
    }
    for (const delta of DEBUG_MONTH_DELTAS) expect(html).toContain(`data-action="debug-shift-month" data-delta="${delta}"`);
    expect(html.match(/data-action="debug-add-paper"/g)).toHaveLength(12);
    expect(html.match(/data-action="debug-add-relationship"/g)).toHaveLength(4);
    for (const action of ["force-next-month", "debug-add-all-buffs", "restart-game", "reset-game"]) {
      expect(html).toContain(`data-action="${action}"`);
    }
  });

  it("disables tools on disconnection or outside a running game and escapes status logs", () => {
    const state = createStartedGameState("normal");
    state.log = [{ id: "unsafe", month: 0, text: '<script>alert("test")</script>' }];
    const disconnected = renderDebugPanel(state, false);
    expect(disconnected).toContain('<fieldset class="debug-popup-tools" disabled>');
    expect(disconnected).toContain('data-action="restart-game" disabled');
    expect(disconnected).toContain("主游戏已断开");
    expect(disconnected).not.toContain('<script>');
    expect(renderDebugPanel({ ...state, phase: "setup" }, true)).toContain('<fieldset class="debug-popup-tools" disabled>');
  });

  it("only accepts debug tool actions with string payloads", () => {
    expect(isDebugWindowActionData({ action: "debug-adjust-stat", debugStatId: "money", delta: "1" })).toBe(true);
    expect(isDebugWindowActionData({ action: "submit-paper", paperId: "1" })).toBe(false);
    expect(isDebugWindowActionData({ action: "debug-adjust-stat", delta: {} })).toBe(false);
    expect(isDebugWindowActionData(null)).toBe(false);
  });

  it("reuses one popup, syncs state and rejects commands from another window or channel", () => {
    const state = createStartedGameState("normal");
    const popup = { closed: false, focus: vi.fn(), postMessage: vi.fn() };
    const handlers = new Map<string, (event: any) => void>();
    const open = vi.fn((_url: string) => popup);
    vi.stubGlobal("window", {
      location: { origin: "https://example.test", href: "https://example.test/PhD_Simulator_V2/" },
      open, addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
    });
    const dispatch = vi.fn();
    const control = createDebugWindow(() => state, dispatch);
    expect(control.open()).toBe(true);
    const url = new URL(open.mock.calls[0]![0] as string);
    expect(url.pathname).toBe("/PhD_Simulator_V2/");
    const channel = url.searchParams.get("debugPanel");
    expect(channel).toBeTruthy();
    const message = { source: popup, origin: "https://example.test", data: { channel, type: "debug-ready" } };
    handlers.get("message")!(message);
    expect(popup.postMessage).toHaveBeenLastCalledWith({ channel, type: "debug-state", state, revision: 0 }, "https://example.test");
    control.open();
    expect(open).toHaveBeenCalledTimes(1);
    control.update();
    expect(popup.postMessage).toHaveBeenLastCalledWith({ channel, type: "debug-state", state, revision: 1 }, "https://example.test");
    const command = { ...message, data: { channel, type: "debug-action", data: { action: "debug-adjust-stat", debugStatId: "money", delta: "1" } } };
    handlers.get("message")!({ ...command, source: {} });
    handlers.get("message")!({ ...command, origin: "https://other.test" });
    handlers.get("message")!({ ...command, data: { ...command.data, channel: "other" } });
    expect(dispatch).not.toHaveBeenCalled();
    handlers.get("message")!(command);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(command.data.data);
    handlers.get("pagehide")!({});
    expect(popup.postMessage).toHaveBeenLastCalledWith({ channel, type: "debug-disconnected" }, "https://example.test");
    popup.closed = true;
    control.open();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("reports popup blocking so the main window can offer a retry", () => {
    vi.stubGlobal("window", { location: { origin: "https://example.test", href: "https://example.test/" }, open: () => null, addEventListener: vi.fn() });
    expect(createDebugWindow(() => createStartedGameState("normal"), vi.fn()).open()).toBe(false);
  });
});
