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

async function answerTestMode(page: Page, accept: boolean) {
  const dialog = page.locator("[data-test-mode-dialog]");
  await dialog.waitFor();
  expect(await dialog.textContent()).toContain("当前存档将失去正常结算资格");
  expect(await dialog.textContent()).toContain("经验、成就和后续统计");
  expect(await dialog.textContent()).toContain("正常月度存档");
  if (accept) await dialog.locator("[data-test-mode-confirm]").click();
  else await dialog.getByRole("button", { name: "取消", exact: true }).click();
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

  it.each([false, true])("confirmed opening disqualifies immediately and only earlier clean saves restore eligibility (rewind: %s)", async rewind => {
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
      expect(await page.locator('[data-ui-open-debug-window]').textContent()).toContain("测试模式");
      const clean = { debugged: false, disqualified: false, statistics: false };
      const dirty = { debugged: true, disqualified: true, statistics: true };
      const originalState = await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState());
      await Promise.all([answerTestMode(page, false), page.locator('[data-ui-open-debug-window]').click()]);
      expect(context.pages()).toHaveLength(1);
      expect(await qualification(page)).toEqual(clean);
      expect(await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState())).toEqual(originalState);
      const [popup] = await Promise.all([
        page.waitForEvent("popup"), answerTestMode(page, true), page.locator('[data-ui-open-debug-window]').click(),
      ]);
      await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
      expect(await qualification(page)).toEqual(dirty);
      // Merely opening disqualifies; normal actions cannot clear the flag.
      await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.dispatch("set-linear-event-blocking", { blockLinearEvents: false }));
      expect(await qualification(page)).toEqual(dirty);
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
        expect(await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getLobbyState().roleProgress.normal.exp)).toBe(0);
        expect(await page.evaluate(key => {
          const saved = JSON.parse(localStorage.getItem(key)!);
          return saved.results.some(([fingerprint]: [string]) => {
            const [kind, , event] = JSON.parse(fingerprint);
            return kind === "activity" && event === "finish";
          });
        }, STATISTICS_STORAGE_KEY)).toBe(false);
      }
      // An already open panel alone also leaves the next new run clean.
      await startGameFromLobby(page);
      expect(await qualification(page)).toEqual(clean);
      await expect.poll(() => popup.locator('[data-debug-connection]').textContent()).toBe("已连接主游戏");
      const unexpectedDialogs: string[] = [];
      const rejectUnexpectedDialog = async (dialog: import("playwright").Dialog) => {
        unexpectedDialogs.push(dialog.message()); await dialog.dismiss();
      };
      page.on("dialog", rejectUnexpectedDialog);
      await popup.locator('[data-action="reset-game"]').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState().phase)).toBe("setup");
      expect(unexpectedDialogs).toEqual([]);
      page.off("dialog", rejectUnexpectedDialog);
      await startGameFromLobby(page);
      expect(await qualification(page)).toEqual(clean);
      const money = await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState().player.money);
      const adjust = popup.locator('[data-action="debug-adjust-stat"][data-debug-stat-id="money"][data-delta="1"]');
      await Promise.all([answerTestMode(page, false), adjust.click()]);
      expect(await qualification(page)).toEqual(clean);
      expect(await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState().player.money)).toBe(money);
      await Promise.all([answerTestMode(page, true), adjust.click()]);
      await expect.poll(() => qualification(page)).toEqual(dirty);
      expect(await page.evaluate(() => (window as unknown as DebugSaveWindow).debugSaveStore.getState().player.money)).toBe(money + 1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 60_000);

  it("keeps a confirmed run clean when the browser blocks the test window", async () => {
    const context = await browser.newContext();
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(server.resolvedUrls!.local[0]!);
      await startGame(page);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.evaluate(() => { window.open = () => null; });
      const messages: string[] = [];
      page.on("dialog", async dialog => {
        messages.push(dialog.message());
        await dialog.dismiss();
      });
      await page.locator('[data-ui-open-debug-window]').click();
      await page.locator('[data-test-mode-confirm]').click();
      expect(messages).toHaveLength(0);
      expect(await page.locator('[data-test-mode-dialog]').textContent()).toContain("被浏览器拦截");
      expect(context.pages()).toHaveLength(1);
      expect(await qualification(page)).toEqual({ debugged: false, disqualified: false, statistics: false });
    } finally { await context.close(); }
  }, 30_000);
});
