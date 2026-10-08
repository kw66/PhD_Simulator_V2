export type MessageSource = "board" | "feedback";

export interface CommunityMessage {
  id: number;
  nickname: string;
  content: string;
  source: MessageSource;
  created_at: string;
  parent_id: number | null;
  is_deleted?: boolean;
}

const API_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/phd_simulator_v2_messages";
const PUBLIC_API_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/phd_simulator_v2_public_messages";
const API_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const NICKNAME_KEY = "kwgame_last_nickname";
const NICKNAME_MAX_LENGTH = 10;
export const MESSAGE_PAGE_SIZE = 5;
export const MESSAGE_MAX_LENGTH = 2000;
const OWNERSHIP_KEY = "kwgame_v2_message_ownership";
const PUBLIC_COLUMNS = "id,nickname,content,source,created_at,parent_id,is_deleted";

export function countMessageCharacters(value: string): number {
  return Array.from(value).length;
}

function validMessageContent(value: string): boolean {
  return countMessageCharacters(value) >= 1 && countMessageCharacters(value) <= MESSAGE_MAX_LENGTH
    && Array.from(value).every((character) => {
      const point = character.codePointAt(0)!;
      return point !== 0 && (point < 0xd800 || point > 0xdfff);
    });
}

interface MessageOwnership {
  secret: string;
  ids: number[];
}

function readOwnership(storage: MessageOptions["storage"]): MessageOwnership | null {
  try {
    const record = JSON.parse(storage?.getItem(OWNERSHIP_KEY) ?? "null") as MessageOwnership | null;
    if (!record || !/^[a-f0-9]{64}$/.test(record.secret) || !Array.isArray(record.ids)) return null;
    return { secret: record.secret, ids: record.ids.filter((id) => Number.isSafeInteger(id) && id > 0) };
  } catch {
    return null;
  }
}

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
  const expandedContentIds = new Set<number>();
  let ownership = readOwnership(storage);
  let editTarget: { id: number; source: MessageSource; originalContent: string } | null = null;
  let editContent = "";
  let editNotice = "";
  let savingEdit = false;
  let deletingMessageId: number | null = null;
  let messageNotice: { id: number; text: string } | null = null;
  let total = 0;
  let visibleTotal: number | null = null;
  let page = 0;
  let status: MessageStatus = "idle";
  let submitting: MessageSource | null = null;
  let notice = "";
  let noticeSource: MessageSource | null = null;
  let loadRevision = 0;

  const notify = (): void => options.onChange?.();

  const prepareOwnership = async (): Promise<string | null> => {
    try {
      if (!storage || !globalThis.crypto?.subtle) return null;
      ownership = readOwnership(storage);
      if (!ownership) {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
        ownership = { secret: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""), ids: [] };
        storage.setItem(OWNERSHIP_KEY, JSON.stringify(ownership));
        if (readOwnership(storage)?.secret !== ownership.secret) return null;
      }
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownership.secret));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return null;
    }
  };

  const loadPage = async (nextPage: number): Promise<void> => {
    if (!Number.isSafeInteger(nextPage) || nextPage < 0) return;
    if (nextPage !== page && replyTarget && !submitting) {
      contents[replyTarget.source] = draftBeforeReply;
      replyTarget = null;
      draftBeforeReply = "";
    }
    const revision = ++loadRevision;
    status = "loading";
    page = nextPage;
    notify();
    try {
      const url = new URL(PUBLIC_API_URL);
      url.searchParams.set("select", PUBLIC_COLUMNS);
      url.searchParams.set("parent_id", "is.null");
      url.searchParams.set("order", "created_at.desc,id.desc");
      url.searchParams.set("limit", String(MESSAGE_PAGE_SIZE));
      url.searchParams.set("offset", String(nextPage * MESSAGE_PAGE_SIZE));
      const countUrl = new URL(PUBLIC_API_URL);
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
        const replyUrl = new URL(PUBLIC_API_URL);
        replyUrl.searchParams.set("select", PUBLIC_COLUMNS);
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
      if (replyTarget && !submitting && !mainMessages.some((message) => message.id === replyTarget?.id)) {
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
    if (submitting || savingEdit) return false;
    const target = replyTarget?.source === source ? replyTarget : null;
    const submittedNickname = nickname.trim();
    const submittedContent = contents[source].trim();
    const submittedDraft = contents[source];
    noticeSource = source;
    if (!submittedNickname || countMessageCharacters(submittedNickname) > NICKNAME_MAX_LENGTH) {
      notice = `请输入不超过 ${NICKNAME_MAX_LENGTH} 字的昵称`;
      notify();
      return false;
    }
    if (!validMessageContent(submittedContent)) {
      notice = `请输入不超过 ${MESSAGE_MAX_LENGTH} 字的有效留言`;
      notify();
      return false;
    }
    submitting = source;
    notice = "正在发送…";
    notify();
    try {
      const editTokenHash = await prepareOwnership();
      const submittedSecret = editTokenHash ? ownership?.secret : null;
      const postUrl = new URL(API_URL);
      if (editTokenHash) postUrl.searchParams.set("select", "id");
      const response = await request(postUrl, {
        method: "POST",
        headers: { apikey: API_KEY, "Content-Type": "application/json", Prefer: editTokenHash ? "return=representation" : "return=minimal" },
        body: JSON.stringify({ nickname: submittedNickname, content: submittedContent, source, parent_id: target?.id ?? null,
          ...(editTokenHash ? { edit_token_hash: editTokenHash } : {}) }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Message submission failed: ${response.status}`);
      let trackedOwnership = false;
      if (submittedSecret) {
        try {
          const rows: unknown = await response.json();
          const id = Array.isArray(rows) && rows.length === 1 ? rows[0]?.id : null;
          const latest = readOwnership(storage);
          if (Number.isSafeInteger(id) && id > 0 && latest?.secret === submittedSecret) {
            ownership = { secret: submittedSecret, ids: [...new Set([...latest.ids, id])] };
            storage?.setItem(OWNERSHIP_KEY, JSON.stringify(ownership));
            trackedOwnership = readOwnership(storage)?.ids.includes(id) ?? false;
          }
        } catch {
          ownership = readOwnership(storage);
        }
      }
      if (nickname.trim() === submittedNickname) nickname = submittedNickname;
      if (contents[source] === submittedDraft) contents[source] = target ? draftBeforeReply : "";
      if (target) {
        replyTarget = null;
        draftBeforeReply = "";
      }
      try {
        storage?.setItem(NICKNAME_KEY, submittedNickname);
      } catch {
        // The message can succeed even when browser storage is unavailable.
      }
      notice = target ? "已回复" : "已发送";
      if (!trackedOwnership) {
        notice += "；编辑凭证不可用，此留言无法编辑";
      }
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

  const saveEdit = async (): Promise<boolean> => {
    if (!editTarget || savingEdit || submitting) return false;
    const target = editTarget;
    const content = editContent.trim();
    ownership = readOwnership(storage);
    if (!ownership?.ids.includes(target.id)) {
      editNotice = "无法验证本浏览器的编辑凭证";
      notify();
      return false;
    }
    if (!validMessageContent(content)) {
      editNotice = `请输入不超过 ${MESSAGE_MAX_LENGTH} 字的有效留言`;
      notify();
      return false;
    }
    savingEdit = true;
    editNotice = "正在保存…";
    notify();
    try {
      const response = await request(new URL("rpc/edit_phd_simulator_v2_message", `${API_URL.slice(0, API_URL.lastIndexOf("/"))}/`), {
        method: "POST",
        headers: { apikey: API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_id: target.id, p_edit_token: ownership.secret, p_content: content,
          p_expected_content: target.originalContent }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Edit failed");
      const result: unknown = await response.json();
      if (result !== true) {
        editNotice = "保存失败：留言已变更或无编辑权限，请刷新后重试";
        return false;
      }
      editTarget = null;
      editContent = "";
      editNotice = "";
      await loadPage(page);
      return true;
    } catch {
      editNotice = "保存失败，请稍后重试";
      return false;
    } finally {
      savingEdit = false;
      notify();
    }
  };

  const deleteMessage = async (id: number): Promise<boolean> => {
    if (deletingMessageId !== null || savingEdit || submitting) return false;
    ownership = readOwnership(storage);
    const message = [...messages, ...replies].find((entry) => entry.id === id);
    if (!message || message.is_deleted || !ownership?.ids.includes(id)) {
      messageNotice = { id, text: "无法验证本浏览器的删除凭证" };
      notify();
      return false;
    }
    deletingMessageId = id;
    messageNotice = null;
    notify();
    try {
      const response = await request(new URL("rpc/delete_phd_simulator_v2_message", `${API_URL.slice(0, API_URL.lastIndexOf("/"))}/`), {
        method: "POST",
        headers: { apikey: API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_id: id, p_edit_token: ownership.secret, p_expected_content: message.content }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Delete failed");
      const result: unknown = await response.json();
      if (result !== true) {
        messageNotice = { id, text: "删除失败：留言已变更或无删除权限" };
        return false;
      }
      messageNotice = null;
      await loadPage(page);
      return true;
    } catch {
      messageNotice = { id, text: "删除失败，请稍后重试" };
      return false;
    } finally {
      deletingMessageId = null;
      notify();
    }
  };

  return {
    loadPage,
    submit,
    saveEdit,
    deleteMessage,
    openEdit(id: number, source: MessageSource = "board"): void {
      if (savingEdit || submitting || editTarget) return;
      ownership = readOwnership(storage);
      const message = [...messages, ...replies].find((entry) => entry.id === id);
      if (!message || message.is_deleted || !ownership?.ids.includes(id)) return;
      editTarget = { id, source, originalContent: message.content };
      editContent = message.content;
      editNotice = "";
      notify();
    },
    setEditContent(value: string): void {
      if (!editTarget || savingEdit) return;
      editContent = value;
      editNotice = "";
    },
    cancelEdit(): void {
      if (savingEdit) return;
      editTarget = null;
      editContent = "";
      editNotice = "";
      notify();
    },
      toggleContent(id: number): void {
      if (expandedContentIds.has(id)) expandedContentIds.delete(id);
      else expandedContentIds.add(id);
      notify();
    },
    openReply(id: number, source: MessageSource = "board"): void {
      if (submitting) return;
      const target = [...messages, ...replies].find((message) => message.id === id);
      if (!target || target.is_deleted) return;
      const parent = target.parent_id === null
        ? target
        : messages.find((message) => message.id === target.parent_id);
      if (!parent || parent.is_deleted) return;
      if (replyTarget?.id === id && replyTarget.source === source) return;
      if (replyTarget) contents[replyTarget.source] = draftBeforeReply;
      draftBeforeReply = contents[source];
      replyTarget = { id: parent.id, nickname: target.nickname, content: target.content, source };
      contents[source] = "";
      notice = "";
      notify();
    },
    cancelReply(source: MessageSource = "board"): void {
      if (submitting || !replyTarget || replyTarget.source !== source) return;
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
        expandedContentIds: new Set(expandedContentIds),
        ownedMessageIds: new Set(readOwnership(storage)?.ids ?? []),
        editTarget: editTarget ? { ...editTarget } : null,
        editContent,
        editNotice,
        savingEdit,
        deletingMessageId,
        messageNotice,
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

type CommunityMessageState = ReturnType<CommunityMessages["snapshot"]>;

function createMessageBody(message: CommunityMessage, state: CommunityMessageState, isReply = false): HTMLElement {
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
  const deleted = Boolean(message.is_deleted);
  const content = document.createElement("p");
  content.className = `community-message-content${deleted ? " is-deleted" : ""}`;
  const expanded = state.expandedContentIds.has(message.id);
  content.dataset.expanded = String(expanded);
  content.dataset.communityMessageContent = String(message.id);
  content.textContent = deleted ? "该留言已删除" : message.content;
  item.append(header, content);
  {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "community-expand-content";
    toggle.dataset.communityToggleContent = String(message.id);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "收起" : "展开全文";
    toggle.hidden = deleted;
    item.append(toggle);
  }
  const ownsMessage = state.ownedMessageIds.has(message.id) && !deleted;
  const canReply = isReply && !deleted;
  if (ownsMessage || canReply) {
    const actions = document.createElement("div");
    actions.className = "community-message-actions";
    if (ownsMessage) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "community-edit-button";
      edit.dataset.communityEdit = String(message.id);
      edit.textContent = "编辑";
      edit.disabled = state.editTarget !== null || state.savingEdit || state.submitting !== null;
      actions.append(edit);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "community-delete-button";
      remove.dataset.communityDelete = String(message.id);
      remove.textContent = state.deletingMessageId === message.id ? "删除中…" : "删除";
      remove.disabled = state.editTarget !== null || state.savingEdit || state.submitting !== null || state.deletingMessageId !== null;
      actions.append(remove);
      if (state.messageNotice?.id === message.id) {
        const notice = document.createElement("span");
        notice.className = "community-delete-notice";
        notice.setAttribute("role", "status");
        notice.textContent = state.messageNotice.text;
        actions.append(notice);
      }
    }
    if (canReply) {
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "community-reply-to-button";
      reply.dataset.communityReplyTo = String(message.id);
      reply.textContent = "回复";
      reply.disabled = state.submitting !== null || state.savingEdit || state.deletingMessageId !== null;
      actions.append(reply);
    }
    header.append(actions);
  }
  if (state.editTarget?.id === message.id && !deleted) {
    const editor = document.createElement("div");
    editor.className = "community-message-editor";
    editor.dataset.communityEditor = String(message.id);
    const input = document.createElement("textarea");
    input.className = "community-edit-content";
    input.dataset.communityEditContent = String(message.id);
    input.value = state.editContent;
    input.rows = 4;
    input.disabled = state.savingEdit;
    input.setAttribute("aria-label", "编辑留言");
    input.setAttribute("aria-invalid", String(!validMessageContent(state.editContent.trim())));
    const footer = document.createElement("div");
    footer.className = "community-edit-footer";
    const count = document.createElement("span");
    count.className = "community-edit-count";
    count.dataset.communityEditCount = String(message.id);
    count.textContent = `${countMessageCharacters(state.editContent)}/${MESSAGE_MAX_LENGTH}`;
    const save = document.createElement("button");
    save.type = "button";
    save.dataset.communitySaveEdit = String(message.id);
    save.textContent = state.savingEdit ? "保存中…" : "保存";
    save.disabled = state.savingEdit || state.submitting !== null;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.communityCancelEdit = String(message.id);
    cancel.textContent = "取消";
    cancel.disabled = state.savingEdit;
    const status = document.createElement("span");
    status.className = "community-edit-notice";
    status.dataset.communityEditNotice = String(message.id);
    status.setAttribute("role", "status");
    status.textContent = state.editNotice;
    footer.append(count, save, cancel);
    editor.append(input, footer, status);
    item.append(editor);
  }
  return item;
}

function createMessageItem(message: CommunityMessage, replies: CommunityMessage[], state: CommunityMessageState): HTMLElement {
  const expanded = state.expandedReplyIds.has(message.id);
  const item = createMessageBody(message, state);
  const actions = item.querySelector(".community-message-actions") ?? document.createElement("div");
  actions.className = "community-message-actions";
  if (message.is_deleted) return item;
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
    const visibleReplies = expanded ? replies : replies.filter((reply, index) => index === 0 || reply.id === state.editTarget?.id);
    replyList.append(...visibleReplies.map((reply) => createMessageBody(reply, state, true)));
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
      target.textContent = `${countMessageCharacters(state.nickname)}/${NICKNAME_MAX_LENGTH}`;
    });
    root.querySelectorAll<HTMLTextAreaElement>(`textarea[data-community-content="${source}"]`).forEach((input) => {
      input.value = state.contents[source];
      input.removeAttribute("maxlength");
      input.setAttribute("aria-invalid", String(countMessageCharacters(state.contents[source].trim()) > MESSAGE_MAX_LENGTH));
      input.disabled = state.submitting === source;
      input.placeholder = state.replyTarget?.source === source
        ? `回复 ${state.replyTarget.nickname}` : "说点什么吧";
    });
    root.querySelectorAll<HTMLElement>(`[data-community-char-count="${source}"]`).forEach((target) => {
      target.textContent = `${countMessageCharacters(state.contents[source])}/${MESSAGE_MAX_LENGTH}`;
    });
    root.querySelectorAll<HTMLButtonElement>(`button[data-community-send="${source}"]`).forEach((button) => {
      button.disabled = state.submitting !== null || state.savingEdit;
      const label = button.querySelector("span");
      if (label) label.textContent = state.replyTarget?.source === source ? "回复" : "发送";
    });
    root.querySelectorAll<HTMLElement>(`[data-community-notice="${source}"]`).forEach((target) => {
      target.textContent = state.noticeSource === source ? state.notice : "";
    });
  }
  root.querySelectorAll<HTMLButtonElement>("button[data-community-cancel-reply]").forEach((button) => {
    button.hidden = button.dataset.communityCancelReply !== state.replyTarget?.source;
    button.disabled = state.submitting !== null;
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
        state,
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
  refreshCommunityContentOverflow(root);
}

export function refreshCommunityContentOverflow(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-community-message-content]").forEach((content) => {
    const toggle = content.parentElement?.querySelector<HTMLButtonElement>("[data-community-toggle-content]");
    if (!toggle || content.getClientRects().length === 0) return;
    const expanded = content.dataset.expanded === "true";
    content.dataset.expanded = "false";
    const overflowing = content.scrollHeight > content.clientHeight + 1;
    content.dataset.expanded = String(expanded);
    toggle.hidden = !expanded && !overflowing;
    toggle.setAttribute("aria-expanded", String(expanded));
  });
}

function renderCommunityPagination(root: ParentNode, state: ReturnType<CommunityMessages["snapshot"]>): void {
  const pageCount = Math.max(1, Math.ceil(state.total / MESSAGE_PAGE_SIZE));
  root.querySelectorAll<HTMLElement>("[data-community-pagination]").forEach((pager) => {
    const pageLabel = pager.querySelector<HTMLElement>("[data-community-page-count]");
    if (pageLabel) pageLabel.textContent = `${state.page + 1}/${pageCount}`;
    const previous = pager.querySelector<HTMLButtonElement>("[data-community-page-delta='-1']");
    const next = pager.querySelector<HTMLButtonElement>("[data-community-page-delta='1']");
    if (previous) previous.disabled = state.status === "loading" || state.page <= 0;
    if (next) next.disabled = state.status === "loading" || state.page + 1 >= pageCount;
  });
}
