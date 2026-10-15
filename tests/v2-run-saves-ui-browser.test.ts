import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type SaveWindow = Window & { saveStore: ReturnType<typeof createStore> };

describe("run save controls in the game", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-save-ui",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
      plugins: [{ name: "save-ui-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); window.saveStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("fills each complete achievement page equally without clipping the last card", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const base = server.resolvedUrls!.local[0]!;
    const origin = new URL(base).origin;
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      const list = page.locator('.lobby-profile-achievement-list');
      await list.waitFor();
      const next = page.locator('[data-action="change-role-achievement-page"][data-delta="1"]');
      while (true) {
        const isLast = await next.isDisabled();
        const layout = await list.evaluate(element => ({
          count: element.children.length,
          overflow: element.scrollHeight > element.clientHeight,
          bottomGap: element.getBoundingClientRect().bottom - element.lastElementChild!.getBoundingClientRect().bottom,
        }));
        expect(layout.overflow).toBe(false);
        expect(layout.count).toBeGreaterThan(0);
        expect(layout.count).toBeLessThanOrEqual(11);
        if (isLast) break;
        expect(layout.count).toBe(11);
        expect(layout.bottomGap).toBeGreaterThanOrEqual(0);
        expect(layout.bottomGap).toBeLessThan(10);
        await next.click();
      }
    } finally { await page.close(); }
  }, 30_000);

  it("resumes after reload, rewinds through settings from the ending, then settles exactly once", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const base = server.resolvedUrls!.local[0]!;
    const origin = new URL(base).origin;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.locator('[data-action="start-game"]').click();
      for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
        await page.locator(`[data-event-choice-id="${id}"]:visible`).click();
      }
      await page.waitForFunction(() => (window as unknown as SaveWindow).saveStore.getState().totalMonths === 1);
      const firstRun = await page.evaluate(async () => {
        const store = (window as unknown as SaveWindow).saveStore;
        await store.flushSaves();
        return { id: store.getCurrentRunId(), state: JSON.stringify(store.getState()) };
      });
      await page.reload();
      await page.waitForFunction(() => (window as unknown as SaveWindow).saveStore.isReady());
      expect(await page.locator('[data-action="start-game"]').textContent()).toContain("继续游戏");
      await page.locator('[data-action="start-game"]').click();
      expect(await page.evaluate(() => JSON.stringify((window as unknown as SaveWindow).saveStore.getState()))).toBe(firstRun.state);
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getLobbyState().roleProgress.normal.startedRuns)).toBe(1);

      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.locator('[data-ui-open-run-saves]:visible').click();
      expect(await page.locator('.run-save-card').count()).toBe(3);
      expect(await page.locator('.run-saves').textContent()).toContain("回溯会删除");
      await page.screenshot({ path: "artifacts/run-saves-ui.png" });
      // The read-save view is ordinary settings content, not a modal tab lock.
      await page.locator('[data-ui-play-tab="research"]').click();
      expect(await page.locator('[data-tab-panel="research"]').isVisible()).toBe(true);
      await page.locator('[data-ui-play-tab="settings"]').click();
      expect(await page.locator('[data-ui-open-run-saves]:visible').getAttribute('aria-expanded')).toBe("false");
      await page.locator('[data-ui-open-run-saves]:visible').click();
      const pendingEvent = page.locator('[data-ui-open-event-id]:visible').first();
      expect(await pendingEvent.count()).toBe(1);
      await pendingEvent.click();
      expect(await page.locator('[data-tab-panel="events"]').isVisible()).toBe(true);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.locator('[data-ui-open-run-saves]:visible').click();
      await page.locator('[data-ui-close-run-saves]:visible').click();
      await page.locator('[data-action="quit-game"]:visible').click();
      await page.locator('[data-ui-confirm-quit]').click();
      expect(await page.locator('[data-action="restart-game"]').textContent()).toContain("结算并重开");
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getLobbyState().roleProgress.normal.exp)).toBe(0);
      await page.locator('[data-ui-open-run-saves]:visible').click();
      expect(await page.locator('[data-tab-panel="settings"]').isVisible()).toBe(true);
      await page.locator('[data-ui-load-run-save="month:0"]').click();
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getState().totalMonths)).toBe(0);
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getRunSaves().map(save => save.id))).toEqual(["latest", "month:0"]);
      await page.evaluate(async () => { await (window as unknown as SaveWindow).saveStore.flushSaves(); });
      await page.reload();
      await page.locator('[data-action="start-game"]').click();
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getCurrentRunId())).toBe(firstRun.id);
      // Replaying the exact saved opening reproduces the original first month.
      for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
        await page.locator(`[data-event-choice-id="${id}"]:visible`).click();
      }
      expect(await page.evaluate(() => JSON.stringify((window as unknown as SaveWindow).saveStore.getState()))).toBe(firstRun.state);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.locator('[data-action="quit-game"]:visible').click();
      await page.locator('[data-ui-confirm-quit]').click();
      await page.locator('[data-action="restart-game"]').click();
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getLobbyState().roleProgress.normal.exp)).toBe(5);
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getCurrentRunId())).not.toBe(firstRun.id);
      expect(await page.evaluate(() => (window as unknown as SaveWindow).saveStore.getRunSaves().map(save => save.id))).toEqual(["latest", "month:0"]);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
