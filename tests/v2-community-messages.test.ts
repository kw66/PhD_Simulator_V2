import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import { createCommunityMessages, countMessageCharacters, MESSAGE_MAX_LENGTH, MESSAGE_PAGE_SIZE } from "../src/app/v2-community-messages";
import type { CommunityMessage, CommunityMessages } from "../src/app/v2-community-messages";

const ownershipKey = "kwgame_v2_message_ownership";
const secret = "a1".repeat(32);
const ownMessage: CommunityMessage = {
  id: 21, nickname: "同名玩家", content: "原留言", source: "board",
  parent_id: null, created_at: "2026-10-08T00:00:00Z",
};

function editingHarness(ownedIds: number[] = [21]) {
  const values = new Map([[ownershipKey, JSON.stringify({ secret, ids: ownedIds })]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let rows = [{ ...ownMessage }];
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": `*/${rows.length}` } });
    if (init?.method === "POST") return new Response("true");
    const isMain = new URL(String(input)).searchParams.get("parent_id") === "is.null";
    return new Response(JSON.stringify(rows.filter((row) => isMain ? row.parent_id === null : row.parent_id !== null)), {
      headers: { "Content-Range": `0-0/${rows.filter((row) => row.parent_id === null).length}` },
    });
  });
  const community = createCommunityMessages({ fetch: request as typeof fetch, storage });
  return { community, request, values, storage, setRows: (next: CommunityMessage[]) => { rows = next; } };
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("V2 community messages", () => {
  it("loads a counted page and keeps the browser nickname separate from the message list", async () => {
    const storage = new Map([["kwgame_last_nickname", "上次的名字"]]);
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "HEAD"
      ? new Response(null, { headers: { "Content-Range": "*/14" } })
      : new URL(String(input)).searchParams.get("parent_id") === "is.null"
      ? new Response(JSON.stringify([
        { id: 7, nickname: "访客", content: "你好", source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null },
      ]), { headers: { "Content-Range": "5-5/11" } })
      : new Response("[]"));
    const community = createCommunityMessages({
      fetch: request as typeof fetch,
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
    });

    await community.loadPage(1);

    expect(community.snapshot()).toMatchObject({ status: "ready", page: 1, total: 11, visibleTotal: 14, nickname: "上次的名字" });
    expect(community.snapshot().messages[0]?.content).toBe("你好");
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.searchParams.get("limit")).toBe(String(MESSAGE_PAGE_SIZE));
    expect(url.searchParams.get("offset")).toBe(String(MESSAGE_PAGE_SIZE));
    expect(url.searchParams.get("parent_id")).toBe("is.null");
    const countCall = request.mock.calls.find((call) => call[1]?.method === "HEAD");
    expect(new URL(String(countCall?.[0])).searchParams.get("parent_id")).toBeNull();
  });

  it("drops deleted messages and stale reply targets when the page reloads", async () => {
    let exists = true;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return new Response(null, { headers: { "Content-Range": exists ? "*/1" : "*/0" } });
      }
      const parentFilter = new URL(String(input)).searchParams.get("parent_id");
      const rows = exists && parentFilter === "is.null"
        ? [{ id: 4, nickname: "作者", content: "已删除留言", source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null }]
        : [];
      return new Response(JSON.stringify(rows), { headers: { "Content-Range": exists ? "0-0/1" : "*/0" } });
    });
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    await community.loadPage(0);
    community.setContent("board", "原草稿");
    community.openReply(4);
    exists = false;

    await community.loadPage(0);

    expect(community.snapshot()).toMatchObject({ status: "ready", messages: [], total: 0, visibleTotal: 0, replyTarget: null });
    expect(community.snapshot().contents.board).toBe("原草稿");
    expect(request.mock.calls.every((call) => call[1]?.cache === "no-store")).toBe(true);
  });

  it("returns to the first page when deleted messages leave the current page empty", async () => {
    let exists = true;
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "HEAD"
      ? new Response(null, { headers: { "Content-Range": exists ? "*/6" : "*/0" } })
      : new Response(JSON.stringify(exists ? [{
        id: 6, nickname: "作者", content: "末页留言", source: "board",
        created_at: "2026-09-27T00:00:00Z", parent_id: null,
      }] : []), { headers: { "Content-Range": exists ? "5-5/6" : "*/0" } }));
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    await community.loadPage(1);
    exists = false;

    await community.loadPage(1);

    expect(community.snapshot()).toMatchObject({ status: "ready", page: 0, total: 0, messages: [] });
  });

  it("sends a message, stores the successful nickname, and clears only that draft", async () => {
    const storage = new Map<string, string>();
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? new Response('[{"id":21}]', { status: 201 })
      : init?.method === "HEAD"
        ? new Response(null, { headers: { "Content-Range": "*/0" } })
      : new Response("[]", { headers: { "Content-Range": "*/0" } }));
    const community = createCommunityMessages({
      fetch: request as typeof fetch,
      storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); } },
    });
    community.setNickname("  玩家甲  ");
    community.setContent("board", "  第一条留言  ");
    community.setContent("feedback", "未发送的反馈");

    expect(await community.submit("board")).toBe(true);

    const post = request.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ nickname: "玩家甲", content: "第一条留言", source: "board", parent_id: null, edit_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(storage.get("kwgame_last_nickname")).toBe("玩家甲");
    expect(community.snapshot().contents).toEqual({ board: "", feedback: "未发送的反馈" });
    expect(community.snapshot().notice).toBe("已发送");
  });

  it("keeps replies with their parent page and submits them under the selected message", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 201 });
      if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": "*/8" } });
      const url = new URL(String(input));
      return url.searchParams.get("parent_id") === "is.null"
        ? new Response(JSON.stringify([
          { id: 7, nickname: "作者", content: "主留言", source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null },
        ]), { headers: { "Content-Range": "5-5/6" } })
        : new Response(JSON.stringify([
          { id: 8, nickname: "访客", content: "回复一", source: "board", created_at: "2026-09-27T01:00:00Z", parent_id: 7 },
          { id: 9, nickname: "访客", content: "回复二", source: "board", created_at: "2026-09-27T02:00:00Z", parent_id: 7 },
        ]));
    });
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    await community.loadPage(1);
    expect(community.snapshot()).toMatchObject({ page: 1, total: 6, visibleTotal: 8 });
    expect(community.snapshot().replies).toHaveLength(2);

    community.setContent("board", "未发表主留言");
    community.openReply(7);
    expect(community.snapshot().replyTarget).toMatchObject({ id: 7, nickname: "作者", content: "主留言", source: "board" });
    community.setNickname("玩家乙");
    community.setContent("board", "补充说明");
    community.toggleReplies(7);
    expect(community.snapshot().expandedReplyIds.has(7)).toBe(true);
    expect(await community.submit("board")).toBe(true);

    const post = request.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ nickname: "玩家乙", content: "补充说明", source: "board", parent_id: 7 });
    expect(community.snapshot()).toMatchObject({ page: 1, notice: "已回复；编辑凭证不可用，此留言无法编辑", replyTarget: null });
    expect(community.snapshot().contents.board).toBe("未发表主留言");
    const lastMainRequest = request.mock.calls.filter((call) => call[1]?.method !== "POST" && new URL(String(call[0])).searchParams.get("parent_id") === "is.null").at(-1);
    expect(new URL(String(lastMainRequest?.[0])).searchParams.get("offset")).toBe(String(MESSAGE_PAGE_SIZE));
  });

  it("paginates five main messages while keeping replies with their parents", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": "*/18" } });
      const url = new URL(String(input));
      const parentFilter = url.searchParams.get("parent_id");
      if (parentFilter !== "is.null") {
        const ids = new Set(parentFilter?.match(/\d+/g)?.map(Number) ?? []);
        const replies = Array.from({ length: 10 }, (_, index) => ({
          id: index + 9, nickname: "访客", content: `回复 ${index + 1}`,
          source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: Math.floor(index / 2) + 1,
        })).filter((reply) => ids.has(reply.parent_id));
        return new Response(JSON.stringify(replies));
      }
      const offset = Number(url.searchParams.get("offset"));
      const rows = Array.from({ length: 8 }, (_, index) => ({
        id: index + 1, nickname: "访客", content: `留言 ${index + 1}`,
        source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null,
      })).slice(offset, offset + MESSAGE_PAGE_SIZE);
      return new Response(JSON.stringify(rows), { headers: { "Content-Range": "0-4/8" } });
    });
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });

    await community.loadPage(0);
    expect(community.snapshot().messages.map((message) => message.id)).toEqual([1, 2, 3, 4, 5]);
    expect(community.snapshot().replies).toHaveLength(10);
    await community.loadPage(1);
    expect(community.snapshot().messages.map((message) => message.id)).toEqual([6, 7, 8]);
    expect(community.snapshot().replies).toHaveLength(0);
    const offsets = request.mock.calls
      .filter((call) => new URL(String(call[0])).searchParams.get("parent_id") === "is.null")
      .map((call) => new URL(String(call[0])).searchParams.get("offset"));
    expect(offsets).toEqual(["0", "5"]);
  });

  it("restores an unfinished main message when cancelling a reply", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "HEAD"
      ? new Response(null, { headers: { "Content-Range": "*/1" } })
      : new URL(String(input)).searchParams.get("parent_id") === "is.null"
      ? new Response(JSON.stringify([
        { id: 4, nickname: "作者", content: "主留言", source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null },
      ]), { headers: { "Content-Range": "0-0/1" } })
      : new Response("[]"));
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    await community.loadPage(0);
    community.setContent("board", "主留言草稿");
    community.openReply(4);
    community.setContent("board", "回复草稿");
    community.cancelReply();
    expect(community.snapshot().contents.board).toBe("主留言草稿");
    expect(community.snapshot().replyTarget).toBeNull();
  });

  it("replies from the game overlay with its own draft and feedback source", async () => {
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 201 });
      if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": "*/1" } });
      return new URL(String(input)).searchParams.get("parent_id") === "is.null"
        ? new Response(JSON.stringify([
          { id: 12, nickname: "访客", content: "主留言", source: "board", created_at: "2026-09-27T00:00:00Z", parent_id: null },
        ]), { headers: { "Content-Range": "0-0/1" } })
        : new Response("[]");
    });
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    await community.loadPage(0);
    community.setNickname("游戏玩家");
    community.setContent("board", "开始页草稿");
    community.setContent("feedback", "游戏内草稿");
    community.openReply(12, "feedback");
    community.setContent("feedback", "游戏内回复");

    expect(await community.submit("feedback")).toBe(true);
    const post = request.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      nickname: "游戏玩家", content: "游戏内回复", source: "feedback", parent_id: 12,
    });
    expect(community.snapshot().contents).toEqual({ board: "开始页草稿", feedback: "游戏内草稿" });
    expect(community.snapshot().replyTarget).toBeNull();
  });

  it("rejects empty input before making a request and preserves drafts after network failure", async () => {
    const request = vi.fn(async () => { throw new Error("offline"); });
    const community = createCommunityMessages({ fetch: request as typeof fetch, storage: null });
    expect(await community.submit("board")).toBe(false);
    expect(request).not.toHaveBeenCalled();

    community.setNickname("12345678901");
    community.setContent("board", "稍后再发");
    expect(await community.submit("board")).toBe(false);
    expect(community.snapshot().notice).toBe("请输入不超过 10 字的昵称");
    expect(request).not.toHaveBeenCalled();

    community.setNickname("玩家乙");
    expect(await community.submit("board")).toBe(false);
    expect(community.snapshot().contents.board).toBe("稍后再发");
    expect(community.snapshot().notice).toBe("发送失败，请稍后重试");
  });
});

describe("V2 message ownership and editing", () => {
  it("stores only a hash on insert and persists ownership from the returned id across reloads", async () => {
    const harness = editingHarness([]);
    harness.request.mockImplementationOnce(async () => new Response('[{"id":21}]', { status: 201 }));
    harness.community.setNickname(ownMessage.nickname);
    harness.community.setContent("board", "新留言");
    expect(await harness.community.submit("board")).toBe(true);
    const [url, init] = harness.request.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("select")).toBe("id");
    expect(init?.headers).toMatchObject({ Prefer: "return=representation" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ edit_token_hash: createHash("sha256").update(secret).digest("hex") });
    expect(String(init?.body)).not.toContain(secret);
    expect(harness.community.snapshot().ownedMessageIds.has(21)).toBe(true);
    const reopened = createCommunityMessages({ fetch: harness.request as typeof fetch, storage: harness.storage });
    await reopened.loadPage(0);
    reopened.openEdit(21);
    expect(reopened.snapshot().editTarget?.id).toBe(21);
    expect(JSON.stringify(reopened.snapshot())).not.toContain(secret);
  });

  it("never infers ownership from nickname or reading old messages", async () => {
    const { community, request } = editingHarness([]);
    await community.loadPage(0);
    community.setNickname(ownMessage.nickname);
    community.openEdit(21);
    expect(community.snapshot().editTarget).toBeNull();
    expect(await community.saveEdit()).toBe(false);
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(request.mock.calls.every(([url]) => !String(url).includes("edit_token_hash"))).toBe(true);
  });

  it("edits only content through the secret-authenticated RPC with an optimistic precondition", async () => {
    const { community, request } = editingHarness();
    await community.loadPage(0);
    community.setContent("board", "未发的新留言");
    community.openEdit(21, "feedback");
    community.setEditContent("\u3000改过的留言😀\n");
    expect(await community.saveEdit()).toBe(true);
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(new URL(String(post[0])).pathname).toBe("/rest/v1/rpc/edit_phd_simulator_v2_message");
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      p_id: 21, p_edit_token: secret, p_content: "改过的留言😀", p_expected_content: "原留言",
    });
    expect(community.snapshot()).toMatchObject({ editTarget: null, editContent: "", savingEdit: false });
    expect(community.snapshot().contents.board).toBe("未发的新留言");
  });

  it("soft deletes an owned message through the credentialed RPC and preserves the thread contract", async () => {
    const { community, request } = editingHarness();
    await community.loadPage(0);
    expect(await community.deleteMessage(21)).toBe(true);
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(new URL(String(post[0])).pathname).toBe("/rest/v1/rpc/delete_phd_simulator_v2_message");
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      p_id: 21, p_edit_token: secret, p_expected_content: "原留言",
    });
    expect(community.snapshot().deletingMessageId).toBeNull();
  });

  it("retains edit drafts through refresh, navigation, conflict, and failure until cancellation", async () => {
    const { community, request, setRows } = editingHarness();
    await community.loadPage(0);
    community.openEdit(21);
    community.setEditContent("我的草稿");
    community.toggleContent(21);
    setRows([{ ...ownMessage, content: "其他窗口已修改" }]);
    await community.loadPage(1);
    community.openEdit(21);
    expect(community.snapshot()).toMatchObject({ editContent: "我的草稿", editTarget: { originalContent: "原留言" } });
    expect(community.snapshot().expandedContentIds.has(21)).toBe(true);
    request.mockImplementationOnce(async () => new Response("false"));
    expect(await community.saveEdit()).toBe(false);
    expect(community.snapshot().editNotice).toContain("已变更");
    expect(community.snapshot().editContent).toBe("我的草稿");
    request.mockImplementationOnce(async () => { throw new Error("offline"); });
    expect(await community.saveEdit()).toBe(false);
    expect(community.snapshot().editContent).toBe("我的草稿");
    community.cancelEdit();
    expect(community.snapshot()).toMatchObject({ editTarget: null, editContent: "" });
  });

  it("guards editor changes and duplicate saves while a save is pending", async () => {
    const { community, request } = editingHarness();
    await community.loadPage(0);
    community.openEdit(21);
    community.setEditContent("正在保存的草稿");
    const pending = deferredResponse();
    request.mockImplementationOnce(() => pending.promise);
    const saving = community.saveEdit();
    expect(community.snapshot().savingEdit).toBe(true);
    community.cancelEdit();
    community.setEditContent("不得悄悄替换");
    expect(await community.saveEdit()).toBe(false);
    expect(community.snapshot().editContent).toBe("正在保存的草稿");
    pending.resolve(new Response("false"));
    expect(await saving).toBe(false);
    expect(community.snapshot()).toMatchObject({ savingEdit: false, editContent: "正在保存的草稿" });
  });

  it("preserves a newer composer draft typed during an asynchronous submission", async () => {
    const { community, request } = editingHarness();
    const pending = deferredResponse();
    request.mockImplementationOnce(() => pending.promise);
    community.setNickname("原昵称");
    community.setContent("board", "正在发送");
    const submission = community.submit("board");
    community.setContent("board", "新的未发草稿");
    community.setNickname("新昵称");
    expect(await community.submit("board")).toBe(false);
    pending.resolve(new Response('[{"id":22}]', { status: 201 }));
    expect(await submission).toBe(true);
    expect(community.snapshot()).toMatchObject({ nickname: "新昵称", contents: { board: "新的未发草稿" } });
  });

  it("allows owned replies and retains their draft when replies collapse", async () => {
    const { community, setRows } = editingHarness([23]);
    setRows([ownMessage, { ...ownMessage, id: 22, parent_id: 21 }, { ...ownMessage, id: 23, parent_id: 21 }]);
    await community.loadPage(0);
    community.openEdit(23);
    community.setEditContent("回复草稿");
    community.toggleReplies(21);
    community.toggleReplies(21);
    expect(community.snapshot()).toMatchObject({ editTarget: { id: 23 }, editContent: "回复草稿" });
  });

  it("replies to an existing reply within its top-level thread", async () => {
    const { community, request, setRows } = editingHarness();
    setRows([
      ownMessage,
      { ...ownMessage, id: 22, nickname: "另一位玩家", content: "已有回复", parent_id: 21 },
    ]);
    await community.loadPage(0);
    community.setNickname("同名玩家");
    community.openReply(22);
    community.setContent("board", "回复这条回复");
    expect(await community.submit("board")).toBe(true);
    const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ parent_id: 21, content: "回复这条回复" });
    expect(community.snapshot().replyTarget).toBeNull();
  });

  it("rejects invalid or oversized Unicode while accepting exactly 2000 astral characters", async () => {
    const { community, request } = editingHarness();
    expect(countMessageCharacters("中😀e\u0301")).toBe(4);
    community.setNickname("😀".repeat(10));
    for (const content of ["😀".repeat(2001), "\u3000\u00a0", "bad\u0000", "bad\ud800"]) {
      community.setContent("board", content);
      expect(await community.submit("board")).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
    request.mockImplementationOnce(async () => new Response('[{"id":21}]', { status: 201 }));
    community.setContent("board", "😀".repeat(MESSAGE_MAX_LENGTH));
    expect(await community.submit("board")).toBe(true);
    community.openEdit(21);
    const before = request.mock.calls.length;
    community.setEditContent("😀".repeat(MESSAGE_MAX_LENGTH + 1));
    expect(await community.saveEdit()).toBe(false);
    expect(request.mock.calls.length).toBe(before);
    community.setEditContent("😀".repeat(MESSAGE_MAX_LENGTH));
    expect(await community.saveEdit()).toBe(true);
  });

  it("falls back to unowned posting with an explicit notice when storage or crypto fails", async () => {
    for (const unavailable of ["storage", "crypto"] as const) {
      const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
        ? new Response(null, { status: 201 }) : new Response("[]"));
      const storage = { getItem: () => null, setItem: () => { if (unavailable === "storage") throw new Error("blocked"); } };
      if (unavailable === "crypto") vi.stubGlobal("crypto", undefined);
      try {
        const community = createCommunityMessages({ fetch: request as typeof fetch, storage });
        community.setNickname("玩家");
        community.setContent("board", "仍能发送");
        expect(await community.submit("board")).toBe(true);
        const post = request.mock.calls.find(([, init]) => init?.method === "POST")!;
        expect(JSON.parse(String(post[1]?.body))).not.toHaveProperty("edit_token_hash");
        expect(community.snapshot().notice).toContain("此留言无法编辑");
        expect(community.snapshot().ownedMessageIds.size).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  });

  it("does not trust an in-memory secret after browser credentials are removed", async () => {
    const { community, request, values } = editingHarness();
    await community.loadPage(0);
    community.openEdit(21);
    values.delete(ownershipKey);
    expect(await community.saveEdit()).toBe(false);
    expect(community.snapshot().editNotice).toContain("编辑凭证");
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("ignores a stale page response after an edit reload has completed", async () => {
    const { community, request, setRows } = editingHarness();
    await community.loadPage(0);
    community.openEdit(21);
    community.setEditContent("已保存的新内容");
    const stale = deferredResponse();
    request.mockImplementationOnce(() => stale.promise);
    const staleLoad = community.loadPage(0);
    setRows([{ ...ownMessage, content: "已保存的新内容" }]);
    expect(await community.saveEdit()).toBe(true);
    stale.resolve(new Response(JSON.stringify([ownMessage])));
    await staleLoad;
    expect(community.snapshot().messages[0].content).toBe("已保存的新内容");
  });

  it("limits SQL editing privileges and keeps legacy null ownership unclaimable", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261008_kwgame_v2_message_editing.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toMatch(/revoke all on function public\.edit_phd_simulator_v2_message[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.edit_phd_simulator_v2_message\(bigint, text, text, text\) to anon/);
    expect(sql).toMatch(/revoke select \(edit_token_hash\), update/);
    expect(sql).not.toMatch(/grant\s+(?:update|all)\b/i);
    expect(sql).toMatch(/message\.edit_token_hash = encode\(extensions\.digest\(convert_to/);
    expect(sql).toMatch(/message\.content = p_expected_content/);
    expect(sql).toMatch(/and message\.is_visible/);
    expect(sql).not.toMatch(/set\s+edit_token_hash\s*=/i);
    expect(sql).toMatch(/between 1 and 2000/);
    const deletionSql = readFileSync(new URL("../supabase/migrations/20261008_kwgame_v2_message_deletion.sql", import.meta.url), "utf8");
    expect(deletionSql).toMatch(/set search_path = ''/);
    expect(deletionSql).toMatch(/set content = '该留言已删除'/);
    expect(deletionSql).toMatch(/edit_token_hash = null/);
    expect(deletionSql).toMatch(/grant execute on function public\.delete_phd_simulator_v2_message\(bigint, text, text\) to anon/);
    expect(deletionSql).not.toMatch(/grant\s+(?:update|all)\b/i);
    const viewSql = readFileSync(new URL("../supabase/migrations/20261008_kwgame_v2_message_public_view.sql", import.meta.url), "utf8");
    expect(viewSql).toContain("phd_simulator_v2_public_messages");
    expect(viewSql).toMatch(/grant select on public\.phd_simulator_v2_public_messages to anon/);
    expect(viewSql).toMatch(/security_barrier = true/);
    expect(viewSql).not.toContain("edit_token_hash");
  });
});

declare global {
  interface Window {
    messageHarness: {
      community: CommunityMessages;
      render: () => void;
      refresh: () => void;
    };
  }
}

describe("V2 community message rendering", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("measures actual multiline overflow, preserves full safe content and expansion after rerender", async () => {
    const page = await browser.newPage({ viewport: { width: 500, height: 800 } });
    const rows = [
      { ...ownMessage, content: "一\n二\n三\n四\n五\n六" },
      { ...ownMessage, id: 22, content: "<script>alert('x')</script>" },
      { ...ownMessage, id: 23, content: "a".repeat(180) },
    ];
    await page.route("**/__message_test__", (route) => route.fulfill({ contentType: "text/html", body: `
      <html><head><meta charset="utf-8"><style>
        body { font: 16px/1.5 sans-serif; }
        .community-message-content { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 6em; overflow: hidden; }
        .community-message-content[data-expanded=true] { max-height: none; }
        [hidden] { display: none; }
      </style></head><body><main id="test-root"></main><script type="module">
        import { createCommunityMessages, renderCommunityMessages, refreshCommunityContentOverflow } from '/src/app/v2-community-messages.ts';
        import { renderLobbyMessageRailView } from '/src/app/v2-render-community.ts';
        const root = document.getElementById('test-root');
        root.innerHTML = renderLobbyMessageRailView();
        localStorage.setItem(${JSON.stringify(ownershipKey)}, ${JSON.stringify(JSON.stringify({ secret, ids: [21] }))});
        const rows = ${JSON.stringify(rows).replaceAll("<", "\\u003c")};
        const community = createCommunityMessages({ fetch: async (input, init) => {
          if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': '*/3' } });
          return new Response(JSON.stringify(new URL(input).searchParams.get('parent_id') === 'is.null' ? rows : []));
        }});
        await community.loadPage(0);
        window.messageHarness = { community, render: () => renderCommunityMessages(root, community), refresh: () => refreshCommunityContentOverflow(root) };
        window.messageHarness.render();
      </script></body></html>` }));
    try {
      await page.goto(`${server.resolvedUrls!.local[0]}__message_test__`);
      await page.waitForFunction(() => Boolean(window.messageHarness));
      const content = page.locator('[data-community-message-content="21"]');
      const toggle = page.locator('[data-community-toggle-content="21"]');
      expect(await content.textContent()).toBe(rows[0].content);
      expect(await toggle.isVisible()).toBe(true);
      expect(await page.locator('[data-community-toggle-content="22"]').isVisible()).toBe(false);
      expect(await page.locator('[data-community-message-content="22"]').textContent()).toBe(rows[1].content);
      expect(await page.locator('[data-community-message-content="22"] script').count()).toBe(0);
      expect(await page.locator('[data-community-toggle-content="23"]').isVisible()).toBe(false);
      expect(await page.locator('[data-community-edit="21"]').count()).toBe(1);
      expect(await page.locator('[data-community-edit="22"]').count()).toBe(0);
      await page.evaluate(() => { window.messageHarness.community.toggleContent(21); window.messageHarness.render(); });
      expect(await content.getAttribute("data-expanded")).toBe("true");
      expect(await toggle.getAttribute("aria-expanded")).toBe("true");
      expect(await content.evaluate((element) => element.clientHeight)).toBeGreaterThan(96);
      await page.evaluate(async () => { await window.messageHarness.community.loadPage(0); window.messageHarness.render(); });
      expect(await content.getAttribute("data-expanded")).toBe("true");
      await page.setViewportSize({ width: 180, height: 800 });
      await page.evaluate(() => window.messageHarness.refresh());
      expect(await page.locator('[data-community-toggle-content="23"]').isVisible()).toBe(true);
      await page.evaluate(() => { window.messageHarness.community.openEdit(21); window.messageHarness.community.setEditContent('草稿😀'); window.messageHarness.render(); });
      expect(await page.locator('[data-community-edit-content="21"]').inputValue()).toBe("草稿😀");
      expect(await page.locator('[data-community-edit-count="21"]').textContent()).toBe("3/2000");
      expect(await page.locator('[data-community-edit-content="21"]').getAttribute("maxlength")).toBeNull();
      await page.evaluate(() => { window.messageHarness.community.cancelEdit(); window.messageHarness.render(); });
      expect(await page.locator('[data-community-editor]').count()).toBe(0);
    } finally {
      await page.close();
    }
  });
});
