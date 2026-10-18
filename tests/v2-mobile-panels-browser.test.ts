import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { createStore } from "../src/core/v2-store";

type MobileWindow = typeof window & { mobilePanelsStore: ReturnType<typeof createStore> };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
import '/src/styles/mobile-panels.css';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("mobile play panels", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false },
      plugins: [{ name: "mobile-panels-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.mobilePanelsStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/mobile-panels", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([320, 360, 390, 430])("fits populated panels and touch actions at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    page.setDefaultTimeout(8_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.route("**/*.supabase.co/**", route => route.abort());
      await page.route("**/__mobile_panels_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__mobile_panels_test__`);
      await page.locator('[data-action="start-game"]').waitFor();
      const paper = { ...createDraftPaper(1, 1, () => 0.4), id: "mobile-paper", paperSlotIndex: 0,
        title: "Unified Learning of Robust Representations for Cross-Modal Retrieval and Open-World Visual Understanding",
        idea: 55, experiment: 60, writing: 70 };
      const published = attachPaperPublication({ ...paper, id: "mobile-published", paperSlotIndex: 1, status: "published", target: "A", submittedIdea: 55, submittedExperiment: 60, submittedWriting: 70 }, 1.5);
      await page.evaluate(({ paper, published }) => {
        const store = (window as MobileWindow).mobilePanelsStore;
        store.dispatch("start-game", { roleId: "normal" });
        for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
          store.dispatch("resolve-event", { eventChoiceId });
        }
        for (const debugRelationshipType of ["senior", "peer", "junior", "lover"] as const) {
          store.dispatch("debug-add-relationship", { debugRelationshipType });
        }
        const state = store.getState();
        Object.assign(state, { degree: "phd", year: 6, month: 4, totalMonths: 64, maxMonths: 70,
          eventQueue: [], selectedAdvisorName: "张教授", selectedPaperId: paper.id, papers: [paper, published] });
        Object.assign(state.player, { research: 20, social: 20, money: 200, san: 20 });
        state.advisorProgressState.funding = 1000;
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      }, { paper, published });
      await page.locator('[data-ui-play-tab="workstation"]').tap();
      const submissions = page.locator('.workstation-submit-target-grid .workstation-submit-target');
      expect(await submissions.count()).toBe(6);
      const rows = await submissions.evaluateAll(nodes => new Set(nodes.map(node => Math.round(node.getBoundingClientRect().top))).size);
      expect(rows).toBe(3);
      const advance = page.locator('[data-action="advance-thesis-point"]').first();
      expect(await advance.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(40);
      await advance.tap();
      expect(await advance.isDisabled()).toBe(true);
      await page.locator('[data-ui-play-tab="relationship"]').tap();
      const history = page.locator('.rel-activity-history').first();
      await history.locator('summary').tap();
      expect(await history.getAttribute('open')).not.toBeNull();
      await history.locator('summary').tap();
      expect(await history.getAttribute('open')).toBeNull();
      expect(await page.locator('.rel-card').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
      await page.locator('[data-ui-play-tab="shop"]').tap();
      for (const tab of ["ai", "coffee", "gear", "life", "rest"]) {
        await page.locator(`[data-ui-shop-tab="${tab}"]`).tap();
        expect(await page.locator('.shop-item-row').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await page.locator('[data-ui-shop-tab="gear"]').tap();
      const buy = page.locator('.shop-item-btn:not(:disabled)').first();
      const beforeMoney = await page.evaluate(() => (window as MobileWindow).mobilePanelsStore.getState().player.money);
      await buy.tap();
      expect(await page.evaluate(() => (window as MobileWindow).mobilePanelsStore.getState().player.money)).toBeLessThan(beforeMoney);
      await page.locator('[data-ui-mobile-more]').tap();
      await page.locator('#mobile-secondary-tabs [data-ui-play-tab="talent"]').tap();
      for (const tab of ["character", "relation", "equip", "growth", "publication"]) {
        await page.locator(`[data-ui-talent-tab="${tab}"]`).tap();
        expect(await page.locator('.talent-item-row').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await page.locator('[data-ui-talent-tab="relation"]').tap();
      const next = page.locator('[data-ui-lab-inheritance-page="1"]');
      await next.tap();
      expect(await page.locator('[data-ui-lab-inheritance-page="0"]').isEnabled()).toBe(true);
      await page.locator('[data-ui-mobile-more]').tap();
      await page.locator('#mobile-secondary-tabs [data-ui-play-tab="research"]').tap();
      await page.locator('.research-paper-row').first().tap();
      const promote = page.locator('[data-action="promote-paper"][data-promotion-id="github"]');
      expect(await promote.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
      await promote.tap();
      expect(await page.evaluate(() => (window as MobileWindow).mobilePanelsStore.getState().papers.find(p => p.id === "mobile-published")!.publication!.promotions!.github)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/mobile-panels/verified-${width}.png`, fullPage: true });
      expect(errors).toEqual([]);
    } finally {
      await page.screenshot({ path: `artifacts/mobile-panels/final-${width}.png` });
      await page.close();
    }
  }, 40_000);
});
