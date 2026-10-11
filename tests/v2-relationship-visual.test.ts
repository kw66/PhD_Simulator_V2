import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type RelationshipWindow = typeof window & { relationshipVisualStore: ReturnType<typeof createStore> };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("relationship card layout", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
      plugins: [{ name: "relationship-visual-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.relationshipVisualStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/relationship", { recursive: true });
  }, 30_000);

  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([1440, 390])("keeps populated relationship cards legible at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
    try {
      await page.route("**/__relationship_visual__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__relationship_visual__`);
      await page.waitForSelector('[data-action="start-game"]');
      await page.evaluate(() => {
        const store = (window as RelationshipWindow).relationshipVisualStore;
        store.dispatch("start-game", { roleId: "normal" });
        for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
          store.dispatch("resolve-event", { eventChoiceId });
        }
        store.dispatch("next-month");
        for (const debugRelationshipType of ["senior", "peer", "junior", "lover"] as const) {
          store.dispatch("debug-add-relationship", { debugRelationshipType });
        }
      });
      await page.locator('[data-ui-play-tab="relationship"]').click();
      await page.locator('#rel-card-grid .rel-card.filled').first().waitFor();
      await page.mouse.move(0, 0);
      await page.locator("#rel-card-grid").screenshot({ path: `artifacts/relationship/cards-${width}.png`, animations: "disabled" });
      expect(await page.locator('#rel-card-grid .rel-card.filled').count()).toBe(5);
      expect(await page.locator('#rel-card-grid .rel-card-empty-header').last().textContent()).toContain("同学位置 4");
      expect(await page.locator('#rel-card-grid .rel-card').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
    } finally {
      await page.close();
    }
  }, 30_000);

  it.each([1440, 390])("opens a bounded history overlay without resizing cards at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce" });
    try {
      await page.route("**/__relationship_visual__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__relationship_visual__`);
      await page.waitForSelector('[data-action="start-game"]');
      const month = await page.evaluate(() => {
        const store = (window as RelationshipWindow).relationshipVisualStore;
        store.dispatch("start-game", { roleId: "normal" });
        for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
          store.dispatch("resolve-event", { eventChoiceId });
        }
        store.dispatch("next-month");
        for (const debugRelationshipType of ["senior", "peer", "junior", "lover"] as const) {
          store.dispatch("debug-add-relationship", { debugRelationshipType });
        }
        for (let index = 0; index < 7; index += 1) store.dispatch("force-next-month");
        return store.getState().totalMonths;
      });
      expect(month).toBeGreaterThanOrEqual(6);
      await page.locator('[data-ui-play-tab="relationship"]').click();
      const card = page.locator("#rel-card-grid .rel-card.filled").first();
      const details = card.locator(".rel-activity-history");
      const cardHeight = await card.evaluate(element => element.getBoundingClientRect().height);
      await details.locator("summary").click();
      expect(await details.getAttribute("open")).not.toBeNull();
      const panel = details.locator(".rel-activity-history-panel");
      expect(await panel.locator(".rel-activity-history-row").count()).toBeGreaterThan(4);
      expect(await panel.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      expect(await card.evaluate(element => element.getBoundingClientRect().height)).toBe(cardHeight);
      await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
      expect(await panel.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
      await page.mouse.move(0, 0);
      await page.locator("#rel-card-grid").screenshot({ path: `artifacts/relationship/history-${width}.png`, animations: "disabled" });
      await details.locator("summary").click();
      expect(await details.getAttribute("open")).toBeNull();
      const lastFilled = page.locator("#rel-card-grid .rel-card.filled").last();
      const lastDetails = lastFilled.locator(".rel-activity-history");
      await lastDetails.locator("summary").click();
      const lastPanel = await lastDetails.locator(".rel-activity-history-panel").boundingBox();
      const lastSummary = await lastDetails.locator("summary").boundingBox();
      expect(lastPanel).not.toBeNull();
      expect(lastSummary).not.toBeNull();
      expect(lastPanel!.y + lastPanel!.height).toBeLessThan(lastSummary!.y);
      expect(lastPanel!.y).toBeGreaterThanOrEqual(0);
    } finally {
      await page.close();
    }
  }, 30_000);
});
