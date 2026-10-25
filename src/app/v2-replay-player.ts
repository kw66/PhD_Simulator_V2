import { createIcons, ArrowLeft, Download, Film, SkipBack, SkipForward, Trash2, Upload, Activity, ArrowRight, Award, Backpack, BadgeCheck, BadgeDollarSign, Bell, BookOpen, Brain, Briefcase, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartNoAxesColumn, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, CircleHelp, CircleDollarSign, Clock3, Coffee, Coins, Cpu, Crown, Database, Dumbbell, Eye, Feather, FastForward, Files, FileCheck2, FileHeart, FileText, FilePlus2, Flame, FlaskConical, Footprints, Gamepad2, Gem, Gift, GitFork, GraduationCap, HandCoins, HandHelping, Handshake, Heart, HeartCrack, HeartHandshake, HeartPlus, HeartPulse, History, House, Hourglass, Infinity, Laptop, Lightbulb, Lock, LogOut, Medal, MessageCircle, MessageSquare, MessagesSquare, Microscope, Microchip, Monitor, MoveUpRight, Network, NotebookPen, Presentation, PiggyBank, Pause, Play, RefreshCw, Reply, RotateCcw, Rocket, Send, Settings, Shield, ShieldPlus, Skull, Smile, Sparkles, Sprout, Star, Store, Sun, Sunrise, Target, Trophy, TrendingUp, Users, UsersRound, ShoppingCart, UserRound, UserRoundPlus, Utensils, Wallet, Wrench, X, Zap } from "lucide";
import { getAcademicCalendarMonth } from "../core/v2-calendar";
import { MAX_LOCAL_REPLAY_BYTES, createReplaySession, type ReplayRecording, type ReplaySession } from "../core/v2-local-replay";
import { getCalendarForTotalMonths, getRoleDefinition } from "../core/v2-progression";
import type { GameState } from "../core/v2-types";
import { executeReplayCommand, replayStateDigest } from "../core/v2-run-replay";
import { createEventLayout } from "./v2-event-layout";
import { getPlayHelpContext, getPlayHelpPageIndex, renderPlayHelpInlineToggle, renderPlayHelpPanel } from "./v2-play-help";
import { createRelationshipTooltips } from "./v2-relationship-tooltips";
import { createReplayLibrary, type ReplayLibrary, type ReplaySummary } from "./v2-replay-library";
import { prepareReplayActionView, getReplayActionTarget, getReplayActionTiming } from "./v2-replay-action-focus";
import { renderEventLayoutSamples, renderPlayScreen } from "./v2-render-play";
import { getRoleChibiPortraitUrl } from "./v2-role-portrait-assets";
import { OFFICIAL_REPLAY_SLOTS, type OfficialReplayRoute } from "./v2-official-replays";
import { getReplayResults, type ReplayMetrics } from "./v2-replay-results";
import { getReplayNavigationStep } from "./v2-replay-navigation";
import type { PlayRenderUiState } from "./v2-render-types";
import { createResponsiveScoreCharts } from "./v2-responsive-score-charts";
import "../styles/mobile-base.css";
import "../styles/mobile-panels.css";
import "../styles/mobile-events.css";
import "../styles/v2-replay-player.css";

const icons = { ArrowLeft, Download, Film, SkipBack, SkipForward, Trash2, Upload, Activity, ArrowRight, Award, Backpack, BadgeCheck, BadgeDollarSign, Bell, BookOpen, Brain, Briefcase, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartNoAxesColumn, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, CircleHelp, CircleDollarSign, Clock3, Coffee, Coins, Cpu, Crown, Database, Dumbbell, Eye, Feather, FastForward, Files, FileCheck2, FileHeart, FileText, FilePlus2, Flame, FlaskConical, Footprints, Gamepad2, Gem, Gift, GitFork, GraduationCap, HandCoins, HandHelping, Handshake, Heart, HeartCrack, HeartHandshake, HeartPlus, HeartPulse, History, House, Hourglass, Infinity, Laptop, Lightbulb, Lock, LogOut, Medal, MessageCircle, MessageSquare, MessagesSquare, Microscope, Microchip, Monitor, MoveUpRight, Network, NotebookPen, Presentation, PiggyBank, Pause, Play, RefreshCw, Reply, RotateCcw, Rocket, Send, Settings, Shield, ShieldPlus, Skull, Smile, Sparkles, Sprout, Star, Store, Sun, Sunrise, Target, Trophy, TrendingUp, Users, UsersRound, ShoppingCart, UserRound, UserRoundPlus, Utensils, Wallet, Wrench, X, Zap };
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const icon = (name: string): string => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const endings: Record<string, string> = { master: "硕士毕业", phd: "博士毕业", burnout: "不堪重负", overthinking: "用脑过度", poor: "穷困潦倒", expelled: "逐出师门", isolated: "被孤立", delay: "延毕", quit: "主动退学", "lab-bankrupt": "实验室破产" };
const gameHref = (): string => window.location.pathname;
const replayHref = (id = "library"): string => `${gameHref()}?replay=${encodeURIComponent(id)}`;
function monthLabel(totalMonths: number): string {
  if (totalMonths === 0) return "入学前";
  const { year, month } = getCalendarForTotalMonths(totalMonths, "phd");
  return `第${year}学年 · ${getAcademicCalendarMonth(month)}月`;
}
function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function renderMetrics(summary: ReplaySummary, metrics?: ReplayMetrics, failed = false): string {
  const number = (value: number): string => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
  const stats = [
    { label: "科研分", value: summary.researchScore, cap: undefined },
    { label: "金币", value: metrics?.money, cap: undefined },
    ...["SAN", "科研能力", "社交能力", "导师好感"].map(label => metrics?.attributes.find(stat => stat.label === label) ?? { label, value: undefined, cap: undefined }),
  ];
  return `<dl class="replay-card-metrics" data-replay-metrics="${escape(summary.id)}" aria-label="本局最终数值">${stats.map(stat => `<div><dt>${stat.label}</dt><dd>${stat.value === undefined ? failed ? "—" : "…" : number(stat.value)}${stat.cap === undefined ? "" : `<span> / ${number(stat.cap)}</span>`}</dd></div>`).join("")}</dl>`;
}
function renderSummary(summary: ReplaySummary, official = false, metrics = summary.metrics): string {
  const role = getRoleDefinition(summary.roleId);
  const status = summary.academicYear ? `第${summary.academicYear}学年归档` : summary.ending ? endings[summary.ending] ?? "本轮结束" : summary.phase === "finished" ? "本轮结束" : "途中记录";
  const filename = `${role.name}${summary.playerName ? ` · ${summary.playerName}` : ""}`;
  return `<article class="replay-card${summary.roleId.endsWith("-reversed") ? " is-reversed" : ""}" data-replay-card="${escape(summary.id)}">
    <img class="replay-card-portrait" src="${escape(getRoleChibiPortraitUrl(summary.roleId))}" alt="" loading="lazy">
    <div class="replay-card-identity"><h2>${escape(role.name)}</h2><p><span class="replay-card-status${summary.ending === "phd" || summary.ending === "master" ? " is-graduated" : ""}">${escape(status)}</span>${official ? "" : `<small>${escape(summary.playerName || dateLabel(summary.updatedAt))} · ${summary.totalMonths}个月</small>`}</p></div>
    <div class="replay-card-actions"><a class="replay-link is-primary" href="${replayHref(summary.id)}" data-replay-open="${escape(summary.id)}" aria-label="播放${escape(filename)}">${icon("play")}播放</a><button class="replay-button is-icon" type="button" data-replay-export="${escape(summary.id)}" aria-label="${official ? "下载" : "导出"}${escape(filename)}">${icon("download")}</button>${official ? "" : `<button class="replay-button is-icon is-delete" type="button" data-replay-delete="${escape(summary.id)}" aria-label="删除${escape(filename)}的回放">${icon("trash-2")}</button>`}</div>
    ${renderMetrics(summary, metrics)}
  </article>`;
}

/** A separate browser entry: no game store, persistent account or remote clients. */
export async function bootstrapReplayPlayer(root: HTMLDivElement, initialId = "library", options: { library?: ReplayLibrary; official?: boolean } = {}) {
  const library = options.library ?? createReplayLibrary();
  const official = options.official === true;
  let summaries: ReplaySummary[] = [];
  let officialRoute: OfficialReplayRoute = "phd-10";
  let recording: ReplayRecording | null = null;
  let recordingId: string | null = null;
  let session: ReplaySession | null = null;
  let state: GameState | null = null;
  let viewedPaperId: string | null = null;
  let ui: PlayRenderUiState = {};
  let message = "";
  let error = false;
  let deleting: string | null = null;
  let busy = false;
  let playing = false;
  let speed = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let routeVersion = 0;
  let seekVersion = 0;
  let animationFrame = 0;
  let playVersion = 0;
  let playbackSeek: AbortController | undefined;
  let cueTarget: HTMLElement | null = null;
  let cueFrame: HTMLDivElement | null = null;
  let talentTour: { step: number; nodes: string[]; position: number } | null = null;
  const metricsCache = new Map<string, ReplayMetrics>();
  let metricsRequest: AbortController | undefined;
  const eventLayout = createEventLayout(root);
  const tooltips = createRelationshipTooltips(root);
  const charts = createResponsiveScoreCharts(root);
  root.classList.add("replay-app");
  document.title = `${official ? "官方录像" : "本地回放"} · 研究生模拟器 2.0`;

  function syncLayout(): void {
    const shell = root.querySelector<HTMLElement>(".play-stage-shell");
    const stage = root.querySelector<HTMLElement>(".play-stage");
    if (shell && stage) {
      const absolute = getComputedStyle(stage).position === "absolute";
      root.style.setProperty("--play-stage-scale", absolute ? Math.min(1, shell.clientWidth / 1540).toFixed(4) : "1");
      root.style.setProperty("--play-stage-content-height", `${stage.scrollHeight}px`);
    }
    eventLayout.sync();
    tooltips.sync();
    charts.sync();
    positionCue();
  }
  function scheduleLayout(): void {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(syncLayout);
  }
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(root);
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("scroll", positionCue, true);

  function clearCue(): void {
    cueTarget?.classList.remove("replay-click-target");
    cueTarget = null; cueFrame?.remove(); cueFrame = null;
  }
  function positionCue(): void {
    if (!cueTarget?.isConnected || !cueFrame) return;
    const rect = cueTarget.getBoundingClientRect();
    Object.assign(cueFrame.style, { left: `${rect.left - 3}px`, top: `${rect.top - 3}px`, width: `${rect.width + 6}px`, height: `${rect.height + 6}px` });
  }
  function pause(): void {
    playing = false; playVersion++; clearTimeout(timer);
    if (playbackSeek) busy = false;
    playbackSeek?.abort(); playbackSeek = undefined; clearCue();
  }
  function syncPlaybackButton(): void {
    const button = root.querySelector<HTMLButtonElement>("[data-replay-play]");
    if (!button) return;
    const label = playing ? "暂停" : "播放";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `${icon(playing ? "pause" : "play")}<span>${label}</span>`;
    createIcons({ icons, root: button });
  }
  function announce(text: string, isError = false): void { message = text; error = isError; }
  function messageHtml(): string { return message ? `<p class="replay-message${error ? " is-error" : ""}" role="${error ? "alert" : "status"}">${escape(message)}</p>` : ""; }
  function decorate(): void {
    createIcons({ icons, root });
    scheduleLayout();
  }
  function renderLibrary(): void {
    const localContent = summaries.length ? `<div class="replay-grid">${summaries.map(summary => renderSummary(summary, false, summary.metrics ?? metricsCache.get(summary.id))).join("")}</div>` : `<section class="replay-empty">${icon("film")}<h2>还没有回放</h2><p>在游戏「设置」中下载本局回放，再导入这里。</p></section>`;
    root.innerHTML = `<main class="replay-library${official ? " is-official-library" : ""}">
      <section class="replay-library-sheet">
        <header class="replay-library-header"><div class="replay-library-title">${icon(official ? "graduation-cap" : "history")}<h1>${official ? "官方录像" : "本地回放"}</h1></div><nav class="replay-library-actions" aria-label="回放操作">${!official ? `<button class="replay-button is-primary" type="button" data-replay-import${busy ? " disabled" : ""}>${icon("upload")}${busy ? "读取中…" : "导入"}</button>` : ""}<a class="replay-button" href="${gameHref()}">${icon("arrow-left")}返回游戏</a></nav></header>
        ${messageHtml()}${deleting ? `<div class="replay-confirm" role="alert"><span>删除这份本地回放？</span><button class="replay-button" type="button" data-replay-cancel-delete>保留</button><button class="replay-button" type="button" data-replay-confirm-delete="${escape(deleting)}"${busy ? " disabled" : ""}>确认删除</button></div>` : ""}
        ${official ? renderOfficialSections() : localContent}
      </section><input class="replay-file-input" type="file" accept=".json,.phdreplay,application/json" data-replay-file aria-label="选择本地回放文件">
    </main>`;
    decorate();
    void loadMissingMetrics();
  }
  async function loadMissingMetrics(): Promise<void> {
    metricsRequest?.abort();
    const request = new AbortController(); metricsRequest = request;
    const visible = summaries.filter(item => (!official || item.officialRoute === officialRoute) && !item.metrics && !metricsCache.has(item.id));
    for (const summary of visible) {
      try {
        const loaded = await library.get(summary.id);
        if (request.signal.aborted) return;
        if (!loaded) throw new Error("找不到这份录像");
        const result = await getReplayResults(loaded, { signal: request.signal });
        if (request.signal.aborted) return;
        metricsCache.set(summary.id, result);
      } catch {
        if (request.signal.aborted) return;
      }
      const target = root.querySelector(`[data-replay-metrics="${CSS.escape(summary.id)}"]`);
      if (target) target.outerHTML = renderMetrics(summary, metricsCache.get(summary.id), true);
    }
  }
  function renderOfficialSections(): string {
    const entries = summaries.filter(summary => summary.officialRoute === officialRoute);
    return `<nav class="replay-route-tabs" aria-label="教学路线">${OFFICIAL_REPLAY_SLOTS.map(({ route, label }) => `<button type="button" data-replay-route="${route}" aria-pressed="${route === officialRoute}">${label.replace("路线", "")}</button>`).join("")}</nav><section class="replay-official-section" aria-label="${OFFICIAL_REPLAY_SLOTS.find(slot => slot.route === officialRoute)!.label}">${entries.length ? `<div class="replay-grid">${entries.map(summary => renderSummary(summary, true, summary.metrics ?? metricsCache.get(summary.id))).join("")}</div>` : '<div class="replay-empty"><p>暂无录像，陆续补充。</p></div>'}</section>`;
  }
  function monthOptions(): string {
    if (!session) return "";
    const byMonth = new Map<number, number>();
    for (const point of session.getMonths()) if (!byMonth.has(point.totalMonths)) byMonth.set(point.totalMonths, Math.max(1, point.index));
    const currentMonth = state?.totalMonths ?? 0;
    return [...byMonth].sort(([a], [b]) => a - b).map(([month, index]) => `<option value="${index}"${month === currentMonth ? " selected" : ""}>${monthLabel(month)}</option>`).join("");
  }
  function renderPlayer(): void {
    if (!session || !recording || !state) return;
    clearCue();
    const index = session.getIndex(), length = session.getLength();
    const roleName = getRoleDefinition(state.selectedRoleId).name;
    const oldScroll = window.scrollY;
    const replayTransport = {
      roleName, monthLabel: monthLabel(state.totalMonths), currentStep: index,
      totalSteps: length, playing, busy, speed, monthOptions: monthOptions(),
    };
    root.innerHTML = `${messageHtml()}<div class="replay-viewer" aria-label="对局回放">${renderPlayScreen(viewedPaperId ? { ...state, selectedPaperId: viewedPaperId } : state, { ...ui, isReplay: true, replayTransport })}</div>`;
    if (ui.isHelpOpen || recording.replay.commands[index]?.kind === "help") {
      root.querySelector("[data-replay-inline-controls]")?.insertAdjacentHTML("beforebegin", `<div data-replay-help>${renderPlayHelpInlineToggle(ui)}${renderPlayHelpPanel(ui)}</div>`);
    }
    // Ending/archive overlays must not block the replay controls in the side rail.
    root.querySelector(".play-stage-shell")?.removeAttribute("inert");
    // Recorded actions alone advance simulation. These controls remain visible for faithful playback.
    root.querySelectorAll<HTMLElement>(".replay-viewer [data-action], .replay-viewer [data-ui-open-run-saves], .replay-viewer [data-ui-open-feedback], .replay-viewer [data-ui-open-debug-window], .replay-viewer [data-ui-download-replay], .replay-viewer [data-ui-open-local-replays]").forEach(element => {
      element.dataset.replayInert = "true";
      element.setAttribute("aria-disabled", "true");
      // Keep game buttons visually active so the replay can point at the
      // operation. The delegated handler still consumes their clicks.
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) element.disabled = true;
    });
    root.querySelectorAll<HTMLAnchorElement>(".replay-viewer a[href]").forEach(anchor => { anchor.removeAttribute("href"); anchor.setAttribute("aria-disabled", "true"); });
    root.querySelectorAll<HTMLInputElement>(".replay-viewer input, .replay-viewer textarea, .replay-viewer select").forEach(input => {
      if (!input.closest("[data-replay-inline-controls]")) input.disabled = true;
    });
    eventLayout.reset();
    const current = state.eventQueue.find(event => event.id === ui.activeEventId) ?? null;
    const history = state.eventHistory.find(event => event.id === ui.activeEventHistoryId) ?? null;
    eventLayout.update(renderEventLayoutSamples(current, history, state));
    decorate();
    if (oldScroll) window.scrollTo({ top: oldScroll, behavior: "instant" });
  }
  function isOpeningTalentStep(): boolean {
    const command = recording?.replay.commands[(session?.getIndex() ?? 0) - 1];
    return official && state?.totalMonths === 1 && command?.kind === "action" && command.actionId === "next-month";
  }
  function selectTalentNode(key: string): void {
    const [page, index] = key.split("-").map(Number);
    if (!Number.isInteger(page) || !Number.isInteger(index)) return;
    const selected = [...ui.talentTreeSelectedNodeByPage ?? []];
    selected[page!] = index!;
    ui.talentTreeSelectedNodeByPage = selected;
    const treePage = root.querySelector<HTMLElement>(`.lobby-talent-tree-page[data-tree-page="${page}"]`);
    treePage?.querySelectorAll<HTMLButtonElement>("[data-ui-talent-tree-node]").forEach(node => {
      const active = node.dataset.uiTalentTreeNode === key;
      node.classList.toggle("is-selected", active);
      node.setAttribute("aria-pressed", String(active));
    });
    treePage?.querySelectorAll<HTMLElement>(".lobby-normal-tree-detail").forEach((detail, detailIndex) => {
      detail.hidden = detailIndex !== index;
    });
    scheduleLayout();
  }
  function showClickCue(target: HTMLElement | null, index: number): void {
    clearCue();
    syncLayout();
    cueTarget = target;
    if (!target) return;
    target.classList.add("replay-click-target");
    const stickyTabs = root.querySelector<HTMLElement>(".center-main-tabs");
    const toolbarHeight = stickyTabs && getComputedStyle(stickyTabs).position === "sticky"
      && stickyTabs.getBoundingClientRect().top <= 1 ? stickyTabs.getBoundingClientRect().bottom : 0;
    const rect = target.getBoundingClientRect();
    if (rect.top < toolbarHeight + 12 || rect.bottom > innerHeight - 32) {
      target.style.scrollMarginTop = `${toolbarHeight + 24}px`;
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    }
    cueFrame = document.createElement("div");
    cueFrame.className = "replay-click-cue";
    cueFrame.dataset.replayActionIndex = String(index);
    cueFrame.setAttribute("aria-hidden", "true");
    cueFrame.innerHTML = '<span class="replay-click-hand">👆</span>';
    root.append(cueFrame); positionCue();
  }
  function missingControl(label: string): void {
    pause();
    announce(`回放已暂停：找不到操作按钮（${label}）。`, true);
    renderPlayer();
  }
  function previewView(desired: PlayRenderUiState, paperId: string | undefined, done: () => void,
    version: number, index: number, depth = 0): void {
    if (version !== playVersion || !state) return;
    const step = getReplayNavigationStep(root, state, ui, desired, paperId, viewedPaperId);
    if (!step) { done(); return; }
    const target = root.querySelector<HTMLElement>(step.selector);
    if (!target || !target.getClientRects().length || target instanceof HTMLButtonElement && target.disabled || depth > 30) {
      missingControl(step.selector); return;
    }
    showClickCue(target, index);
    timer = setTimeout(() => {
      if (version !== playVersion) return;
      clearCue();
      ui = { ...ui, ...step.patch };
      if (step.paperId) viewedPaperId = step.paperId;
      renderPlayer();
      // Leave the newly opened panel visible before pointing at its next button.
      timer = setTimeout(() => previewView(desired, paperId, done, version, index, depth + 1), 180 / speed);
    }, 450 / speed);
  }
  function previewTalentNode(autoplay: boolean): boolean {
    const tour = talentTour;
    const key = tour?.nodes[tour.position];
    if (!tour || !key || session?.getIndex() !== tour.step) return false;
    const version = ++playVersion;
    previewView({ ...ui, activePlayTab: "talent", activeTalentTab: "character", isEventContentOpen: false, isEndingContentOpen: false }, undefined, () => {
      const target = root.querySelector<HTMLElement>(`[data-ui-talent-tree-node="${key}"]`);
      if (!target) { missingControl(`天赋 ${key}`); return; }
      showClickCue(target, tour.step);
      timer = setTimeout(() => {
        if (version !== playVersion || talentTour !== tour) return;
        clearCue(); selectTalentNode(key); tour.position++;
        if (autoplay && playing) schedulePlay(2000);
      }, 450 / speed);
    }, version, tour.step);
    return true;
  }
  function render(): void { if (session && state) renderPlayer(); else renderLibrary(); }
  function resetScene(): void {
    ui.activeLogPage = null;
    ui.activeEventId = null;
    ui.activeEventHistoryId = null;
    ui.activeEventHistoryIndex = null;
    ui.isEventContentOpen = false;
    ui.isEndingContentOpen = false;
  }
  function focusRecordedAction(previous: GameState | null): void {
    if (!state || !session || !recording) return;
    resetScene();
    const command = recording.replay.commands[session.getIndex() - 1];
    if (state.phase === "finished") { ui.activePlayTab = "events"; ui.isEndingContentOpen = true; return; }
    if (isOpeningTalentStep()) { ui.activePlayTab = "talent"; ui.activeTalentTab = "character"; return; }
    if (command?.kind !== "action") return;
    if (["resolve-event", "replay-event", "rewinder-replay-event"].includes(command.actionId)) {
      ui.activePlayTab = "events";
      ui.isEventContentOpen = true;
      const chain = previous?.eventQueue.find(item => item.id === command.payload.eventId)?.chainId;
      const event = state.eventQueue.find(item => item.id === command.payload.eventId || chain && item.chainId === chain);
      if (event) ui.activeEventId = event.id;
      else if (state.eventHistory.length) ui.activeEventHistoryId = ([...state.eventHistory].reverse().find(item => chain && item.chainId === chain) ?? state.eventHistory.at(-1))!.id;
      else ui.activeEventId = state.eventQueue[0]?.id;
    } else if (command.actionId === "start-game" || command.actionId === "next-month") {
      ui.activePlayTab = "events";
      ui.isEventContentOpen = true;
      ui.activeEventId = state.eventQueue[0]?.id;
    } else {
      const view = prepareReplayActionView(state, command, ui);
      ui = view.ui; viewedPaperId = view.paperId ?? null;
    }
  }
  async function seek(target: number, signal?: AbortSignal, direct = true): Promise<void> {
    if (!session) return;
    const active = session;
    const operation = ++seekVersion;
    busy = true;
    try {
      const next = await active.seek(Math.max(1, Math.min(active.getLength(), Math.trunc(target))), { signal });
      if (operation !== seekVersion || session !== active) return;
      const previous = state;
      state = next; viewedPaperId = null; busy = false; message = "";
      talentTour = null;
      if (direct) focusRecordedAction(previous);
      else {
        const command = recording?.replay.commands[active.getIndex() - 1];
        ui.isQuitConfirmationOpen = false;
        if (command?.kind === "action" && command.actionId === "set-date-display-mode") ui.dateDisplayMode = command.payload.dateDisplayMode;
        if (command?.kind === "action" && ["resolve-event", "replay-event", "rewinder-replay-event"].includes(command.actionId) && ui.isEventContentOpen
          && previous?.eventQueue.some(item => item.id === command.payload.eventId)) {
          const chain = previous?.eventQueue.find(item => item.id === command.payload.eventId)?.chainId;
          const event = state.eventQueue.find(item => item.id === command.payload.eventId || chain && item.chainId === chain);
          ui.activeEventHistoryIndex = null;
          ui.activeEventId = event?.id ?? null;
          ui.activeEventHistoryId = event ? null : [...state.eventHistory].reverse().find(item => chain && item.chainId === chain)?.id ?? null;
        }
      }
      if (direct && active.getIndex() >= active.getLength()) pause();
      renderPlayer();
      if (isOpeningTalentStep()) {
        const template = document.createElement("template");
        template.innerHTML = renderPlayScreen(state, { ...ui, activePlayTab: "talent", activeTalentTab: "character", isReplay: true });
        const nodes = [...template.content.querySelectorAll<HTMLButtonElement>("[data-ui-talent-tree-node]")]
          .filter(node => !node.disabled && !node.hasAttribute("data-curse-difficulty") && (Number(node.dataset.currentLevel) > 0 || node.dataset.fixed === "true"))
          .map(node => node.dataset.uiTalentTreeNode!);
        talentTour = { step: active.getIndex(), nodes, position: 0 };
      }
    } catch (cause) {
      if (operation !== seekVersion || session !== active || cause instanceof DOMException && cause.name === "AbortError") return;
      busy = false; pause(); announce(cause instanceof Error ? cause.message : "无法定位回放", true); render();
    }
  }
  function previewNextAction(autoplay: boolean): void {
    if (!session || !state || !recording || session.getIndex() >= session.getLength()) return;
    if (previewTalentNode(autoplay)) return;
    const command = recording.replay.commands[session.getIndex()]!;
    const index = session.getIndex();
    const version = ++playVersion;
    const timing = getReplayActionTiming(command);
    const advance = async (): Promise<void> => {
      if (version !== playVersion || !session || (autoplay && !playing)) return;
      playbackSeek = new AbortController();
      await seek(index + 1, playbackSeek.signal, false);
      playbackSeek = undefined;
      if (version !== playVersion) return;
      if (session && session.getIndex() === session.getLength()) {
        if (state?.phase === "finished") previewView({ ...ui, activePlayTab: "events", isEventContentOpen: false, isEndingContentOpen: true }, undefined,
          () => { pause(); syncPlaybackButton(); }, version, index + 1);
        else { pause(); syncPlaybackButton(); }
      } else if (autoplay && playing) schedulePlay(isOpeningTalentStep() ? 150 : timing.resultMs);
    };
    // Old recordings can retain obsolete event acknowledgements after a scene
    // now closes immediately. Only omit commands proven to change no game data.
    if (command.kind === "action" && command.actionId === "resolve-event" && !state.eventQueue.some(event => event.id === command.payload.eventId)) {
      const next = executeReplayCommand(structuredClone(state), command, recording.replay.ruleset);
      if (replayStateDigest(next) === replayStateDigest(state)) { void advance(); return; }
    }
    const view = prepareReplayActionView(state, command, ui);
    previewView(view.ui, command.kind === "action" && command.actionId === "select-paper" ? undefined : view.paperId, () => {
      if (command.kind === "help") { void advance(); return; }
      const target = getReplayActionTarget(root, command);
      if (!target) { missingControl(command.kind === "action" ? command.actionId : "帮助"); return; }
      showClickCue(target, index + 1);
      timer = setTimeout(() => { void advance(); }, timing.previewMs / speed);
    }, version, index + 1);
  }
  function schedulePlay(delayMs = 100): void {
    clearTimeout(timer);
    if (!playing || !session) return;
    playVersion++;
    timer = setTimeout(() => { if (playing) previewNextAction(true); }, delayMs / speed);
  }
  async function showLibrary(): Promise<void> {
    const route = ++routeVersion;
    metricsRequest?.abort();
    pause(); session?.dispose(); session = null; recording = null; recordingId = null; state = null; busy = true; deleting = null;
    renderLibrary();
    try {
      const result = await library.list();
      if (route !== routeVersion) return;
      summaries = result;
    } catch (cause) { if (route === routeVersion) announce(cause instanceof Error ? cause.message : "无法打开本地回放库", true); }
    if (route === routeVersion) { busy = false; renderLibrary(); }
  }
  async function open(id: string): Promise<void> {
    const route = ++routeVersion;
    metricsRequest?.abort();
    pause(); session?.dispose(); session = null; state = null; recording = null; recordingId = null; message = ""; busy = true;
    root.innerHTML = `<main class="replay-loading"><p class="replay-eyebrow">本地回放</p><h1>正在展开这一局</h1><progress aria-label="读取回放"></progress><p>还原操作与随机结果…</p></main>`;
    try {
      const loaded = await library.get(id);
      if (route !== routeVersion) return;
      if (!loaded) throw new Error("这份回放不在当前浏览器中，可以先导入回放文件。");
      recording = loaded;
      recordingId = id;
      session = createReplaySession(loaded);
      const active = session;
      await active.seek(active.getLength());
      if (route !== routeVersion || session !== active) return;
      ui = { activePlayTab: "events", dateDisplayMode: "academic", isEventContentOpen: false, academicArchiveAct: 0 };
      await seek(1, undefined, false);
    } catch (cause) {
      if (route !== routeVersion) return;
      announce(cause instanceof Error ? cause.message : "无法打开回放", true);
      await showLibrary();
    }
  }
  function navigate(id: string): void {
    metricsRequest?.abort();
    history.pushState({}, "", replayHref(id));
    void ((official && id === "official") || (!official && id === "library") ? showLibrary() : open(id));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function exportFile(id: string): Promise<void> {
    try {
      const text = await library.export(id);
      const blob = new Blob([text], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href; anchor.download = `研究生模拟器2.0-${id}.phdreplay.json`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (cause) { announce(cause instanceof Error ? cause.message : "回放导出失败", true); render(); }
  }
  async function importFile(file: File): Promise<void> {
    if (busy) return;
    busy = true; announce("正在检查并保存回放…"); renderLibrary();
    try {
      if (file.size > MAX_LOCAL_REPLAY_BYTES) throw new Error("回放文件超过20MB，请选择较小的文件。");
      await library.import(await file.text());
      announce("回放已保存到本地。", false);
    } catch (cause) { announce(cause instanceof Error ? cause.message : "回放导入失败", true); }
    await showLibrary();
  }

  const numericUi: Record<string, keyof PlayRenderUiState> = {
    uiRelationshipIndex: "activeRelationshipIndex", uiResearchIndex: "currentResearchPaperIndex", uiLogPageIndex: "activeLogPage",
    uiEventSceneIndex: "activeEventHistoryIndex", uiAdvisorSalaryStart: "advisorSalaryStartIndex", uiLabInheritancePage: "labInheritancePage",
    uiLoverRewardPage: "loverRewardPage", uiInternshipPage: "internshipPage", uiGameGrowthPage: "gameGrowthPage", uiAcademicArchiveAct: "academicArchiveAct",
  };
  root.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const paper = target.closest<HTMLElement>("[data-ui-select-workstation-paper]");
    if (paper && state && !target.closest("[data-action]")) {
      pause(); viewedPaperId = paper.dataset.uiSelectWorkstationPaper ?? null; renderPlayer(); return;
    }
    const button = target.closest<HTMLElement>("button, a");
    if (button?.hasAttribute("data-replay-inert")) { event.preventDefault(); return; }
    const data = button?.dataset;
    if (data?.replayRoute && OFFICIAL_REPLAY_SLOTS.some(slot => slot.route === data.replayRoute)) { officialRoute = data.replayRoute as OfficialReplayRoute; renderLibrary(); return; }
    if (data?.replayOpen) { event.preventDefault(); navigate(data.replayOpen); return; }
    if (button?.hasAttribute("data-replay-library")) { event.preventDefault(); navigate(official ? "official" : "library"); return; }
    if (button?.hasAttribute("data-replay-import")) { root.querySelector<HTMLInputElement>("[data-replay-file]")?.click(); return; }
    if (button?.hasAttribute("data-replay-export")) {
      const id = data?.replayExport || recordingId;
      if (id) void exportFile(id);
      return;
    }
    if (data?.replayDelete) { deleting = data.replayDelete; renderLibrary(); return; }
    if (button?.hasAttribute("data-replay-cancel-delete")) { deleting = null; renderLibrary(); return; }
    if (data?.replayConfirmDelete && !busy) {
      busy = true; void library.remove(data.replayConfirmDelete).then(() => { announce("回放已删除。"); return showLibrary(); }).catch(cause => { busy = false; announce(cause instanceof Error ? cause.message : "删除失败", true); renderLibrary(); }); return;
    }
    if (button?.hasAttribute("data-replay-play") && session) {
      if (playing) pause();
      else { playing = true; if (session.getIndex() === session.getLength()) void seek(1).then(() => schedulePlay()); else schedulePlay(); }
      syncPlaybackButton();
      return;
    }
    if (data?.replayStep && session) {
      pause();
      if (Number(data.replayStep) > 0) previewNextAction(false);
      else void seek(session.getIndex() - 1);
      return;
    }
    if (!state || !data) return;
    if (data.uiTalentTreeNode) {
      pause(); talentTour = null;
      selectTalentNode(data.uiTalentTreeNode); syncPlaybackButton(); return;
    }
    // Browsing a panel pauses playback so the next cue cannot pull the view away.
    pause();
    talentTour = null;
    // These actions affect only view state and never enter the game engine.
    if (button.hasAttribute("data-effect-sources")) {
      const box = root.querySelector<HTMLElement>("#new-effect-source-box");
      if (!box) return;
      const wasSelected = button.getAttribute("aria-pressed") === "true";
      root.querySelectorAll<HTMLElement>(".effect-chip").forEach(chip => { chip.classList.remove("is-selected"); chip.setAttribute("aria-pressed", "false"); });
      box.replaceChildren();
      if (!wasSelected) {
        button.classList.add("is-selected"); button.setAttribute("aria-pressed", "true");
        try {
          const sources: unknown = JSON.parse(data.effectSources ?? "[]");
          if (Array.isArray(sources)) for (const source of sources) if (typeof source === "string") {
            const line = document.createElement("div"); line.className = "effect-source-line"; line.textContent = source; box.append(line);
          }
        } catch { /* Generated source details may be absent on older recordings. */ }
      }
      scheduleLayout(); return;
    }
    if (data.uiPlayTab) ui.activePlayTab = data.uiPlayTab as PlayRenderUiState["activePlayTab"];
    else if (data.uiShopTab) ui.activeShopTab = data.uiShopTab as PlayRenderUiState["activeShopTab"];
    else if (data.uiTalentTab) ui.activeTalentTab = data.uiTalentTab as PlayRenderUiState["activeTalentTab"];
    else if (data.uiOpenEventId) { resetScene(); ui.isEventContentOpen = true; ui.activeEventId = data.uiOpenEventId; ui.activePlayTab = "events"; }
    else if (data.uiOpenEventHistoryId) { resetScene(); ui.isEventContentOpen = true; ui.activeEventHistoryId = data.uiOpenEventHistoryId; ui.activePlayTab = "events"; }
    else if (button.hasAttribute("data-ui-close-event-content")) resetScene();
    else if (button.hasAttribute("data-ui-open-ending-content")) { resetScene(); ui.isEndingContentOpen = true; }
    else if (button.hasAttribute("data-ui-close-ending-content")) resetScene();
    else if (data.uiResearchSort) { ui.researchSortMode = data.uiResearchSort as PlayRenderUiState["researchSortMode"]; ui.currentResearchPaperIndex = null; ui.researchPageIndex = 0; }
    else if (data.uiResearchAuthorship) { ui.researchAuthorshipFilter = ui.researchAuthorshipFilter === data.uiResearchAuthorship ? "all" : data.uiResearchAuthorship as PlayRenderUiState["researchAuthorshipFilter"]; ui.currentResearchPaperIndex = null; ui.researchPageIndex = 0; }
    else if (data.uiResearchPage) ui.researchPageIndex = Math.floor(Number(data.uiResearchPage) / 5);
    else if (data.uiPendingNav) ui.activePendingPage = Math.max(0, Number(root.querySelector<HTMLElement>("[data-pending-page-index]")?.dataset.pendingPageIndex ?? 0) + (data.uiPendingNav === "prev" ? -1 : 1));
    else if (button.hasAttribute("data-ui-san-chart-toggle")) ui.isSanChartOpen = !ui.isSanChartOpen;
    else if (data.uiRewinderAct) ui.activeRewinderAct = data.uiRewinderAct as PlayRenderUiState["activeRewinderAct"];
    else if (button.hasAttribute("data-ui-help-toggle")) ui.isHelpOpen = !ui.isHelpOpen;
    else if (data.uiHelpPage !== undefined) {
      const context = getPlayHelpContext(ui);
      ui.helpPageByContext = { ...ui.helpPageByContext, [context.key]: getPlayHelpPageIndex(context, Number(data.uiHelpPage)) };
    }
    else {
      const numericKey = Object.keys(numericUi).find(key => data[key] !== undefined);
      if (!numericKey) return;
      Object.assign(ui, { [numericUi[numericKey]!]: Number(data[numericKey]) });
    }
    renderPlayer();
  });
  root.addEventListener("change", event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.hasAttribute("data-replay-file")) { const file = input.files?.[0]; if (file) void importFile(file); }
    else if (input instanceof HTMLInputElement && input.hasAttribute("data-replay-seek")) { pause(); void seek(Number(input.value)); }
    else if (input instanceof HTMLSelectElement && input.hasAttribute("data-replay-month")) { pause(); void seek(Number(input.value)); }
    else if (input instanceof HTMLSelectElement && input.hasAttribute("data-replay-speed")) {
      const resume = playing; pause(); speed = Number(input.value); playing = resume; syncPlaybackButton(); schedulePlay();
    }
  });
  root.addEventListener("pointerdown", event => {
    if (event.target instanceof HTMLInputElement && event.target.hasAttribute("data-replay-seek")) pause();
  });
  root.addEventListener("input", event => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.hasAttribute("data-replay-seek")) {
      pause(); const output = root.querySelector(".replay-inline-progress output");
      if (output) output.textContent = `${input.value} / ${input.max} 步`;
    }
  });
  root.addEventListener("keydown", event => {
    if (!session || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault(); pause();
      if (event.key === "ArrowRight") previewNextAction(false); else void seek(session.getIndex() - 1);
    }
  });
  const popstate = (): void => { metricsRequest?.abort(); const id = new URLSearchParams(location.search).get("replay") || (official ? "official" : "library"); void (((official && id === "official") || (!official && id === "library")) ? showLibrary() : open(id)); };
  window.addEventListener("popstate", popstate);
  await (((official && initialId === "official") || (!official && initialId === "library")) ? showLibrary() : open(initialId));
  return {
    dispose() { metricsRequest?.abort(); pause(); session?.dispose(); observer.disconnect(); document.querySelector("#relationship-tooltip")?.remove(); cancelAnimationFrame(animationFrame); window.removeEventListener("resize", scheduleLayout); window.removeEventListener("scroll", positionCue, true); window.removeEventListener("popstate", popstate); routeVersion++; seekVersion++; },
  };
}
