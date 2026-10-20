import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";

describe("lobby level statistics and experience hints", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-lobby-levels",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([390, 1440])("opens a deduplicated distribution and readable experience hint at %ipx", async width => {
    const touch = width === 390;
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: touch, isMobile: touch });
    const base = server.resolvedUrls!.local[0]!;
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      requests.push(url.pathname);
      if (url.pathname.endsWith("get_phd_simulator_v2_role_level_statistics")) return route.fulfill({
        contentType: "application/json", body: JSON.stringify({ version: 1, epoch: DATA_EPOCH,
          roles: { normal: { counts: [12, 8, 6, 3, 3, 2, 1, 0, 1, 0, 1] } } }),
      });
      return route.abort();
    });
    try {
      await page.goto(base);
      await page.locator('[data-ui-role-rail-view="achievements"]').click();
      const entry = page.locator("[data-ui-open-level-stats]");
      const progress = page.locator(".lobby-profile-achievement-overall-progress");
      const entryBounds = await entry.boundingBox();
      const progressBounds = await progress.boundingBox();
      expect(progressBounds!.x + progressBounds!.width).toBeLessThanOrEqual(entryBounds!.x);
      await (touch ? entry.tap() : entry.click());
      const dialog = page.getByRole("dialog", { name: "玩家等级" });
      await dialog.locator(".role-level-stats-chart").waitFor();
      expect(await dialog.locator('[role="listitem"]').count()).toBe(11);
      expect(await dialog.locator(".role-level-stats-summary").textContent()).toContain("37");
      expect(await dialog.locator(".role-level-stats-own").textContent()).toBe("我的 Lv.0");
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(960);
      await page.screenshot({ path: `artifacts/role-level-stats-${width}.png` });
      await page.keyboard.press("Escape");
      expect(await dialog.count()).toBe(0);
      expect(await entry.evaluate(element => document.activeElement === element)).toBe(true);
      const bar = page.locator(".lobby-growth-exp-bar");
      await (touch ? bar.tap() : bar.hover());
      const tooltip = page.locator("#relationship-tooltip");
      await tooltip.waitFor({ state: "visible" });
      expect(await tooltip.textContent()).toContain("科研分 × 当前经验倍率");
      expect(await tooltip.textContent()).toContain("成就卡标明的经验奖励");
      // Local previews may read public aggregates, but never upload player levels.
      expect(requests.some(path => path.endsWith("record_phd_simulator_v2_role_levels"))).toBe(false);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
