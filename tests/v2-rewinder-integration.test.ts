import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createStore } from "../src/core/v2-store";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { captureRewinderGrowth } from "../src/core/v2-rewinder-growth";
import { captureRewinderRelationships } from "../src/core/v2-rewinder-relationships";
import { getRewinderPreview, initializeRewinder, normalizeRewinderArchive, settleRewinderArchive } from "../src/core/v2-rewinder";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "../src/core/v2-progression";
import { prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS } from "../src/core/v2-thesis-rules";
import { createRunReplay, executeReplayCommand, replayStateDigest, verifyRunReplay } from "../src/core/v2-run-replay";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { activateLover } from "../src/core/v2-lover-system";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import type { RewinderArchive, RewinderYearRecord } from "../src/core/v2-rewinder-state";
import type { GameState } from "../src/core/v2-types";

function nearYearEnd(totalMonths = 12): GameState {
  const state = createStartedGameState("rewinder");
  return initializeRewinder({ ...state, ...getCalendarForTotalMonths(totalMonths), totalMonths,
    selectedAdvisorName: "测试导师", eventQueue: [], availableRandomEvents: [],
    randomState: { seed: 1700000000, cursor: 0 },
    player: { san: 20, research: 5, social: 5, favor: 5, money: 100 } });
}
function record(state: GameState): RewinderYearRecord {
  return { growth: captureRewinderGrowth(state), relationships: captureRewinderRelationships(state) };
}
function archive(): RewinderArchive {
  const first = nearYearEnd();
  first.player.research = 18; first.readingState.readCount = 29;
  const second = nearYearEnd(24);
  second.player.social = 19; second.player.research = 20;
  return { years: { 1: record(first), 2: record(second) } };
}
function confirm(state: GameState): GameState {
  const event = state.eventQueue.find(item => item.rewinderPresentation)!;
  expect(event).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: "confirm-rewinder-year" });
}

async function fixture(history: RewinderArchive = { years: {} }, settledRuns = 0) {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
  const account = createDefaultAccountProfile();
  account.roleProgress.rewinder.unlocked = true;
  account.roleProgress.rewinder.playedRuns = settledRuns;
  account.rewinderArchive = history;
  saveAccountProfile(account, storage);
  const adapter = createMemoryRunSaveAdapter();
  const saves = createRunSaveRepository({ storage, adapter });
  await saves.ready();
  // These fixtures represent an already-running r8 life. New starts now use academic chapters.
  const initial = { ...createInitialState(), randomState: { seed: 1700000000, cursor: 0 } };
  const payload = { roleId: "rewinder" as const, rewinderArchive: history, rewinderCycleNumber: settledRuns + 1 };
  const oldStart = withGameplayRuleset("20261018-r8", () => dispatchAction(initial, "start-game", payload));
  const replay = createRunReplay(initial, oldStart, payload);
  replay.ruleset = "20261018-r8";
  replay.commands[0] = { kind: "action", actionId: "start-game", payload, ruleset: "20261018-r8" };
  saves.commit(oldStart, { replay, monthStart: true });
  const store = createStore({ storage, saves });
  await store.ready();
  store.getState().randomState = { seed: 1700000000, cursor: 0 };
  store.dispatch("start-game", { roleId: "rewinder" });
  return { store, saves, storage, adapter };
}
type Store = ReturnType<typeof createStore>;
function drain(store: Store) {
  for (let turn = 0; turn < 60 && store.getState().eventQueue.length; turn++) {
    const event = store.getState().eventQueue[0]!;
    if (event.rewinderPresentation) return;
    let advanced = false;
    for (const choice of event.choices) {
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: choice.id });
      if (!store.getState().eventQueue.some(item => item.id === event.id)) { advanced = true; break; }
    }
    expect(advanced, `${event.id}: ${event.choices.map(choice => choice.id).join(",")}`).toBe(true);
  }
}
function enroll(store: Store) {
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = store.getState().eventQueue.find(item => item.chainId === "before-grad-school")!;
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId });
  }
  store.dispatch("next-month");
}
function playYear(store: Store) {
  enroll(store);
  for (let month = 1; month <= 12; month++) {
    expect(store.getState().phase).toBe("playing");
    drain(store);
    store.dispatch("rest");
    store.dispatch("next-month");
    expect(store.getReplayStatus().failed).toBeUndefined();
  }
  expect(store.getState().totalMonths).toBe(12);
  expect(store.getState().rewinderState?.pending?.year).toBe(1);
}
function confirmStore(store: Store) {
  const event = store.getState().eventQueue.find(item => item.rewinderPresentation)!;
  store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: "confirm-rewinder-year" });
}

describe("rewinder yearly, replay and account integration", () => {
  it("does not strand a pending annual event when debug forces the next month", () => {
    const pending = dispatchAction(nearYearEnd(), "next-month");
    expect(pending.rewinderState?.pending).toBeDefined();
    const next = dispatchAction(pending, "force-next-month");
    expect(next.totalMonths).toBe(13);
    expect(next.rewinderState?.pending).toBeUndefined();
    expect(next.rewinderState?.completedYears).toEqual([1]);
  });

  it("freezes history without applying it at start, then restores only the matching August record once", () => {
    const historical = archive();
    const initial = createInitialState(); initial.randomState = { seed: 17, cursor: 0 };
    const started = withGameplayRuleset("20261018-r8", () => dispatchAction(initial, "start-game", { roleId: "rewinder", rewinderArchive: historical }));
    expect(started.player.research).toBeLessThan(18);
    historical.years[1]!.growth.attributes.research = 99;
    expect(started.rewinderState!.history.years[1]!.growth.attributes.research).toBe(18);
    const end = { ...nearYearEnd(), rewinderState: started.rewinderState };
    const pending = dispatchAction(end, "next-month");
    expect(pending.totalMonths).toBe(12);
    expect(pending.player.research).toBe(5);
    expect(getRewinderPreview(pending)?.after.growth.attributes).toMatchObject({ research: 18, social: 5 });
    const before = structuredClone(pending);
    getRewinderPreview(pending); getRewinderPreview(pending);
    expect(pending).toEqual(before);
    const next = confirm(pending);
    expect(next.totalMonths).toBe(13);
    expect(next.player.research).toBe(18);
    expect(next.player.social).toBe(5);
    expect(next.rewinderState?.completedYears).toEqual([1]);
    expect(Object.keys(next.rewinderState!.records.years)).toEqual(["1"]);
    expect(next.eventHistory.filter(item => item.chainId === "rewinder-year-1")).toHaveLength(1);
    const stale = pending.eventQueue.find(item => item.rewinderPresentation)!;
    const repeat = dispatchAction(next, "resolve-event", { eventId: stale.id, eventChoiceId: "confirm-rewinder-year" });
    expect(repeat.totalMonths).toBe(13);
    expect(repeat.rewinderState?.completedYears).toEqual([1]);
  });

  it("opens the final June event before graduation, then graduates after confirmation", () => {
    let state = nearYearEnd(getMonthLimitByDegree("master"));
    state.graduationScoreTarget = getGraduationScoreTarget("master", state.selectedAdvisorName!);
    state.totalResearchScore = state.graduationScoreTarget!;
    const reviewMonth = state.maxMonths - 2;
    const prepared = syncThesisState({ ...state, ...getCalendarForTotalMonths(reviewMonth), totalMonths: reviewMonth }, () => 0);
    prepared.thesis.researchPoints = prepared.thesis.researchPoints.map(point => ({ ...point, score: Math.ceil(THESIS_REVIEW_THRESHOLDS.master.B / 3) }));
    const reviewed = prepareThesisBlindReview(prepared, () => 0);
    state = { ...state, thesis: { ...reviewed.thesis, reviewResolved: true } };
    const pending = dispatchAction(state, "next-month");
    expect(pending.phase).toBe("playing");
    expect(pending.rewinderState?.pending?.year).toBe(3);
    const finished = confirm(pending);
    expect(finished).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
    expect(finished.rewinderState?.completedYears).toEqual([3]);
    expect(finished.rewinderState?.records.years[3]).toBeDefined();
  });

  it("does not repeat annual natural growth while the result awaits confirmation", () => {
    let state = nearYearEnd();
    state.loverState = activateLover("smart", 1, "female");
    state.loverProgressState = { ...createLoverProgressState("smart", () => 0), research: 2 };
    state = dispatchAction(state, "next-month");
    expect(state.loverProgressState.research).toBe(4);
    expect(state.loverProgressState.lastAnnualGrowthTotalMonths).toBe(12);
    const blocked = dispatchAction(state, "next-month");
    expect(blocked.loverProgressState.research).toBe(4);
    expect(blocked.totalMonths).toBe(12);
    const next = confirm(blocked);
    expect(next.totalMonths).toBe(13);
    expect(next.loverProgressState.research).toBe(4);
    expect(next.loverProgressState.lastAnnualGrowthTotalMonths).toBe(12);
  });

  it("merges annual maxima separately and rejects malformed or incomplete archive entries", () => {
    const account = createDefaultAccountProfile(); account.rewinderArchive = archive();
    const state = nearYearEnd();
    state.player.social = 16;
    state.rewinderState!.records = { years: { 1: record(state) } };
    const settled = settleRewinderArchive(account, { ...state, phase: "finished", ending: "quit" });
    expect(settled.rewinderArchive?.years[1]?.growth.attributes).toMatchObject({ research: 18, social: 16 });
    expect(settled.rewinderArchive?.years[2]?.growth.attributes).toMatchObject({ research: 20, social: 19 });
    expect(account.rewinderArchive.years[1]?.growth.attributes.social).toBe(5);
    expect(normalizeRewinderArchive({ years: { 1: { growth: {} }, 2: settled.rewinderArchive?.years[2], 99: record(state) } }).years)
      .toEqual({ 2: settled.rewinderArchive?.years[2] });
  });

  it("discards removed meeting and career fields from stored archives before preview or restoration", () => {
    const past = record(nearYearEnd());
    const stored = { ...past, growth: { ...past.growth, growth: { ...past.growth.growth,
      meetingCount: 99, domesticMeetingCount: 99, asiaMeetingCount: 99, westMeetingCount: 99,
      internshipCount: 99, hasInternshipExperience: true, hasJointTrainingExperience: true,
    } } };
    const cleaned = normalizeRewinderArchive({ years: { 1: stored } });
    expect(cleaned.years[1]).toEqual(past);
    const pending = dispatchAction(initializeRewinder(nearYearEnd(), { years: { 1: stored } }), "next-month");
    const next = confirm(pending);
    expect(next.eventCounters.meetingCount).toBe(0);
    expect(next.internshipCount).toBe(0);
    expect(next.conferenceCareerState.hasInternshipExperience).not.toBe(true);
    expect(next.conferenceEncounterState.bigBullCooperation).not.toBe(true);
    expect(next.rewinderState?.records.years[1]?.growth.growth).not.toHaveProperty("internshipCount");
  });

  it("replays a real full year, preserves pending saves, and archives only on explicit settlement", async () => {
    const { store, storage, adapter } = await fixture(archive(), 6);
    expect(store.getState().rewinderState?.cycleNumber).toBe(7);
    const originalArchive = structuredClone(store.getLobbyState().rewinderArchive);
    playYear(store);
    expect(getRewinderPreview(store.getState())?.cycleNumber).toBe(7);
    expect(store.getState().eventQueue.find(event => event.rewinderPresentation)?.rewinderPresentation?.cycleNumber).toBe(7);
    expect(store.getLobbyState().rewinderArchive).toEqual(originalArchive);
    getRewinderPreview(store.getState());
    await store.flushSaves();
    const restoredSaves = createRunSaveRepository({ storage, adapter });
    const restored = createStore({ storage, saves: restoredSaves });
    await restored.ready(); restored.dispatch("start-game", { roleId: "rewinder" });
    expect(restored.getState()).toEqual(store.getState());
    expect(restored.getState().rewinderState?.cycleNumber).toBe(7);
    confirmStore(restored);
    expect(restored.getState().totalMonths).toBe(13);
    expect(restored.getReplayStatus().failed).toBeUndefined();
    expect(restored.getLobbyState().rewinderArchive).toEqual(originalArchive);
    // Re-execute all actual commands, including annual confirmation, from the original start.
    const replay = structuredClone(restoredSaves.get("rewinder")!.replay!);
    let actual = structuredClone(replay.initial);
    for (const command of replay.commands) actual = executeReplayCommand(actual, command);
    expect(replayStateDigest(actual)).toBe(replayStateDigest(restored.getState()));
    expect(verifyRunReplay(replay, { state: replay.initial, index: 0 }, actual)).not.toBeNull();
    restored.dispatch("quit-game");
    expect(restored.isCurrentRunDisqualified()).toBe(false);
    expect(restored.getLobbyState().rewinderArchive).toEqual(originalArchive);
    restored.dispatch("reset-game");
    expect(restored.getLobbyState().rewinderArchive).toEqual(originalArchive);
    restored.dispatch("start-game", { roleId: "rewinder" });
    const completedRecord = structuredClone(restored.getState().rewinderState!.records.years[1]);
    restored.dispatch("settle-and-return");
    expect(restored.getState().phase).toBe("setup");
    expect(restored.getLobbyState().rewinderArchive?.years[1]).toEqual(completedRecord);
    expect(loadAccountProfile(storage).account.rewinderArchive?.years[1]).toEqual(completedRecord);
    expect(restored.hasRoleSave("rewinder")).toBe(false);
    restored.dispatch("start-game", { roleId: "rewinder" });
    expect(restored.getState().rewinderState?.academic?.startYear).toBe(1);
    expect(restored.getLobbyState().rewinderArchive?.years[1]).toEqual(completedRecord);
    expect(restored.getState().rewinderState?.records.years).toEqual({});
    expect(restored.getState().rewinderState?.cycleNumber).toBe(8);
  });

  it("rewinding before the annual event removes the abandoned record and later saves", async () => {
    const { store } = await fixture();
    playYear(store); confirmStore(store);
    expect(store.getState().rewinderState?.records.years[1]).toBeDefined();
    expect(store.loadRunSave("month:12")).toBe(true);
    expect(store.getState().rewinderState?.records.years).toEqual({});
    expect(store.getRunSaves().some(save => save.totalMonths > 12)).toBe(false);
    store.dispatch("quit-game"); store.dispatch("settle-and-return");
    expect(store.getLobbyState().rewinderArchive?.years).toEqual({});
  });

  it("debug disqualification prevents the completed annual record from entering the account", async () => {
    const { store } = await fixture();
    playYear(store); confirmStore(store);
    expect(store.getState().rewinderState?.records.years[1]).toBeDefined();
    store.markCurrentRunAsDebugged();
    store.dispatch("quit-game"); store.dispatch("settle-and-return");
    expect(store.getLobbyState().rewinderArchive?.years).toEqual({});
    expect(store.getFinalizedOutbox()).toEqual([]);
  });
});
