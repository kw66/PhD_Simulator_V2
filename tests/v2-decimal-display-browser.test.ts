import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type NumericTestWindow = typeof window & { numericTestStore: ReturnType<typeof createStore> };

const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("decimal display through real attribute animations", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({
      configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
      plugins: [{
        name: "expose-numeric-test-store",
        transform(code, id) {
          if (!id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return;
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.numericTestStore = store;");
        },
      }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("keeps fractional stats readable and shows clean positive and negative floating changes", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await page.route("**/__numeric_display_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__numeric_display_test__`);
      await page.waitForSelector("[data-action='start-game']:not(:disabled)");
      await mkdir("artifacts/decimal-display", { recursive: true });
      await page.evaluate(() => {
        const store = (window as NumericTestWindow).numericTestStore;
        store.dispatch("start-game", { roleId: "normal" });
        Object.assign(store.getState().player, { research: 7.8, social: 7.8, favor: 7.8, money: 7.8, san: 7.8 });
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      for (const [value, expected] of [[8.8000000004, "+1"], [8.0000000004, "-0.8"]] as const) {
        const changes = await page.evaluate((value) => {
          const store = (window as NumericTestWindow).numericTestStore;
          Object.assign(store.getState().player, { research: value, social: value, favor: value, money: value, san: value });
          store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
          return [...document.querySelectorAll("[data-player-stat] .stat-floating-change")].map(element => element.textContent);
        }, value);
        expect(changes).toHaveLength(5);
        expect(changes.every(change => change === expected)).toBe(true);
        expect(await page.locator('[data-player-stat="research"]').getAttribute("data-stat-value")).toBe(String(value));
        expect(await page.locator('[data-player-stat="research"] .new-attr-value').textContent()).toContain(value > 8.1 ? "8.8/" : "8/");
        if (expected === "+1") await page.screenshot({ path: "artifacts/decimal-display/attribute-increase.png" });
      }
      await page.evaluate(() => {
        const store = (window as NumericTestWindow).numericTestStore;
        store.getState().player.research += Number.EPSILON * 8;
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      expect(await page.locator('[data-player-stat] .stat-floating-change').count()).toBe(0);
      const text = await page.locator(".new-attr-item").allTextContents();
      expect(text.join(" ")).not.toMatch(/\d+\.\d{5,}/);
      expect(await page.evaluate(() => (window as NumericTestWindow).numericTestStore.getState().player.research)).toBeGreaterThan(8);
      await page.screenshot({ path: "artifacts/decimal-display/attributes.png" });
    } finally {
      await page.close();
    }
  }, 30_000);
});
