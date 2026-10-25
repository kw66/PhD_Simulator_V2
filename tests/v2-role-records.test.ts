import { DATA_EPOCH, DATA_EPOCH_STARTED_AT } from "../src/core/v2-data-epoch";
import { dispatchAction } from "../src/core/v2-engine";
import { ACCOUNT_STORAGE_KEY, saveAccountProfile } from "../src/core/v2-account-storage";
import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, buildLobbySelectedRoleViewModel } from "../src/core/v2-lobby";
import { ROLE_RECORDS_STORAGE_KEY, loadRoleRecords, saveRoleRecords } from "../src/core/v2-role-records";
import { createStore } from "../src/core/v2-store";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";
import { replayStateDigest } from "../src/core/v2-run-replay";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import { withPassingThesisReview } from "./helpers/v2-thesis-fixtures";

function createStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

// These fixtures exercise account settlement rather than replay validation. Give
// their synthetic terminal/publication state an explicit trusted checkpoint;
// dedicated replay tests cover ordinary state edits being disqualified.
function trustFixture(store: ReturnType<typeof createStore>, saves: ReturnType<typeof createRunSaveRepository>) {
  const state = store.getState();
  const replay = structuredClone(saves.get(state.selectedRoleId)!.replay!);
  replay.checkpoints.at(-1)!.digest = replayStateDigest(state);
  saves.commit(state, { runId: store.getCurrentRunId()!, replay });
  expect(store.loadRunSave("latest")).toBe(true);
}

describe("role history and run statistics", () => {
  it("keeps h-index third in history and separates the five statistics", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.historyBest.hIndex = 7;
    account.roleProgress.normal.startedRuns = 12;
    account.roleProgress.normal.playedRuns = 9;
    account.roleProgress.normal.completedRuns = 4;
    const view = buildLobbySelectedRoleViewModel(account, "normal");
    expect(view.historyStats.map((stat) => stat.id)).toEqual(["research-score", "total-citations", "h-index", "nature-count", "representative"]);
    expect(view.historyStats[2].value).toBe("7");
    expect(view.statistics.map((stat) => stat.label)).toEqual(["个人通关", "个人游玩", "全球通关", "全球游玩", "博士率"]);
    expect(view.statistics.map((stat) => stat.value)).toEqual(["4", "12", "--", "--", "--"]);
    expect(view.statistics[1].tooltip).toContain("开始新游戏");
    expect(view.statistics[4].tooltip).toContain("已达成结局");
  });

  it.each(["master", "phd", "quit", "burnout", "poor", "expelled", "isolated", "overthinking", "lab-bankrupt", "delay"] as const)("records the %s result and personal history once and persists its start separately", async (ending) => {
    const storage = createStorage();
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0 });
    const hasPublication = !["master", "phd", "delay"].includes(ending);
    if (hasPublication) Object.assign(store.getState(), dispatchAction(store.getState(), "debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" }));
    const state = store.getState();
    if (hasPublication) {
      const published = [...state.papers, ...state.externalPublications].find(paper => paper.status === "published")!;
      published.publication!.citations = 9;
      published.publication!.effectiveScore = 80;
      state.totalCitations = 9;
    }
    state.sanCap = 36;
    state.eventQueue = [];
    state.totalMonths = 1;
    state.month = 1;
    if (ending === "burnout") state.player.san = -1;
    if (ending === "poor") state.player.money = -1;
    if (ending === "expelled") state.player.favor = -1;
    if (ending === "isolated") state.player.social = -1;
    if (ending === "overthinking") state.player.research = -1;
    if (ending === "lab-bankrupt") {
      state.selectedAdvisorName = "测试导师";
      state.advisorProgressState.funding = -1;
    }
    if (ending === "master" || ending === "phd" || ending === "delay") {
      state.degree = ending === "phd" ? "phd" : "master";
      state.maxMonths = getMonthLimitByDegree(state.degree);
      state.totalMonths = state.maxMonths;
      Object.assign(state, getCalendarForTotalMonths(state.totalMonths, state.degree));
      state.graduationScoreTarget = ending === "phd" ? 7 : 1;
      state.totalResearchScore = ending === "delay" ? 0 : state.graduationScoreTarget;
      state.thesis = withPassingThesisReview(state).thesis;
    }
    trustFixture(store, saves);
    store.dispatch(ending === "quit" ? "quit-game" : "next-month");
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    const finished = store.getState();
    const expectedHistory = { researchScore: finished.totalResearchScore, totalCitations: finished.totalCitations,
      hIndex: Number(hasPublication), natureCount: Number(hasPublication), representativeScore: hasPublication ? 80 : 0, sanCap: 36 };
    const completedRuns = Number(ending === "master" || ending === "phd");
    store.dispatch("next-month");
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0, completedRuns: 0 });
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0 });
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 1, completedRuns });
    expect(store.getLobbyState().roleProgress.normal.historyBest).toMatchObject(expectedHistory);
    expect(createStore({ storage }).getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 1, completedRuns, historyBest: expectedHistory });
    const historyView = buildLobbySelectedRoleViewModel(store.getLobbyState(), "normal");
    expect(historyView.historyStats.find(stat => stat.id === "nature-count")?.value).toBe(String(Number(hasPublication)));
    expect(store.getLobbyState().roleProgress.rich).toMatchObject({ startedRuns: 0, playedRuns: 0 });
  });

  it("deduplicates player publications, includes coauthored work and preserves best records across runs", async () => {
    const storage = createStorage();
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    store.dispatch("start-game", { roleId: "normal" });
    // Build publication fixtures outside the store: store debug actions invalidate this run.
    let fixture = dispatchAction(store.getState(), "debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    fixture = dispatchAction(fixture, "debug-add-paper", { debugPaperTarget: "A", debugPaperAuthorship: "first" });
    fixture = dispatchAction(fixture, "debug-add-paper", { debugPaperTarget: "B", debugPaperAuthorship: "coauthor" });
    Object.assign(store.getState(), fixture);
    const state = store.getState();
    const published = [...state.papers, ...state.externalPublications].filter((paper) => paper.status === "published");
    expect(published).toHaveLength(3);
    published.forEach((paper, index) => {
      paper.publication!.citations = [9, 4, 2][index];
      paper.publication!.effectiveScore = [80, 50, 30][index];
    });
    state.externalPublications.push(published[0]);
    state.externalPublications.push({ ...published[0], id: "fellow-only", leadAuthorId: "fellow", nonFirstAuthor: false });
    state.totalCitations = 15;
    const score = state.totalResearchScore;
    trustFixture(store, saves);
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal.historyBest.researchScore).toBe(0);
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal.historyBest).toMatchObject({ researchScore: score, totalCitations: 15, hIndex: 2, natureCount: 1, representativeScore: 80, representativeCitations: 9 });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(1);
    store.dispatch("settle-and-return");
    const restored = createStore({ storage }).getLobbyState().roleProgress.normal;
    expect(restored).toMatchObject({ startedRuns: 2, playedRuns: 2, completedRuns: 0, historyBest: { hIndex: 2, totalCitations: 15, natureCount: 1, representativeScore: 80 } });
  });

  it("counts clean starts once and removes the current start when debugging opens", () => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("change-lobby-role-page", { delta: 1 });
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    store.markCurrentRunAsDebugged();
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature" });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 0, playedRuns: 0, completedRuns: 0, historyBest: { hIndex: 0, researchScore: 0, natureCount: 0 } });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.startedRuns).toBe(0);
  });

  it("persists independent ending attribute maxima only after clean settlement", async () => {
    const storage = createStorage();
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    store.dispatch("start-game", { roleId: "normal" });
    const state = store.getState();
    state.sanCap = 36;
    Object.assign(state.player, { research: 15.4, social: 12.6, favor: 9.2, money: 60.5 });
    trustFixture(store, saves);
    store.dispatch("quit-game");
    const zero = { sanCap: 0, research: 0, social: 0, favor: 0, money: 0 };
    expect(store.getLobbyState().roleProgress.normal.historyBest).toMatchObject(zero);
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().phase).toBe("finished");
    expect(store.getLobbyState().roleProgress.normal.historyBest).toMatchObject(zero);
    store.dispatch("settle-and-return");
    const first = { sanCap: 36, research: 15.4, social: 12.6, favor: 9.2, money: 60.5 };
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.historyBest).toMatchObject(first);

    store.dispatch("start-game", { roleId: "normal" });
    const next = store.getState();
    next.sanCap = 24;
    // A past high SAN-cap entry must not override the actual ending value.
    next.sanHistory = [{ totalMonths: 0, san: 80, sanCap: 100 }];
    Object.assign(next.player, { research: 20.8, social: 10, favor: 18.4, money: -1 });
    trustFixture(store, saves);
    store.dispatch("quit-game");
    store.dispatch("settle-and-return");
    const best = { ...first, research: 20.8, favor: 18.4 };
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.historyBest).toMatchObject(best);
    expect(store.getLobbyState().roleProgress.rich.historyBest).toMatchObject(zero);

    store.dispatch("start-game", { roleId: "normal" });
    store.markCurrentRunAsDebugged();
    store.getState().sanCap = 200;
    Object.assign(store.getState().player, { research: 200, social: 200, favor: 200, money: 200 });
    store.dispatch("quit-game");
    store.dispatch("settle-and-return");
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.historyBest).toMatchObject(best);
  });

  it("defaults missing ending attributes to zero and sanitizes persisted values", () => {
    const storage = createStorage();
    storage.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: DATA_EPOCH_STARTED_AT, roles: {
      normal: { playedRuns: 3, completedRuns: 2, historyBest: { researchScore: 80 } },
      rich: { playedRuns: 1, completedRuns: 0, historyBest: { sanCap: 30.5, research: -1, social: "20", favor: null, money: 120.4 } },
    } }));
    const account = loadRoleRecords(createDefaultAccountProfile(), storage);
    expect(account.roleProgress.normal.historyBest).toMatchObject({ researchScore: 80, sanCap: 0, research: 0, social: 0, favor: 0, money: 0 });
    expect(account.roleProgress.rich.historyBest).toMatchObject({ sanCap: 30.5, research: 0, social: 0, favor: 0, money: 120.4 });
    saveRoleRecords(account, storage);
    expect(loadRoleRecords(createDefaultAccountProfile(), storage).roleProgress).toEqual(account.roleProgress);
  });

  it("does not count an unavailable role or a setup action as a new start", () => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("select-role", { roleId: "rich" });
    store.dispatch("start-game", { roleId: "rich" });
    expect(store.getState().phase).toBe("setup");
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(0);
    expect(store.getLobbyState().roleProgress.rich.startedRuns).toBe(0);
    expect(storage.getItem("phd_simulator_v2_role_records_v1")).toBeNull();
  });

  it("sanitizes stored records and tolerates blocked storage", () => {
    const account = createDefaultAccountProfile();
    const storage = createStorage();
    storage.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: DATA_EPOCH_STARTED_AT, roles: { normal: { playedRuns: 2, completedRuns: 1, historyBest: { hIndex: -3, natureCount: 1.5, totalCitations: "not a number", representativeScore: 50 } }, rich: { playedRuns: 1, completedRuns: 4 } } }));
    expect(loadRoleRecords(account, storage).roleProgress.normal).toMatchObject({ startedRuns: 2, playedRuns: 2, completedRuns: 1, historyBest: { hIndex: 0, natureCount: 0, totalCitations: 0, representativeScore: 50 } });
    expect(loadRoleRecords(account, storage).roleProgress.rich.completedRuns).toBe(0);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const store = createStore({ storage: blocked });
    store.dispatch("start-game", { roleId: "normal" });
    expect(() => store.dispatch("quit-game")).not.toThrow();
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(0);
    const before = structuredClone(store.getLobbyState());
    store.dispatch("settle-and-return");
    expect(store.getState()).toMatchObject({ phase: "finished", ending: "quit" });
    expect(store.getLobbyState()).toEqual(before);
    expect(store.getSaveStatus()).not.toBe("");
  });

  it("carries proven historical starts forward once and preserves newer unfinished starts", () => {
    const storage = createStorage();
    storage.setItem(ROLE_RECORDS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: DATA_EPOCH, savedAt: DATA_EPOCH_STARTED_AT, roles: {
      normal: { playedRuns: 9, completedRuns: 4, startedRuns: 0 },
      rich: { playedRuns: 3, completedRuns: 1, startedRuns: 5 },
    } }));
    const first = loadRoleRecords(createDefaultAccountProfile(), storage);
    expect(first.roleProgress.normal.startedRuns).toBe(9);
    expect(first.roleProgress.rich.startedRuns).toBe(5);
    saveRoleRecords(first, storage);
    const restored = loadRoleRecords(createDefaultAccountProfile(), storage);
    expect(restored.roleProgress.normal.startedRuns).toBe(9);
    saveAccountProfile(restored, storage);
    expect(storage.getItem(ACCOUNT_STORAGE_KEY)).not.toBeNull();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(10);
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 10, playedRuns: 9 });
    store.dispatch("settle-and-return");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 10, playedRuns: 10 });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.startedRuns).toBe(10);
  });
});
