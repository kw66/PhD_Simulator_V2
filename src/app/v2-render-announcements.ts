import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "./v2-announcements";
import { renderVisitMetrics } from "./v2-render-community";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function renderAnnouncementPage(requestedPage = 0): string {
  const page = getAnnouncementPageIndex(requestedPage);
  const announcement = GAME_ANNOUNCEMENTS[page]!;
  return `
    <div class="community-message-heading announcement-heading">
      <h2 id="lobby-announcement-title">更新记录</h2>
      <time class="announcement-date" datetime="${announcement.date}">${announcement.date.replaceAll("-", ".")}</time>
      <nav class="community-pagination compact-pagination" aria-label="公告分页">
        <button class="pager-arrow" type="button" data-ui-announcement-page="${page - 1}" aria-label="较新公告"${page === 0 ? " disabled" : ""}><i data-lucide="chevron-left" aria-hidden="true"></i></button>
        <span class="pagination-count" aria-live="polite" aria-atomic="true">${page + 1}/${GAME_ANNOUNCEMENTS.length}</span>
        <button class="pager-arrow" type="button" data-ui-announcement-page="${page + 1}" aria-label="较早公告"${page === GAME_ANNOUNCEMENTS.length - 1 ? " disabled" : ""}><i data-lucide="chevron-right" aria-hidden="true"></i></button>
      </nav>
    </div>
    <article class="announcement-card" aria-label="${announcement.date} 更新记录" data-announcement-date="${announcement.date}">
      <ul class="announcement-changes">
        ${announcement.changes.map((change) => `<li>
          <span class="announcement-category">${change.category}</span>
          <div><strong>${escapeHtml(change.title)}</strong><p>${escapeHtml(change.description)}</p></div>
        </li>`).join("")}
      </ul>
    </article>
  `;
}

export function renderLobbyAnnouncementRailView(requestedPage = 0): string {
  return `<section class="lobby-profile-section lobby-message-rail-view lobby-announcement-rail-view" aria-labelledby="lobby-announcement-title">
    <div class="lobby-live-metrics" aria-label="玩家访问数据">${renderVisitMetrics()}</div>
    <div class="announcement-content" data-announcement-content>${renderAnnouncementPage(requestedPage)}</div>
  </section>`;
}
