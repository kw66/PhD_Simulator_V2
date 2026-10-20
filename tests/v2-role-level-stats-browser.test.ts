import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";

describe("player level statistics dialog in the actual game", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-role-level-stats-test",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    it(`shows all levels without overflow at ${viewport.width}px and closes by its button`, async () => {
      const page = await browser.newPage({ viewport });
      const origin = new URL(server.resolvedUrls!.local[0]!).origin;
      const errors: string[] = [];
      let reads = 0;
      let writes = 0;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) { await route.continue(); return; }
        if (url.pathname.endsWith("/get_phd_simulator_v2_role_level_statistics")) {
          reads++;
          await route.fulfill({ json: { version: 1, epoch: DATA_EPOCH, roles: {
            normal: { counts: [3, 4, 6, 2, 1, 0, 2, 0, 1, 0, 1] },
          } } }); return;
        }
        if (url.pathname.endsWith("/record_phd_simulator_v2_role_levels")) writes++;
        await route.abort();
      });
      try {
        await page.goto(server.resolvedUrls!.local[0]!);
        await page.locator('[data-ui-role-rail-view="achievements"]').click();
        await page.locator("[data-ui-open-level-stats]").click();
        await expect.poll(() => page.locator(".role-level-stats-column").count()).toBe(11);
        expect(await page.locator(".role-level-stats-own").textContent()).toContain("Lv.0");
        const bounds = await page.locator(".role-level-stats-dialog").evaluate(element => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            overflowing: element.scrollWidth > element.clientWidth };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(viewport.width);
        expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
        expect(bounds.overflowing).toBe(false);
        if (viewport.width < 760) expect(bounds.bottom).toBe(viewport.height);
        await page.locator(".role-level-stats-close").click();
        expect(await page.locator(".role-level-stats-dialog").count()).toBe(0);
        await page.locator("[data-ui-open-level-stats]").click();
        await expect.poll(() => page.locator(".role-level-stats-column").count()).toBe(11);
        expect(reads).toBe(1); expect(writes).toBe(0); expect(errors).toEqual([]);
      } finally { await page.close(); }
    }, 30_000);
  }
});
