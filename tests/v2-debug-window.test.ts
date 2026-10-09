import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapDebugWindow, createDebugWindow, isDebugWindowActionData } from "../src/app/v2-debug-window";
import { renderDebugPanel } from "../src/app/v2-render-debug-panel";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { DEBUG_EVENT_GROUPS, DEBUG_MONTH_DELTAS, DEBUG_STAT_GROUPS } from "../src/core/v2-debug-tools";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createHostFixture() {
  const handlers = new Map<string, (event: any) => void>();
  const host = {
    location: { origin: "https://example.test", href: "https://example.test/PhD_Simulator_V2/" },
    open: vi.fn(),
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
  };
  vi.stubGlobal("window", host);
  return { host, handlers };
}

function createPopupFixture() {
  const handlers = new Map<string, (event: any) => void>();
  const rootHandlers = new Map<string, (event: any) => void>();
  const host = { closed: false, postMessage: vi.fn() };
  const root = {
    innerHTML: "",
    childElementCount: 1,
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: (type: string, handler: (event: any) => void) => rootHandlers.set(type, handler),
  };
  const popup = {
    opener: host as typeof host | null,
    location: { origin: "https://example.test" },
    scrollY: 0,
    scrollTo: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
  };
  vi.stubGlobal("window", popup);
  vi.stubGlobal("document", { title: "", body: { classList: { add: vi.fn() } } });
  return { host, root, popup, handlers, rootHandlers };
}

describe("independent debug window", () => {
  it("groups thesis progress with graduation and keeps separate conference shortcuts", () => {
    const html = renderDebugPanel(createStartedGameState("normal"), true);
    const paperGroup = html.match(/<h3>论文相关<\/h3>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const graduationGroup = html.match(/<h3>毕业相关<\/h3>([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(paperGroup.match(/data-event-id="([^"]+)"/)?.[1]).toBe("review-result");
    for (const [id, label] of [["conference", "论文参会"], ["conference-activity", "会场活动"], ["review-result", "论文结果"]]) {
      expect(paperGroup).toContain(`data-event-id="${id}"`);
      expect(paperGroup).toContain(label);
    }
    expect(paperGroup).not.toContain('data-event-id="thesis-progress"');
    expect(graduationGroup).toContain('data-event-id="thesis-progress"');
    expect(graduationGroup).toContain("论文推进");
    expect(graduationGroup).toContain('data-event-id="career-internet"');
    expect(html).not.toContain("招聘相关");
    expect(html).toContain("年会活动");
  });

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
    expect(html).toContain('data-action="debug-toggle-event-replay" data-debug-event-replay-enabled="true"');
    expect(html).toContain('data-action="debug-adjust-action-points" data-delta="-1"');
    expect(html).toContain('data-action="debug-adjust-action-points" data-delta="1"');
    expect(html).toContain("读研之始 ✓");
    expect(html).toContain("教师节 ✓");
    expect(html).toContain("领域年会 ✓");
    expect(html).toContain("年会活动 ✓");
    expect(html).toContain("导师经费 ✓");
    expect(html).toContain("游戏放松 ✓");
    expect(html).toContain("数据丢失 ✓");
    expect(html).toContain("被抢发idea ✓");
    expect(html).toContain("新sota ✓");
    expect(html).toContain("显卡故障 ✓");
    expect(html).toContain("署名风波 ✓");
    expect(renderDebugPanel({ ...state, eventHistory: [] }, true)).toContain("读研之始 ✓");
    expect(renderDebugPanel({ ...state, eventHistory: [] }, true)).toContain("教师节 ✓");
  });

  it("separates attributes and papers with action points under other tools", () => {
    const html = renderDebugPanel(createStartedGameState("normal"), true);
    const attributes = html.match(/aria-label="属性调整">([\s\S]*?)<\/section>/)?.[1] ?? "";
    const papers = html.match(/aria-label="新增论文">([\s\S]*?)<\/section>/)?.[1] ?? "";
    const other = html.match(/aria-label="其他调试">([\s\S]*?)<\/section>/)?.[1] ?? "";
    expect(html).toContain('class="debug-popup-columns"');
    expect(attributes.match(/data-debug-value=/g)).toHaveLength(5);
    expect(attributes).not.toMatch(/debug-adjust-action-points|debug-add-paper/);
    expect(papers.match(/data-action="debug-add-paper"/g)).toHaveLength(12);
    expect(papers).not.toMatch(/debug-adjust-stat|debug-adjust-action-points|debug-add-relationship/);
    for (const action of ["debug-adjust-action-points", "debug-toggle-event-replay", "debug-shift-month", "force-next-month", "debug-add-relationship", "debug-add-all-buffs"]) {
      expect(other).toContain(`data-action="${action}"`);
    }
    expect(other).not.toMatch(/debug-adjust-stat|debug-add-paper/);
    for (const group of DEBUG_EVENT_GROUPS) {
      expect(html).toContain(`<div class="debug-popup-event-buttons debug-popup-buttons"><h3>${group.title}</h3><button`);
    }
  });

  it("keeps conference, journal and relationship shortcuts on separate rows", () => {
    const html = renderDebugPanel(createStartedGameState("normal"), true);
    const conference = html.match(/aria-label="新增会议论文">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const journal = html.match(/aria-label="新增期刊论文">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const relationships = html.match(/aria-label="新增人际与效果">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(conference.match(/data-debug-paper-target=/g)).toHaveLength(6);
    expect(conference).not.toContain("data-debug-journal-target");
    expect(journal.match(/data-debug-journal-target=/g)).toHaveLength(6);
    expect(journal).not.toContain("debug-add-relationship");
    expect(relationships.match(/data-action="debug-add-relationship"/g)).toHaveLength(4);
    expect(relationships).toContain('data-action="debug-add-all-buffs"');
    expect(relationships).not.toContain("debug-add-paper");
  });

  it.each(["playing", "setup", "finished"] as const)("keeps session buttons at the top and available during %s", (phase) => {
    const html = renderDebugPanel({ ...createStartedGameState("normal"), phase }, true);
    for (const action of ["restart-game", "reset-game"]) {
      expect(html.indexOf(`data-action="${action}"`)).toBeLessThan(html.indexOf('<fieldset'));
      expect(html).not.toContain(`data-action="${action}" disabled`);
      expect(html.match(new RegExp(`data-action="${action}"`, "g"))).toHaveLength(1);
    }
    if (phase !== "playing") expect(html).toContain('<fieldset class="debug-popup-tools" disabled>');
  });

  it("disables tools on disconnection or outside a running game and escapes status logs", () => {
    const state = createStartedGameState("normal");
    state.log = [{ id: "unsafe", month: 0, text: '<script>alert("test")</script>' }];
    const disconnected = renderDebugPanel(state, false);
    expect(disconnected).toContain('<fieldset class="debug-popup-tools" disabled>');
    expect(disconnected).toContain('data-action="restart-game" disabled');
    expect(disconnected).toContain("主游戏已断开");
    expect(disconnected).toContain("正在尝试重连");
    expect(disconnected).toContain('data-debug-reconnect');
    expect(disconnected).not.toContain("请从设置重新打开");
    expect(disconnected.indexOf('data-debug-reconnect')).toBeLessThan(disconnected.indexOf('<fieldset'));
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
    expect(popup.postMessage).toHaveBeenLastCalledWith({ channel, type: "debug-state", state, revision: 0, hostId: expect.any(String) }, "https://example.test");
    control.open();
    expect(open).toHaveBeenCalledTimes(1);
    control.update();
    expect(popup.postMessage).toHaveBeenLastCalledWith({ channel, type: "debug-state", state, revision: 1, hostId: expect.any(String) }, "https://example.test");
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
    const onOpened = vi.fn();
    const control = createDebugWindow(() => createStartedGameState("normal"), vi.fn(), onOpened);
    expect(control.open()).toBe(false);
    expect(control.isOpen()).toBe(false);
    expect(onOpened).not.toHaveBeenCalled();
  });

  it("marks the active run when the panel opens or is reopened", () => {
    const popup = { closed: false, focus: vi.fn(), postMessage: vi.fn() };
    vi.stubGlobal("window", {
      location: { origin: "https://example.test", href: "https://example.test/" },
      open: vi.fn(() => popup),
      addEventListener: vi.fn(),
    });
    const onOpened = vi.fn();
    const control = createDebugWindow(() => createStartedGameState("normal"), vi.fn(), onOpened);
    expect(control.open()).toBe(true);
    expect(control.isOpen()).toBe(true);
    control.open();
    expect(onOpened).toHaveBeenCalledTimes(2);
  });

  it("reattaches its surviving child on ready without opening or focusing a new window", () => {
    const { host, handlers } = createHostFixture();
    const state = createStartedGameState("normal");
    const dispatch = vi.fn();
    const control = createDebugWindow(() => state, dispatch);
    const popup = {
      opener: host, closed: false, focus: vi.fn(), postMessage: vi.fn(),
      location: { href: `${host.location.href}?debugPanel=old-channel` },
    };
    const message = { source: popup, origin: host.location.origin, data: { channel: "old-channel", type: "debug-ready" } };
    handlers.get("message")!(message);
    expect(popup.postMessage).toHaveBeenLastCalledWith({
      channel: "old-channel", type: "debug-state", state, revision: 0, hostId: expect.any(String),
    }, host.location.origin);
    expect(host.open).not.toHaveBeenCalled();
    expect(popup.focus).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    handlers.get("message")!({ ...message, data: { channel: "old-channel", type: "debug-action", data: { action: "debug-adjust-stat", debugStatId: "money", delta: "1" } } });
    expect(dispatch).toHaveBeenCalledOnce();
    control.open();
    expect(host.open).not.toHaveBeenCalled();
    expect(popup.focus).toHaveBeenCalledOnce();
    handlers.get("pagehide")!({});
    handlers.get("pageshow")!({});
    expect(popup.postMessage.mock.lastCall?.[0].type).toBe("debug-state");
  });

  it.each(["origin", "opener", "path", "channel", "closed", "inaccessible", "command"])("rejects invalid reconnect source: %s", (kind) => {
    const { host, handlers } = createHostFixture();
    const dispatch = vi.fn();
    createDebugWindow(() => createStartedGameState("normal"), dispatch);
    const popup = {
      opener: kind === "opener" ? {} : host,
      closed: kind === "closed",
      postMessage: vi.fn(),
      location: { href: kind === "path" ? "https://example.test/other/?debugPanel=old" : `${host.location.href}?debugPanel=${kind === "channel" ? "other" : "old"}` },
    };
    if (kind === "inaccessible") Object.defineProperty(popup, "location", { get() { throw new Error("Access denied"); } });
    expect(() => handlers.get("message")!({
      source: popup, origin: kind === "origin" ? "https://other.test" : host.location.origin,
      data: { channel: "old", type: kind === "command" ? "debug-action" : "debug-ready", data: { action: "reset-game" } },
    })).not.toThrow();
    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
  });

  it("reconnects at the same revision and refreshes state after host replacement", () => {
    const { root, host, handlers } = createPopupFixture();
    bootstrapDebugWindow(root as unknown as HTMLDivElement, "channel");
    expect(root.innerHTML).toContain("正在连接主游戏");
    const state = createStartedGameState("normal");
    state.player.money = 42;
    const message = { source: host, origin: "https://example.test", data: { channel: "channel", type: "debug-state", state, revision: 0, hostId: "first" } };
    handlers.get("message")!(message);
    expect(root.innerHTML).toContain('data-debug-value="money">42</b>');
    handlers.get("message")!({ ...message, data: { channel: "channel", type: "debug-disconnected" } });
    expect(root.innerHTML).toContain("正在尝试重连");
    handlers.get("message")!(message);
    expect(root.innerHTML).toContain("已连接主游戏");
    handlers.get("message")!({ ...message, data: { ...message.data, hostId: "second", state: { ...state, player: { ...state.player, money: 1 } } } });
    expect(root.innerHTML).toContain('data-debug-value="money">1</b>');
  });

  it("preserves the event replay switch across reconnect and resynchronizes the host", () => {
    const { root, host, handlers, rootHandlers } = createPopupFixture();
    class ToggleButton {
      dataset = { action: "debug-toggle-event-replay", debugEventReplayEnabled: "true" };
      closest(selector: string) { return selector === "button[data-action]" ? this : null; }
      matches() { return false; }
    }
    vi.stubGlobal("Element", ToggleButton);
    bootstrapDebugWindow(root as unknown as HTMLDivElement, "channel");
    const state = createStartedGameState("normal");
    handlers.get("message")!({
      source: host,
      origin: "https://example.test",
      data: { channel: "channel", type: "debug-state", state, revision: 0, hostId: "first" },
    });
    rootHandlers.get("click")!({ target: new ToggleButton() });
    expect(host.postMessage).toHaveBeenLastCalledWith({
      channel: "channel",
      type: "debug-action",
      data: { action: "debug-toggle-event-replay", debugEventReplayEnabled: "true" },
    }, "https://example.test");
    handlers.get("message")!({ ...state, source: host, origin: "https://example.test", data: { channel: "channel", type: "debug-disconnected" } });
    handlers.get("message")!({
      source: host,
      origin: "https://example.test",
      data: { channel: "channel", type: "debug-state", state: { ...state, debugEventReplayEnabled: false }, revision: 1, hostId: "second" },
    });
    expect(root.innerHTML).toContain("事件回退 <b>开启</b>");
    expect(host.postMessage).toHaveBeenLastCalledWith({
      channel: "channel",
      type: "debug-action",
      data: { action: "debug-toggle-event-replay", debugEventReplayEnabled: "true" },
    }, "https://example.test");
  });

  it("allows manual retry while disabled and resumes the heartbeat after page restoration", () => {
    const { root, host, popup, handlers, rootHandlers } = createPopupFixture();
    class RetryButton {
      closest(selector: string) { return selector === "button[data-debug-reconnect]" ? this : null; }
    }
    vi.stubGlobal("Element", RetryButton);
    bootstrapDebugWindow(root as unknown as HTMLDivElement, "channel");
    host.postMessage.mockClear();
    rootHandlers.get("click")!({ target: new RetryButton() });
    expect(host.postMessage).toHaveBeenCalledExactlyOnceWith({ channel: "channel", type: "debug-ready" }, "https://example.test");
    handlers.get("pagehide")!({});
    expect(popup.clearInterval).toHaveBeenCalledWith(1);
    handlers.get("pageshow")!({});
    expect(popup.setInterval).toHaveBeenCalledTimes(2);
    host.closed = true;
    handlers.get("pageshow")!({});
    expect(root.innerHTML).toContain("主游戏已关闭");
    expect(root.innerHTML).not.toContain('data-debug-reconnect');
  });

  it("does not claim it can reconnect when the opener is missing", () => {
    const { popup, root } = createPopupFixture();
    popup.opener = null;
    bootstrapDebugWindow(root as unknown as HTMLDivElement, "channel");
    expect(root.innerHTML).toContain("未找到主游戏窗口");
    expect(root.innerHTML).not.toContain('data-debug-reconnect');
  });
});
