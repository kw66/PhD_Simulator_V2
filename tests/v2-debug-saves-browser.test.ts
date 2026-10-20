import { startGameFromLobby } from "./helpers/v2-start-game";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import type { StatisticsClient } from "../src/app/v2-statistics-client";
import { STATISTICS_STORAGE_KEY } from "../src/app/v2-statistics-client";

type DebugSaveWindow = Window & {
  debugSaveStore: ReturnType<typeof createStore>;
  debugSaveStats: StatisticsClient;
};

async function qualification(page: Page) {
  return page.evaluate(() => {
    const { debugSaveStore: store, debugSaveStats: stats } = window as unknown as DebugSaveWindow;
    const state = store.getState();
    return { debugged: store.isCurrentRunDebugged(), disqualified: store.isCurrentRunDisqualified(),
      statistics: stats.isDebugRun(JSON.stringify([state.conferenceLocationSeed, state.selectedRoleId])) };
  });
}

async function startGame(page: Page) {
  await startGameFromLobby(page);
  for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    await page.locator(`[data-event-choice-id="${id}"]:visible`).click();
  }
}

describe("debug qualification through the real popup and save controls", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-debug-save-test",
      define: { __LOCAL_PLAYGROUND__: false },
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, plugins: [{
        name: "debug-save-browser-fixture", transform(code, id) {
          if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code
            .replace("const store = createStore();", "const store = createStore(); globalThis.debugSaveStore = store;")
            .replace("const statisticsUploadEnabled = isRemoteWriteEnabled();", "const statisticsUploadEnabled = true;")
            .replace("const visitStats = createVisitStats(", "globalThis.debugSaveStats = statistics; const visitStats = createVisitStats(");
        },
      }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([false, true])("opening is harmless; dirty progress remains dirty until an earlier save is loaded (rewind: %s)", async rewind => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    const errors: string[] = [];
    const achievements: Array<{ p_achievement_ids: string[] }> = [];
    // All external traffic is intercepted, including requests from the popup.
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) { await route.continue(); return; }
      if (url.pathname.endsWith("/record_phd_simulator_v2_stats_batch")) {
        const data = route.request().postDataJSON();
        await route.fulfill({ json: data.p_records.map((row: { payload: { p_id: string } }) => row.payload.p_id) }); return;
      }
      if (url.pathname.endsWith("/record_phd_simulator_v2_achievement_start")) {
        await route.fulfill({ json: true }); return;
      }
      if (url.pathname.endsWith("/record_phd_simulator_v2_achievement_run")) {
        achievements.push(route.request().postDataJSON());
        await route.fulfill({ json: true }); return;
      }
      await route.abort();
    });
    const page = await context.newPage();
    context.on("page", popup => popup.on("pageerror", error => errors.push(error.message)));
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(10_000);
    try {
      await page.goto(server.resolvedUrls!.local[0]!);
      await startGame(page);
      await page.locator('[data-ui-play-tab="settings"]').click();
      const [popup] = await Promise.all([
        page.waitForEvent("popup"), page.locator('[data-ui-open-debug-window]').click(),
      ]);
      await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
      const clean = { debugged: false, disqualified: false, statistics: false };
      const dirty = { debugged: true, disqualified: true, statistics: true };
      expect(await qualification(page)).toEqual(clean);
      // Normal gameplay still remains eligible while the tools window is open.
      await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.dispatch("set-linear-event-blocking", { blockLinearEvents: false }));
      expect(await qualification(page)).toEqual(clean);
      await popup.locator('[data-action="debug-adjust-stat"][data-debug-stat-id="money"][data-delta="1"]').click();
      await expect.poll(() => qualification(page)).toEqual(dirty);
      await popup.locator('[data-action="force-next-month"]').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState().totalMonths)).toBe(2);
      await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.flushSaves());
      await page.reload();
      await startGameFromLobby(page);
      expect(await qualification(page)).toEqual(dirty);
      await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
      // Loading the debug-created month does not clear its exclusion.
      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.locator('[data-ui-open-run-saves]').click();
      await page.locator('[data-ui-load-run-save="month:2"]').click();
      expect(await qualification(page)).toEqual(dirty);
      if (rewind) {
        await page.locator('[data-ui-play-tab="settings"]').click();
        await page.locator('[data-ui-open-run-saves]').click();
        await page.locator('[data-ui-load-run-save="month:1"]').click();
        expect(await qualification(page)).toEqual(clean);
        await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.flushSaves());
        await page.reload();
        await startGameFromLobby(page);
        expect(await qualification(page)).toEqual(clean);
        // A reconnect/heartbeat while resuming the clean month cannot reapply tools.
        await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
        expect(await qualification(page)).toEqual(clean);
      }
      await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.dispatch("quit-game"));
      const award = await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getEndingExperienceAward());
      expect(award?.disqualifiedByDebug === true).toBe(!rewind);
      expect(award?.disqualifiedByIntegrity).not.toBe(true);
      await page.locator('[data-action="settle-and-return"]').click();
      if (rewind) {
        await expect.poll(() => achievements.length).toBe(1);
        expect(achievements[0]!.p_achievement_ids).toContain("global:ending-quit");
        // Finish is either queued or already acknowledged; debug removal must not suppress it.
        expect(await page.evaluate(key => {
          const saved = JSON.parse(localStorage.getItem(key)!);
          return saved.results.some(([fingerprint]: [string]) => {
            const [kind, , event] = JSON.parse(fingerprint);
            return kind === "activity" && event === "finish";
          });
        }, STATISTICS_STORAGE_KEY)).toBe(true);
      } else {
        expect(achievements).toEqual([]);
      }
      // An already open panel alone also leaves the next new run clean.
      await startGameFromLobby(page);
      expect(await qualification(page)).toEqual(clean);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 60_000);
});
