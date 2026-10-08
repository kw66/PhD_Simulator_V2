import type { RoleRailViewId } from "./v2-render-types";
import { MESSAGE_MAX_LENGTH } from "./v2-community-messages";

function renderMessageComposer(mode: "board" | "feedback"): string {
  const prefix = mode === "board" ? "lobby-message" : "game-feedback";

  return `
    <section class="community-compose${mode === "feedback" ? " is-feedback" : ""}">
      <div class="community-reply-indicator" data-community-reply-indicator="${mode}" hidden>
        <span class="community-reply-context"><strong data-community-reply-name></strong><span data-community-reply-preview></span></span>
        <button class="community-cancel-reply" type="button" data-community-cancel-reply="${mode}" aria-label="取消回复"><i data-lucide="x" aria-hidden="true"></i><span>取消</span></button>
      </div>
      <div class="community-compose-top">
        <label for="${prefix}-nickname">昵称</label>
        <div class="community-nickname-wrap">
          <input id="${prefix}-nickname" type="text" maxlength="10" autocomplete="nickname" placeholder="怎么称呼你" data-community-nickname="${mode}" />
          <span class="community-nickname-count" data-community-nickname-count="${mode}" aria-hidden="true">0/10</span>
        </div>
        <button class="community-send-button" type="button" data-community-send="${mode}">
          <i data-lucide="send" aria-hidden="true"></i>
          <span>发送</span>
        </button>
      </div>
      <div class="community-content-wrap">
        <textarea id="${prefix}-content" rows="4" aria-label="留言内容" aria-describedby="${prefix}-count" placeholder="说点什么吧" data-community-content="${mode}"></textarea>
        <span class="community-character-count" id="${prefix}-count" data-community-char-count="${mode}">0/${MESSAGE_MAX_LENGTH}</span>
        <span class="community-service-state" data-community-notice="${mode}" role="status" aria-live="polite"></span>
      </div>
    </section>
  `;
}

export function renderVisitMetrics(): string {
  return `
    <span>
      <span class="lobby-metric-label"><i data-lucide="eye" aria-hidden="true"></i><span>访问（今日）</span></span>
      <strong data-community-stat="views">--（--）</strong>
    </span>
    <span>
      <span class="lobby-metric-label"><i data-lucide="users" aria-hidden="true"></i><span>访客（今日）</span></span>
      <strong data-community-stat="visitors">--（--）</strong>
    </span>
    <span>
      <span class="lobby-metric-label"><i data-lucide="gamepad-2" aria-hidden="true"></i><span>游玩（今日）</span></span>
      <strong data-community-stat="games">--（--）</strong>
    </span>
  `;
}

function renderMessagePagination(): string {
  return `
    <div class="community-pagination compact-pagination" data-community-pagination aria-label="留言分页">
      <button class="pager-arrow" type="button" data-community-page-delta="-1" aria-label="上一页"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
      <span class="pagination-count" data-community-page-count aria-live="polite" aria-atomic="true">1/1</span>
      <button class="pager-arrow" type="button" data-community-page-delta="1" aria-label="下一页"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
    </div>
  `;
}

function renderCompactMessagePanel(mode: "board" | "feedback", titleId: string): string {
  return `
    <div class="community-message-heading${mode === "feedback" ? " is-dialog" : ""}">
      <h2 id="${titleId}">留言</h2>
      <strong class="community-message-count" data-community-count>0 条</strong>
      ${renderMessagePagination()}
      ${mode === "feedback" ? `<button class="community-feedback-close" type="button" data-ui-close-feedback aria-label="关闭">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>` : ""}
    </div>
    <div class="community-message-feed" data-community-feed>
      <div class="community-message-empty" data-community-empty>
        <i data-lucide="messages-square" aria-hidden="true"></i>
        <div class="community-message-empty-copy">
          <strong data-community-empty-title>正在加载留言</strong>
          <span data-community-empty-description></span>
          <button class="community-retry-button" type="button" data-community-retry hidden>重试</button>
        </div>
      </div>
      <div class="community-message-list" data-community-list hidden></div>
    </div>
    ${renderMessageComposer(mode)}
  `;
}

function renderRoleRailViewSwitcher(activeView: RoleRailViewId): string {
  return `
    <div class="lobby-profile-rail-tabs" role="tablist" aria-label="角色详情侧栏">
      <button
        class="lobby-profile-rail-tab${activeView === "achievements" ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${activeView === "achievements"}"
        data-ui-role-rail-view="achievements"
      >
        <i data-lucide="trophy" aria-hidden="true"></i><span>角色成就</span>
      </button>
      <button
        class="lobby-profile-rail-tab${activeView === "messages" ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${activeView === "messages"}"
        data-ui-role-rail-view="messages"
      >
        <i data-lucide="message-square" aria-hidden="true"></i><span>留言板</span>
      </button>
      <button
        class="lobby-profile-rail-tab${activeView === "announcements" ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${activeView === "announcements"}"
        data-ui-role-rail-view="announcements"
      >
        <i data-lucide="bell" aria-hidden="true"></i><span>游戏公告</span>
      </button>
    </div>
  `;
}

export function renderLobbyMasthead(activeRoleRailView: RoleRailViewId): string {
  return `
    <header class="lobby-masthead">
      <div class="lobby-masthead-main">
        <div class="lobby-brand-block">
          <strong><i data-lucide="graduation-cap" aria-hidden="true"></i><span>研究生模拟器v2.0</span></strong>
        </div>
        <nav class="lobby-project-links" aria-label="项目链接">
          <a href="https://xhslink.com/m/A2DFslJF4mb" target="_blank" rel="noreferrer"><i data-lucide="user-round" aria-hidden="true"></i><span>开发者</span></a>
          <a href="https://github.com/kw66/PhD_Simulator_V2" target="_blank" rel="noreferrer"><i data-lucide="git-fork" aria-hidden="true"></i><span>项目地址</span></a>
          <a href="https://kw66.github.io/games/" target="_blank" rel="noreferrer"><i data-lucide="gamepad-2" aria-hidden="true"></i><span>游戏合集</span></a>
        </nav>
      </div>
      <div class="lobby-masthead-side">
        ${renderRoleRailViewSwitcher(activeRoleRailView)}
      </div>
    </header>
  `;
}

export function renderLobbyMessageRailView(): string {
  return `
    <section class="lobby-profile-section lobby-message-rail-view" aria-labelledby="lobby-message-rail-title">
      <div class="lobby-live-metrics" aria-label="玩家访问数据">
        ${renderVisitMetrics()}
      </div>
      ${renderCompactMessagePanel("board", "lobby-message-rail-title")}
    </section>
  `;
}

export function renderGameFeedbackOverlay(): string {
  return `
    <div class="community-feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="game-feedback-title">
      <button class="community-feedback-backdrop" type="button" data-ui-close-feedback aria-label="关闭留言反馈"></button>
      <section class="community-feedback-dialog">
        ${renderCompactMessagePanel("feedback", "game-feedback-title")}
      </section>
    </div>
  `;
}
