import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { collectRunStatistics } from "../src/core/v2-run-statistics";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFERENCE_STATS_RULE_VERSION, createConferenceStats, getConferenceGlobalStats, loadConferenceGlobalStats } from "../src/app/v2-conference-stats";
import { createJournalStats } from "../src/app/v2-journal-stats";
import { createThesisStats } from "../src/app/v2-thesis-stats";
import { createStatisticsClient } from "../src/app/v2-statistics-client";
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
  means: { Reject: 60, Poster: 120, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null } };

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
    if (String(input).endsWith("/record_phd_simulator_v2_stats_batch")) {
      for (const record of payload.p_records) rows.set(record.payload.p_id, record.payload);
      if (loseAcknowledgement) { loseAcknowledgement = false; throw new Error("Connection lost after commit"); }
      return Response.json(payload.p_records.map((record: { payload: { p_id: string } }) => record.payload.p_id));
    }
    if (failRead) return new Response("unavailable", { status: 503 });
    return Response.json({ ...SUMMARY, epoch: DATA_EPOCH });
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

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("global conference statistics", () => {
  it.each([
    ["conference", createConferenceStats, { p_rule_version: CONFERENCE_STATS_RULE_VERSION,
      p_conference_name: CONFERENCE.name, p_conference_year: CONFERENCE.year, p_target: "A",
      p_accepted: true, p_accept_type: "Poster", p_score: 120 }],
    ["journal", createJournalStats, { p_rule_version: "v2-journal-20261012", p_journal: "pami", p_score: 125, p_months: 2 }],
    ["thesis", createThesisStats, { p_rule_version: "v2-thesis-20261013", p_degree: "master",
      p_submitted: true, p_passed: true, p_excellent: false }],
  ] as const)("restores %s upload eligibility only from an explicit clean snapshot", async (kind, create, payload) => {
    const network = backend();
    const stats = create({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const state = createStartedGameState("normal");
    const ending = (fingerprint: string): GameState => ({ ...state, phase: "finished",
      pendingRunStatistics: [{ kind, fingerprint, payload }] });
    await stats.track(state, state);
    stats.markDebug();
    await stats.track(state, ending("debug-branch"), { finalized: true });
    await stats.flush();
    expect(network.fetch).not.toHaveBeenCalled();
    // Ordinary tracking must not itself pardon a debug branch.
    await stats.track(state, ending("still-debug"), { finalized: true, debugUsed: false });
    expect(network.fetch).not.toHaveBeenCalled();
    stats.restoreRun(state, { debugUsed: false });
    await stats.track(state, ending("clean-snapshot"), { finalized: true });
    await stats.flush();
    expect(network.rows.size).toBe(1);
    expect([...network.rows.values()][0]).toMatchObject(payload);
    stats.restoreRun(state, { debugUsed: true });
    await stats.track(state, ending("loaded-debug-snapshot"), { finalized: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.rows.size).toBe(1);
    stats.dispose();
  });

  it("keeps review evidence inside saves and uploads only the selected final branch", async () => {
    const network = backend();
    const local = storage();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    const rejected = review(false);
    const rejectedBranch = collectRunStatistics(rejected.before, rejected.after);
    expect(rejectedBranch.pendingRunStatistics).toHaveLength(1);
    await stats.track(rejected.before, rejectedBranch);
    await stats.track(rejectedBranch, { ...rejectedBranch, phase: "finished" });
    await stats.flush();
    expect(network.rows.size).toBe(0);
    stats.dispose();

    // Restore an earlier monthly save and choose another branch. The rejected
    // evidence is absent from that save and can never leak through a client queue.
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    const accepted = review(true);
    const acceptedBranch = JSON.parse(JSON.stringify(collectRunStatistics(accepted.before, accepted.after))) as GameState;
    expect(acceptedBranch.pendingRunStatistics).toHaveLength(1);
    await reloaded.track(acceptedBranch, { ...acceptedBranch, phase: "finished" });
    await reloaded.flush();
    expect(network.rows.size).toBe(0);
    await reloaded.track(acceptedBranch, { ...acceptedBranch, phase: "finished" }, { finalized: true });
    await reloaded.flush();
    expect([...network.rows.values()].map((row) => row.p_accepted)).toEqual([true]);
    reloaded.dispose();
  });

  it("shares the upload queue and debug exclusion with journal results", async () => {
    const network = backend();
    const client = createStatisticsClient({ fetch: network.fetch, storage: storage() });
    const conferences = createConferenceStats({ onChange: vi.fn(), client });
    const journals = createJournalStats({ onChange: vi.fn(), client });
    const states = review();
    const journal = { ...createDraftPaper(1, 0, () => 0), id: "shared-journal", status: "published" as const,
      journalTarget: "pami" as const, submittedYear: 1, submittedMonth: 3, acceptedTotalMonths: 5,
      idea: 40, experiment: 40, writing: 45 };
    const journalAfter = { ...states.after, externalPublications: [...states.after.externalPublications, journal] };
    await finalize(conferences, states.before, states.after);
    await finalize(journals, states.after, journalAfter);
    expect(network.fetch).not.toHaveBeenCalled();
    await client.flush();
    expect(network.rows.size).toBe(2);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(network.fetch.mock.calls[0]![1]!.body)).p_records.map((row: { kind: string }) => row.kind))
      .toEqual(["conference", "journal"]);
    conferences.markDebug();
    await finalize(journals, journalAfter, { ...journalAfter, externalPublications: [...journalAfter.externalPublications,
      { ...journal, id: "another-journal" }] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.fetch).toHaveBeenCalledTimes(1);
    client.dispose();
  });

  it.each([true, false])("records only final confirmed review outcomes (accepted=%s)", async (accepted) => {
    const network = backend();
    const onChange = vi.fn();
    const stats = createConferenceStats({ onChange, fetch: network.fetch, storage: storage() });
    const states = review(accepted);
    const snapshot = structuredClone(states.before);
    await stats.observe(states.before);
    await finalize(stats, states.overview, states.reviewers);
    await finalize(stats, states.reviewers, states.before);
    await finalize(stats, states.before, projectPaperReviewSettlement(states.before, states.settlement));
    expect(network.rows.size).toBe(0);
    await finalize(stats, states.before, states.after);
    expect(network.fetch).not.toHaveBeenCalled();
    await stats.flush();
    expect(network.rows.size).toBe(1);
    const payload = [...network.rows.values()][0]!;
    expect(payload).toMatchObject({ p_rule_version: CONFERENCE_STATS_RULE_VERSION,
      p_conference_name: CONFERENCE.name, p_conference_year: CONFERENCE.year, p_target: "A",
      p_accepted: accepted, p_score: accepted ? 300 : 3, p_accept_type: states.settlement.acceptType });
    expect(payload.p_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(payload).sort()).toEqual(["p_rule_version", "p_conference_name", "p_conference_year",
      "p_target", "p_accepted", "p_score", "p_accept_type", "p_id", "p_context"].sort());
    expect(JSON.stringify(payload)).not.toContain("Private paper title");
    expect(stats.read(...KEY)).toEqual({ status: "loading", data: null });
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: SUMMARY });
    expect(onChange).toHaveBeenCalled();
    expect(states.before).toEqual(snapshot);
  });

  it("deduplicates concurrent callbacks and persists acknowledgement across reloads", async () => {
    const network = backend();
    const local = storage();
    const states = review();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await Promise.all([finalize(stats, states.before, states.after), finalize(stats, states.before, states.after)]);
    await finalize(stats, states.before, states.after);
    await stats.flush();
    stats.dispose();
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await finalize(reloaded, states.before, states.after);
    await reloaded.flush();
    expect(network.rows.size).toBe(1);
    expect(network.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"))).toHaveLength(1);
  });

  it("retries an ambiguously committed upload with the same UUID after reload", async () => {
    const network = backend();
    network.loseNextAcknowledgement();
    const local = storage();
    const states = review();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await finalize(stats, states.before, states.after);
    await stats.flush();
    expect(network.rows.size).toBe(1);
    const id = [...network.rows.keys()][0];
    stats.dispose();
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await reloaded.flush();
    expect(network.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect([...network.rows.keys()]).toEqual([id]);
    expect(network.fetch.mock.calls.filter(([url]) => String(url).includes("/record_"))).toHaveLength(2);
    expect(reloaded.read(...KEY).status).toBe("loading");
  });

  it("does not acknowledge false or malformed upload responses", async () => {
    const network = backend();
    network.fetch.mockResolvedValueOnce(Response.json(false));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const states = review();
    await finalize(stats, states.before, states.after);
    await stats.flush();
    expect(network.rows.size).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.rows.size).toBe(1);
  });

  it("counts a rejected paper's confirmed resubmission as a distinct outcome", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const rejected = review(false);
    await finalize(stats, rejected.before, rejected.after);
    const paper = rejected.after.papers[0]!;
    const resubmitted = { ...rejected.after, papers: [{ ...prepareConferenceSubmission({ ...paper,
      idea: 100, experiment: 100, writing: 100 }, "A", 3, 1), reviewMonthsLeft: 0 }] };
    const overview = resolveDuePaperReviews(resubmitted, () => 0.5).state;
    const before = confirm(confirm(overview));
    await finalize(stats, before, confirm(before));
    await stats.flush();
    expect(network.rows.size).toBe(2);
    expect([...network.rows.values()].map((row) => row.p_accepted)).toEqual([false, true]);
  });

  it("fails closed when a cryptographic UUID cannot be generated", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: null });
    const states = review();
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => { throw new Error("unavailable"); });
    await finalize(stats, states.before, states.after);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("excludes debug runs persistently and resets exclusion for a new run", async () => {
    const network = backend();
    const local = storage();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    const states = review();
    await finalize(stats, states.before, states.after, { debugUsed: true });
    await finalize(stats, states.before, states.after, { debugUsed: false });
    expect(network.rows.size).toBe(0);
    const reloaded = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: local });
    await finalize(reloaded, states.before, states.after);
    expect(network.rows.size).toBe(0);
    reloaded.resetRun();
    const newRun = review(true, 456);
    await finalize(reloaded, newRun.before, newRun.after);
    await reloaded.flush();
    expect(network.rows.size).toBe(1);
  });

  it("drops unsent records when the run becomes debugged", async () => {
    const network = backend();
    network.fetch.mockRejectedValueOnce(new Error("offline"));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const states = review();
    await finalize(stats, states.before, states.after);
    await stats.flush();
    stats.markDebug();
    await stats.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(network.rows.size).toBe(0);
    expect(network.fetch).toHaveBeenCalledTimes(1);
  });

  it("tracks the new run after reset before a subscribed restart transition", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const oldRun = review(true, 123);
    await finalize(stats, oldRun.before, oldRun.after, { debugUsed: true });
    stats.resetRun();
    const newRun = review(true, 456);
    await finalize(stats, oldRun.after, newRun.overview);
    await finalize(stats, newRun.overview, newRun.reviewers);
    await finalize(stats, newRun.reviewers, newRun.before);
    await finalize(stats, newRun.before, newRun.after);
    await stats.flush();
    expect(network.rows.size).toBe(1);
  });

  it("marks the new run when the debug panel remains open across restart", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: storage() });
    const oldRun = review(true, 123);
    stats.resetRun();
    stats.markDebug();
    const newRun = review(true, 456);
    await finalize(stats, oldRun.after, newRun.overview);
    await finalize(stats, newRun.before, newRun.after);
    expect(network.fetch).not.toHaveBeenCalled();
  });

  it("makes no requests when disabled", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), enabled: false, fetch: network.fetch, storage: storage() });
    const states = review();
    await finalize(stats, states.before, states.after);
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
    await vi.advanceTimersByTimeAsync(600_001);
    await stats.load(...KEY);
    expect(network.fetch).toHaveBeenCalledTimes(2);
    const result = stats.read(...KEY);
    result.data!.counts.Poster = 999;
    expect(stats.read(...KEY).data!.counts.Poster).toBe(1);
  });

  it.each([null, {}, { ...SUMMARY, accepted: 3 },
    { ...SUMMARY, means: { ...SUMMARY.means, Reject: null } },
    { ...SUMMARY, means: { ...SUMMARY.means, Spotlight: 0 } }])(
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
      await vi.advanceTimersByTimeAsync(60_001);
      await stats.load(...KEY);
      expect(stats.read(...KEY)).toEqual({ status: "ready", data: SUMMARY });
      expect(onChange).toHaveBeenCalledTimes(2);
    },
  );

  it("retains genuine cached data as ready when refresh fails", async () => {
    vi.useFakeTimers();
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch, storage: null });
    await stats.load(...KEY);
    network.failReads();
    await vi.advanceTimersByTimeAsync(600_001);
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: SUMMARY });
  });

  it("accepts empty aggregates only with null means", async () => {
    const empty = { submissions: 0, accepted: 0,
      counts: { Poster: 0, Spotlight: 0, Oral: 0, "Best Paper Candidate": 0, "Best Paper": 0 },
      means: { Reject: null, Poster: null, Spotlight: null, Oral: null, "Best Paper Candidate": null, "Best Paper": null } };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ ...empty, epoch: DATA_EPOCH }));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch, storage: null });
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: empty });
  });

  it("accepts a conference with no rejections only when its reject mean is null", async () => {
    const allAccepted = { ...SUMMARY, submissions: 1, means: { ...SUMMARY.means, Reject: null } };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ ...allAccepted, epoch: DATA_EPOCH }));
    const stats = createConferenceStats({ onChange: vi.fn(), fetch, storage: null });
    await stats.load(...KEY);
    expect(stats.read(...KEY)).toEqual({ status: "ready", data: allAccepted });
  });

  it("rejects invalid keys without a request and tolerates unavailable storage", async () => {
    const network = backend();
    const stats = createConferenceStats({ onChange: vi.fn(), fetch: network.fetch,
      storage: { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } } });
    await stats.load("bad\nname", 2024, "A");
    await stats.load("CVPR", 1, "A");
    expect(network.fetch).not.toHaveBeenCalled();
    const states = review();
    await finalize(stats, states.before, states.after);
    await stats.flush();
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
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\b/i);
    expect(sql).not.toMatch(/create extension|pgcrypto|nickname|paper_title/i);
  });
});

// These recorder tests submit a committed final branch; gameplay alone never uploads.
function finalize(controller: { track(before: GameState, after: GameState, options?: { debugUsed?: boolean; finalized?: boolean }): Promise<void> },
  before: GameState, after: GameState, options: { debugUsed?: boolean } = {}): Promise<void> {
  return controller.track(before, { ...collectRunStatistics(before, after), phase: "finished" }, { ...options, finalized: true });
}
