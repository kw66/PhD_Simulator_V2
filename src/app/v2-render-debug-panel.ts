import { DEBUG_COMPLETED_EVENT_IDS, DEBUG_EVENT_GROUPS, DEBUG_MONTH_DELTAS, DEBUG_STAT_GROUPS } from "../core/v2-debug-tools";
import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import { getResearchCap } from "../core/v2-research-cap-system";
import type { GameState } from "../core/v2-types";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function button(label: string, action: string, attributes: Record<string, string | number> = {}): string {
  return `<button type="button" data-action="${action}" ${Object.entries(attributes).map(([key, value]) => `data-${key}="${escapeHtml(String(value))}"`).join(" ")}>${escapeHtml(label)}</button>`;
}

export type DebugConnectionStatus = "connecting" | "disconnected" | "closed" | "unavailable";

export function renderDebugPanel(state: GameState | null, connected: boolean, connectionStatus: DebugConnectionStatus = "disconnected"): string {
  const playable = connected && state?.phase === "playing";
  const date = !state || state.totalMonths === 0 ? "入学前"
    : `${getAcademicCalendarYear(state.year, state.month)}年 ${getAcademicCalendarMonth(state.month)}月`;
  const status = !connected ? {
    connecting: "正在连接主游戏…",
    disconnected: "主游戏已断开，正在尝试重连…",
    closed: "主游戏已关闭，请先打开游戏",
    unavailable: "未找到主游戏窗口，请从游戏设置打开面板",
  }[connectionStatus]
    : state?.phase === "setup" ? "请在主窗口开始游戏"
    : state?.phase === "finished" ? "本轮已结束" : "已连接主游戏";
  const attributes = DEBUG_STAT_GROUPS.map((group) => {
    const cap = group.statId === "san" ? state?.sanCap : group.statId === "research" ? state ? getResearchCap(state.researchCapacityState) : null : group.statId === "money" ? null : 20;
    return `<div class="debug-popup-stat-row"><strong>${escapeHtml(group.label)} <b data-debug-value="${group.statId}">${state?.player[group.statId] ?? "—"}${cap == null ? "" : `/${cap}`}</b></strong>
      <div class="debug-popup-buttons">${group.deltas.map((delta) => button(`${delta > 0 ? "+" : ""}${delta}`, "debug-adjust-stat", { "debug-stat-id": group.statId, delta })).join("")}</div></div>`;
  }).join("");
  const replayEnabled = state?.debugEventReplayEnabled === true;
  const actionLimit = state?.actionState.limit ?? 0;
  const actionUsed = state?.actionState.used ?? 0;
  const actionRemaining = Math.max(0, actionLimit - actionUsed);
  const actionPoints = `<div class="debug-popup-stat-row debug-popup-action-row"><strong>行动点 <b data-debug-action-points>${actionRemaining}/${actionLimit}</b></strong>
    <div class="debug-popup-buttons">${button("-1", "debug-adjust-action-points", { delta: -1 })}${button("+1", "debug-adjust-action-points", { delta: 1 })}</div></div>`;
  const replayControl = `<div class="debug-popup-replay"><strong>事件回退 <b>${replayEnabled ? "开启" : "关闭"}</b></strong>
    <div class="debug-popup-buttons">${button(replayEnabled ? "关闭" : "开启", "debug-toggle-event-replay", { "debug-event-replay-enabled": String(!replayEnabled) })}</div></div>`;
  const paperButtons = (["first", "coauthor"] as const).flatMap((authorship) => (["A", "B", "C"] as const).map((target) => (
    button(`${target}${authorship === "first" ? "一作" : "合作"}`, "debug-add-paper", { "debug-paper-target": target, "debug-paper-authorship": authorship })
  ))).join("");
  const journalButtons = (["first", "coauthor"] as const).flatMap((authorship) => (["nature", "nmi", "pami"] as const).map((target) => (
    button(`${target === "nature" ? "Nature" : target.toUpperCase()}${authorship === "first" ? "一作" : "合作"}`, "debug-add-paper", { "debug-journal-target": target, "debug-paper-authorship": authorship })
  ))).join("");
  return `<main class="debug-popup">
    <header class="debug-popup-header"><h1>🛠️ 调试面板</h1><div class="debug-popup-connection"><span data-debug-connection role="status">${status}</span>${!connected && (connectionStatus === "disconnected" || connectionStatus === "connecting") ? '<button type="button" data-debug-reconnect>↻ 重新连接</button>' : ""}</div></header>
    <fieldset class="debug-popup-tools" ${playable ? "" : "disabled"}>
      <section class="debug-popup-common" aria-label="常用调试">
      <div class="debug-popup-columns">
        <section class="debug-popup-card"><h2>📊 属性与行动</h2>${attributes}${actionPoints}</section>
        <section class="debug-popup-card"><h2>📚 新增论文</h2>
          <h3>会议论文</h3><div class="debug-popup-paper-buttons debug-popup-buttons">${paperButtons}</div>
          <h3>期刊论文</h3><div class="debug-popup-paper-buttons debug-popup-buttons">${journalButtons}</div>
        </section>
      </div>
        <div class="debug-popup-card debug-popup-controls">
          <div class="debug-popup-time-control"><strong>📅 <span data-debug-date>${date}</span></strong>
            <div class="debug-popup-time debug-popup-buttons">${DEBUG_MONTH_DELTAS.map((delta) => button(`${delta > 0 ? "+" : ""}${delta}月`, "debug-shift-month", { delta })).join("")}
              <button type="button" data-action="force-next-month" title="删除当前阻塞事件并真实结算下一月">下一月</button>
            </div>
          </div>
          ${replayControl}
        </div>
        <section class="debug-popup-card"><h2>🤝 新增人际与效果</h2>
          <div class="debug-popup-relationship-buttons debug-popup-buttons">${[
            ["senior", "新增师兄/师姐"], ["junior", "新增师弟/师妹"], ["peer", "新增同门"], ["lover", "新增恋人"],
          ].map(([type, label]) => button(label!, "debug-add-relationship", { "debug-relationship-type": type! })).join("")}${button("全部buff", "debug-add-all-buffs")}</div>
        </section>
      </section>
      <section class="debug-popup-card debug-popup-events" aria-label="事件触发">
        <h2>🔔 事件触发 <span>待处理 ${state?.eventQueue.length ?? 0}</span></h2>
        ${DEBUG_EVENT_GROUPS.map((group) => `<section class="debug-popup-event-group"><h3>${escapeHtml(group.title)}</h3><div class="debug-popup-event-buttons debug-popup-buttons">${group.buttons.map((item) => button(`${item.label}${DEBUG_COMPLETED_EVENT_IDS.includes(item.id as typeof DEBUG_COMPLETED_EVENT_IDS[number]) ? " ✓" : ""}`, "debug-trigger-event", { "event-id": item.id })).join("")}</div></section>`).join("")}
      </section>
    </fieldset>
    <footer class="debug-popup-footer">
      <div class="debug-popup-feedback"><strong>最近操作</strong><p data-debug-last-log>${escapeHtml(state?.log[0]?.text ?? "暂无操作记录")}</p></div>
      <div class="debug-popup-buttons"><button type="button" data-action="restart-game" ${connected && state ? "" : "disabled"}>↻ 重开</button><button type="button" data-action="reset-game" ${connected && state ? "" : "disabled"}>⌂ 返回开始页</button></div>
    </footer>
  </main>`;
}
