import { describe, expect, it, vi } from "vitest";
import { createCommunityMessages, MESSAGE_PAGE_SIZE } from "../src/app/v2-community-messages";

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
      ? new Response(null, { status: 201 })
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
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ nickname: "玩家甲", content: "第一条留言", source: "board", parent_id: null });
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
    expect(community.snapshot()).toMatchObject({ page: 1, notice: "已回复", replyTarget: null });
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
