import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
type TestWindow = Window & { investmentStore: ReturnType<typeof createStore> };

describe("compact batch investment controls", () => {
  let server: ViteDevServer, browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-batch-investment",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
      plugins: [{ name: "investment-test-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code.replace("const store = createStore();", "const store = createStore(); window.investmentStore = store;");
      } }],
    });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });
  it.each([320, 390, 1440])("keeps single clicks and confirms a batch only once at %spx", async width => {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const base = server.resolvedUrls!.local[0]!, origin = new URL(base).origin;
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(base);
      await page.locator('[data-action="start-game"]').waitFor();
      await page.evaluate(() => {
        const store = (window as unknown as TestWindow).investmentStore;
        const s = store.getState();
        Object.assign(s, { phase: "playing", selectedRoleId: "rich-reversed", totalMonths: 1,
          roleTalents: { levels: { "finance-master": 3, "investment-acceleration": 6 } } });
        s.player.money = 5005; store.dispatch("invest-money");
      });
      const money = () => page.evaluate(() => (window as unknown as TestWindow).investmentStore.getState().player.money);
      const arrow = page.getByRole("button", { name: "批量投资", exact: true });
      await arrow.waitFor({ state: "visible" });
      // The startup render can replace the button after visibility resolves.
      // Retry the measurement rather than dereference a detached layout box.
      let height = 0;
      await expect.poll(async () => {
        height = (await arrow.boundingBox())?.height ?? 0;
        return height;
      }).toBeGreaterThan(0);
      await arrow.click();
      const dialog = page.getByRole("dialog", { name: "批量投资" });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "500金", exact: true }).click();
      expect(await money()).toBe(5000);
      expect(await dialog.locator("#investment-summary").textContent()).toContain("剩余4500");
      const bounds = (await dialog.locator(".investment-panel").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/batch-investment-${width}.png` });
      await page.keyboard.press("Escape"); expect(await money()).toBe(5000);
      await expect.poll(async () => (await arrow.boundingBox())?.height).toBe(height);
      await page.locator('[data-action="invest-money"]').click(); expect(await money()).toBe(4995);
      await arrow.click(); await dialog.getByRole("button", { name: "最大", exact: true }).click();
      expect(await money()).toBe(4995);
      await dialog.getByRole("button", { name: "投资4995金币", exact: true }).click();
      expect(await money()).toBe(0); expect(await dialog.count()).toBe(0); expect(await arrow.isDisabled()).toBe(true);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
