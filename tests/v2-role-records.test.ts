import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile, buildLobbySelectedRoleViewModel } from "../src/core/v2-lobby";
import { loadRoleRecords } from "../src/core/v2-role-records";
import { createStore } from "../src/core/v2-store";

function createStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("role history and run statistics", () => {
  it("keeps h-index third in history and separates the five statistics", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.historyBest.hIndex = 7;
    account.roleProgress.normal.playedRuns = 9;
    account.roleProgress.normal.completedRuns = 4;
    const view = buildLobbySelectedRoleViewModel(account, "normal");
    expect(view.historyStats.map((stat) => stat.id)).toEqual(["research-score", "total-citations", "h-index", "nature-count", "representative"]);
    expect(view.historyStats[2].value).toBe("7");
    expect(view.statistics.map((stat) => stat.label)).toEqual(["通关", "游玩", "全球通关", "全球游玩", "博士率"]);
    expect(view.statistics.map((stat) => stat.value)).toEqual(["4", "9", "--", "--", "--"]);
  });

  it.each(["master", "phd", "quit", "burnout", "poor", "expelled", "isolated", "delay"] as const)("records the %s result once and persists it without counting starts", (ending) => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(0);
    const state = store.getState();
    state.eventQueue = [];
    state.totalMonths = 1;
    state.month = 1;
    if (ending === "burnout") state.player.san = -1;
    if (ending === "poor") state.player.money = -1;
    if (ending === "expelled") state.player.favor = -1;
    if (ending === "isolated") state.player.social = -1;
    if (ending === "master" || ending === "phd" || ending === "delay") {
      state.degree = ending === "phd" ? "phd" : "master";
      state.totalMonths = state.maxMonths;
      state.graduationScoreTarget = ending === "phd" ? 7 : 1;
      state.totalResearchScore = ending === "delay" ? 0 : state.graduationScoreTarget;
    }
    store.dispatch(ending === "quit" ? "quit-game" : "next-month");
    expect(store.getState()).toMatchObject({ phase: "finished", ending });
    const completedRuns = Number(ending === "master" || ending === "phd");
    store.dispatch("next-month");
    store.dispatch("quit-game");
    store.dispatch("reset-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ playedRuns: 1, completedRuns });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal).toMatchObject({ playedRuns: 1, completedRuns });
    expect(store.getLobbyState().roleProgress.rich.playedRuns).toBe(0);
  });

  it("deduplicates player publications, includes coauthored work and preserves best records across runs", () => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    store.dispatch("debug-add-paper", { debugPaperTarget: "A", debugPaperAuthorship: "first" });
    store.dispatch("debug-add-paper", { debugPaperTarget: "B", debugPaperAuthorship: "coauthor" });
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
    expect(store.getLobbyState().roleProgress.normal.historyBest).toEqual({ researchScore: score, totalCitations: 15, hIndex: 2, natureCount: 1, representativeScore: 80, representativeCitations: 9 });
    store.dispatch("restart-game");
    store.dispatch("quit-game");
    const restored = createStore({ storage }).getLobbyState().roleProgress.normal;
    expect(restored).toMatchObject({ playedRuns: 2, completedRuns: 0, historyBest: { hIndex: 2, totalCitations: 15, natureCount: 1, representativeScore: 80 } });
  });

  it("excludes debug runs and abandoned runs from personal records", () => {
    const storage = createStorage();
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("restart-game");
    store.markCurrentRunAsDebugged();
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature" });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ playedRuns: 0, completedRuns: 0, historyBest: { hIndex: 0, researchScore: 0, natureCount: 0 } });
    expect(storage.getItem("phd_simulator_v2_role_records_v1")).toBeNull();
  });

  it("sanitizes stored records and tolerates blocked storage", () => {
    const account = createDefaultAccountProfile();
    const storage = createStorage();
    storage.setItem("phd_simulator_v2_role_records_v1", JSON.stringify({ version: 1, roles: { normal: { playedRuns: 2, completedRuns: 1, historyBest: { hIndex: -3, natureCount: 1.5, totalCitations: "not a number", representativeScore: 50 } }, rich: { playedRuns: 1, completedRuns: 4 } } }));
    expect(loadRoleRecords(account, storage).roleProgress.normal).toMatchObject({ playedRuns: 2, completedRuns: 1, historyBest: { hIndex: 0, natureCount: 0, totalCitations: 0, representativeScore: 50 } });
    expect(loadRoleRecords(account, storage).roleProgress.rich.completedRuns).toBe(0);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const store = createStore({ storage: blocked });
    store.dispatch("start-game", { roleId: "normal" });
    expect(() => store.dispatch("quit-game")).not.toThrow();
    expect(store.getLobbyState().roleProgress.normal.playedRuns).toBe(1);
  });
});
