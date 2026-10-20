import { startGameFromLobby } from "./helpers/v2-start-game";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

describe("mobile navigation and readable status", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-mobile-shell", logLevel: "error",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([320, 390, 430])("keeps %spx status compact, pending events reachable, and touch tooltips dismissible", async width => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
    const url = server.resolvedUrls!.local[0]!;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    try {
      await page.goto(url);
      expect(await page.locator('[data-ui-role-rail-view="announcements"]').getAttribute('aria-selected')).toBe('true');
      await page.locator('[data-ui-role-rail-view="achievements"]').tap();
      await page.locator('.lobby-profile-achievement').first().tap();
      expect(await page.locator('#relationship-tooltip').isVisible()).toBe(true);
      const bounds = await page.locator('#relationship-tooltip').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.locator('.lobby-profile-achievement').first().tap();
      expect(await page.locator('#relationship-tooltip').isVisible()).toBe(false);
      await startGameFromLobby(page, true);
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        return { documentWidth: document.documentElement.scrollWidth, statusHeight: rect('.play-left-rail').height,
          pendingTop: rect('.play-right-rail').top, centerTop: rect('.play-center-column').top,
          tabs: [...document.querySelectorAll('.center-tab-btn')].map(button => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })) };
      });
      expect(metrics.documentWidth).toBeLessThanOrEqual(width);
      expect(metrics.statusHeight).toBeLessThan(200);
      expect(metrics.pendingTop).toBeLessThan(metrics.centerTop);
      expect(metrics.tabs.every(button => button.height >= 44 && button.width >= 44)).toBe(true);
      await page.locator('[data-ui-play-tab="settings"]').tap();
      await page.locator('[data-ui-open-run-saves]:visible').tap();
      await page.locator('[data-ui-play-tab="events"]').tap();
      expect(await page.locator('.run-saves').count()).toBe(0);
      expect(await page.locator('[data-tab-panel="events"]').isVisible()).toBe(true);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
