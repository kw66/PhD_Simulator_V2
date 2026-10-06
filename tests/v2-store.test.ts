import { describe, expect, it } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { createStore } from "../src/core/v2-store";

describe("session store", () => {
  it("starts at the lobby with only the base role playable", () => {
    const store = createStore();

    expect(store.getState().phase).toBe("setup");
    expect(store.getLobbyState().roleProgress.normal.unlocked).toBe(true);
    expect(
      Object.entries(store.getLobbyState().roleProgress)
        .filter(([, progress]) => progress.unlocked)
        .map(([roleId]) => roleId),
    ).toEqual(["normal"]);

    store.dispatch("select-role", { roleId: "genius" });
    expect(store.getLobbyState().selectedLobbyRoleId).toBe("genius");

    store.dispatch("start-game", { roleId: "genius" });
    expect(store.getState().phase).toBe("setup");

    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().selectedRoleId).toBe("normal");
  });

  it("keeps display settings only for the current store session", () => {
    const store = createStore();
    expect(store.getLobbyState().dateDisplayMode).toBe("calendar");
    store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });

    expect(store.getLobbyState().dateDisplayMode).toBe("academic");
    expect(createStore().getLobbyState().dateDisplayMode).toBe("calendar");
  });

  it("can restart a run and return to the lobby without persistence", () => {
    const store = createStore();
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-adjust-stat", { debugStatId: "money", delta: 10 });
    expect(store.getState().player.money).toBe(11);

    store.dispatch("restart-game");
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().player.money).toBe(1);

    store.dispatch("reset-game");
    expect(store.getState().phase).toBe("setup");
  });

  it("keeps the debug event replay switch when restarting or resetting", () => {
    const store = createStore();
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-toggle-event-replay", { debugEventReplayEnabled: true });
    expect(store.getState().debugEventReplayEnabled).toBe(true);

    store.dispatch("restart-game");
    expect(store.getState().debugEventReplayEnabled).toBe(true);

    store.dispatch("reset-game");
    expect(store.getState().debugEventReplayEnabled).toBe(true);
  });

  it("awards final research score once and restores role experience in a new store", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    expect(store.getState().totalResearchScore).toBe(20);
    store.dispatch("quit-game");

    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });
    expect(store.getLobbyState().lastRunExperience).toMatchObject({ gained: 20, previousLevel: 0, level: 1 });
    expect(renderApp(store.getState(), store.getLobbyState())).toContain("本局经验 <strong>+20</strong>");
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });

    store.dispatch("reset-game");
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugPaperTarget: "A", debugPaperAuthorship: "first" });
    store.dispatch("restart-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });

    const restored = createStore({ storage });
    expect(restored.getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 0 });
    expect(restored.getLobbyState().lastRunExperience).toBeUndefined();
    expect(restored.getLobbyState().roleProgress.rich.unlocked).toBe(false);
  });

  it("awards the same ending again in a new run but skips a run that opened debugging", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const store = createStore({ storage });

    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    store.markCurrentRunAsDebugged();
    store.dispatch("quit-game");
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 0, exp: 0 });
    expect(store.getLobbyState().lastRunExperience?.disqualifiedByDebug).toBe(true);
    expect(renderApp(store.getState(), store.getLobbyState())).toContain("调试局，本局不结算角色经验");
    expect(values.size).toBe(0);

    for (const [level, exp] of [[1, 0], [1, 20]]) {
      store.dispatch("reset-game");
      store.dispatch("start-game", { roleId: "normal" });
      store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
      store.dispatch("quit-game");
      expect(store.getState().ending).toBe("quit");
      expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level, exp });
      expect(store.getLobbyState().lastRunExperience?.gained).toBe(20);
      expect(store.getLobbyState().lastRunExperience?.disqualifiedByDebug).toBeUndefined();
    }
    expect(createStore({ storage }).getLobbyState().roleProgress.normal).toMatchObject({ level: 1, exp: 20 });
  });

  it("persists and displays experience earned at the level cap", () => {
    const values = new Map<string, string>([["phd_simulator_v2_role_experience_v1", JSON.stringify({
      version: 1,
      roles: { normal: { level: 9, exp: 819 } },
    })]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const store = createStore({ storage });
    store.dispatch("start-game", { roleId: "normal" });
    store.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    store.dispatch("quit-game");

    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 19 });
    expect(renderApp(store.getState(), store.getLobbyState())).toContain("经验 <strong>19/∞</strong>");
    store.dispatch("reset-game");
    expect(renderApp(store.getState(), store.getLobbyState())).toContain(">19</span>/∞");

    const restored = createStore({ storage });
    expect(restored.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 19 });
    restored.dispatch("start-game", { roleId: "normal" });
    restored.dispatch("debug-add-paper", { debugJournalTarget: "nature", debugPaperAuthorship: "first" });
    restored.dispatch("quit-game");
    expect(restored.getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 39 });
    expect(createStore({ storage }).getLobbyState().roleProgress.normal).toMatchObject({ level: 10, exp: 39 });
  });

  it("ignores corrupt saved experience without blocking a new game", () => {
    const storage = { getItem: () => '{broken', setItem: () => {} };
    const store = createStore({ storage });
    expect(store.getLobbyState().roleProgress.normal).toMatchObject({ level: 0, exp: 0 });
    store.dispatch("start-game", { roleId: "normal" });
    expect(store.getState().phase).toBe("playing");
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
