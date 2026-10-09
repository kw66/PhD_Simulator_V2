import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFERENCE_STATS_RULE_VERSION, createConferenceStats, getConferenceGlobalStats, loadConferenceGlobalStats } from "../src/app/v2-conference-stats";
import { getConferenceInfo } from "../src/core/v2-conference-catalog";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { projectPaperReviewSettlement, resolveDuePaperReviews } from "../src/core/v2-publication-system";
import type { GameState } from "../src/core/v2-types";

const CONFERENCE = getConferenceInfo(3, "A", 1);
const KEY = [CONFERENCE.name, CONFERENCE.year, "A"] as const;
const SUMMARY = { submissions: 2, accepted: 1,
  counts: { Poster: 1, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
  acceptedMeanScore: 120, rejectedMeanScore: 60,
  means: { Reject: 60, Poster: 120, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null },
  p90: 114, p99: 119.4, updatedAt: "2026-10-09T08:00:00Z" };

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}

function backend() {
  const rows = new Map<string, Record<string, unknown>>();
  let loseAcknowledgement = false;
  let failRead = false;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const payload = JSON.parse(String(init?.body));
    if (String(input).endsWith("/record_phd_simulator_v2_conference_review")) {
      rows.set(payload.p_id, payload);
      if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error("Connection lost after commit"); }
      return Response.json(true);
    }
    if (failRead) return new Response("unavailable", { status: 503 });
    return Response.json(SUMMARY);
  });
  return { rows, fetch, loseNextAcknowledgement: () => { loseAcknowledgement = true; }, failReads: () => { failRead = true; } };
}

function confirm(state: GameState): GameState {
  const event = state.eventQueue.find((entry) => entry.source === "review")!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

function review(accepted = true, seed = 123) {
  const base = createStartedGameState("normal");
  const score = accepted ? 100 : 1;
  const paper = { ...prepareConferenceSubmission({ ...createDraftPaper(3, 0, () => 0),
    title: "Private paper title", idea: score, experiment: score, writing: score }, "A", 3, 1), reviewMonthsLeft: 0 };
  const initial: GameState = { ...base, conferenceLocationSeed: seed, year: 1, month: 6, totalMonths: 6,
    eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [], papers: [paper],
    player: { ...base.player, san: 20, money: 100 }, advisorProgressState: { ...base.advisorProgressState, funding: 100 } };
  const overview = resolveDuePaperReviews(initial, () => 0.5).state;
  const reviewers = confirm(overview);
  const before = confirm(reviewers);
  const settlement = before.eventQueue.find((event) => event.source === "review")!.choices[0]!.effects.paperReviewSettlement!;
  expect(settlement.accepted).toBe(accepted);
  return { overview, reviewers, before, after: confirm(before), settlement };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("global conference statistics", () => {
  it.each([true, false])("records only final confirmed review outcomes (accepted=%s)", async (accepted) => {
    const network = backend();
    const onChange = vi.fn();
    const stats = createConferenceStats({ onChange, fetch: network.fetch, storage: storage() });
    const states = review(accepted);
    const snapshot = structuredClone(states.before);
    await stats.observe(states.before);
    await stats.track(states.overview, states.reviewers);
    await stats.track(states.reviewers, states.before);
    await stats.track(states.before, projectPaperReviewSettlement(states.before, states.settlement));
    expect(network.rows.size).toBe(0);
    await stats.track(states.before, states.after);
    expect(network.rows.size).toBe(1);
    const payload = [...network.rows.values()][0]!;
    expect(payload).toMatchObject({ p_rule_version: CONFERENCE_STATS_RULE_VERSION,
      p_conference_name: CONFERENCE.name, p_conference_year: CONFERENCE.year, p_target: "A",
      p_accepted: accepted, p_score: accepted ? 300 : 3, p_accept_type: states.settlement.acceptType });
    expect(payload.p_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(payload).sort()).toEqual(["p_rule_version", "p_conference_name", "p_conference_year",
      "p_target", "p_accepted", "p_score", "p_accept_type", "p_id"].sort());
    expect(JSON.stringify(payload)).not.toContain("Private paper title");
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: SUMMARY });
    expect(onChange).toHaveBeenCalled();
    expect(states.before).toEqual(snapshot);
  });

  it("deduplicates concurrent callbacks and persists acknowledgement across reloads", async () => {
    const network = backend();
    const local = storage();
    const states = review();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await Promise.all([stats.track(states.before, states.after), stats.track(states.before, states.after)]);
    await stats.track(states.before, states.after);
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await reloaded.track(states.before, states.after);
    expect(network.rows.size).toBe(1);
    expect(network.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"))).toHaveLength(1);
  });

  it("retries an ambiguously committed upload with the same UUID after reload", async () => {
    const network = backend();
    network.loseNextAcknowledgement();
    const local = storage();
    const states = review();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await stats.track(states.before, states.after);
    expect(network.rows.size).toBe(1);
    const id = [...network.rows.keys()][0];
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await reloaded.flush();
    expect([...network.rows.keys()]).toEqual([id]);
    expect(network.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"))).toHaveLength(2);
    expect(reloaded.read(...KEY).status).toBe("ready");
  });

  it("does not acknowledge false or malformed upload responses", async () => {
    const network = backend();
    network.fetch.mockResolvedValueOnce(Response.json(false));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const states = review();
    await stats.track(states.before, states.after);
    expect(network.rows.size).toBe(0);
    await stats.flush();
    expect(network.rows.size).toBe(1);
  });

  it("counts a rejected paper's confirmed resubmission as a distinct outcome", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const rejected = review(false);
    await stats.track(rejected.before, rejected.after);
    const paper = rejected.after.papers[0]!;
    const resubmitted = { ...rejected.after, papers: [{ ...prepareConferenceSubmission({ ...paper,
      idea: 100, experiment: 100, writing: 100 }, "A", 3, 1), reviewMonthsLeft: 0 }] };
    const overview = resolveDuePaperReviews(resubmitted, () => 0.5).state;
    const before = confirm(confirm(overview));
    await stats.track(before, confirm(before));
    expect(network.rows.size).toBe(2);
    expect([...network.rows.values()].map((row) => row.p_accepted)).toEqual([false, true]);
  });

  it("fails closed when a cryptographic UUID cannot be generated", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: null });
    const states = review();
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => { throw new Error("unavailable"); });
    await stats.track(states.before, states.after);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("excludes debug runs persistently and resets exclusion for a new run", async () => {
    const network = backend();
    const local = storage();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    const states = review();
    await stats.track(states.before, states.after, { debugUsed: true });
    await stats.track(states.before, states.after, { debugUsed: false });
    expect(network.rows.size).toBe(0);
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await reloaded.track(states.before, states.after);
    expect(network.rows.size).toBe(0);
    reloaded.resetRun();
    const newRun = review(true, 456);
    await reloaded.track(newRun.before, newRun.after);
    expect(network.rows.size).toBe(1);
  });

  it("drops unsent records when the run becomes debugged", async () => {
    const network = backend();
    network.fetch.mockRejectedValueOnce(new Error("offline"));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const states = review();
    await stats.track(states.before, states.after);
    stats.markDebug();
    await stats.flush();
    expect(network.rows.size).toBe(0);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("tracks the new run after reset before a subscribed restart transition", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const oldRun = review(true, 123);
    await stats.track(oldRun.before, oldRun.after, { debugUsed: true });
    stats.resetRun();
    const newRun = review(true, 456);
    await stats.track(oldRun.after, newRun.overview);
    await stats.track(newRun.overview, newRun.reviewers);
    await stats.track(newRun.reviewers, newRun.before);
    await stats.track(newRun.before, newRun.after);
    expect(network.rows.size).toBe(1);
  });

  it("marks the new run when the debug panel remains open across restart", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const oldRun = review(true, 123);
    stats.resetRun();
    stats.markDebug();
    const newRun = review(true, 456);
    await stats.track(oldRun.after, newRun.overview);
    await stats.track(newRun.before, newRun.after);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("makes no requests when disabled", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), enabled: false, fetch: network.fetch, storage: storage() });
    const states = review();
    await stats.track(states.before, states.after);
    await stats.load(...KEY);
    await stats.flush();
    expect(stats.read(...KEY)).toEqual({ status: "unavailable", data: null });
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("deduplicates loads, caches by conference/year/grade and expires successful reads", async () => {
    vi.useFakeTimers();
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: null });
    expect(getConferenceGlobalStats(...KEY)).toEqual({ status: "loading", data: null });
    await Promise.all([stats.load(...KEY), loadConferenceGlobalStats(...KEY)]);
    await stats.load(...KEY);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(getConferenceGlobalStats(...KEY)).toEqual({ status: "ready", data: SUMMARY });
    expect(stats.read(KEY[0], KEY[1] + 1, "A").status).toBe("loading");
    expect(stats.read(KEY[0], KEY[1], "B").status).toBe("loading");
    expect(stats.read("ICML", KEY[1], "A").status).toBe("loading");
    await vi.advanceTimersByTimeAsync(60_001);
    await stats.load(...KEY);
    expect(network.fetch).toHaveBeenCalledTimes(2);
    const result = stats.read(...KEY);
    result.data!.counts.Poster = 999;
    expect(stats.read(...KEY).data!.counts.Poster).toBe(1);
  });

  it.each([null, {}, { ...SUMMARY, accepted: 3 }, { ...SUMMARY, p90: 999 }, { ...SUMMARY, p99: "NaN" }])(
    "keeps malformed responses unavailable without fabricating zero counts: %j", async (response) => {
      vi.useFakeTimers();
      const network = backend();
      network.fetch.mockResolvedValueOnce(Response.json(response));
      const onChange = vi.fn();
      const stats = createConferenceStats({ onChange, fetch: network.fetch, storage: storage() });
      await stats.load(...KEY);
      expect(stats.read(...KEY)).toEqual({ status: "unavailable", data: null });
      await stats.load(...KEY);
      expect(network.fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_001);
      await stats.load(...KEY);
      expect(stats.read(...KEY)).toEqual({ status: "ready", data: SUMMARY });
      expect(onChange).toHaveBeenCalledTimes(2);
    },
  );

  it("retains genuine cached data but reports unavailable when refresh fails", async () => {
    vi.useFakeTimers();
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: null });
    await stats.load(...KEY);
    network.failReads();
    await vi.advanceTimersByTimeAsync(60_001);
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "unavailable", data: SUMMARY });
  });

  it("accepts real empty aggregates only with null scores and timestamp", async () => {
    const empty = { submissions: 0, accepted: 0,
      counts: { Poster: 0, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
      acceptedMeanScore: null, rejectedMeanScore: null,
      means: { Reject: null, Poster: null, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null },
      p90: null, p99: null, updatedAt: null };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(empty));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch, storage: null });
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: empty });
  });

  it("rejects invalid keys without a request and tolerates unavailable storage", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch,
      storage: { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } } });
    await stats.load("bad\nname", 2024, "A");
    await stats.load("CVPR", 1, "A");
    expect(network.fetch).not.toHaveBeenCalled();
    const states = review();
    await stats.track(states.before, states.after);
    expect(network.rows.size).toBe(1);
  });

  it("ships an isolated aggregate-only SQL contract with UUID deduplication", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261009_kwgame_v2_conference_stats.sql", import.meta.url), "utf8");
    expect(sql).toContain(CONFERENCE_STATS_RULE_VERSION);
    expect(sql).toContain("id uuid primary key");
    expect(sql).toContain("on conflict (id) do nothing");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.phd_simulator_v2_conference_reviews from public, anon, authenticated");
    expect(sql.match(/security definer\nset search_path = ''/g)).toHaveLength(2);
    expect(sql).toContain("percentile_cont(0.9)");
    expect(sql).toContain("percentile_cont(0.99)");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\b/i);
    expect(sql).not.toMatch(/create extension|pgcrypto|nickname|paper_title/i);
  });
});
