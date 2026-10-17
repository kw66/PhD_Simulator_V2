import { describe, expect, it } from "vitest";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createInitialState } from "../src/core/v2-engine";
import { renderApp } from "../src/app/v2-render";
import { createStore } from "../src/core/v2-store";
import { saveAccountProfile } from "../src/core/v2-account-storage";
import { createMemoryRunSaveAdapter, createRunSaveRepository } from "../src/core/v2-run-saves";

describe("rewinder lobby and gameplay", () => {
  it("allows the unlocked role to start without allocation controls", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "rewinder";
    account.roleProgress.rewinder.unlocked = true;
    saveAccountProfile(account, storage);
    const html = renderApp(createInitialState(), account);
    expect(html).not.toContain("玩法待实装");
    expect(html).toContain('data-action="start-game"');
    expect(html).not.toContain('data-ui-talent-reset=');
    const saves = createRunSaveRepository({ storage, adapter: createMemoryRunSaveAdapter() });
    const store = createStore({ storage, saves });
    await store.ready();
    store.dispatch("start-game", { roleId: "rewinder" });
    expect(store.getState().phase).toBe("playing");
    expect(saves.get("rewinder")).toBeDefined();
    expect(store.getLobbyState().roleProgress.rewinder.startedRuns).toBe(1);
  });
});
