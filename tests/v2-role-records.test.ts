import { dispatchAction } from "../src/core/v2-engine";
import { ACCOUNT_STORAGE_KEY, saveAccountProfile } from "../src/core/v2-account-storage";
import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, buildLobbySelectedRoleViewModel } from "../src/core/v2-lobby";
import { loadRoleRecords, saveRoleRecords } from "../src/core/v2-role-records";
import { createStore } from "../src/core/v2-store";
import { getCalendarForTotalMonths, getMonthLimitByDegree } from "../src/core/v2-progression";
import { withPassingThesisReview } from "./helpers/v2-thesis-fixtures";

function createStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
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
    expect(view.statistics.map((stat) => stat.label)).toEqual(["通关", "游玩", "全球通关", "全球游玩", "博士率"]);
    expect(view.statistics.map((stat) => stat.value)).toEqual(["4", "12", "--", "--", "--"]);
    expect(view.statistics[1].tooltip).toContain("开始新游戏");
    expect(view.statistics[4].tooltip).toContain("已达成结局");
  });

  it.each(["master", "phd", "quit", "burnout", "poor", "expelled", "isolated", "overthinking", "delay"] as const)("records the %s result once and persists its start separately", (ending) => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0 });
    const state = store.getState();
    state.eventQueue = [];
    state.totalMonths = 1;
    state.month = 1;
    if (ending === "burnout") state.player.san = -1;
    if (ending === "poor") state.player.money = -1;
    if (ending === "expelled") state.player.favor = -1;
    if (ending === "isolated") state.player.social = -1;
    if (ending === "overthinking") state.player.research = -1;
    if (ending === "master" || ending === "phd" || ending === "delay") {
      state.degree = ending === "phd" ? "phd" : "master";
      state.maxMonths = getMonthLimitByDegree(state.degree);
      state.totalMonths = state.maxMonths;
      Object.assign(state, getCalendarForTotalMonths(state.totalMonths, state.degree));
      state.graduationScoreTarget = ending === "phd" ? 7 : 1;
      state.totalResearchScore = ending === "delay" ? 0 : state.graduationScoreTarget;
      state.thesis = withPassingThesisReview(state).thesis;
    }
    store.dispatch(ending === "quit" ? "quit-game" : "next-month");
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    const completedRuns = Number(ending === "master" || ending === "phd");
    store.dispatch("next-month");
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0, completedRuns: 0 });
    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 1, playedRuns: 0 });
    store.dispatch("restart-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 2, playedRuns: 1, completedRuns });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 2, playedRuns: 1, completedRuns });
    expect(store.getLobbyState().roleProgress.rich).toMatchObject({ startedRuns: 0, playedRuns: 0 });
  });

  it("deduplicates player publications, includes coauthored work and preserves best records across runs", () => {
    const storage = createStorage();
    const store = createStore({ storage });
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
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal.historyBest.researchScore).toBe(0);
    store.dispatch("restart-game");
    expect(store.getLobbyState().roleProgress.normal.historyBest).toEqual({ researchScore: score, totalCitations: 15, hIndex: 2, natureCount: 1, representativeScore: 80, representativeCitations: 9 });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(1);
    store.dispatch("restart-game");
    const restored = createStore({ storage }).getLobbyState().roleProgress.normal;
    expect(restored).toMatchObject({ startedRuns: 3, playedRuns: 2, completedRuns: 0, historyBest: { hIndex: 2, totalCitations: 15, natureCount: 1, representativeScore: 80 } });
  });

  it("counts clean starts once and removes the current start when debugging opens", () => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("change-lobby-role-page", { delta: 1 });
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    store.dispatch("restart-game");
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    store.markCurrentRunAsDebugged();
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature" });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 0, playedRuns: 0, completedRuns: 0, historyBest: { hIndex: 0, researchScore: 0, natureCount: 0 } });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.startedRuns).toBe(0);
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
    storage.setItem("phd_simulator_v2_role_records_v1", JSON.stringify({ version: 1, roles: { normal: { playedRuns: 2, completedRuns: 1, historyBest: { hIndex: -3, natureCount: 1.5, totalCitations: "not a number", representativeScore: 50 } }, rich: { playedRuns: 1, completedRuns: 4 } } }));
    expect(loadRoleRecords(account, storage).roleProgress.normal).toMatchObject({ startedRuns: 2, playedRuns: 2, completedRuns: 1, historyBest: { hIndex: 0, natureCount: 0, totalCitations: 0, representativeScore: 50 } });
    expect(loadRoleRecords(account, storage).roleProgress.rich.completedRuns).toBe(0);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const store = createStore({ storage: blocked });
    store.dispatch("start-game", { roleId: "normal" });
    expect(() => store.dispatch("quit-game")).not.toThrow();
    expect(store.getLobbyState().roleProgress.normal.startedRuns).toBe(1);
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(0);
    const before = structuredClone(store.getLobbyState());
    store.dispatch("restart-game");
    expect(store.getState()).toMatchObject({ phase: "finished", ending: "quit" });
    expect(store.getLobbyState()).toEqual(before);
    expect(store.getSaveStatus()).not.toBe("");
  });

  it("carries proven historical starts forward once and preserves newer unfinished starts", () => {
    const storage = createStorage();
    storage.setItem("phd_simulator_v2_role_records_v1", JSON.stringify({ version: 1, roles: {
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
    store.dispatch("restart-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ startedRuns: 11, playedRuns: 10 });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal.startedRuns).toBe(11);
  });
});
