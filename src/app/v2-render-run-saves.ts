import { formatAttribute, formatAttributeDetail } from "../core/v2-attribute-format";
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
  const latest = saves.find(save => save.kind === "latest");
  const mergedMonthId = latest?.sameAsMonthId && saves.some(save => save.kind === "month" && save.id === latest.sameAsMonthId)
    ? latest.sameAsMonthId : undefined;
  const visibleSaves = mergedMonthId ? saves.filter(save => save.kind !== "latest") : saves;
  return `<section class="run-saves" aria-labelledby="run-saves-title">
    <header class="run-saves-heading">
      <h3 id="run-saves-title"><i data-lucide="history" aria-hidden="true"></i>读取存档<span>${saves.filter(save => save.kind === "month").length}/70个月</span></h3>
      <button type="button" class="run-saves-close" data-ui-close-run-saves>${state.phase === "finished" ? "返回结局" : "收起"}</button>
    </header>
    <p class="run-saves-note">回溯会删除该时间点之后的存档与本局成就进度，随机结果保持一致</p>
    ${uiState.saveStatus ? `<p class="run-saves-status" role="status">${escape(uiState.saveStatus)}</p>` : ""}
    <div class="run-saves-list" role="list" aria-label="本角色存档">
      ${visibleSaves.length ? visibleSaves.map(save => {
        const month = save.totalMonths > 0
          ? `${getAcademicCalendarYear(save.year, save.month)}年${getAcademicCalendarMonth(save.month)}月`
          : "入学前";
        const isLatest = save.kind === "latest" || save.id === mergedMonthId;
        const timing = save.phase === "finished" ? "结局" : isLatest ? "最新" : "月初";
        const detail = `${save.playerName?.trim() || "？？？"} · ${save.degree === "phd" ? "博士" : "硕士"} · SAN ${formatAttributeDetail(save.san)}/${formatAttributeDetail(save.sanCap)} · 科研分 ${save.researchScore}`;
        const savedAt = isLatest && mergedMonthId ? latest!.savedAt : save.savedAt;
        const label = `读取${month}${isLatest ? "最新进度" : "月初存档"}，${detail}，保存于${formatSavedAt(savedAt)}`;
        return `<div class="run-save-item" role="listitem"><button type="button" class="run-save-card${isLatest ? " is-latest" : ""}" data-ui-load-run-save="${escape(save.id)}" aria-label="${escape(label)}" title="${escape(label)}">
          <strong class="run-save-title">${month}</strong>
          <span class="run-save-position"><span>${save.totalMonths > 0 ? `第${save.totalMonths}月` : "入学"}</span><span class="run-save-timing">${timing}</span></span>
          <span class="run-save-detail"><span>SAN ${formatAttribute(save.san, [0, 2, 3, 5, 6, 12, 18, 20, save.sanCap])}/${formatAttribute(save.sanCap)}</span><span>科研 ${save.researchScore}</span></span>
        </button></div>`;
      }).join("") : '<p class="run-saves-empty">当前角色尚无存档</p>'}
    </div>
  </section>`;
}
