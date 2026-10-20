import { describe, expect, it } from "vitest";
import { createStore } from "../src/core/v2-store";
import { replayStateDigest } from "../src/core/v2-run-replay";
import { createRunSaveRepository, createMemoryRunSaveAdapter, type RunSaveAdapter } from "../src/core/v2-run-saves";
import { ACCOUNT_STORAGE_KEY, loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, PendingEvent } from "../src/core/v2-types";

type Store = ReturnType<typeof createStore>;

function memoryStorage() {
  const values = new Map<string, string>();
  let fail = false;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail && key === ACCOUNT_STORAGE_KEY) throw new Error("quota");
      values.set(key, value);
    },
    failAccountWrites(value: boolean) { fail = value; },
  };
}

async function harness() {
  const storage = memoryStorage();
  const profile = createDefaultAccountProfile();
  profile.roleProgress.rich.unlocked = true;
  saveAccountProfile(profile, storage);
  const adapter = createMemoryRunSaveAdapter();
  const saves = createRunSaveRepository({ storage, adapter });
  const store = createStore({ storage, saves });
  await store.ready();
  return { store, storage, adapter, saves };
}

async function reopen(storage: ReturnType<typeof memoryStorage>, adapter: RunSaveAdapter) {
  const saves = createRunSaveRepository({ storage, adapter });
  const store = createStore({ storage, saves });
  await store.ready();
  return { store, saves };
}

function finishOpening(store: Store) {
  for (const choiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = store.getState().eventQueue.find(item => item.chainId === "before-grad-school")!;
    expect(event).toBeDefined();
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: choiceId });
  }
  store.dispatch("next-month");
  expect(store.getState().totalMonths).toBe(1);
}

function nextMonth(store: Store) {
  // Exercise normal event confirmation before the ordinary month transition.
  for (let i = 0; i < 30 && store.getState().eventQueue.length; i += 1) {
    const event = store.getState().eventQueue[0]!;
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
  }
  const previous = store.getState().totalMonths;
  store.dispatch("next-month");
  expect(store.getState().totalMonths).toBe(previous + 1);
}

function awardWindfall(store: Store, saves: ReturnType<typeof createRunSaveRepository>) {
  const event: PendingEvent = {
    id: "save-test-income", chainId: "save-test-income", title: "收入", description: "", source: "system",
    stage: "result", blocking: true, deadlineMonths: 0,
    choices: [{ id: "confirm", label: "确定", outcome: "", effects: { money: 100 } }],
  };
  store.getState().eventQueue = [createEventQueueItem(event, 1)];
  // Inject this test-only income event as an explicit trusted fixture checkpoint.
  // Give it a distinct operation index so the real month-start checkpoint remains
  // available for the rewind assertions below. Replay corruption has its own tests.
  const state = store.getState();
  const replay = structuredClone(saves.get(state.selectedRoleId)!.replay!);
  replay.commands.push({ kind: "help", id: "fixture-boundary", requiredIds: [] });
  replay.checkpoints.push({ index: replay.commands.length, digest: replayStateDigest(state), totalMonths: state.totalMonths });
  saves.commit(state, { runId: store.getCurrentRunId()!, replay });
  expect(store.loadRunSave("latest")).toBe(true);
  store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: "confirm" });
}

describe("per-role saves integrated with the store", () => {
  it("retires only an unallocated playing save through normal one-time finalization", async () => {
    const { store } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    const runId = store.getCurrentRunId();
    finishOpening(store);
    store.dispatch("reset-game");
    // Lobby edits cannot retroactively allocate talents in a saved run.
    store.upgradeRoleTalent("normal", "first-month-drive");
    expect(store.getRoleSaveTalentState("normal")).toMatchObject({ phase: "playing", levels: {} });
    let finalized = 0;
    store.subscribeFinalized(() => { finalized++; });
    expect(store.retireUnallocatedRoleSave("normal")).toBe(true);
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("normal")).toBe(false);
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    expect(store.getFinalizedOutbox().find(run => run.runId === runId)?.state.ending).toBe("quit");
    expect(store.getLobbyState().achievementRewardedIds).toContain("global:ending-quit");
    expect(store.retireUnallocatedRoleSave("normal")).toBe(false);
    expect(finalized).toBe(1);
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().roleTalents?.levels["first-month-drive"]).toBe(1);
    store.dispatch("reset-game");
    expect(store.retireUnallocatedRoleSave("normal")).toBe(false);
    expect(store.hasRoleSave("normal")).toBe(true);
  });

  it("resumes latest after lobby return and browser recreation without counting another start", async () => {
    const { store, storage, adapter } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    store.dispatch("set-linear-event-blocking", { blockLinearEvents: false });
    const latest = structuredClone(store.getState());
    const runId = store.getCurrentRunId();
    store.dispatch("reset-game");
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("normal")).toBe(true);
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState()).toEqual(latest);
    expect(store.getCurrentRunId()).toBe(runId);
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    await store.flushSaves();
    const loaded = (await reopen(storage, adapter)).store;
    loaded.dispatch("start-game", { roleId: "normal" });
    expect(loaded.getState()).toEqual(latest);
    expect(loaded.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
  });

  it("settles to setup without another start or save and leaves the other role untouched", async () => {
    const { store, saves } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    const normalRun = saves.get("normal")!;
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "rich" });
    finishOpening(store);
    const richRun = saves.get("rich")!;
    store.dispatch("quit-game");
    store.dispatch("settle-and-return");
    expect(store.getState().phase).toBe("setup");
    expect(store.getState().totalMonths).toBe(0);
    expect(store.getCurrentRunId()).not.toBe(richRun.runId);
    expect(saves.get("rich")).toBeUndefined();
    expect(store.getCurrentRunId()).toBeNull();
    expect(store.getLobbyState().roleProgress.rich.startedRuns).toBe(1);
    expect(saves.get("normal")).toEqual(normalRun);
    store.dispatch("start-game", { roleId: "rich" });
    expect(store.getLobbyState().roleProgress.rich.startedRuns).toBe(2);
    expect(saves.get("rich")?.months.map(month => month.totalMonths)).toEqual([0]);
  });

  it("keeps month starts immutable while latest changes, and truncates the future after rewind", async () => {
    const { store, saves, storage, adapter } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    const firstMonth = structuredClone(saves.get("normal")!.months.find(item => item.totalMonths === 1)!);
    store.dispatch("set-linear-event-blocking", { blockLinearEvents: false });
    nextMonth(store);
    nextMonth(store);
    expect(store.getRunSaves().filter(item => item.kind === "month").map(item => item.totalMonths)).toEqual([3, 2, 1, 0]);
    expect(saves.get("normal")!.months.find(item => item.totalMonths === 1)).toEqual(firstMonth);
    expect(store.loadRunSave("month:1")).toBe(true);
    expect(store.getState()).toEqual(firstMonth.state);
    expect(store.getRunSaves().filter(item => item.kind === "month").map(item => item.totalMonths)).toEqual([1, 0]);
    await store.flushSaves();
    const loaded = (await reopen(storage, adapter)).store;
    loaded.dispatch("start-game", { roleId: "normal" });
    expect(loaded.getState()).toEqual(firstMonth.state);
    expect(loaded.getRunSaves().some(item => item.totalMonths > 1)).toBe(false);
  });

  it("previews but does not reward branch achievements and rewinding discards that branch", async () => {
    const { store, saves } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    awardWindfall(store, saves);
    expect(store.getState().achievementProgress?.satisfied).toContain("global:windfall");
    store.dispatch("quit-game");
    expect(store.getState().runAchievementIds).toContain("global:windfall");
    expect(store.getEndingExperienceAward()?.gained).toBeGreaterThan(0);
    expect(store.getLobbyState().achievementRewardedIds).toEqual([]);
    expect(store.getLobbyState().roleProgress.normal.exp).toBe(0);
    expect(store.loadRunSave("month:1")).toBe(true);
    expect(store.getState().achievementProgress?.satisfied).not.toContain("global:windfall");
    store.dispatch("quit-game");
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().achievementRewardedIds).not.toContain("global:windfall");
    expect(store.getLobbyState().achievementUnlockedByRole?.["global:windfall"]).toBeUndefined();
    expect(store.getLobbyState().achievementRewardedIds).toContain("global:ending-quit");
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(1);
  });

  it("keeps debug qualification on affected saves but restores normal settlement from an earlier month", async () => {
    const { store, storage, adapter, saves } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    const cleanMoney = store.getState().player.money;
    store.dispatch("debug-adjust-stat", { debugStatId: "money", delta: 100 });
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("force-next-month");
    expect(saves.get("normal")?.months.find(month => month.totalMonths === 1)?.debugUsed).toBe(false);
    expect(saves.get("normal")?.months.find(month => month.totalMonths === 2)?.debugUsed).toBe(true);
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.isCurrentRunDebugged()).toBe(true);
    await store.flushSaves();
    const loaded = (await reopen(storage, adapter)).store;
    loaded.dispatch("start-game", { roleId: "normal" });
    expect(loaded.isCurrentRunDebugged()).toBe(true);
    expect(loaded.loadRunSave("month:2")).toBe(true);
    expect(loaded.isCurrentRunDebugged()).toBe(true);
    loaded.dispatch("quit-game");
    expect(loaded.getEndingExperienceAward()?.disqualifiedByDebug).toBe(true);
    expect(loaded.loadRunSave("month:1")).toBe(true);
    expect(loaded.isCurrentRunDisqualified()).toBe(false);
    expect(loaded.getState().player.money).toBe(cleanMoney);
    expect(loaded.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    expect(loaded.getRunSaves().some(save => save.totalMonths > 1)).toBe(false);
    expect(loaded.loadRunSave("month:1")).toBe(true);
    expect(loaded.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    await loaded.flushSaves();
    const clean = (await reopen(storage, adapter)).store;
    clean.dispatch("start-game", { roleId: "normal" });
    expect(clean.isCurrentRunDisqualified()).toBe(false);
    clean.dispatch("quit-game");
    expect(clean.getEndingExperienceAward()?.disqualifiedByDebug).toBeUndefined();
    expect(clean.getEndingExperienceAward()?.disqualifiedByIntegrity).toBeUndefined();
    clean.dispatch("settle-and-return");
    expect(clean.getLobbyState().achievementRewardedIds).toContain("global:ending-quit");
    expect(clean.getLobbyState().roleProgress.normal.playedRuns).toBe(1);
    expect(clean.getFinalizedOutbox()).toHaveLength(1);
  });

  it("still excludes a debug branch when the player continues and settles without a clean rewind", async () => {
    const { store } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    store.dispatch("debug-adjust-stat", { debugStatId: "money", delta: 100 });
    store.dispatch("quit-game");
    expect(store.getEndingExperienceAward()?.disqualifiedByDebug).toBe(true);
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().achievementRewardedIds).toEqual([]);
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(0);
    expect(store.getFinalizedOutbox()).toEqual([]);
  });

  it.each([false, true])("recovers pre-fix snapshots without clearing real debug changes: actual tools %s", async usedTool => {
    const { store, storage, saves } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    if (usedTool) store.dispatch("debug-adjust-stat", { debugStatId: "money", delta: 100 });
    else store.markCurrentRunAsDebugged(); // Simulate the old popup-open behavior.
    const legacy = structuredClone(saves.get("normal")!);
    delete legacy.latest.debugUsed;
    legacy.months.forEach(month => { delete month.debugUsed; });
    await store.flushSaves();
    const adapter = createMemoryRunSaveAdapter([legacy]);
    const loaded = (await reopen(storage, adapter)).store;
    loaded.dispatch("start-game", { roleId: "normal" });
    expect(loaded.isCurrentRunDebugged()).toBe(usedTool);
    expect(loaded.loadRunSave("month:1")).toBe(true);
    expect(loaded.isCurrentRunDisqualified()).toBe(false);
    expect(loaded.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    loaded.dispatch("quit-game");
    expect(loaded.getEndingExperienceAward()?.disqualifiedByDebug).toBeUndefined();
    loaded.dispatch("settle-and-return");
    expect(loaded.getFinalizedOutbox()).toHaveLength(1);
  });

  it("persists finalization atomically and rejects a stale already-finalized UUID save on startup", async () => {
    const { store, saves, storage } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    awardWindfall(store, saves);
    store.dispatch("quit-game");
    const oldRecord = saves.get("normal")!;
    let finalized = 0;
    store.subscribeFinalized(() => { finalized += 1; });
    store.dispatch("settle-and-return");
    expect(finalized).toBe(1);
    const account = structuredClone(store.getLobbyState());
    const persisted = loadAccountProfile(storage);
    expect(persisted.settledRuns.normal).toBe(oldRecord.runId);
    expect(persisted.finalizedOutbox.map(record => record.runId)).toContain(oldRecord.runId);
    await store.flushSaves();
    // Simulate durable account reward commit followed by a crash before old IndexedDB deletion.
    const crashAdapter = createMemoryRunSaveAdapter([oldRecord]);
    const restored = await reopen(storage, crashAdapter);
    expect(restored.store.hasRoleSave("normal")).toBe(false);
    expect(restored.store.getLobbyState().roleProgress).toEqual(account.roleProgress);
    expect(restored.store.getFinalizedOutbox()).toHaveLength(1);
    restored.store.acknowledgeFinalizedRun(oldRecord.runId);
    expect(loadAccountProfile(storage).finalizedOutbox).toEqual([]);
  });

  it("keeps the ending save and account unchanged if finalization cannot persist", async () => {
    const { store, storage, saves } = await harness();
    store.dispatch("start-game", { roleId: "normal" });
    finishOpening(store);
    awardWindfall(store, saves);
    store.dispatch("quit-game");
    const beforeAccount = structuredClone(store.getLobbyState());
    const beforeSave = structuredClone(saves.get("normal"));
    const beforeState: GameState = structuredClone(store.getState());
    storage.failAccountWrites(true);
    store.dispatch("settle-and-return");
    expect(store.getState()).toEqual(beforeState);
    expect(store.getLobbyState()).toEqual(beforeAccount);
    expect(saves.get("normal")).toEqual(beforeSave);
    expect(store.getFinalizedOutbox()).toEqual([]);
    expect(store.getSaveStatus()).not.toBe("");
    storage.failAccountWrites(false);
    store.dispatch("settle-and-return");
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("normal")).toBe(false);
    expect(store.getLobbyState().achievementRewardedIds).toContain("global:windfall");
  });
});
