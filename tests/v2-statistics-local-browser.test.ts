import { startGameFromLobby } from "./helpers/v2-start-game";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { getRoleOptions } from "../src/core/v2-progression";

describe("statistics on the actual local development configuration", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    // No transform or production flag override: exercise the real localhost gating.
    server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-statistics-local-test", logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("refreshes a current-key obsolete zero cache and shows real counters without uploading local visits or games", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(5000);
    const baseUrl = server.resolvedUrls!.local[0]!;
    const origin = new URL(baseUrl).origin;
    const reads: string[] = [];
    const forbidden: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) { await route.continue(); return; }
      if (url.hostname.endsWith(".supabase.co")) {
        if (url.hostname !== "rffmgeacueokudwreyeb.supabase.co") {
          forbidden.push(`old-project:${url.href}`);
          await route.abort();
          return;
        }
        if (url.pathname.endsWith("/get_phd_simulator_v2_activity_stats")) {
          reads.push("activity");
          await route.fulfill({ json: { version: 2, epoch: DATA_EPOCH, day: request.postDataJSON().p_day,
            visitors: 120, todayVisitors: 3, views: 210, todayViews: 4, games: 100, todayGames: 5,
            roles: Object.fromEntries(getRoleOptions().map((role) => [role.id, { games: 55, finished: 55, clears: 8, phd: 7 }])) } });
          return;
        }
        if (url.pathname.endsWith("/get_phd_simulator_v2_stats_snapshot")) {
          reads.push("snapshot");
          const journal = { acceptedCount: 4, meanScore: 150, meanMonths: 3 };
          const thesis = { submittedCount: 10, passedCount: 8, excellentCount: 2, notSubmittedCount: 1 };
          await route.fulfill({ json: { version: 1, epoch: DATA_EPOCH, conference: [], journals: { pami: journal, nmi: journal, nature: journal },
            theses: { master: thesis, phd: thesis } } });
          return;
        }
        if (url.pathname.includes("record_") || url.pathname.includes("increment_") || url.pathname.endsWith("/get_counters")) {
          forbidden.push(`forbidden-rpc:${url.pathname}`);
        }
      }
      // No external service, image, or font may receive a real request from this test.
      await route.abort();
    });
    try {
      // Reproduce a page that fetched the old server response after the client
      // cache key had already changed. This must not wait ten minutes to recover.
      await page.addInitScript(() => {
        if (sessionStorage.getItem("statistics-cache-seeded")) return;
        sessionStorage.setItem("statistics-cache-seeded", "1");
        const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
        const key = JSON.stringify(["get_phd_simulator_v2_activity_stats", { p_day: day }, "activity-20261016-monthly-replay-v1"]);
        localStorage.setItem("phd_simulator_v2_statistics_v1", JSON.stringify({ version: 1, cache: [[key, {
          fetchedAt: Date.now(), retryAt: 0, data: { day,
            visitors: 120, todayVisitors: 3, views: 210, todayViews: 4, games: 0, todayGames: 0,
            roles: { normal: { games: 0, finished: 55, clears: 8, phd: 7 } },
          },
        }]] }));
      });
      await page.goto(`${baseUrl}?start=setup`);
      const roleStat = (metric: string) => page.locator(`[data-role-stat="${metric}"][data-role-id="normal"]`).first();
      await expect.poll(() => roleStat("global-completed-runs").textContent(), { timeout: 5000 }).toBe("8");
      expect(await roleStat("global-played-runs").textContent()).toBe("55");
      expect(await roleStat("phd-rate").textContent()).toBe("12.7%");
      expect(await roleStat("played-runs").textContent()).toBe("0");
      expect(reads).toEqual(["activity"]);

      await page.reload();
      await expect.poll(() => roleStat("global-played-runs").textContent()).toBe("55");
      expect(reads).toEqual(["activity"]);

      await startGameFromLobby(page);
      await expect.poll(() => reads.filter((rpc) => rpc === "snapshot").length).toBe(1);
      const researchStatistics = await page.evaluate(async () => {
        const load = new Function("path", "return import(path)");
        const [conference, journal, thesis] = await Promise.all([
          load("/src/app/v2-conference-stats.ts"), load("/src/app/v2-journal-stats.ts"), load("/src/app/v2-thesis-stats.ts"),
        ]);
        return {
          conference: conference.getConferenceGlobalStats("CVPR", 2026, "A"),
          journal: journal.getJournalGlobalStats("pami"),
          thesis: thesis.getThesisGlobalStats("master"),
        };
      });
      expect(researchStatistics.conference).toMatchObject({ status: "ready", data: { submissions: 0, accepted: 0 } });
      expect(researchStatistics.journal).toMatchObject({ status: "ready", data: { acceptedCount: 4, meanScore: 150, meanMonths: 3 } });
      expect(researchStatistics.thesis).toMatchObject({ status: "ready", data: { submittedCount: 10, passedCount: 8, excellentCount: 2, notSubmittedCount: 1 } });
      for (let act = 0; act < 3; act++) {
        await page.locator('[data-action="resolve-event"]:not([data-event-secondary]):visible').first().click();
      }
      for (const tab of ["settings", "events", "research", "settings"]) {
        await page.locator(`[data-ui-play-tab="${tab}"]`).click();
      }
      await page.locator('[data-action="quit-game"]').click();
      await page.locator('[data-ui-confirm-quit]').click();
      await page.locator('[data-action="settle-and-return"]').click();
      expect(await roleStat("played-runs").textContent()).toBe("1");
      expect(await roleStat("global-played-runs").textContent()).toBe("55");
      expect(await roleStat("global-completed-runs").textContent()).toBe("8");
      expect(await roleStat("phd-rate").textContent()).toBe("12.7%");
      await page.evaluate(() => {
        window.dispatchEvent(new Event("online"));
        window.dispatchEvent(new Event("pagehide"));
      });
      await page.waitForTimeout(600);
      expect(reads).toEqual(["activity", "snapshot"]);
      expect(forbidden).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
