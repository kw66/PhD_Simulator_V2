export type MessageSource = "board" | "feedback";

export interface CommunityMessage {
  id: number;
  nickname: string;
  content: string;
  source: MessageSource;
  created_at: string;
  parent_id: number | null;
}

const API_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/phd_simulator_v2_messages";
const API_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const NICKNAME_KEY = "kwgame_last_nickname";
const NICKNAME_MAX_LENGTH = 10;
export const MESSAGE_PAGE_SIZE = 5;

type MessageStatus = "idle" | "loading" | "ready" | "error";

interface MessageOptions {
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  onChange?: () => void;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createCommunityMessages(options: MessageOptions = {}) {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let nickname = "";
  try {
    nickname = storage?.getItem(NICKNAME_KEY) ?? "";
  } catch {
    // Private browsing can disable storage without disabling messages.
  }
  const contents: Record<MessageSource, string> = { board: "", feedback: "" };
  let draftBeforeReply = "";
  let messages: CommunityMessage[] = [];
  let replies: CommunityMessage[] = [];
  let replyTarget: { id: number; nickname: string; content: string; source: MessageSource } | null = null;
  const expandedReplyIds = new Set<number>();
  let total = 0;
  let visibleTotal: number | null = null;
  let page = 0;
  let status: MessageStatus = "idle";
  let submitting: MessageSource | null = null;
  let notice = "";
  let noticeSource: MessageSource | null = null;
  let loadRevision = 0;

  const notify = (): void => options.onChange?.();

  const loadPage = async (nextPage: number): Promise<void> => {
    if (!Number.isSafeInteger(nextPage) || nextPage < 0) return;
    if (nextPage !== page && replyTarget) {
      contents[replyTarget.source] = draftBeforeReply;
      replyTarget = null;
      draftBeforeReply = "";
    }
    const revision = ++loadRevision;
    status = "loading";
    page = nextPage;
    notify();
    try {
      const url = new URL(API_URL);
      url.searchParams.set("select", "id,nickname,content,source,created_at,parent_id");
      url.searchParams.set("parent_id", "is.null");
      url.searchParams.set("order", "created_at.desc,id.desc");
      url.searchParams.set("limit", String(MESSAGE_PAGE_SIZE));
      url.searchParams.set("offset", String(nextPage * MESSAGE_PAGE_SIZE));
      const countUrl = new URL(API_URL);
      countUrl.searchParams.set("select", "id");
      const responsePromise = request(url, {
        headers: { apikey: API_KEY, Prefer: "count=exact" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const visibleCountPromise = request(countUrl, {
        method: "HEAD",
        headers: { apikey: API_KEY, Prefer: "count=exact" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }).then((countResponse) => {
        const rangeTotal = countResponse.headers.get("Content-Range")?.split("/")[1];
        return countResponse.ok && rangeTotal && /^\d+$/.test(rangeTotal) ? Number(rangeTotal) : null;
      }).catch(() => null);
      const response = await responsePromise;
      if (!response.ok) throw new Error(`Message request failed: ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error("Invalid message response");
      const rangeTotal = response.headers.get("Content-Range")?.split("/")[1];
      const count = rangeTotal && /^\d+$/.test(rangeTotal) ? Number(rangeTotal) : rows.length;
      if (revision !== loadRevision) return;
      if (rows.length === 0 && nextPage > 0) {
        await loadPage(Math.max(0, Math.ceil(count / MESSAGE_PAGE_SIZE) - 1));
        return;
      }
      const mainMessages = rows as CommunityMessage[];
      let pageReplies: CommunityMessage[] = [];
      if (mainMessages.length > 0) {
        const replyUrl = new URL(API_URL);
        replyUrl.searchParams.set("select", "id,nickname,content,source,created_at,parent_id");
        replyUrl.searchParams.set("parent_id", `in.(${mainMessages.map((message) => message.id).join(",")})`);
        replyUrl.searchParams.set("order", "created_at.asc,id.asc");
        const replyResponse = await request(replyUrl, {
          headers: { apikey: API_KEY },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!replyResponse.ok) throw new Error(`Replies unavailable: ${replyResponse.status}`);
        const replyRows: unknown = await replyResponse.json();
        if (!Array.isArray(replyRows)) throw new Error("Invalid replies response");
        pageReplies = replyRows as CommunityMessage[];
      }
      if (revision !== loadRevision) return;
      const allCount = await visibleCountPromise;
      if (revision !== loadRevision) return;
      messages = mainMessages;
      replies = pageReplies;
      if (replyTarget && !mainMessages.some((message) => message.id === replyTarget?.id)) {
        contents[replyTarget.source] = draftBeforeReply;
        replyTarget = null;
        draftBeforeReply = "";
      }
      total = count;
      visibleTotal = allCount;
      status = "ready";
    } catch {
      if (revision !== loadRevision) return;
      status = "error";
    }
    notify();
  };

  const submit = async (source: MessageSource): Promise<boolean> => {
    if (submitting) return false;
    const target = replyTarget?.source === source ? replyTarget : null;
    const submittedNickname = nickname.trim();
    const submittedContent = contents[source].trim();
    noticeSource = source;
    if (!submittedNickname || submittedNickname.length > NICKNAME_MAX_LENGTH) {
      notice = `请输入不超过 ${NICKNAME_MAX_LENGTH} 字的昵称`;
      notify();
      return false;
    }
    if (!submittedContent || submittedContent.length > 150) {
      notice = "请输入不超过 150 字的留言";
      notify();
      return false;
    }
    submitting = source;
    notice = "正在发送…";
    notify();
    try {
      const response = await request(API_URL, {
        method: "POST",
        headers: { apikey: API_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ nickname: submittedNickname, content: submittedContent, source, parent_id: target?.id ?? null }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Message submission failed: ${response.status}`);
      nickname = submittedNickname;
      contents[source] = target ? draftBeforeReply : "";
      if (target) {
        replyTarget = null;
        draftBeforeReply = "";
      }
      try {
        storage?.setItem(NICKNAME_KEY, nickname);
      } catch {
        // The message can succeed even when browser storage is unavailable.
      }
      notice = target ? "已回复" : "已发送";
      await loadPage(target ? page : 0);
      return true;
    } catch {
      notice = "发送失败，请稍后重试";
      return false;
    } finally {
      submitting = null;
      notify();
    }
  };

  return {
    loadPage,
    submit,
    openReply(id: number, source: MessageSource = "board"): void {
      if (submitting) return;
      const target = messages.find((message) => message.id === id);
      if (!target) return;
      if (replyTarget?.id === id && replyTarget.source === source) return;
      if (replyTarget) contents[replyTarget.source] = draftBeforeReply;
      draftBeforeReply = contents[source];
      replyTarget = { id, nickname: target.nickname, content: target.content, source };
      contents[source] = "";
      notice = "";
      notify();
    },
    cancelReply(source: MessageSource = "board"): void {
      if (!replyTarget || replyTarget.source !== source) return;
      contents[source] = draftBeforeReply;
      replyTarget = null;
      draftBeforeReply = "";
      notice = "";
      notify();
    },
    toggleReplies(id: number): void {
      if (expandedReplyIds.has(id)) expandedReplyIds.delete(id);
      else expandedReplyIds.add(id);
      notify();
    },
    setNickname(value: string): void { nickname = value; notice = ""; },
    setContent(source: MessageSource, value: string): void {
      contents[source] = value;
      if (noticeSource === source) notice = "";
    },
    snapshot() {
      return {
        nickname,
        contents: { ...contents },
        messages: [...messages],
        replies: [...replies],
        replyTarget,
        expandedReplyIds: new Set(expandedReplyIds),
        total,
        visibleTotal,
        page,
        status,
        submitting,
        notice,
        noticeSource,
      };
    },
  };
}

export type CommunityMessages = ReturnType<typeof createCommunityMessages>;

function createMessageBody(message: CommunityMessage, isReply = false): HTMLElement {
  const item = document.createElement("article");
  item.className = isReply ? "community-reply-item" : "community-message-item";
  const header = document.createElement("div");
  header.className = "community-message-item-head";
  const author = document.createElement("div");
  author.className = "community-message-author";
  const name = document.createElement("strong");
  name.textContent = message.nickname;
  name.title = message.nickname;
  author.append(name);
  if (!isReply && message.source === "feedback") {
    const source = document.createElement("span");
    source.className = "community-message-source";
    source.textContent = "游戏内";
    author.append(source);
  }
  const time = document.createElement("time");
  time.dateTime = message.created_at;
  const date = new Date(message.created_at);
  time.textContent = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
  header.append(author, time);
  const content = document.createElement("p");
  content.textContent = message.content;
  item.append(header, content);
  return item;
}

function createMessageItem(message: CommunityMessage, replies: CommunityMessage[], expanded: boolean): HTMLElement {
  const item = createMessageBody(message);
  const actions = document.createElement("div");
  actions.className = "community-message-actions";
  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.dataset.communityReplyTo = String(message.id);
  const replyIcon = document.createElement("i");
  replyIcon.dataset.lucide = "reply";
  replyIcon.setAttribute("aria-hidden", "true");
  replyButton.append(replyIcon, "回复");
  if (replies.length > 0) {
    const count = document.createElement("span");
    count.className = "community-reply-count";
    count.textContent = `${replies.length} 条`;
    replyButton.append(count);
    replyButton.setAttribute("aria-label", `回复，已有 ${replies.length} 条回复`);
  }
  actions.append(replyButton);
  item.querySelector(".community-message-item-head")?.append(actions);
  if (replies.length > 0) {
    const replyList = document.createElement("div");
    replyList.className = "community-replies";
    replyList.append(...(expanded ? replies : replies.slice(0, 1)).map((reply) => createMessageBody(reply, true)));
    if (replies.length > 1) {
      const expandButton = document.createElement("button");
      expandButton.type = "button";
      expandButton.className = "community-expand-replies";
      expandButton.dataset.communityToggleReplies = String(message.id);
      const icon = document.createElement("i");
      icon.dataset.lucide = expanded ? "chevron-up" : "chevron-down";
      icon.setAttribute("aria-hidden", "true");
      expandButton.append(icon, expanded ? "收起回复" : `展开更多回复（${replies.length - 1} 条）`);
      replyList.append(expandButton);
    }
    item.append(replyList);
  }
  return item;
}

export function renderCommunityMessages(root: ParentNode, community: CommunityMessages): void {
  const state = community.snapshot();
  for (const source of ["board", "feedback"] as const) {
    root.querySelectorAll<HTMLInputElement>(`input[data-community-nickname="${source}"]`).forEach((input) => {
      input.value = state.nickname;
      input.disabled = state.submitting === source;
    });
    root.querySelectorAll<HTMLElement>(`[data-community-nickname-count="${source}"]`).forEach((target) => {
      target.textContent = `${state.nickname.length}/${NICKNAME_MAX_LENGTH}`;
    });
    root.querySelectorAll<HTMLTextAreaElement>(`textarea[data-community-content="${source}"]`).forEach((input) => {
      input.value = state.contents[source];
      input.disabled = state.submitting === source;
      input.placeholder = state.replyTarget?.source === source
        ? `回复 ${state.replyTarget.nickname}` : "说点什么吧";
    });
    root.querySelectorAll<HTMLElement>(`[data-community-char-count="${source}"]`).forEach((target) => {
      target.textContent = `${state.contents[source].length}/150`;
    });
    root.querySelectorAll<HTMLButtonElement>(`button[data-community-send="${source}"]`).forEach((button) => {
      button.disabled = state.submitting !== null;
      const label = button.querySelector("span");
      if (label) label.textContent = state.replyTarget?.source === source ? "回复" : "发送";
    });
    root.querySelectorAll<HTMLElement>(`[data-community-notice="${source}"]`).forEach((target) => {
      target.textContent = state.noticeSource === source ? state.notice : "";
    });
  }
  root.querySelectorAll<HTMLButtonElement>("button[data-community-cancel-reply]").forEach((button) => {
    button.hidden = button.dataset.communityCancelReply !== state.replyTarget?.source;
  });
  root.querySelectorAll<HTMLElement>("[data-community-reply-indicator]").forEach((indicator) => {
    const target = state.replyTarget?.source === indicator.dataset.communityReplyIndicator ? state.replyTarget : null;
    indicator.hidden = !target;
    const name = indicator.querySelector<HTMLElement>("[data-community-reply-name]");
    const preview = indicator.querySelector<HTMLElement>("[data-community-reply-preview]");
    if (name) name.textContent = target ? `回复 ${target.nickname}：` : "";
    if (preview) preview.textContent = target ? `“${target.content}”` : "";
  });

  root.querySelectorAll<HTMLElement>("[data-community-feed]").forEach((feed) => {
    const empty = feed.querySelector<HTMLElement>("[data-community-empty]");
    const list = feed.querySelector<HTMLElement>("[data-community-list]");
    if (!empty || !list) return;
    const showMessages = state.status === "ready" && state.messages.length > 0;
    list.hidden = !showMessages;
    empty.hidden = showMessages;
    if (showMessages) {
      list.replaceChildren(...state.messages.map((message) => createMessageItem(
        message,
        state.replies.filter((reply) => reply.parent_id === message.id),
        state.expandedReplyIds.has(message.id),
      )));
    } else {
      const title = empty.querySelector<HTMLElement>("[data-community-empty-title]");
      const description = empty.querySelector<HTMLElement>("[data-community-empty-description]");
      const retry = empty.querySelector<HTMLButtonElement>("[data-community-retry]");
      if (title) title.textContent = state.status === "error" ? "留言加载失败" : state.status === "loading" ? "正在加载留言" : "还没有留言";
      if (description) description.textContent = state.status === "error" ? "请稍后重试" : state.status === "loading" ? "" : "来留下第一条留言吧";
      if (retry) retry.hidden = state.status !== "error";
    }
  });

  root.querySelectorAll<HTMLElement>("[data-community-count]").forEach((target) => {
    target.textContent = `${state.status === "loading" ? "--" : state.visibleTotal ?? "--"} 条`;
  });
  renderCommunityPagination(root, state);
}

function renderCommunityPagination(root: ParentNode, state: ReturnType<CommunityMessages["snapshot"]>): void {
  const pageCount = Math.max(1, Math.ceil(state.total / MESSAGE_PAGE_SIZE));
  root.querySelectorAll<HTMLElement>("[data-community-pagination]").forEach((pager) => {
    const pageButtons = pager.querySelector<HTMLElement>("[data-community-page-buttons]");
    if (pageButtons) {
      const windowSize = Number(pager.dataset.communityPageWindow) || 5;
      const start = Math.max(0, Math.min(state.page - Math.floor(windowSize / 2), pageCount - windowSize));
      const buttons: HTMLButtonElement[] = [];
      for (let index = start; index < Math.min(pageCount, start + windowSize); index += 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `community-page-number${index === state.page ? " is-active" : ""}`;
        button.dataset.communityPage = String(index);
        button.textContent = String(index + 1);
        button.setAttribute("aria-label", `第 ${index + 1} 页`);
        if (index === state.page) button.setAttribute("aria-current", "page");
        button.disabled = state.status === "loading" || index === state.page;
        buttons.push(button);
      }
      pageButtons.replaceChildren(...buttons);
    }
    const previous = pager.querySelector<HTMLButtonElement>("[data-community-page-delta='-1']");
    const next = pager.querySelector<HTMLButtonElement>("[data-community-page-delta='1']");
    if (previous) previous.disabled = state.status === "loading" || state.page <= 0;
    if (next) next.disabled = state.status === "loading" || state.page + 1 >= pageCount;
  });
}
