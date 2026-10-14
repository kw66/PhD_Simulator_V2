import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJournalStats } from "../src/app/v2-journal-stats";
import { renderJournalAcceptanceEvent } from "../src/app/v2-render-paper-review";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, JournalAcceptancePresentation } from "../src/core/v2-types";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function acceptedStates(): [GameState, GameState] {
  const before = createStartedGameState("normal");
  before.conferenceLocationSeed = 138;
  before.totalMonths = 5;
  before.year = 1;
  before.month = 5;
  const paper = { ...createDraftPaper(1, 0, () => 0), id: "accepted-journal", title: "Private title",
    status: "published" as const, journalTarget: "pami" as const,
    submittedYear: 1, submittedMonth: 3, acceptedTotalMonths: 5,
    idea: 40, experiment: 40, writing: 45 };
  return [before, { ...before, externalPublications: [paper] }];
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("global journal statistics", () => {
  it("queues a normal acceptance once and reads the shared aggregate only on demand", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const payload = JSON.parse(String(init?.body));
      if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
        for (const record of payload.p_records) rows.set(record.payload.p_id, record.payload);
        return Response.json(payload.p_records.map((record: { payload: { p_id: string } }) => record.payload.p_id));
      }
      return Response.json({ acceptedCount: 12, meanScore: 146.5, meanMonths: 2.3 });
    });
    const local = storage();
    const stats = createJournalStats({ onChange: vi.fn(), fetch, storage: local });
    const [before, after] = acceptedStates();
    await stats.track(before, after);
    await stats.track(before, after);
    expect(fetch).not.toHaveBeenCalled();
    await stats.flush();
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]).toMatchObject({ p_journal: "pami", p_score: 125, p_months: 2 });
    expect(JSON.stringify([...rows.values()][0])).not.toContain("Private title");
    expect(stats.read("pami")).toEqual({ status: "loading", data: null });
    await stats.load("pami");
    expect(stats.read("pami")).toEqual({ status: "ready", data: { acceptedCount: 12, meanScore: 146.5, meanMonths: 2.3 } });
    stats.dispose();
    const reloaded = createJournalStats({ onChange: vi.fn(), fetch, storage: local });
    await reloaded.track(before, after);
    await reloaded.flush();
    await reloaded.load("pami");
    expect(rows.size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not publish debug runs and never labels local numbers as global", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const stats = createJournalStats({ onChange: vi.fn(), fetch, storage: storage() });
    const [before, after] = acceptedStates();
    stats.markDebug();
    await stats.track(before, after);
    await stats.flush();
    expect(fetch).not.toHaveBeenCalled();
    const presentation: JournalAcceptancePresentation = {
      stage: "overview", paperTitle: "Test", journalName: "顶刊PAMI", journalTarget: "pami",
      submissionScore: 90, acceptanceScore: 125, submissionThreshold: 75,
      acceptanceThreshold: 125, scoreHistory: [{ totalMonths: 3, score: 90 }, { totalMonths: 5, score: 125 }],
    };
    const html = renderJournalAcceptanceEvent(presentation, "");
    expect(html).toContain("所有玩家统计");
    expect(html).toContain("统计暂未同步");
    expect(html).not.toContain("本局 · 顶刊PAMI统计");
    expect(html).not.toContain("中稿数</span><strong>1</strong>");
  });

  it("excludes papers led by another author", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const stats = createJournalStats({ onChange: vi.fn(), fetch, storage: storage() });
    const [before, after] = acceptedStates();
    after.externalPublications[0] = { ...after.externalPublications[0]!, nonFirstAuthor: true, leadAuthorId: "fellow" };
    await stats.track(before, after);
    await stats.flush();
    expect(fetch).not.toHaveBeenCalled();
  });
});
