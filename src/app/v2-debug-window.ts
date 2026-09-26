import type { GameState } from "../core/v2-types";
import { renderDebugPanel, type DebugConnectionStatus } from "./v2-render-debug-panel";
import "../styles/debug-panel.css";

const DEBUG_WINDOW_ACTIONS = new Set([
  "debug-adjust-stat", "debug-shift-month", "force-next-month", "debug-add-paper",
  "debug-add-all-buffs", "debug-add-relationship", "debug-trigger-event", "restart-game", "reset-game",
  "debug-toggle-event-replay", "debug-adjust-action-points",
]);

export function isDebugWindowActionData(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string")
    && DEBUG_WINDOW_ACTIONS.has((value as Record<string, string>).action ?? "");
}

export function createDebugWindow(getState: () => GameState, onAction: (data: DOMStringMap) => void) {
  let channel: string = crypto.randomUUID();
  const hostId = crypto.randomUUID();
  const origin = window.location.origin;
  let popup: Window | null = null;
  let revision = 0;
  const sendState = (): void => {
    if (popup && !popup.closed) popup.postMessage({ channel, type: "debug-state", state: getState(), revision, hostId }, origin);
  };
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== origin) return;
    if ((!popup || popup.closed) && event.data?.type === "debug-ready") {
      const source = event.source as Window | null;
      const requestedChannel: unknown = event.data.channel;
      if (!source || typeof requestedChannel !== "string" || !requestedChannel || requestedChannel.length > 128) return;
      try {
        if (source.closed || source.opener !== window) return;
        const sourceUrl = new URL(source.location.href);
        const hostUrl = new URL(window.location.href);
        if (sourceUrl.origin !== origin || sourceUrl.pathname !== hostUrl.pathname
          || sourceUrl.searchParams.get("debugPanel") !== requestedChannel) return;
      } catch {
        return;
      }
      popup = source;
      channel = requestedChannel;
    }
    if (!popup || popup.closed || event.source !== popup || event.origin !== origin || event.data?.channel !== channel) return;
    if (event.data.type === "debug-ready") sendState();
    if (event.data.type === "debug-action" && isDebugWindowActionData(event.data.data)) {
      if (getState().phase !== "playing" && event.data.data.action !== "restart-game" && event.data.data.action !== "reset-game") return;
      onAction(event.data.data);
    }
  });
  window.addEventListener("pagehide", () => {
    if (popup && !popup.closed) popup.postMessage({ channel, type: "debug-disconnected" }, origin);
  });
  window.addEventListener("pageshow", sendState);
  return {
    open(): boolean {
      if (popup && !popup.closed) {
        popup.focus();
        sendState();
        return true;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("debugPanel", channel);
      url.hash = "";
      popup = window.open(url.href, `phd-debug-${channel}`, "popup=yes,width=760,height=780,resizable=yes,scrollbars=yes");
      if (!popup) return false;
      popup.focus();
      return true;
    },
    update(): void {
      revision += 1;
      sendState();
    },
  };
}

export function bootstrapDebugWindow(root: HTMLDivElement, channel: string): void {
  document.title = "调试面板 · 研究生模拟器 v2.0";
  document.body.classList.add("debug-popup-page");
  const host = window.opener as Window | null;
  const origin = window.location.origin;
  let state: GameState | null = null;
  let connected = false;
  let revision = -1;
  let hostId: string | undefined;
  let connectionStatus: DebugConnectionStatus = "connecting";
  let lastReceived = Date.now();
  const render = (): void => {
    const focused = root.querySelector<HTMLButtonElement>("button:focus");
    const focusKey = focused ? JSON.stringify({ ...focused.dataset }) : null;
    const scrollY = window.scrollY;
    root.innerHTML = renderDebugPanel(state, connected, connectionStatus);
    if (focusKey) [...root.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => JSON.stringify({ ...button.dataset }) === focusKey)?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  };
  const disconnect = (status: DebugConnectionStatus = "disconnected"): void => {
    if (!connected && connectionStatus === status && root.childElementCount > 0) return;
    connected = false;
    connectionStatus = status;
    render();
  };
  render();
  window.addEventListener("message", (event: MessageEvent) => {
    if (!host || event.source !== host || event.origin !== origin || event.data?.channel !== channel) return;
    if (event.data.type === "debug-disconnected") {
      disconnect();
      return;
    }
    if (event.data.type !== "debug-state" || !event.data.state) return;
    lastReceived = Date.now();
    if (connected && revision === event.data.revision && hostId === event.data.hostId) return;
    state = event.data.state as GameState;
    revision = event.data.revision;
    hostId = event.data.hostId;
    connected = true;
    render();
  });
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("button[data-debug-reconnect]")) {
      requestState();
      return;
    }
    if (!connected || !host || host.closed) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || button.matches(":disabled")) return;
    const data = { ...button.dataset };
    if (isDebugWindowActionData(data)) host.postMessage({ channel, type: "debug-action", data }, origin);
  });
  const requestState = (): void => {
    if (!host) {
      disconnect("unavailable");
      return;
    }
    if (host.closed) {
      disconnect("closed");
      return;
    }
    if (Date.now() - lastReceived > 5000) disconnect();
    host.postMessage({ channel, type: "debug-ready" }, origin);
  };
  requestState();
  let heartbeat: number | undefined = window.setInterval(requestState, 1500);
  window.addEventListener("pagehide", () => {
    window.clearInterval(heartbeat);
    heartbeat = undefined;
    disconnect();
  });
  window.addEventListener("pageshow", () => {
    requestState();
    if (heartbeat === undefined) heartbeat = window.setInterval(requestState, 1500);
  });
}
