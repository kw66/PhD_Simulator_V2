import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import type { RoleId } from "../src/core/v2-types";

type PlaygroundWindow = typeof window & { localPlaygroundStore: ReturnType<typeof createStore> };

describe("local playground on the actual development configuration", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({
      // Source fixtures use root-relative imports even when CI publishes under a repository base.
      base: "/", mode: "development", logLevel: "error", cacheDir: "node_modules/.vite-local-playground-test",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
      plugins: [{ name: "observe-playground-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); window.localPlaygroundStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("exposes the local settings debug panel without changing the run until a tool is used", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const url = server.resolvedUrls!.local[0]!;
    const origin = new URL(url).origin;
    const errors: string[] = [];
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    const page = await context.newPage();
    try {
      await page.goto(url);
      await page.waitForFunction(() => (window as PlaygroundWindow).localPlaygroundStore?.isReady());
      await page.locator('[data-action="start-game"]').click();
      await page.locator('[data-ui-start-without-talents]').click();
      await page.locator('[data-ui-play-tab="settings"]').click();
      const controls = page.locator(".settings-sections > button");
      expect(await controls.count()).toBe(5);
      const debugStyle = await page.locator('[data-ui-open-debug-window]').evaluate(element => {
        const button = getComputedStyle(element);
        const peer = getComputedStyle(document.querySelector('[data-ui-open-run-saves]')!);
        return ["height", "border", "background-image", "font-size", "box-shadow"].every(key => button.getPropertyValue(key) === peer.getPropertyValue(key));
      });
      expect(debugStyle).toBe(true);
      const before = await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.getState());
      const [popup] = await Promise.all([
        page.waitForEvent("popup"), page.locator('[data-ui-open-debug-window]').click(),
      ]);
      await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
      expect(await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.getState())).toEqual(before);
      expect(await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.isCurrentRunDebugged())).toBe(false);
      await popup.locator('[data-action="debug-adjust-stat"][data-debug-stat-id="money"][data-delta="1"]').click();
      await expect.poll(() => page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.getState().player.money)).toBe(before.player.money + 1);
      expect(await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.isCurrentRunDebugged())).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 60_000);

  it("unlocks all roles and curse ranks, retains talent choices and isolates account, journal and IndexedDB saves", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const url = server.resolvedUrls!.local[0]!;
    const origin = new URL(url).origin;
    const writes: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const request = route.request();
      if (new URL(request.url()).origin === origin) return route.continue();
      if (!["GET", "HEAD"].includes(request.method()) && !new URL(request.url()).pathname.includes("/get_")) writes.push(request.url());
      return route.abort();
    });
    try {
      await page.goto(url);
      await page.waitForFunction(() => (window as PlaygroundWindow).localPlaygroundStore?.isReady());
      // A real progression account and a real save can coexist on this origin.
      // Seed them separately; the development store must never read or replace them.
      const original = await page.evaluate(async () => {
        const load = new Function("path", "return import(path)");
        const accounts: typeof import("../src/core/v2-account-storage") = await load("/src/core/v2-account-storage.ts");
        const lobby: typeof import("../src/core/v2-lobby") = await load("/src/core/v2-lobby.ts");
        const saves: typeof import("../src/core/v2-run-saves") = await load("/src/core/v2-run-saves.ts");
        const engine: typeof import("../src/core/v2-engine-state-factory") = await load("/src/core/v2-engine-state-factory.ts");
        const account = lobby.createDefaultAccountProfile();
        account.roleProgress.normal.level = 2;
        accounts.saveAccountProfile(account, localStorage);
        const repository = saves.createRunSaveRepository();
        await repository.ready();
        repository.commit({ ...engine.createStartedGameState("normal"), playerName: "正式存档" }, { runId: "production-sentinel" });
        await repository.flush();
        return { account: localStorage.getItem(accounts.ACCOUNT_STORAGE_KEY), journal: localStorage.getItem(`${saves.RUN_SAVE_JOURNAL_PREFIX}normal`) };
      });
      await page.reload();
      await page.waitForFunction(() => (window as PlaygroundWindow).localPlaygroundStore?.isReady());
      expect(await page.locator("[data-local-playground]").textContent()).toBe("本地测试");
      expect(await page.locator(".lobby-role-owned-count").textContent()).toContain("18 / 18");
      const profile = await page.evaluate(() => {
        const store = (window as PlaygroundWindow).localPlaygroundStore;
        return { account: store.getLobbyState(), save: store.hasRoleSave("normal") };
      });
      expect(Object.values(profile.account.roleProgress)).toHaveLength(18);
      expect(Object.values(profile.account.roleProgress).every(role => role.unlocked && role.level === 10)).toBe(true);
      expect(Object.values(profile.account.curseDifficultyUnlocked!)).toEqual([4, 4, 4, 4]);
      expect(profile.save).toBe(false);
      expect(await page.locator(".lobby-talent-points-value").textContent()).toBe("20");

      // All implemented trees get usable points with the normal prerequisite rules.
      const allocations = await page.evaluate(async () => {
        const load = new Function("path", "return import(path)");
        const talents: typeof import("../src/core/v2-role-talent-definitions") = await load("/src/core/v2-role-talent-definitions.ts");
        const store = (window as PlaygroundWindow).localPlaygroundStore;
        const account = store.getLobbyState();
        const points = Object.keys(account.roleProgress).filter(id => talents.isRoleTalentImplemented(id as RoleId))
          .map(id => talents.getTalentPointBalance(id as RoleId, account.roleProgress[id as RoleId].level, {}));
        return { points, upgraded: store.upgradeRoleTalent("normal", "first-month-drive") };
      });
      expect(allocations.points).toEqual(Array(12).fill(20));
      expect(allocations.upgraded).toBe(true);
      await expect.poll(() => page.locator(".lobby-talent-points-value").textContent()).toBe("18");
      await page.locator('[data-action="start-game"]').click();
      expect(await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.getState().roleTalents?.levels["first-month-drive"])).toBe(1);
      await page.evaluate(() => (window as PlaygroundWindow).localPlaygroundStore.flushSaves());
      await page.reload();
      await page.waitForFunction(() => (window as PlaygroundWindow).localPlaygroundStore?.isReady());
      expect(await page.locator('.lobby-start-button-label').textContent()).toBe("继续游戏");
      expect(await page.locator(".lobby-talent-points-value").textContent()).toBe("18");
      await page.locator('[data-action="start-game"]').click();
      const isolated = await page.evaluate(async () => {
        const load = new Function("path", "return import(path)");
        const accounts: typeof import("../src/core/v2-account-storage") = await load("/src/core/v2-account-storage.ts");
        const saves: typeof import("../src/core/v2-run-saves") = await load("/src/core/v2-run-saves.ts");
        const repository = saves.createRunSaveRepository();
        await repository.ready();
        return {
          account: localStorage.getItem(accounts.ACCOUNT_STORAGE_KEY),
          journal: localStorage.getItem(`${saves.RUN_SAVE_JOURNAL_PREFIX}normal`),
          productionRun: repository.get("normal")?.runId,
          testRun: (window as PlaygroundWindow).localPlaygroundStore.getCurrentRunId(),
          databases: (await indexedDB.databases()).map(db => db.name),
        };
      });
      expect(isolated.account).toBe(original.account);
      expect(isolated.journal).toBe(original.journal);
      expect(isolated.productionRun).toBe("production-sentinel");
      expect(isolated.testRun).not.toBe("production-sentinel");
      expect(isolated.databases).toContain("phd_simulator_v2_runs_local_playground");
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 60_000);
});
