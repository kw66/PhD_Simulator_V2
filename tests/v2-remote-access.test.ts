import { afterEach, describe, expect, it, vi } from "vitest";
import { isRemoteWriteEnabled } from "../src/app/v2-remote-access";
import { createCommunityMessages } from "../src/app/v2-community-messages";
import { createStatisticsClient } from "../src/app/v2-statistics-client";
import { createAchievementStats, ACHIEVEMENT_STATS_STORAGE_KEY } from "../src/app/v2-achievement-stats";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("remote writes are confined to the published site", () => {
  it.each(["localhost", "LOCALHOST", "localhost.", "preview.localhost", "127.0.0.1", "127.0.0.2", "[::1]", "::1", ""])(
    "blocks production previews on %s even with HTTPS", (hostname) => {
      expect(isRemoteWriteEnabled({ production: true, protocol: "https:", hostname })).toBe(false);
    });

  it("requires both a production build and HTTPS on a remote host", () => {
    const online = { production: true, protocol: "https:", hostname: "kw66.github.io" };
    expect(isRemoteWriteEnabled(online)).toBe(true);
    expect(isRemoteWriteEnabled({ ...online, production: false })).toBe(false);
    expect(isRemoteWriteEnabled({ ...online, protocol: "http:" })).toBe(false);
    expect(isRemoteWriteEnabled({ ...online, protocol: "file:" })).toBe(false);
  });

  it("keeps messages readable while blocking every local mutation, including owned messages", async () => {
    const message = { id: 21, nickname: "玩家", content: "线上留言", source: "board", parent_id: null, created_at: "2026-10-18T00:00:00Z" };
    const request = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === "HEAD") return new Response(null, { headers: { "Content-Range": "*/1" } });
      return Response.json(new URL(String(input)).searchParams.get("parent_id") === "is.null" ? [message] : []);
    });
    vi.stubGlobal("fetch", request);
    const community = createCommunityMessages({ storage: {
      getItem: (key) => key === "kwgame_v2_message_ownership" ? JSON.stringify({ secret: "a1".repeat(32), ids: [21] }) : null,
      setItem: vi.fn(),
    } });
    await community.loadPage(0);
    expect(community.snapshot()).toMatchObject({ status: "ready", writeEnabled: false, messages: [message] });
    request.mockClear();
    community.setNickname("本地玩家");
    for (const source of ["board", "feedback"] as const) {
      community.setContent(source, "本地调试内容");
      community.openReply(21, source);
      expect(await community.submit(source)).toBe(false);
    }
    community.openEdit(21);
    community.setEditContent("不应修改线上留言");
    expect(await community.saveEdit()).toBe(false);
    expect(await community.deleteMessage(21)).toBe(false);
    expect(community.snapshot().notice).toContain("本地预览不上传数据");
    expect(community.snapshot()).toMatchObject({ editTarget: null, replyTarget: null });
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks new statistics, restored queues and scheduled background writes by default locally", async () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const request = vi.fn<typeof fetch>(async (input) => Response.json(String(input).includes("achievement_stats")
      ? { version: 2, epoch: DATA_EPOCH, achievements: [] }
      : { epoch: DATA_EPOCH, acceptedCount: 0, meanScore: null, meanMonths: null }));
    const record = { runId: "20000000-0000-4000-8000-000000000001", debugUsed: false,
      state: { ...createStartedGameState("normal"), phase: "finished" as const, ending: "quit" as const } };
    const journal = { p_rule_version: "v2-journal-20261012", p_journal: "pami", p_score: 120, p_months: 2 };
    const seededStats = createStatisticsClient({ storage, fetch: request });
    seededStats.enqueue("journal", record.runId, "paper", journal);
    seededStats.persistPending();
    seededStats.dispose();
    const seededAchievements = createAchievementStats({ storage, fetch: request });
    seededAchievements.recordStartedPlayer();
    seededAchievements.recordFinalizedRun(record);
    seededAchievements.dispose();
    const savedAchievements = values.get(ACHIEVEMENT_STATS_STORAGE_KEY);
    vi.stubGlobal("fetch", request);
    const statistics = createStatisticsClient({ storage });
    const achievements = createAchievementStats({ storage });
    try {
      expect(statistics.enqueue("journal", "new-run", "paper", journal)).toBe(false);
      expect(achievements.recordStartedPlayer()).toBe(false);
      expect(achievements.recordFinalizedRun(record)).toBe(false);
      await Promise.all([statistics.flush(), achievements.flush()]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(request).not.toHaveBeenCalled();
      expect(values.get(ACHIEVEMENT_STATS_STORAGE_KEY)).toBe(savedAchievements);
      await statistics.load("get_phd_simulator_v2_journal_stats", {}, (value) => value);
      await achievements.load();
      expect(request.mock.calls).toHaveLength(2);
      expect(request.mock.calls.every(([url]) => String(url).includes("/get_"))).toBe(true);
    } finally { statistics.dispose(); achievements.dispose(); }
  });
});
