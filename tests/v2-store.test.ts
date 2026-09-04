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
