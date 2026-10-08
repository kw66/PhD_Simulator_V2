import { GAME_ANNOUNCEMENTS, getAnnouncementPageIndex } from "./v2-announcements";
import { renderVisitMetrics } from "./v2-render-community";

const announcementCollapseStates = new WeakMap<HTMLElement, {
  expanded: Set<string>;
  dispose?: () => void;
}>();

export function bindAnnouncementCollapse(root: HTMLElement): () => void {
  let state = announcementCollapseStates.get(root);
  if (!state) {
    state = { expanded: new Set() };
    announcementCollapseStates.set(root, state);
  }
  state.dispose?.();
  const expandedDates = state.expanded;
  const view = root.ownerDocument.defaultView;
  const cards = Array.from(root.querySelectorAll<HTMLElement>(".announcement-card[data-announcement-date]"));
  let disposed = false;

  const updateCard = (card: HTMLElement): void => {
    const body = card.querySelector<HTMLElement>("[data-announcement-body]");
    const button = card.querySelector<HTMLButtonElement>("[data-announcement-toggle]");
    if (!body || !button) return;
    const previousExpanded = card.dataset.announcementExpanded;
    card.dataset.announcementExpanded = "false";
    if (body.clientHeight === 0) {
      card.dataset.announcementExpanded = previousExpanded ?? "false";
      return;
    }
    const overflowing = body.scrollHeight > body.clientHeight;
    const expanded = overflowing && expandedDates.has(card.dataset.announcementDate!);
    card.dataset.announcementOverflow = String(overflowing);
    card.dataset.announcementExpanded = String(expanded);
    button.hidden = !overflowing;
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "收起" : "展开";
  };
  const update = (): void => {
    if (!disposed) cards.forEach(updateCard);
  };
  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("[data-announcement-toggle]");
    const card = button?.closest<HTMLElement>(".announcement-card[data-announcement-date]");
    if (!button || button.hidden || !card || !root.contains(card)) return;
    const date = card.dataset.announcementDate!;
    if (expandedDates.has(date)) expandedDates.delete(date);
    else expandedDates.add(date);
    updateCard(card);
  };

  root.addEventListener("click", onClick);
  view?.addEventListener("resize", update);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
  for (const card of cards) {
    card.querySelectorAll("[data-announcement-body], .announcement-changes").forEach((element) => observer?.observe(element));
  }
  void root.ownerDocument.fonts?.ready.then(update);
  update();

  const dispose = (): void => {
    disposed = true;
    observer?.disconnect();
    root.removeEventListener("click", onClick);
    view?.removeEventListener("resize", update);
  };
  state.dispose = dispose;
  return dispose;
}

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
    <article class="announcement-card" aria-label="${announcement.date} 更新记录" data-announcement-date="${announcement.date}" data-announcement-expanded="false">
      <div class="announcement-body" id="announcement-body-${announcement.date}" data-announcement-body>
        <ul class="announcement-changes">
        ${announcement.changes.map((change) => `<li>
          <span class="announcement-category">${change.category}</span>
          <div><strong>${escapeHtml(change.title)}</strong><p>${escapeHtml(change.description)}</p></div>
        </li>`).join("")}
        </ul>
      </div>
      <button class="announcement-toggle" type="button" data-announcement-toggle aria-controls="announcement-body-${announcement.date}" aria-expanded="false" hidden>展开</button>
    </article>
  `;
}

export function renderLobbyAnnouncementRailView(requestedPage = 0): string {
  return `<section class="lobby-profile-section lobby-message-rail-view lobby-announcement-rail-view" aria-labelledby="lobby-announcement-title">
    <div class="lobby-live-metrics" aria-label="玩家访问数据">${renderVisitMetrics()}</div>
    <div class="announcement-content" data-announcement-content>${renderAnnouncementPage(requestedPage)}</div>
  </section>`;
}
