import { createIcons, ArrowLeft, Download, Film, SkipBack, SkipForward, Trash2, Upload, Activity, ArrowRight, Award, Backpack, BadgeCheck, BadgeDollarSign, Bell, BookOpen, Brain, Briefcase, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartNoAxesColumn, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, CircleHelp, CircleDollarSign, Clock3, Coffee, Coins, Cpu, Crown, Database, Dumbbell, Eye, Feather, FastForward, Files, FileHeart, FileText, FilePlus2, Flame, FlaskConical, Footprints, Gamepad2, Gem, Gift, GitFork, GraduationCap, HandCoins, HandHelping, Handshake, Heart, HeartCrack, HeartHandshake, HeartPlus, HeartPulse, History, House, Hourglass, Infinity, Laptop, Lightbulb, Lock, LogOut, Medal, MessageCircle, MessageSquare, MessagesSquare, Microscope, Microchip, Monitor, MoveUpRight, Network, NotebookPen, Presentation, PiggyBank, Pause, Play, RefreshCw, Reply, RotateCcw, Rocket, Send, Settings, Shield, ShieldPlus, Skull, Smile, Sparkles, Sprout, Star, Store, Sun, Sunrise, Target, Trophy, TrendingUp, Users, UsersRound, ShoppingCart, UserRound, UserRoundPlus, Wallet, Wrench, X, Zap } from "lucide";
import { getAcademicCalendarMonth } from "../core/v2-calendar";
import { MAX_LOCAL_REPLAY_BYTES, createReplaySession, type ReplayRecording, type ReplaySession } from "../core/v2-local-replay";
import { getCalendarForTotalMonths, getRoleDefinition } from "../core/v2-progression";
import type { GameState } from "../core/v2-types";
import { createEventLayout } from "./v2-event-layout";
import { getPlayHelpContext, getPlayHelpPageIndex } from "./v2-play-help";
import { createRelationshipTooltips } from "./v2-relationship-tooltips";
import { createReplayLibrary, type ReplayLibrary, type ReplaySummary } from "./v2-replay-library";
import { prepareReplayActionView, getReplayActionTarget, getReplayActionTiming } from "./v2-replay-action-focus";
import { renderEventLayoutSamples, renderPlayScreen } from "./v2-render-play";
import { getRoleCardPortraitUrl } from "./v2-role-portrait-assets";
import type { PlayRenderUiState } from "./v2-render-types";
import { createResponsiveScoreCharts } from "./v2-responsive-score-charts";
import "../styles/mobile-base.css";
import "../styles/mobile-panels.css";
import "../styles/mobile-events.css";
import "../styles/v2-replay-player.css";

const icons = { ArrowLeft, Download, Film, SkipBack, SkipForward, Trash2, Upload, Activity, ArrowRight, Award, Backpack, BadgeCheck, BadgeDollarSign, Bell, BookOpen, Brain, Briefcase, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, ChartNoAxesColumn, Check, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, CircleHelp, CircleDollarSign, Clock3, Coffee, Coins, Cpu, Crown, Database, Dumbbell, Eye, Feather, FastForward, Files, FileHeart, FileText, FilePlus2, Flame, FlaskConical, Footprints, Gamepad2, Gem, Gift, GitFork, GraduationCap, HandCoins, HandHelping, Handshake, Heart, HeartCrack, HeartHandshake, HeartPlus, HeartPulse, History, House, Hourglass, Infinity, Laptop, Lightbulb, Lock, LogOut, Medal, MessageCircle, MessageSquare, MessagesSquare, Microscope, Microchip, Monitor, MoveUpRight, Network, NotebookPen, Presentation, PiggyBank, Pause, Play, RefreshCw, Reply, RotateCcw, Rocket, Send, Settings, Shield, ShieldPlus, Skull, Smile, Sparkles, Sprout, Star, Store, Sun, Sunrise, Target, Trophy, TrendingUp, Users, UsersRound, ShoppingCart, UserRound, UserRoundPlus, Wallet, Wrench, X, Zap };
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
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function renderSummary(summary: ReplaySummary): string {
  const role = getRoleDefinition(summary.roleId);
  const status = summary.academicYear ? `第${summary.academicYear}学年归档` : summary.ending ? endings[summary.ending] ?? "本轮结束" : summary.phase === "finished" ? "本轮结束" : "途中记录";
  return `<article class="replay-card" data-replay-card="${escape(summary.id)}">
    <div class="replay-card-heading">
      <img class="replay-card-portrait" src="${escape(getRoleCardPortraitUrl(summary.roleId))}" alt="" loading="lazy">
      <div class="replay-card-identity"><span class="replay-card-status">${escape(status)}</span><h2>${escape(role.name)}</h2><p>${escape(summary.playerName ?? "未署名")}</p></div>
    </div>
    <div class="replay-card-metrics"><span><strong>${summary.totalMonths}<small>个月</small></strong>在校时光</span><span><strong>${summary.commandCount}<small>步</small></strong>操作记录</span><span><strong>${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(summary.researchScore)}</strong>科研分</span></div>
    <p class="replay-card-date">${icon("clock-3")}${escape(dateLabel(summary.updatedAt))}</p>
    <div class="replay-card-actions"><a class="replay-link is-primary" href="${replayHref(summary.id)}" data-replay-open="${escape(summary.id)}">${icon("play")}播放回放</a><button class="replay-button" type="button" data-replay-export="${escape(summary.id)}">${icon("download")}导出</button><button class="replay-button is-delete" type="button" data-replay-delete="${escape(summary.id)}" aria-label="删除${escape(role.name)}的回放">${icon("trash-2")}</button></div>
  </article>`;
}

/** A separate browser entry: no store, account, achievement or remote clients are created here. */
export async function bootstrapReplayPlayer(root: HTMLDivElement, initialId = "library", options: { library?: ReplayLibrary } = {}) {
  const library = options.library ?? createReplayLibrary();
  let summaries: ReplaySummary[] = [];
  let recording: ReplayRecording | null = null;
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
  const eventLayout = createEventLayout(root);
  const tooltips = createRelationshipTooltips(root);
  const charts = createResponsiveScoreCharts(root);
  root.classList.add("replay-app");
  document.title = "本地回放 · 研究生模拟器 2.0";

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
  function announce(text: string, isError = false): void { message = text; error = isError; }
  function messageHtml(): string { return message ? `<p class="replay-message${error ? " is-error" : ""}" role="${error ? "alert" : "status"}">${escape(message)}</p>` : ""; }
  function decorate(): void {
    createIcons({ icons, root });
    scheduleLayout();
  }
  function renderLibrary(): void {
    root.innerHTML = `<main class="replay-library">
      <div class="replay-library-topline"><span>研究生模拟器 <b>2.0</b></span><a href="${gameHref()}">${icon("arrow-left")}返回游戏</a></div>
      <section class="replay-library-sheet">
        <header class="replay-library-header"><div class="replay-library-title"><span class="replay-title-icon">${icon("history")}</span><div><p class="replay-eyebrow">对局档案</p><h1>本地回放</h1></div></div>${summaries.length ? `<nav class="replay-library-actions"><button class="replay-button is-primary" type="button" data-replay-import${busy ? " disabled" : ""}>${icon("upload")}${busy ? "正在读取…" : "导入回放"}</button></nav>` : ""}</header>
        ${messageHtml()}${deleting ? `<div class="replay-confirm" role="alert"><span>删除这份本地回放？</span><button class="replay-button" type="button" data-replay-cancel-delete>保留</button><button class="replay-button" type="button" data-replay-confirm-delete="${escape(deleting)}"${busy ? " disabled" : ""}>确认删除</button></div>` : ""}
        ${summaries.length ? `<div class="replay-list-heading"><h2>已导入的回放</h2><span>${summaries.length} 份记录</span></div><div class="replay-grid">${summaries.map(renderSummary).join("")}</div>` : `<section class="replay-empty"><div class="replay-empty-art" aria-hidden="true"><span class="replay-art-page"></span><span class="replay-art-page"></span><span class="replay-art-cover">${icon("film")}<span>对局回放</span><span class="replay-art-line"></span></span><span class="replay-art-play">${icon("play")}</span></div><h2>还没有导入回放</h2><p>导入游戏中下载的回放文件，重看这一局。</p><button class="replay-button is-primary" type="button" data-replay-import${busy ? " disabled" : ""}>${icon("upload")}${busy ? "正在读取…" : "导入回放文件"}</button><p class="replay-empty-hint">游戏内「设置」→「下载本局回放」</p></section>`}
      </section><input class="replay-file-input" type="file" accept=".json,.phdreplay,application/json" data-replay-file aria-label="选择本地回放文件">
    </main>`;
    decorate();
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
  async function seek(target: number, signal?: AbortSignal): Promise<void> {
    if (!session) return;
    const active = session;
    const operation = ++seekVersion;
    busy = true;
    try {
      const next = await active.seek(Math.max(1, Math.min(active.getLength(), Math.trunc(target))), { signal });
      if (operation !== seekVersion || session !== active) return;
      const previous = state;
      state = next; viewedPaperId = null; busy = false; message = "";
      focusRecordedAction(previous);
      if (active.getIndex() >= active.getLength()) pause();
      renderPlayer();
    } catch (cause) {
      if (operation !== seekVersion || session !== active || cause instanceof DOMException && cause.name === "AbortError") return;
      busy = false; pause(); announce(cause instanceof Error ? cause.message : "无法定位回放", true); render();
    }
  }
  function previewNextAction(autoplay: boolean): void {
    if (!session || !state || !recording || session.getIndex() >= session.getLength()) return;
    const command = recording.replay.commands[session.getIndex()]!;
    const index = session.getIndex();
    const version = ++playVersion;
    const timing = getReplayActionTiming(command);
    const advance = async (): Promise<void> => {
      if (version !== playVersion || !session || (autoplay && !playing)) return;
      playbackSeek = new AbortController();
      await seek(index + 1, playbackSeek.signal);
      playbackSeek = undefined;
      if (version !== playVersion) return;
      if (autoplay && playing) schedulePlay(timing.resultMs);
    };
    // Month transitions have no artificial before-click hold or blank interim render.
    if (timing.previewMs === 0) { void advance(); return; }
    const view = prepareReplayActionView(state, command, ui);
    ui = view.ui; viewedPaperId = view.paperId ?? null;
    renderPlayer();
    syncLayout();
    cueTarget = getReplayActionTarget(root, command);
    if (cueTarget) {
      cueTarget.classList.add("replay-click-target");
      const stickyTabs = root.querySelector<HTMLElement>(".center-main-tabs");
      const toolbarHeight = stickyTabs && getComputedStyle(stickyTabs).position === "sticky"
        && stickyTabs.getBoundingClientRect().top <= 1 ? stickyTabs.getBoundingClientRect().bottom : 0;
      const rect = cueTarget.getBoundingClientRect();
      if (rect.top < toolbarHeight + 12 || rect.bottom > innerHeight - 32) {
        cueTarget.style.scrollMarginTop = `${toolbarHeight + 24}px`;
        cueTarget.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      }
      cueFrame = document.createElement("div");
      cueFrame.className = "replay-click-cue";
      cueFrame.dataset.replayActionIndex = String(index + 1);
      cueFrame.setAttribute("aria-hidden", "true");
      cueFrame.innerHTML = '<span class="replay-click-hand">👆</span>';
      root.append(cueFrame); positionCue();
    }
    timer = setTimeout(() => { void advance(); }, timing.previewMs / speed);
  }
  function schedulePlay(delayMs = 100): void {
    clearTimeout(timer);
    if (!playing || !session) return;
    playVersion++;
    timer = setTimeout(() => { if (playing) previewNextAction(true); }, delayMs / speed);
  }
  async function showLibrary(): Promise<void> {
    const route = ++routeVersion;
    pause(); session?.dispose(); session = null; recording = null; state = null; busy = true; deleting = null;
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
    pause(); session?.dispose(); session = null; state = null; recording = null; message = ""; busy = true;
    root.innerHTML = `<main class="replay-loading"><p class="replay-eyebrow">本地回放</p><h1>正在展开这一局</h1><progress aria-label="读取回放"></progress><p>还原操作与随机结果…</p></main>`;
    try {
      const loaded = await library.get(id);
      if (route !== routeVersion) return;
      if (!loaded) throw new Error("这份回放不在当前浏览器中，可以先导入回放文件。");
      recording = loaded;
      session = createReplaySession(loaded);
      const active = session;
      await active.seek(active.getLength());
      if (route !== routeVersion || session !== active) return;
      ui = { activePlayTab: "events", dateDisplayMode: "academic", isEventContentOpen: true, academicArchiveAct: 0 };
      await seek(1);
    } catch (cause) {
      if (route !== routeVersion) return;
      announce(cause instanceof Error ? cause.message : "无法打开回放", true);
      await showLibrary();
    }
  }
  function navigate(id: string): void {
    history.pushState({}, "", replayHref(id));
    void (id === "library" ? showLibrary() : open(id));
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
    if (data?.replayOpen) { event.preventDefault(); navigate(data.replayOpen); return; }
    if (button?.hasAttribute("data-replay-library")) { event.preventDefault(); navigate("library"); return; }
    if (button?.hasAttribute("data-replay-import")) { root.querySelector<HTMLInputElement>("[data-replay-file]")?.click(); return; }
    if (button?.hasAttribute("data-replay-export")) {
      const id = data?.replayExport || recording?.id;
      if (id) void exportFile(id);
      return;
    }
    if (data?.replayDelete) { deleting = data.replayDelete; renderLibrary(); return; }
    if (button?.hasAttribute("data-replay-cancel-delete")) { deleting = null; renderLibrary(); return; }
    if (data?.replayConfirmDelete && !busy) {
      busy = true; void library.remove(data.replayConfirmDelete).then(() => { announce("回放已删除。"); return showLibrary(); }).catch(cause => { busy = false; announce(cause instanceof Error ? cause.message : "删除失败", true); renderLibrary(); }); return;
    }
    if (button?.hasAttribute("data-replay-play") && session) {
      if (playing) { pause(); renderPlayer(); }
      else { playing = true; if (session.getIndex() === session.getLength()) void seek(1).then(() => schedulePlay()); else schedulePlay(); renderPlayer(); }
      return;
    }
    if (data?.replayStep && session) {
      pause();
      if (Number(data.replayStep) > 0) previewNextAction(false);
      else void seek(session.getIndex() - 1);
      return;
    }
    if (!state || !data) return;
    // Browsing a panel pauses playback so the next cue cannot pull the view away.
    pause();
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
      const resume = playing; pause(); speed = Number(input.value); playing = resume; renderPlayer(); schedulePlay();
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
  const popstate = (): void => { const id = new URLSearchParams(location.search).get("replay") || "library"; void (id === "library" ? showLibrary() : open(id)); };
  window.addEventListener("popstate", popstate);
  await (initialId === "library" ? showLibrary() : open(initialId));
  return {
    dispose() { pause(); session?.dispose(); observer.disconnect(); document.querySelector("#relationship-tooltip")?.remove(); cancelAnimationFrame(animationFrame); window.removeEventListener("resize", scheduleLayout); window.removeEventListener("scroll", positionCue, true); window.removeEventListener("popstate", popstate); routeVersion++; seekVersion++; },
  };
}
