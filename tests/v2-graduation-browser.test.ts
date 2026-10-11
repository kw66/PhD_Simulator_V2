import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import type { Degree } from "../src/core/v2-types";

type GraduationWindow = typeof window & { graduationStore: ReturnType<typeof createStore> };
const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("graduation cards and blind review in the browser", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
      plugins: [{ name: "graduation-test-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.graduationStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/graduation", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each(["master", "phd"] as const)("renders %s points, advances once and shows three review acts", async (degree: Degree) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(5000);
    try {
      await page.route("**/__graduation_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__graduation_test__`);
      await page.waitForSelector('[data-action="start-game"]');
      await page.evaluate((degree) => {
        const store = (window as GraduationWindow).graduationStore;
        store.dispatch("start-game", { roleId: "normal" });
        store.getState().degree = degree;
        store.getState().month = 1;
        store.getState().totalMonths = 1;
        store.getState().eventQueue = [];
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      }, degree);
      await page.locator('[data-ui-play-tab="workstation"]').click();
      expect(await page.locator('[data-action="advance-thesis-point"]').count()).toBe(degree === "master" ? 2 : 3);
      expect(await page.locator('[data-action="advance-thesis-point"]').evaluateAll(buttons => buttons.every(button => (button as HTMLButtonElement).disabled))).toBe(true);
      expect(await page.locator('[data-action="prepare-career"]').count()).toBe(4);
      await page.locator(".graduation-cards").screenshot({ path: `artifacts/graduation/${degree}-locked.png` });
      await page.evaluate((degree) => {
        const store = (window as GraduationWindow).graduationStore;
        store.dispatch("start-game", { roleId: "normal" });
        const state = store.getState();
        Object.assign(state, { degree, year: degree === "master" ? 3 : 6, month: 1,
          totalMonths: degree === "master" ? 25 : 61, maxMonths: degree === "master" ? 34 : 70,
          graduationScoreTarget: degree === "master" ? 1 : 7, totalResearchScore: degree === "master" ? 1 : 7,
          eventQueue: [], selectedAdvisorName: "张老师", illnessProbability: 0 });
        Object.assign(state.player, { research: 14.75, san: 20, money: 100 });
        state.advisorProgressState.funding = 1000;
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      }, degree);
      await page.locator('[data-ui-play-tab="workstation"]').click();
      const points = page.locator('[data-action="advance-thesis-point"]');
      expect(await points.count()).toBe(degree === "master" ? 2 : 3);
      await points.first().click();
      expect(await points.first().isDisabled()).toBe(true);
      expect(await points.nth(1).isEnabled()).toBe(true);
      expect(await page.evaluate(() => (window as GraduationWindow).graduationStore.getState().thesis.researchPoints[0]!.score)).toBe(14);
      expect(await page.evaluate(() => (window as GraduationWindow).graduationStore.getState().actionState.used)).toBe(0);
      await page.evaluate(() => {
        const store = (window as GraduationWindow).graduationStore;
        const state = store.getState();
        state.thesis.researchPoints.forEach((point, index) => {
          point.initialScore = [60, 80, 170][index]!;
          point.score = point.initialScore + 14;
          point.supportPaperTitle = "Unified Learning of Robust Representations for Cross-Modal Retrieval and Open-World Visual Understanding";
        });
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `artifacts/graduation/${degree}-cards.png` });
      const cardsFit = await page.locator(".graduation-card").evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1));
      expect(cardsFit).toBe(true);
      const rowsAlign = await page.locator(".graduation-cards").evaluate(cards => {
        const thesisRows = [...cards.querySelectorAll(".graduation-thesis-heading, .graduation-point")];
        const careerRows = [...cards.querySelectorAll(".graduation-career-row")];
        return thesisRows.map((row, index) => {
          const thesis = row.getBoundingClientRect();
          const career = careerRows[index]!.getBoundingClientRect();
          return { offset: thesis.y - career.y, thesisHeight: thesis.height, careerHeight: career.height };
        });
      });
      expect(rowsAlign).toEqual(Array.from({ length: 4 }, () => ({ offset: 0, thesisHeight: 32, careerHeight: 32 })));
      for (const selector of [".graduation-point .rel-detail-label", ".graduation-point-bar",
        ".graduation-career-row .rel-detail-label", ".graduation-career-bar"]) {
        await page.locator(selector).first().hover();
        await expect.poll(() => page.locator("#relationship-tooltip").textContent()).toContain(
          selector.includes("career") ? "初始准备参考" : "Unified Learning",
        );
        expect(await page.locator("#relationship-tooltip").isVisible()).toBe(true);
      }
      await page.evaluate(() => {
        const store = (window as GraduationWindow).graduationStore;
        store.getState().thesis.researchPoints[0]!.score = 562;
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      const highScoreBar = page.locator(".graduation-point-bar").first();
      expect(await highScoreBar.getAttribute("aria-valuemax")).toBe("675");
      expect(await highScoreBar.locator(".graduation-bar-fill-track").evaluate(track => {
        const style = getComputedStyle(track);
        const outer = getComputedStyle(track.parentElement!);
        const finalFill = track.querySelector<HTMLElement>(".graduation-improved")!;
        return style.overflow === "hidden" && style.borderRadius === outer.borderRadius
          && getComputedStyle(finalFill).borderTopRightRadius !== "0px";
      })).toBe(true);
      await highScoreBar.locator(".graduation-improved").evaluate(async fill => {
        await Promise.all(fill.getAnimations().map(animation => animation.finished.catch(() => undefined)));
      });
      expect(await highScoreBar.locator(".graduation-bar-fill-track").evaluate(track => {
        const filledWidth = [...track.querySelectorAll<HTMLElement>(".rel-progress-fill")]
          .reduce((sum, fill) => sum + fill.getBoundingClientRect().width, 0);
        return filledWidth / track.getBoundingClientRect().width;
      })).toBeCloseTo(562 / 675, 2);
      await page.mouse.move(0, 0);
      await page.locator(".graduation-cards").screenshot({ path: `artifacts/graduation/${degree}-high-score.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.mouse.move(0, 0);
      await page.locator(".graduation-cards").screenshot({ path: `artifacts/graduation/${degree}-cards-mobile.png` });
      expect(await page.locator(".graduation-card").evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
      expect(await page.locator(".graduation-thesis-header, .graduation-career-header").evaluateAll(headers => headers.every(header => {
        const bounds = header.getBoundingClientRect();
        const status = header.querySelector(".graduation-status")!.getBoundingClientRect();
        const title = header.querySelector(".rel-name")!.getBoundingClientRect();
        const reference = header.querySelector(".graduation-reference")?.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(header).paddingRight);
        return Math.abs(status.right - bounds.right + padding) < 1
          && title.right <= status.left && (!reference || (
            Math.abs(reference.x + reference.width / 2 - bounds.x - bounds.width / 2) < 1
            && title.right <= reference.left && reference.right <= status.left));
      }))).toBe(true);
      expect(await page.locator(".graduation-support").count()).toBe(0);
      expect(await page.locator(".graduation-point-bar").first().getAttribute("data-tooltip")).toContain("Unified Learning");
      expect(await page.locator('[data-thesis-initial-score="60"]').count()).toBe(1);
      expect(await page.locator('[data-thesis-grade="A"]').count()).toBe(1);
      await page.setViewportSize({ width: 1920, height: 1080 });
      const beforeCareerSan = await page.evaluate(() => (window as GraduationWindow).graduationStore.getState().player.san);
      await page.locator('[data-action="prepare-career"][data-career-type="internet"]').click();
      expect(await page.locator('[data-tab-panel="workstation"]').isVisible()).toBe(true);
      expect(await page.locator('[data-action="prepare-career"][data-career-type="internet"]').isDisabled()).toBe(true);
      expect(await page.locator('[data-action="prepare-career"][data-career-type="academic"]').isEnabled()).toBe(true);
      expect(await page.evaluate(() => (window as GraduationWindow).graduationStore.getState().player.san)).toBe(beforeCareerSan - 4);
      expect(await page.evaluate(() => (window as GraduationWindow).graduationStore.getState().careerProgress.internet)).toBeGreaterThan(0);
      await page.evaluate(() => {
        const store = (window as GraduationWindow).graduationStore;
        const state = store.getState();
        state.month = 7;
        state.totalMonths = (state.year - 1) * 12 + 7;
        state.eventQueue = [];
        state.availableRandomEvents = [];
        state.thesis.researchPoints.forEach(point => { point.score = 200; });
        state.player.san = 20;
        store.dispatch("next-month");
      });
      await page.locator('[data-ui-open-event-id^="thesis-review-"]:visible').first().click();
      await page.screenshot({ path: `artifacts/graduation/${degree}-act1.png` });
      await page.locator("#event-content-buttons button").first().click();
      await page.screenshot({ path: `artifacts/graduation/${degree}-act2.png` });
      await page.locator("#event-content-buttons button").first().click();
      expect(await page.locator(".graduation-review-table tbody tr").count()).toBe(degree === "master" ? 3 : 5);
      expect(await page.locator("#event-content-body").textContent()).toContain(`优秀${degree === "master" ? "硕士" : "博士"}论文`);
      await page.screenshot({ path: `artifacts/graduation/${degree}-act3.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#event-content-box").screenshot({ path: `artifacts/graduation/${degree}-act3-mobile.png` });
      expect(await page.locator(".graduation-review-reports").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.locator("#event-content-buttons button").first().click();
      await page.locator('[data-ui-play-tab="workstation"]').click();
      expect(await page.locator(".graduation-excellent").count()).toBe(0);
      expect(await points.first().isDisabled()).toBe(true);
    } catch (error) {
      await page.screenshot({ path: `artifacts/graduation/${degree}-failure.png` });
      throw error;
    } finally { await page.close(); }
  }, 30_000);
});
