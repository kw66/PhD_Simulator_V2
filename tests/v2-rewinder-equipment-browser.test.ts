import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import { createAcademicEquipmentFixture } from "./helpers/v2-academic-equipment-fixture";

type EquipmentWindow = typeof window & { equipmentStore: ReturnType<typeof createStore> };
describe("academic archive equipment through browser controls", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-rewinder-equipment-test",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{ name: "equipment-test-store",
        transform(code, id) { if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code.replace(
          "const store = createStore();", "const store = createStore(); globalThis.equipmentStore = store;"); },
      }] });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/rewinder-equipment", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([390, 1440])("keeps all equipment compact and selects routes at %i px", async width => {
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1100 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await page.locator('[data-action="start-game"]').waitFor();
      await page.evaluate(async state => {
        const store = (window as EquipmentWindow).equipmentStore;
        await store.ready();
        Object.assign(store.getState(), state);
        store.dispatch("select-rewinder-archive-papers", { rewinderPaperSource: "previous" });
      }, createAcademicEquipmentFixture());
      await page.locator('[data-ui-academic-archive-act="1"]').click();
      expect(await page.locator(".academic-equipment-item").count()).toBe(10);
      expect(await page.locator(".academic-equipment-item svg").count()).toBe(10);
      expect(await page.locator(".academic-kept-tags").first().textContent()).toContain("idea +5分");
      const previousChair = page.locator('[data-action="select-rewinder-archive-chair"][data-rewinder-chair-source="previous"]');
      await previousChair.click();
      expect(await previousChair.getAttribute("aria-pressed")).toBe("true");
      expect(await page.evaluate(() => (window as EquipmentWindow).equipmentStore.getState().rewinderState!.academic!.pending!.chairSource)).toBe("previous");
      expect(await page.locator(".academic-equipment-item").filter({ hasText: "吊床" }).count()).toBe(1);
      await page.locator('[data-action="select-rewinder-archive-coffee"][data-rewinder-coffee-source="previous"]').click();
      expect(await page.locator(".academic-equipment-item").filter({ hasText: "高级咖啡机" }).count()).toBe(1);
      const fit = await page.locator(".academic-archive-panel").evaluate(panel => ({ overflow: panel.scrollWidth - panel.clientWidth,
        childrenOverflow: [...panel.querySelectorAll<HTMLElement>(".academic-equipment-row, .academic-equipment-choice, .academic-kept-tags")]
          .map(element => element.scrollWidth - element.clientWidth), right: panel.getBoundingClientRect().right, viewport: innerWidth }));
      expect(fit.overflow).toBeLessThanOrEqual(1);
      expect(fit.childrenOverflow.every(value => value <= 1)).toBe(true);
      expect(fit.right).toBeLessThanOrEqual(fit.viewport);
      await page.locator(".academic-archive-body").evaluate(element => { element.scrollTop = 0; });
      await page.locator(".academic-archive-panel").screenshot({ path: `artifacts/rewinder-equipment/archive-${width}.png` });
      await page.locator(".academic-equipment-section").screenshot({ path: `artifacts/rewinder-equipment/equipment-${width}.png` });
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 45_000);
});
