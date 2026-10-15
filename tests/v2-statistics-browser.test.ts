import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import { getRoleOptions } from "../src/core/v2-progression";

type StatisticsWindow = typeof window & { statisticsStore: ReturnType<typeof createStore> };

describe("statistics requests through the game UI", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 }, plugins: [{
      name: "local-statistics-fixture",
      transform(code, id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/src/app/v2-statistics-client.ts")) {
          // Redirect every statistics RPC to a local mocked path before enabling the client.
          return code.replace(/const RPC_URL = "[^"]+";/, 'const RPC_URL = "/__mock_statistics";');
        }
        if (path.endsWith("/src/app/v2-bootstrap.ts")) return code
          .replace("const store = createStore();", "const store = createStore(); window.statisticsStore = store;")
          .replace('const statisticsUploadEnabled = import.meta.env.PROD && window.location.protocol === "https:";', "const statisticsUploadEnabled = true;");
      },
    }] });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("freezes a saved run snapshot and uploads only its explicitly settled final branch", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const baseUrl = server.resolvedUrls!.local[0]!;
    const origin = new URL(baseUrl).origin;
    const errors: string[] = [];
    const requests: string[] = [];
    const rows = new Map<string, { kind: string; payload: { p_id: string; p_event?: string } }>();
    const paperCount = () => [...rows.values()].filter((row) => row.kind === "conference").length;
    const activityCount = (event: string) => [...rows.values()].filter((row) => row.kind === "activity" && row.payload.p_event === event).length;
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // The integration test cannot contact Supabase or any other external service.
      if (url.origin !== origin) { await route.abort(); return; }
      if (url.pathname.endsWith("/__mock_statistics/get_phd_simulator_v2_stats_snapshot")) {
        requests.push("snapshot");
        const journal = { acceptedCount: 4, meanScore: 150, meanMonths: 3 };
        const thesis = { submittedCount: 10, passedCount: 8, excellentCount: 2, notSubmittedCount: 1 };
        await route.fulfill({ json: { version: 1, conference: [], journals: { pami: journal, nmi: journal, nature: journal }, theses: { master: thesis, phd: thesis } } });
      } else if (url.pathname.endsWith("/__mock_statistics/record_phd_simulator_v2_stats_batch")) {
        requests.push("batch");
        const body = route.request().postDataJSON() as { p_records: Array<{ kind: string; payload: { p_id: string; p_event?: string } }> };
        for (const row of body.p_records) rows.set(row.payload.p_id, row);
        await route.fulfill({ json: body.p_records.map((row) => row.payload.p_id) });
      } else if (url.pathname.endsWith("/__mock_statistics/get_phd_simulator_v2_activity_stats")) {
        requests.push("activity");
        await route.fulfill({ json: { day: route.request().postDataJSON().p_day,
          version: 2, visitors: 120, todayVisitors: 3, views: 210, todayViews: 4, games: activityCount("start"), todayGames: activityCount("start"),
          roles: Object.fromEntries(getRoleOptions().map((role) => [role.id, { games: 55, finished: 55, clears: 8, phd: 7 }])) } });
      } else if (url.pathname.startsWith("/__mock_statistics/")) {
        requests.push("unexpected-individual-read");
        await route.fulfill({ status: 404, json: {} });
      } else await route.continue();
    });
    try {
      await page.goto(`${baseUrl}?start=setup`);
      await expect.poll(() => activityCount("visit")).toBe(1);
      await expect.poll(() => requests.filter((name) => name === "activity").length).toBe(1);
      expect(requests).not.toContain("snapshot");
      await page.locator('[data-action="start-game"]').click();
      await expect.poll(() => requests.filter((name) => name === "snapshot").length).toBe(1);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("phd_simulator_v2_statistics_v1") ?? "{}").cache?.length > 0);
      await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 31_000; window.dispatchEvent(new Event("online")); });
      await expect.poll(() => activityCount("start")).toBe(1);
      await page.evaluate(async () => {
        const root = "/src/core";
        const browserImport = new Function("path", "return import(path)");
        const { createDraftPaper, prepareConferenceSubmission } = await browserImport(`${root}/v2-paper-rules.ts`);
        const { resolveDuePaperReviews } = await browserImport(`${root}/v2-publication-system.ts`);
        const store = (window as StatisticsWindow).statisticsStore;
        const state = store.getState();
        const paper = { ...prepareConferenceSubmission({ ...createDraftPaper(3, 0, () => 0), idea: 100, experiment: 100, writing: 100 }, "A", 3, 1), reviewMonthsLeft: 0 };
        Object.assign(state, { year: 1, month: 6, totalMonths: 6, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [], papers: [paper] });
        state.player.money = 100;
        state.advisorProgressState.funding = 100;
        Object.assign(state, resolveDuePaperReviews(state, () => 0.5).state);
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      await page.locator('[data-ui-play-tab="events"]').click();
      await page.locator('[data-ui-open-event-id]:visible').first().click();
      for (let index = 0; index < 3; index += 1) {
        expect(paperCount()).toBe(0);
        await page.locator('[data-action="resolve-event"]:not([data-event-secondary]):visible').first().click();
      }
      await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 31_000; window.dispatchEvent(new Event("online")); });
      expect(paperCount()).toBe(0);
      const readsBeforeTabs = requests.filter((name) => name !== "batch");
      await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 660_000; });
      for (const tab of ["settings", "events", "research", "events"]) await page.locator(`[data-ui-play-tab="${tab}"]`).click();
      expect(requests.filter((name) => name !== "batch")).toEqual(readsBeforeTabs);
      expect(activityCount("start")).toBe(1);
      const journalCount = await page.evaluate(async () => {
        const path = "/src/app/v2-journal-stats.ts";
        const module = await new Function("path", "return import(path)")(path);
        return module.getJournalGlobalStats("pami").data?.acceptedCount;
      });
      expect(journalCount).toBe(4);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await page.locator('[data-action="reset-game"]').click();
      await page.locator('[data-action="start-game"]').click();
      expect(requests.filter((name) => name === "snapshot")).toHaveLength(1);
      expect(activityCount("start")).toBe(1);
      expect(paperCount()).toBe(0);
      await page.evaluate(() => (window as StatisticsWindow).statisticsStore.dispatch("quit-game"));
      expect(paperCount()).toBe(0);
      expect(activityCount("finish")).toBe(0);
      await page.locator('[data-action="restart-game"]').click();
      await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 31_000; window.dispatchEvent(new Event("online")); });
      await expect.poll(paperCount).toBe(1);
      await expect.poll(() => activityCount("finish")).toBe(1);
      await expect.poll(() => requests.filter((name) => name === "snapshot").length).toBe(2);
      expect(requests).not.toContain("unexpected-individual-read");
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
