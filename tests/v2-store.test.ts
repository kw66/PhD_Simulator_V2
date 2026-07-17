import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore } from "../src/core/v2-store";

class MemoryStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) ?? null : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

type MockWindowState = {
  localStorage: MemoryStorage;
  location: {
    search: string;
    pathname: string;
    hash: string;
  };
  history: {
    state: null;
    replaceState: (state: null, title: string, url?: string | URL | null) => void;
  };
};

function installMockWindow(search = "", localStorage = new MemoryStorage()): MemoryStorage {
  const windowState: MockWindowState = {
    localStorage,
    location: {
      search,
      pathname: "/",
      hash: "",
    },
    history: {
      state: null,
      replaceState: (_state, _title, url) => {
        const nextUrl = typeof url === "string" ? url : (url?.toString() ?? "/");
        const queryIndex = nextUrl.indexOf("?");
        const hashIndex = nextUrl.indexOf("#");

        windowState.location.search = queryIndex >= 0
          ? nextUrl.slice(queryIndex, hashIndex >= 0 ? hashIndex : undefined)
          : "";
        windowState.location.hash = hashIndex >= 0 ? nextUrl.slice(hashIndex) : "";
      },
    },
  };

  (globalThis as unknown as { window?: MockWindowState }).window = {
    localStorage: windowState.localStorage,
    location: windowState.location,
    history: windowState.history,
  };
  return localStorage;
}

describe("v2 store manual saves", () => {
  beforeEach(() => {
    installMockWindow();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("可以保存到手动槽并从手动槽读档", () => {
    const store = createStore();
    store.dispatch("select-role", { roleId: "normal" });
    store.dispatch("select-advisor", { advisorId: "lin-hao" });
    store.dispatch("start-game");
    store.dispatch("next-month");
    store.dispatch("debug-seed-paper", { paperTarget: "C" });
    store.dispatch("save-manual", { manualSlot: 1 });

    expect(store.getState().manualSaveSummaries).toHaveLength(1);
    expect(store.getState().manualSaveSummaries[0]?.slot).toBe(1);

    store.dispatch("reset-game");
    expect(store.getState().phase).toBe("setup");

    store.dispatch("load-manual", { manualSlot: 1 });
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().selectedRoleId).toBe("normal");
    expect(store.getState().selectedAdvisorId).toBe("lin-hao");
    expect(store.getState().papers.length).toBe(1);
  });

  it("可以删除手动槽", () => {
    const store = createStore();
    store.dispatch("start-game", { roleId: "normal", advisorId: "zhao-ning" });
    store.dispatch("save-manual", { manualSlot: 2 });
    expect(store.getState().manualSaveSummaries.some((item) => item.slot === 2)).toBe(true);

    store.dispatch("delete-manual", { manualSlot: 2 });
    expect(store.getState().manualSaveSummaries.some((item) => item.slot === 2)).toBe(false);
  });
  it("supports debug tools for faster manual testing", () => {
    const store = createStore();
    store.dispatch("start-game", { roleId: "normal", advisorId: "zhao-ning" });

    store.dispatch("debug-adjust-stat", { debugStatId: "money", delta: 10 });
    expect(store.getState().player.money).toBe(11);

    store.dispatch("debug-seed-paper", { paperTarget: "C" });
    expect(store.getState().papers).toHaveLength(1);
    expect(store.getState().selectedPaperId).toBe(store.getState().papers[0]?.id);

    store.dispatch("debug-trigger-event", { eventId: "teachers-day" });
    expect(store.getState().eventQueue.some((item) => item.chainId === "teachers-day")).toBe(true);

    store.dispatch("debug-trigger-event", { eventId: "review-result" });
    expect(store.getState().papers).toHaveLength(1);
    expect(store.getState().log[0]?.text).toContain("论文结果");

    store.dispatch("debug-trigger-event", { eventId: "before-grad-school" });
    expect(store.getState().eventQueue.some((item) => item.chainId === "before-grad-school")).toBe(true);

    store.dispatch("debug-shift-month", { delta: 12 });
    expect(store.getState().totalMonths).toBe(12);
    expect(store.getState().year).toBe(1);
    expect(store.getState().month).toBe(12);
    expect(store.getState().actionsRemaining).toBe(store.getState().maxActionsPerMonth);
  });

  it("forces the start screen when opened with start=setup", () => {
    const localStorage = installMockWindow();
    const firstStore = createStore();
    firstStore.dispatch("select-role", { roleId: "genius" });
    expect(firstStore.getAccountProfile().selectedLobbyRoleId).toBe("genius");
    firstStore.dispatch("start-game", { roleId: "normal", advisorId: "zhao-ning" });
    expect(firstStore.getState().phase).toBe("playing");

    installMockWindow("?start=setup", localStorage);
    const secondStore = createStore();

    expect(secondStore.getState().phase).toBe("setup");
    expect(secondStore.getState().setupSelectedRoleId).toBe("genius");
    expect(secondStore.getAccountProfile().selectedLobbyRoleId).toBe("genius");
    expect((globalThis as unknown as { window?: MockWindowState }).window?.location.search).toBe("");
  });

  it("does not allow starting a locked role from the lobby", () => {
    const store = createStore();
    store.dispatch("select-role", { roleId: "genius" });

    store.dispatch("start-game", { roleId: "genius" });

    expect(store.getState().phase).toBe("setup");
    expect(store.getState().log[0]?.text).toContain("该角色尚未解锁");
  });

  it("pages role achievements in fixed groups of five and resets the page when switching roles", () => {
    const store = createStore();

    store.dispatch("change-role-achievement-page", { delta: 1 });
    expect(store.getAccountProfile().lobbyRoleAchievementPage).toBe(1);

    store.dispatch("select-role", { roleId: "genius" });
    expect(store.getAccountProfile().lobbyRoleAchievementPage).toBe(0);

    store.dispatch("change-role-achievement-page", { delta: 1 });
    expect(store.getAccountProfile().lobbyRoleAchievementPage).toBe(0);
  });
});
