import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, webkit, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type CardWindow = typeof window & { mobileCardStore: ReturnType<typeof createStore> };
// CI installs Chromium; include the optional WebKit check when available locally.
const cardBrowserNames: Array<"chromium" | "webkit"> = existsSync(webkit.executablePath())
  ? ["chromium", "webkit"] : ["chromium"];
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function measureCards(page: Page, cardSelector: string, rowSelector: string) {
  return page.locator(cardSelector).evaluateAll((cards, rowSelector) => cards.map(card => {
    const bounds = card.getBoundingClientRect();
    const rows = [...card.querySelectorAll(rowSelector)].map(row => {
      const elements = [
        row.querySelector('.rel-detail-label'), row.querySelector('.rel-progress-bar'),
        row.querySelector('.rel-progress-val'), row.querySelector('.rel-action-btn, .graduation-unused-action, .rel-advisor-countdown'),
      ].filter((element): element is Element => element !== null).map(element => ({
        text: element.textContent?.trim() ?? "",
        box: element.getBoundingClientRect(),
        content: (() => {
          if (!element.textContent?.trim()) return element.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect();
        })(),
      }));
      return {
        text: row.textContent?.replace(/\s+/g, " ").trim(),
        height: row.getBoundingClientRect().height,
        barWidth: row.querySelector('.rel-progress-bar')?.getBoundingClientRect().width ?? 0,
        singleLine: elements.every(({ box }) => Math.abs(box.y + box.height / 2
          - elements[0]!.box.y - elements[0]!.box.height / 2) < 1),
        overlaps: elements.flatMap((a, index) => elements.slice(index + 1).filter(b => (
          Math.min(a.content.right, b.content.right) - Math.max(a.content.left, b.content.left) > 0.5
          && Math.min(a.content.bottom, b.content.bottom) - Math.max(a.content.top, b.content.top) > 0.5
        )).map(b => `${a.text || "progress"} / ${b.text || "progress"}`)),
        contentsFit: elements.every(({ box, content }) => box.left >= bounds.left && box.right <= bounds.right + 0.5
          && content.left >= bounds.left && content.right <= bounds.right + 0.5),
      };
    });
    return { type: card.getAttribute('data-relationship-type') ?? card.getAttribute('data-graduation-card'),
      height: bounds.height, contentFits: card.scrollWidth <= card.clientWidth + 1, rows,
      sections: [...card.children].map(child => ({ className: child.className,
        height: child.getBoundingClientRect().height, marginTop: getComputedStyle(child).marginTop })) };
  }), rowSelector);
}

describe("compact mobile relationship and graduation cards", () => {
  let server: ViteDevServer;
  let browsers: Partial<Record<"chromium" | "webkit", Browser>>;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false },
      plugins: [{ name: "mobile-card-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.mobileCardStore = store;");
        }
      } }],
    });
    await server.listen();
    browsers = { chromium: await chromium.launch() };
    if (cardBrowserNames.includes("webkit")) browsers.webkit = await webkit.launch();
    await mkdir("artifacts/mobile-card-density", { recursive: true });
  }, 30_000);
  afterAll(async () => { await Promise.all(Object.values(browsers ?? {}).map(browser => browser.close())); await server?.close(); });

  it.each(cardBrowserNames.flatMap(engine => [320, 390, 430, 820].map(width => ({ engine, width }))))(
    "keeps progress, values and actions separate in $engine at $width px", async ({ engine, width }) => {
    const page = await browsers[engine]!.newPage({ viewport: { width, height: 1000 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    page.setDefaultTimeout(8_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.route("**/*.supabase.co/**", route => route.abort());
      await page.route("**/__mobile_card_density__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      // App readiness is checked below; unrelated image loading must not gate navigation.
      await page.goto(`${server.resolvedUrls!.local[0]}__mobile_card_density__`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.locator('[data-action="start-game"]').waitFor({ timeout: 15_000 });
      await page.evaluate(async () => { await (window as CardWindow).mobileCardStore.ready(); });
      await page.evaluate(() => {
        const store = (window as CardWindow).mobileCardStore;
        store.dispatch("start-game", { roleId: "normal" });
        for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
          store.dispatch("resolve-event", { eventChoiceId });
        }
        for (const debugRelationshipType of ["peer", "lover"] as const) {
          store.dispatch("debug-add-relationship", { debugRelationshipType });
        }
        const state = store.getState();
        Object.assign(state, { degree: "phd", year: 6, month: 4, totalMonths: 64, maxMonths: 70,
          eventQueue: [], availableRandomEvents: [], selectedAdvisorName: "马海斌", illnessProbability: 0 });
        Object.assign(state.player, { research: 20, social: 20, money: 200, san: 20 });
        Object.assign(state.advisorProgressState, { funding: 114, researchAccumulation: 297,
          verticalProgress: 10, horizontalProgress: 10, monthlyActivity: "纵向+10" });
        for (const paper of state.fellowPapers ?? []) {
          paper.title = "Unified Learning of Robust Representations for Cross-Modal Retrieval";
        }
        for (const route of Object.values(state.loverProgressState.routes ?? {})) route.progress = 99;
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      });
      await page.locator('[data-ui-play-tab="relationship"]').click();
      await settleLayout(page);
      const relationships = await measureCards(page, '.relationship-section .rel-card.filled',
        '.rel-advisor-metric, .rel-advisor-project-row, .rel-lover-route, .rel-resource-row');
      await page.locator('.relationship-section').screenshot({ path: `artifacts/mobile-card-density/${engine}-relationships-${width}.png` });
      const history = page.locator('.rel-activity-history').first();
      await history.locator('summary').tap();
      expect(await history.getAttribute('open')).not.toBeNull();
      await history.locator('summary').tap();
      expect(await history.getAttribute('open')).toBeNull();
      const project = page.locator('[data-action="advisor-project"][data-project-type="vertical"]');
      expect(await project.evaluate(button => button.getBoundingClientRect().height)).toBe(32);
      await project.tap();
      expect(await project.isDisabled()).toBe(true);

      await page.locator('[data-ui-play-tab="workstation"]').click();
      await page.evaluate(() => {
        const store = (window as CardWindow).mobileCardStore;
        const state = store.getState();
        state.thesis.researchPoints.forEach((point, index) => { point.initialScore = 100; point.score = [562, 374, 166][index]!; });
        state.careerProgress.internet = 174;
        state.careerProgress.civilService = 95;
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      await settleLayout(page);
      const graduation = await measureCards(page, '.graduation-card', '.graduation-point, .graduation-career-row');
      await page.locator('.graduation-cards').screenshot({ path: `artifacts/mobile-card-density/${engine}-graduation-${width}.png` });
      const thesis = page.locator('[data-action="advance-thesis-point"]').first();
      expect(await thesis.evaluate(button => button.getBoundingClientRect().height)).toBe(32);
      await thesis.tap();
      expect(await thesis.isDisabled()).toBe(true);
      const metrics = { engine, width, relationships, graduation };
      await writeFile(`artifacts/mobile-card-density/${engine}-metrics-${width}.json`, JSON.stringify(metrics, null, 2));
      expect(relationships.find(card => card.type === "advisor")!.height).toBeLessThan(235);
      expect(relationships.find(card => card.type === "lover")!.height).toBeLessThan(210);
      expect(graduation.every(card => card.height < 210)).toBe(true);
      for (const card of [...relationships, ...graduation]) {
        expect(card.contentFits, `${card.type} card overflows`).toBe(true);
        for (const row of card.rows) {
          expect(row.contentsFit, `${card.type}: ${row.text}`).toBe(true);
          expect(row.singleLine, `${card.type}: ${row.text}`).toBe(true);
          expect(row.overlaps, `${card.type}: ${row.text}`).toEqual([]);
          expect(row.barWidth).toBeGreaterThanOrEqual(16);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 40_000);
});
