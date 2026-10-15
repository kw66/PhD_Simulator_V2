import { getAcademicCalendarMonth, getAcademicCalendarYear } from "../core/v2-calendar";
import type { GameState } from "../core/v2-types";
import type { PlayRenderUiState } from "./v2-render-types";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

export function renderRunSaves(state: GameState, uiState: PlayRenderUiState): string {
  if (!uiState.isRunSavePanelOpen) return "";
  const saves = uiState.runSaves ?? [];
  return `<section class="run-saves" aria-labelledby="run-saves-title">
    <header class="run-saves-heading">
      <h3 id="run-saves-title"><i data-lucide="history" aria-hidden="true"></i>读取存档<span>${saves.filter(save => save.kind === "month").length}/70个月</span></h3>
      <button type="button" class="run-saves-close" data-ui-close-run-saves>${state.phase === "finished" ? "返回结局" : "收起"}</button>
    </header>
    <p class="run-saves-note">回溯会删除该时间点之后的存档与本局成就进度，随机结果保持一致</p>
    ${uiState.saveStatus ? `<p class="run-saves-status" role="status">${escape(uiState.saveStatus)}</p>` : ""}
    <div class="run-saves-list" role="list" aria-label="本角色存档">
      ${saves.length ? saves.map(save => {
        const month = save.totalMonths > 0
          ? `${getAcademicCalendarYear(save.year, save.month)}年${getAcademicCalendarMonth(save.month)}月`
          : "入学前";
        return `<article class="run-save-card${save.kind === "latest" ? " is-latest" : ""}" role="listitem">
          <div class="run-save-copy"><div class="run-save-title"><strong>${save.kind === "latest" ? "最新进度" : month}</strong><span>${save.kind === "latest" ? month : `第${save.totalMonths}个月`}${save.phase === "finished" ? " · 结局" : ""}</span></div>
            <div class="run-save-detail"><span>${escape(save.playerName?.trim() || "？？？")} · ${save.degree === "phd" ? "博士" : "硕士"}</span><span>SAN ${save.san}/${save.sanCap} · 科研分 ${save.researchScore}</span><time datetime="${escape(save.savedAt)}">${escape(formatSavedAt(save.savedAt))}</time></div>
          </div>
          <button type="button" class="run-save-load" data-ui-load-run-save="${escape(save.id)}" aria-label="读取${escape(save.kind === "latest" ? "最新进度" : month)}">读取</button>
        </article>`;
      }).join("") : '<p class="run-saves-empty">当前角色尚无存档</p>'}
    </div>
  </section>`;
}
