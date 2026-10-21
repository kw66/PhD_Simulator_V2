import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/core/v2-store";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { ACCOUNT_STORAGE_KEY, loadAccountProfile, saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository, type RunSaveAdapter } from "../src/core/v2-run-saves";
import { executeReplayCommand, replayStateDigest, verifyRunReplay } from "../src/core/v2-run-replay";

type Store = ReturnType<typeof createStore>;
const SEED = 1700000000;

function memoryStorage() {
  const values = new Map<string, string>();
  let failAccountWrites = false;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failAccountWrites && key === ACCOUNT_STORAGE_KEY) throw new Error("quota");
      values.set(key, value);
    },
    failAccountWrites(value: boolean) { failAccountWrites = value; },
  };
}

async function reopen(storage: ReturnType<typeof memoryStorage>, adapter: RunSaveAdapter) {
  const saves = createRunSaveRepository({ storage, adapter });
  const store = createStore({ storage, saves });
  await store.ready();
  return { store, saves };
}

function start(store: Store, year = 1) {
  store.getState().randomState = { seed: SEED, cursor: 0 };
  store.dispatch("start-game", { roleId: "rewinder", rewinderStartYear: year });
}

async function fixture() {
  const storage = memoryStorage();
  const account = createDefaultAccountProfile();
  account.roleProgress.rewinder.unlocked = true;
  saveAccountProfile(account, storage);
  const adapter = createMemoryRunSaveAdapter();
  const { store, saves } = await reopen(storage, adapter);
  start(store);
  return { store, saves, storage, adapter };
}

function enroll(store: Store) {
  if (!store.getState().eventQueue.some(event => event.chainId === "before-grad-school")) return;
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = store.getState().eventQueue.find(item => item.chainId === "before-grad-school")!;
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId });
  }
  store.dispatch("next-month");
}

function drain(store: Store) {
  for (let turn = 0; turn < 60 && store.getState().eventQueue.length; turn++) {
    if (store.getState().rewinderState?.academic?.pending) return;
    const event = store.getState().eventQueue[0]!;
    let advanced = false;
    for (const choice of event.choices) {
      store.dispatch("resolve-event", { eventId: event.id, eventChoiceId: choice.id });
      if (!store.getState().eventQueue.some(item => item.id === event.id)) { advanced = true; break; }
    }
    expect(advanced, `${event.id}: ${event.choices.map(choice => choice.id).join(",")}`).toBe(true);
  }
}

function playUntil(store: Store, month: number) {
  enroll(store);
  for (let turn = 0; turn < 13 && store.getState().totalMonths < month; turn++) {
    expect(store.getState().phase).toBe("playing");
    drain(store);
    store.dispatch("rest");
    store.dispatch("next-month");
    expect(store.getReplayStatus().failed).toBeUndefined();
  }
  expect(store.getState().totalMonths).toBe(month);
}

function endFirstYear(store: Store) {
  playUntil(store, 12);
  drain(store);
  store.dispatch("rest");
  store.dispatch("next-month");
  expect(store.getState()).toMatchObject({ phase: "playing", year: 1, month: 12, totalMonths: 12, ending: null });
  expect(store.getState().rewinderState?.academic?.pending).toBeDefined();
  expect(store.getReplayStatus().failed).toBeUndefined();
}

function confirm(store: Store) { store.dispatch("confirm-rewinder-archive"); }

describe("rewinder academic store, save and replay integration", () => {
  it("durably saves the completed academic-year recording before clearing the playable run", async () => {
    const { store } = await fixture();
    endFirstYear(store);
    let release!: () => void;
    store.setReplayArchiver(async capture => {
      expect(capture.state.rewinderState?.academic?.completed?.year).toBe(1);
      expect(capture.replay.commands.at(-1)).toMatchObject({ actionId: "confirm-rewinder-archive" });
      await new Promise<void>(resolve => { release = resolve; });
    });
    void store.confirmAcademicYearArchive(true);
    await Promise.resolve();
    expect(store.hasRoleSave("rewinder")).toBe(true);
    expect(store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeUndefined();
    release();
    await store.whenIdle();
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("rewinder")).toBe(false);
    expect(store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeDefined();
  });

  it("archives August once without a graduation reward and restarts the same year from its original base", async () => {
    const { store, storage } = await fixture();
    const opening = structuredClone(store.getState());
    endFirstYear(store);
    expect(store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeUndefined();
    const progress = structuredClone(store.getLobbyState().roleProgress.rewinder);
    const replayArchive = vi.fn(async () => {});
    store.setReplayArchiver(replayArchive);
    confirm(store);
    expect(replayArchive).not.toHaveBeenCalled();
    expect(store.getState().phase).toBe("setup");
    const archived = structuredClone(store.getLobbyState().rewinderAcademicArchive!.years[1]);
    expect(archived).toBeDefined();
    expect(loadAccountProfile(storage).account.rewinderAcademicArchive?.years[1]).toEqual(archived);
    expect(store.getLobbyState().roleProgress.rewinder.completedRuns).toBe(progress.completedRuns);
    expect(store.getLobbyState().roleProgress.rewinder.exp).toBe(progress.exp);
    expect(store.getFinalizedOutbox()).toEqual([]);
    expect(store.hasRoleSave("rewinder")).toBe(false);
    confirm(store);
    expect(store.getLobbyState().rewinderAcademicArchive!.years[1]).toEqual(archived);
    start(store);
    expect(store.getState().player).toEqual(opening.player);
    expect(store.getState().sanCap).toBe(opening.sanCap);
    expect(store.getState().rewinderState?.academic?.startYear).toBe(1);
    expect(store.getLobbyState().rewinderAcademicArchive!.years[1]).toEqual(archived);
    endFirstYear(store); confirm(store);
    const repeated = store.getLobbyState().rewinderAcademicArchive!.years[1]!;
    expect(repeated.attributes).toEqual(archived!.attributes);
    expect(repeated.growth.readingState).toEqual(archived!.growth.readingState);
    expect(repeated.growth.partTimeWorkCount).toBe(archived!.growth.partTimeWorkCount);
    expect(repeated.growth.internshipCount).toBe(archived!.growth.internshipCount);
    expect(store.getLobbyState().rewinderAcademicArchive?.attempts?.[1]).toBe(2);
  });

  it("starts the next year directly in September and freezes its start data against later account changes", async () => {
    const { store, storage, adapter } = await fixture();
    endFirstYear(store);
    const yearEnd = structuredClone(store.getState());
    confirm(store);
    start(store, 2);
    expect(store.getState()).toMatchObject({ phase: "playing", year: 2, month: 1, totalMonths: 13 });
    expect(store.getState().rewinderState?.academic?.startYear).toBe(2);
    expect(store.getState().eventQueue.some(event => event.chainId === "before-grad-school")).toBe(false);
    expect(store.getState().selectedAdvisorName).toBe(yearEnd.selectedAdvisorName);
    expect(store.getState().player.research).toBeGreaterThanOrEqual(yearEnd.player.research);
    expect(store.getState().readingState.readCount).toBeGreaterThanOrEqual(yearEnd.readingState.readCount);
    const started = structuredClone(store.getState());
    await store.flushSaves();
    // Simulate the source account archive changing in another session. The live
    // year and its replay must retain the exact archive selected at its start.
    const changed = structuredClone(store.getLobbyState());
    changed.rewinderAcademicArchive!.years = {};
    saveAccountProfile(changed, storage);
    const restored = await reopen(storage, adapter);
    restored.store.dispatch("start-game", { roleId: "rewinder", rewinderStartYear: 1 });
    expect(restored.store.getState()).toEqual(started);
    expect(restored.store.getReplayStatus().failed).toBeUndefined();
    const replay = structuredClone(restored.saves.get("rewinder")!.replay!);
    let replayed = structuredClone(replay.initial);
    for (const command of replay.commands) replayed = executeReplayCommand(replayed, command);
    expect(replayStateDigest(replayed)).toBe(replayStateDigest(started));
    expect(verifyRunReplay(replay, { state: replay.initial, index: 0 }, started)).not.toBeNull();
  });

  it("restores both a live academic year and the pending August selection with intact replay", async () => {
    const original = await fixture();
    playUntil(original.store, 6);
    await original.store.flushSaves();
    let restored = await reopen(original.storage, original.adapter);
    restored.store.dispatch("start-game", { roleId: "rewinder" });
    expect(restored.store.getState()).toEqual(original.store.getState());
    expect(restored.store.getReplayStatus().failed).toBeUndefined();
    endFirstYear(restored.store);
    const pending = structuredClone(restored.store.getState());
    for (const action of ["rest", "buy-coffee", "next-month"] as const) restored.store.dispatch(action);
    expect(restored.store.getState().player).toEqual(pending.player);
    expect(restored.store.getState().coffeeState).toEqual(pending.coffeeState);
    expect(restored.store.getState().totalMonths).toBe(12);
    expect(restored.store.getState().rewinderState?.academic?.pending).toEqual(pending.rewinderState!.academic!.pending);
    const awaitingArchive = structuredClone(restored.store.getState());
    await restored.store.flushSaves();
    restored = await reopen(original.storage, original.adapter);
    restored.store.dispatch("start-game", { roleId: "rewinder" });
    expect(restored.store.getState()).toEqual(awaitingArchive);
    const replay = structuredClone(restored.saves.get("rewinder")!.replay!);
    expect(verifyRunReplay(replay, { state: replay.initial, index: 0 }, awaitingArchive)).not.toBeNull();
    confirm(restored.store);
    expect(restored.store.getState().phase).toBe("setup");
    expect(restored.store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeDefined();
  });

  it("retains the completed archive and run save if the atomic account write fails, then retries once", async () => {
    const { store, storage, adapter } = await fixture();
    endFirstYear(store);
    const account = structuredClone(store.getLobbyState());
    storage.failAccountWrites(true);
    confirm(store);
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().rewinderState?.academic?.completed).toBeDefined();
    expect(store.getLobbyState()).toEqual(account);
    expect(store.hasRoleSave("rewinder")).toBe(true);
    expect(store.getSaveStatus()).toContain("保存");
    expect(loadAccountProfile(storage).account.rewinderAcademicArchive?.years[1]).toBeUndefined();
    await store.flushSaves();
    const restored = await reopen(storage, adapter);
    restored.store.dispatch("start-game", { roleId: "rewinder" });
    expect(restored.store.getState().rewinderState?.academic?.completed).toEqual(store.getState().rewinderState!.academic!.completed);
    expect(restored.store.getReplayStatus().failed).toBeUndefined();
    storage.failAccountWrites(false);
    confirm(restored.store);
    expect(restored.store.getState().phase).toBe("setup");
    expect(restored.store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeDefined();
    expect(restored.store.hasRoleSave("rewinder")).toBe(false);
    const saved = structuredClone(restored.store.getLobbyState());
    confirm(restored.store);
    expect(restored.store.getLobbyState()).toEqual(saved);
    expect(restored.store.getFinalizedOutbox()).toEqual([]);
  });

  it("does not archive an abandoned academic year or a debug-disqualified one", async () => {
    const failed = await fixture();
    playUntil(failed.store, 4);
    failed.store.dispatch("quit-game");
    failed.store.dispatch("settle-and-return");
    expect(failed.store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeUndefined();
    const debug = await fixture();
    endFirstYear(debug.store);
    debug.store.markCurrentRunAsDebugged();
    confirm(debug.store);
    expect(debug.store.getLobbyState().rewinderAcademicArchive?.years[1]).toBeUndefined();
    expect(debug.store.getFinalizedOutbox()).toEqual([]);
  });

  it("rejects a later year without its preceding archive and does not create a run", async () => {
    const storage = memoryStorage();
    const account = createDefaultAccountProfile();
    account.roleProgress.rewinder.unlocked = true;
    saveAccountProfile(account, storage);
    const { store } = await reopen(storage, createMemoryRunSaveAdapter());
    start(store, 2);
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("rewinder")).toBe(false);
    expect(store.getLobbyState().roleProgress.rewinder.startedRuns).toBe(0);
  });
});
