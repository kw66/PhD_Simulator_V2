import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { collectRunStatistics } from "../src/core/v2-run-statistics";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThesisStats } from "../src/app/v2-thesis-stats";
import { renderThesisReviewReports } from "../src/app/v2-render-graduation";
import { dispatchAction } from "../src/core/v2-engine";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectThesisEventForMonth } from "../src/core/v2-monthly-thesis-events";
import { syncThesisState } from "../src/core/v2-thesis-rules";
import type { Degree, GameState } from "../src/core/v2-types";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function reviewStates(degree: Degree = "master", submitted = true): [GameState, GameState] {
  const start = createInitialState();
  const year = degree === "master" ? 3 : 6;
  const initialized = syncThesisState({ ...start, phase: "playing", degree, year, month: 1,
    totalMonths: (year - 1) * 12 + 1, selectedAdvisorName: "测试导师",
    graduationScoreTarget: 1, totalResearchScore: submitted ? 1 : 0,
  }, () => 0.5);
  const state = { ...initialized, month: 8, totalMonths: initialized.totalMonths + 7,
    thesis: { ...initialized.thesis, researchPoints: initialized.thesis.researchPoints.map((point) => ({ ...point, score: 300 })) } };
  const collected = collectThesisEventForMonth(state, () => 0.5);
  const overview = collected.event!;
  const reports = overview.choices[0]!.effects.enqueueEvents![0]!;
  const decision = reports.choices[0]!.effects.enqueueEvents![0]!;
  const before = { ...collected.nextState, eventQueue: [createEventQueueItem(decision, 0)] };
  const after = dispatchAction(before, "resolve-event", { eventId: decision.id, eventChoiceId: decision.choices[0]!.id });
  expect(after.thesis.reviewResolved).toBe(true);
  return [before, after];
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("global thesis statistics", () => {
  it("queues a confirmed review once and reads degree-specific shared counts only on demand", async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const payload = JSON.parse(String(init?.body));
      if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
        for (const record of payload.p_records) rows.set(record.payload.p_id, record.payload);
        return Response.json(payload.p_records.map((record: { payload: { p_id: string } }) => record.payload.p_id));
      }
      return Response.json({ epoch: DATA_EPOCH, submittedCount: 30, passedCount: 18, excellentCount: 3, notSubmittedCount: 4 });
    });
    const local = storage();
    const stats = createThesisStats({ onChange: vi.fn(), fetch, storage: local });
    const [before, after] = reviewStates();
    expect(before.eventQueue[0]?.stage).toBe("result");
    expect(before.eventQueue[0]?.thesisReviewPresentation?.stage).toBe("decision");
    expect(after.eventQueue.some((entry) => entry.id === before.eventQueue[0]!.id)).toBe(false);
    expect(after.thesis.review).toMatchObject({ degree: "master", submitted: true, passed: true, excellent: true });
    expect(globalThis.crypto.randomUUID).toBeTypeOf("function");
    expect([after.conferenceLocationSeed, after.selectedRoleId]).toEqual([before.conferenceLocationSeed, before.selectedRoleId]);
    await finalize(stats, before, { ...before });
    expect(fetch).not.toHaveBeenCalled();
    await finalize(stats, before, after);
    await finalize(stats, before, after);
    expect(fetch).not.toHaveBeenCalled();
    await stats.flush();
    expect(rows.size).toBe(1);
    expect([...rows.values()][0]).toMatchObject({ p_degree: "master", p_submitted: true, p_passed: true, p_excellent: true });
    expect(JSON.stringify([...rows.values()][0])).not.toContain(before.thesis.title);
    expect(stats.read("master")).toEqual({ status: "loading", data: null });
    await stats.load("master");
    expect(stats.read("master")).toEqual({ status: "ready", data: {
      submittedCount: 30, passedCount: 18, excellentCount: 3, notSubmittedCount: 4,
    } });
    expect(stats.read("phd").data).toBeNull();
    const html = renderThesisReviewReports(before.eventQueue[0]!.thesisReviewPresentation!);
    expect(html).toContain("所有玩家 · 硕士盲审");
    expect(html).toContain("已送审</span><strong>30</strong>");
    expect(html).toContain("通过率</span><strong>60%</strong>");
    expect(html).toContain("优秀率</span><strong>10%</strong>");
    expect(html).toContain("未送审</span><strong>4</strong>");
    expect(html).toContain("通过率、优秀率以已送审人数为分母");
    expect(html).not.toContain("统计暂未同步");
    stats.dispose();
    const reloaded = createThesisStats({ onChange: vi.fn(), fetch, storage: local });
    await finalize(reloaded, before, after);
    await reloaded.flush();
    await reloaded.load("master");
    expect(rows.size).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps unsubmitted reviews out of both rate denominators", async () => {
    const payloads: Record<string, unknown>[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
        const records = JSON.parse(String(init?.body)).p_records as { payload: Record<string, unknown> }[];
        payloads.push(...records.map((record) => record.payload));
        return Response.json(records.map((record) => record.payload.p_id));
      }
      return Response.json({ epoch: DATA_EPOCH, submittedCount: 0, passedCount: 0, excellentCount: 0, notSubmittedCount: 1 });
    });
    const stats = createThesisStats({ onChange: vi.fn(), fetch, storage: storage() });
    const [before, after] = reviewStates("phd", false);
    await finalize(stats, before, after);
    await stats.flush();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ p_degree: "phd", p_submitted: false, p_passed: false, p_excellent: false });
    await stats.load("phd");
    const html = renderThesisReviewReports(before.eventQueue[0]!.thesisReviewPresentation!);
    expect(html).toContain("已送审</span><strong>0</strong>");
    expect(html).toContain("通过率</span><strong>—</strong>");
    expect(html).toContain("优秀率</span><strong>—</strong>");
    expect(html).toContain("未送审</span><strong>1</strong>");
  });

  it("does not publish debug runs or label local results as global", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const stats = createThesisStats({ onChange: vi.fn(), fetch, storage: storage() });
    const [before, after] = reviewStates();
    stats.markDebug();
    await finalize(stats, before, after);
    await stats.flush();
    expect(fetch).not.toHaveBeenCalled();
    const html = renderThesisReviewReports(before.eventQueue[0]!.thesisReviewPresentation!);
    expect(html).toContain("统计暂未同步");
    expect(html).toContain("已送审</span><strong>—</strong>");
  });

  it("rejects inconsistent aggregates without showing misleading rates", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      submittedCount: 2, passedCount: 3, excellentCount: 1, notSubmittedCount: 0,
    }));
    const stats = createThesisStats({ onChange: vi.fn(), fetch, storage: storage() });
    await stats.load("master");
    expect(stats.read("master")).toEqual({ status: "unavailable", data: null });
  });
});

// These recorder tests submit a committed final branch; gameplay alone never uploads.
function finalize(controller: { track(before: GameState, after: GameState, options?: { debugUsed?: boolean; finalized?: boolean }): Promise<void> },
  before: GameState, after: GameState, options: { debugUsed?: boolean } = {}): Promise<void> {
  return controller.track(before, { ...collectRunStatistics(before, after), phase: "finished" }, { ...options, finalized: true });
}
