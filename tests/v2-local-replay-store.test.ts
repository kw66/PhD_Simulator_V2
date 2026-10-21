import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/core/v2-store";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { replayStateDigest } from "../src/core/v2-run-replay";

async function fixture() {
  const saves = createRunSaveRepository({ storage: null, adapter: createMemoryRunSaveAdapter() });
  const store = createStore({ storage: null, saves });
  await store.ready();
  store.dispatch("start-game", { roleId: "normal" });
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = store.getState().eventQueue.find(item => item.chainId === "before-grad-school")!;
    store.dispatch("resolve-event", { eventId: event.id, eventChoiceId });
  }
  store.dispatch("next-month");
  return { store, saves };
}

describe("local recording and settlement boundary", () => {
  it("settles without saving by default, including after an optional archive failure", async () => {
    const { store, saves } = await fixture();
    store.dispatch("quit-game");
    const archiver = vi.fn(async () => { throw new Error("quota"); });
    store.setReplayArchiver(archiver);
    expect(await store.settleAndReturn(true)).toBe(false);
    expect(store.getState().phase).toBe("finished");
    store.dispatch("settle-and-return");
    expect(store.getState().phase).toBe("setup");
    expect(archiver).toHaveBeenCalledTimes(1);
    expect(store.getSaveStatus()).not.toContain("本地回放保存失败");
    expect(saves.get("normal")).toBeUndefined();
    expect(store.getFinalizedOutbox()).toHaveLength(1);
  });
  it("waits for durable archive before deleting the source, blocks mutations and settles once", async () => {
    const { store, saves } = await fixture();
    store.dispatch("quit-game");
    let release!: () => void;
    const archiver = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    store.setReplayArchiver(archiver);
    const state = structuredClone(store.getState());
    void store.settleAndReturn(true);
    await Promise.resolve();
    expect(archiver).toHaveBeenCalledTimes(1);
    expect(saves.get("normal")).toBeDefined();
    expect(store.getFinalizedOutbox()).toHaveLength(0);
    store.dispatch("reset-game");
    void store.settleAndReturn(true);
    store.markCurrentRunAsDebugged();
    expect(store.loadRunSave("latest")).toBe(false);
    expect(store.upgradeRoleTalent("normal", "anything")).toBe(false);
    expect(replayStateDigest(store.getState())).toBe(replayStateDigest(state));
    release();
    await store.whenIdle();
    expect(store.getState().phase).toBe("setup");
    expect(saves.get("normal")).toBeUndefined();
    expect(store.getFinalizedOutbox()).toHaveLength(1);
    expect(archiver).toHaveBeenCalledTimes(1);
  });

  it("preserves the finished run after archive failure and allows retry", async () => {
    const { store, saves } = await fixture();
    store.dispatch("quit-game");
    store.setReplayArchiver(async () => { throw new Error("quota"); });
    await store.settleAndReturn(true);
    await store.whenIdle();
    expect(store.getState().phase).toBe("finished");
    expect(store.isReplaySavePending()).toBe(false);
    expect(store.getSaveStatus()).toContain("保存失败");
    expect(saves.get("normal")).toBeDefined();
    expect(store.getFinalizedOutbox()).toHaveLength(0);
    store.setReplayArchiver(async () => {});
    await store.settleAndReturn(true);
    await store.whenIdle();
    expect(store.getState().phase).toBe("setup");
    expect(store.getFinalizedOutbox()).toHaveLength(1);
  });

  it("manual save captures a clone without ending the game or changing progression", async () => {
    const { store } = await fixture();
    const before = structuredClone(store.getState());
    const account = structuredClone(store.getLobbyState());
    store.setReplayArchiver(async capture => { capture.state.player.money = 99999; capture.replay.commands.length = 0; });
    await store.saveLocalReplay();
    expect(store.getState()).toEqual(before);
    expect(store.getLobbyState()).toEqual(account);
    expect(store.getReplayStatus().actionCount).toBeGreaterThan(1);
    expect(store.getSaveStatus()).toContain("已保存");
  });

  it("supports the asynchronous retire-and-reallocate path", async () => {
    const { store } = await fixture();
    store.dispatch("reset-game");
    const archive = vi.fn(async () => {});
    store.setReplayArchiver(archive);
    store.retireUnallocatedRoleSave("normal");
    await store.whenIdle();
    expect(store.getState().phase).toBe("setup");
    expect(store.hasRoleSave("normal")).toBe(false);
    expect(archive).toHaveBeenCalledTimes(0);
    expect(store.getFinalizedOutbox()[0]?.state.ending).toBe("quit");
  });
});

