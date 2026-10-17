import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { createStore } from "../src/core/v2-store";
import { getAllAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { ACCOUNT_STORAGE_KEY, saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { replayStateDigest } from "../src/core/v2-run-replay";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
async function fixture(level = 0, exp = 0, rewardsClaimed = false) {
  const storage = memoryStorage();
  const account = createDefaultAccountProfile();
  account.roleProgress.normal.level = level;
  account.roleProgress.normal.exp = exp;
  if (rewardsClaimed) account.achievementRewardedIds = getAllAchievementDefinitions().map(item => item.id);
  saveAccountProfile(account, storage);
  const adapter = createMemoryRunSaveAdapter();
  const saves = createRunSaveRepository({ storage, adapter });
  const store = createStore({ storage, saves });
  await store.ready();
  return { storage, adapter, saves, store };
}
function researchScore(f: Awaited<ReturnType<typeof fixture>>, score = 20) {
  // Synthetic trusted checkpoint for experience arithmetic tests. Separate
  // replay tests ensure changing only the saved state is rejected.
  const state = { ...f.store.getState(), totalResearchScore: score };
  const replay = structuredClone(f.saves.get(state.selectedRoleId)!.replay!);
  replay.checkpoints.at(-1)!.digest = replayStateDigest(state);
  f.saves.commit(state, { runId: f.store.getCurrentRunId()!, replay });
  expect(f.store.loadRunSave("latest")).toBe(true);
}
function rendered(store: ReturnType<typeof createStore>) {
  return renderApp(store.getState(), store.getLobbyState(), { roleExperienceAward: store.getEndingExperienceAward() });
}

describe("session store", () => {
  it("previews achievements without paying, and finalizes once on returning to setup", async () => {
    const f = await fixture(); const { store } = f;
    store.dispatch("start-game", { roleId: "normal" });
    const original = structuredClone(store.getLobbyState());
    const runId = store.getCurrentRunId();
    store.dispatch("quit-game");
    expect(store.getState().runAchievementIds).toContain("global:ending-quit");
    expect(store.getLobbyState()).toEqual(original);
    expect(store.getEndingExperienceAward()?.gained).toBeGreaterThanOrEqual(5);
    store.dispatch("reset-game"); store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().phase).toBe("finished");
    expect(store.getCurrentRunId()).toBe(runId);
    expect(store.getLobbyState()).toEqual(original);
    store.dispatch("settle-and-return");
    expect(store.getState().phase).toBe("setup");
    expect(store.getCurrentRunId()).toBeNull();
    expect(store.hasRoleSave("normal")).toBe(false);
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    expect(store.getCurrentRunId()).not.toBe(runId);
    expect(store.getLobbyState().achievementRewardedIds).toContain("global:ending-quit");
    const date = store.getLobbyState().achievementUnlockedByRole?.["global:ending-quit"]?.normal;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    const exp = store.getLobbyState().roleProgress.normal.exp;
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(2);
    store.dispatch("quit-game"); store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal.exp).toBe(exp);
    await store.flushSaves();
    const restored = createStore({ storage: f.storage, saves: createRunSaveRepository({ storage: f.storage, adapter: f.adapter }) });
    await restored.ready();
    expect(restored.getLobbyState().achievementUnlockedByRole?.["global:ending-quit"]?.normal).toBe(date);
    expect(f.storage.values.has(ACCOUNT_STORAGE_KEY)).toBe(true);
  });

  it("debug exclusion survives returning to setup, resuming, and rewinding until actual finalization", async () => {
    const f = await fixture(); const { store } = f;
    const original = structuredClone(store.getLobbyState().roleProgress.normal);
    store.dispatch("start-game", { roleId: "normal" });
    const runId = store.getCurrentRunId();
    const monthSave = store.getRunSaves().find(save => save.kind === "month")!;
    store.markCurrentRunAsDebugged(); store.markCurrentRunAsDebugged();
    expect(store.loadRunSave(monthSave.id)).toBe(true);
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("reset-game"); store.dispatch("start-game", { roleId: "normal" });
    expect(store.getCurrentRunId()).toBe(runId);
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("quit-game");
    expect(store.getEndingExperienceAward()).toMatchObject({ gained: 0, disqualifiedByDebug: true });
    expect(rendered(store)).toContain("调试局，本局不结算成就、经验及后续统计");
    expect(store.getLobbyState().roleProgress.normal).toEqual(original);
    expect(store.getState().runAchievementIds ?? []).toEqual([]);
    expect(store.getLobbyState().achievementRewardedIds).toEqual([]);
    store.dispatch("settle-and-return");
    expect(store.isCurrentRunDebugged()).toBe(false);
    expect(store.getCurrentRunId()).not.toBe(runId);
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(0);
    expect(store.getFinalizedOutbox()).toEqual([]);
  });

  it("excludes forced month advances even when invoked without opening the debug window", async () => {
    const { store } = await fixture();
    store.dispatch("start-game", { roleId: "normal" });
    const originalMonth = store.getRunSaves().find(save => save.kind === "month")!;
    store.dispatch("force-next-month");
    expect(store.isCurrentRunDebugged()).toBe(true);
    expect(store.loadRunSave(originalMonth.id)).toBe(true);
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("quit-game");
    expect(store.getEndingExperienceAward()).toMatchObject({ gained: 0, disqualifiedByDebug: true });
    store.dispatch("settle-and-return");
    expect(store.getFinalizedOutbox()).toEqual([]);
    expect(store.getLobbyState().achievementRewardedIds).toEqual([]);
    expect(store.isCurrentRunDebugged()).toBe(false);
  });

  it("starts at the lobby with only the base role playable", () => {
    const store = createStore({ storage: null });
    expect(store.getState().phase).toBe("setup");
    expect(Object.entries(store.getLobbyState().roleProgress).filter(([, progress]) => progress.unlocked).map(([id]) => id)).toEqual(["normal"]);
    store.dispatch("select-role", { roleId: "genius" });
    store.dispatch("start-game", { roleId: "genius" }); expect(store.getState().phase).toBe("setup");
    store.dispatch("start-game", { roleId: "normal" }); expect(store.getState().phase).toBe("playing");
  });

  it("keeps the former talent test profile disabled", () => {
    const store = createStore({ storage: null }); const original = structuredClone(store.getLobbyState());
    store.enableTalentTestMode(); expect(store.getLobbyState()).toEqual(original);
    expect(Object.values(store.getLobbyState().roleProgress).every(role => role.level === 0)).toBe(true);
  });

  it("persists display settings in the canonical account", async () => {
    const f = await fixture(); f.store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
    const restored = createStore({ storage: f.storage }); await restored.ready();
    expect(restored.getLobbyState().dateDisplayMode).toBe("academic");
    expect(createStore({ storage: null }).getLobbyState().dateDisplayMode).toBe("calendar");
  });

  it("does not settle or restart an unfinished run, and setup return resumes its exact progress", async () => {
    const f = await fixture(); const { store } = f; store.dispatch("start-game", { roleId: "normal" });
    researchScore(f, 4); const id = store.getCurrentRunId();
    store.dispatch("restart-game"); expect(store.getState().totalResearchScore).toBe(4);
    store.dispatch("settle-and-return"); expect(store.getState().totalResearchScore).toBe(4);
    store.dispatch("reset-game"); expect(store.getState().phase).toBe("setup");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().totalResearchScore).toBe(4); expect(store.getCurrentRunId()).toBe(id);
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
  });

  it("awards research experience only on finalization and persists it", async () => {
    const f = await fixture(0, 0, true); const { store } = f;
    store.dispatch("start-game", { roleId: "normal" }); researchScore(f);
    const before = structuredClone(store.getLobbyState()); store.dispatch("quit-game");
    expect(store.getLobbyState()).toEqual(before);
    expect(store.getEndingExperienceAward()).toMatchObject({ gained: 20, previousLevel: 0, level: 1, exp: 0 });
    expect(rendered(store)).toContain("本局经验 <strong>+20</strong>");
    store.dispatch("quit-game"); expect(store.getLobbyState()).toEqual(before);
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });
    await store.flushSaves();
    const restored = createStore({ storage: f.storage }); await restored.ready();
    expect(restored.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });
    expect(restored.getLobbyState().lastRunExperience).toBeUndefined();
  });

  it("allows repeat ending experience across finalized runs, but never through debug commands", async () => {
    const f = await fixture(0, 0, true); const { store } = f;
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    expect(store.isCurrentRunDebugged()).toBe(true);
    store.dispatch("quit-game"); expect(store.getEndingExperienceAward()?.gained).toBe(0); store.dispatch("settle-and-return");
    for (const [level, exp] of [[1, 0], [1, 20]]) {
      store.dispatch("start-game", { roleId: "normal" });
      researchScore(f); const before = structuredClone(store.getLobbyState()); store.dispatch("quit-game");
      expect(store.getLobbyState()).toEqual(before); expect(store.getEndingExperienceAward()?.gained).toBe(20);
      store.dispatch("settle-and-return"); expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level, exp });
    }
  });

  it("previews and persists uncapped experience at max role level", async () => {
    const f = await fixture(9, 819, true); const { store } = f;
    store.dispatch("start-game", { roleId: "normal" }); researchScore(f); store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 9, exp: 819 });
    expect(store.getEndingExperienceAward()).toMatchObject({ level: 10, exp: 19 });
    expect(rendered(store)).toContain("经验 <strong>19/∞</strong>");
    store.dispatch("settle-and-return"); expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 19 });
    store.dispatch("start-game", { roleId: "normal" });
    researchScore(f); store.dispatch("quit-game"); store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 39 });
    const restored = createStore({ storage: f.storage }); await restored.ready();
    expect(restored.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 39 });
  });

  it("ignores corrupt canonical account data without blocking play", () => {
    const storage = { getItem: () => "{broken", setItem: () => {} };
    const store = createStore({ storage }); expect(store.getLobbyState().roleProgress.normal.level).toBe(0);
    store.dispatch("start-game", { roleId: "normal" }); expect(store.getState().phase).toBe("playing");
  });
  it("notifies the UI immediately when final event confirmation adds a Buff", () => {
    const store = createStore();
    let latestHtml = "";
    store.subscribe((state) => {
      latestHtml = renderApp(state, store.getLobbyState());
    });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-trigger-event", { eventId: "random-9" });

    const intro = store.getState().eventQueue.find((event) => event.chainId === "random-9");
    expect(intro).toBeDefined();
    store.dispatch("resolve-event", { eventId: intro?.id, eventChoiceId: intro?.choices[0]?.id });

    const decision = store.getState().eventQueue.find((event) => event.chainId === "random-9");
    const technologyChoice = decision?.choices.find((choice) => choice.label === "最新技术");
    expect(technologyChoice).toBeDefined();
    store.dispatch("resolve-event", { eventId: decision?.id, eventChoiceId: technologyChoice?.id });
    expect(latestHtml).not.toContain("每次想 idea +1分");

    const result = store.getState().eventQueue.find((event) => event.chainId === "random-9");
    expect(result?.stage).toBe("result");
    store.dispatch("resolve-event", { eventId: result?.id, eventChoiceId: result?.choices[0]?.id });

    expect(store.getState().buffs.map((buff) => buff.name)).toContain("每次想 idea +1分");
    expect(latestHtml).toContain("idea +1分");
    expect(latestHtml).not.toContain("每次 idea +1分");
    expect(latestHtml).toContain("不断学习 · 永久");
  });
});
