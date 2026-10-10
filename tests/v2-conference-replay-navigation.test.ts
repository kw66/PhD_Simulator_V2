import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("conference replay through real bootstrap handlers", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function action(page: Page, actionId: string, extra: Record<string, string> = {}) {
    await page.evaluate(({ actionId, extra }) => {
      const button = document.createElement("button");
      Object.assign(button.dataset, { action: actionId, ...extra });
      document.querySelector("#app")!.append(button);
      button.click();
      button.remove();
    }, { actionId, extra });
  }

  async function trackRandom(page: Page, value: number) {
    await page.evaluate((value) => {
      const trackedWindow = window as typeof window & { conferenceRandomCalls: number };
      trackedWindow.conferenceRandomCalls = 0;
      Math.random = () => {
        trackedWindow.conferenceRandomCalls += 1;
        return value;
      };
    }, value);
  }

  async function randomCalls(page: Page) {
    return page.evaluate(() => (window as typeof window & { conferenceRandomCalls: number }).conferenceRandomCalls);
  }

  async function menuIds(page: Page) {
    return page.locator("#event-content-buttons button").evaluateAll((buttons) =>
      buttons.map((button) => (button as HTMLButtonElement).dataset.eventChoiceId));
  }

  it("inspects every history tab without RNG, preserves act2 reselection, and redraws only on act1 Continue", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await page.route("**/__conference_replay_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__conference_replay_test__`);
      await page.waitForSelector("[data-action='start-game']");
      await action(page, "start-game", { roleId: "normal" });
      await action(page, "debug-toggle-event-replay", { debugEventReplayEnabled: "true" });
      await trackRandom(page, 0);
      await action(page, "debug-trigger-event", { eventId: "conference-activity-c" });
      await page.locator('[data-ui-open-event-id$="-activity-act1"]').click();
      await page.locator('#event-content-buttons button[data-event-choice-id="continue"]').click();
      const originalMenu = await menuIds(page);
      expect(originalMenu).toContain("tour-local");
      await page.locator('#event-content-buttons button[data-event-choice-id="tour-local"]').click();
      const originalResult = await page.locator("#event-content-body").textContent();
      await trackRandom(page, 0.99);

      for (const sceneIndex of [0, 1, 2, 1, 0, 2, 1]) {
        await page.locator(`[data-ui-event-scene-index="${sceneIndex}"]`).click();
        expect(await randomCalls(page)).toBe(0);
        if (sceneIndex === 1) {
          expect(await menuIds(page)).toEqual(originalMenu);
          expect(await page.locator('#event-content-buttons [data-event-choice-id="tour-local"] [aria-label="已选择"]').count()).toBe(1);
        }
      }
      await page.locator('#event-content-buttons button[data-event-choice-id="tour-local"]').click();
      expect(await page.locator("#event-content-body").textContent()).toBe(originalResult);
      expect(await randomCalls(page)).toBe(0);

      await page.locator('[data-ui-event-scene-index="0"]').click();
      expect(await randomCalls(page)).toBe(0);
      await page.locator('#event-content-buttons button[data-event-choice-id="continue"]').click();
      const rerolledMenu = await menuIds(page);
      expect(rerolledMenu).not.toEqual(originalMenu);
      expect(await randomCalls(page)).toBeGreaterThan(0);
      await trackRandom(page, 0);
      await page.locator('[data-ui-event-scene-index="0"]').click();
      await page.locator('[data-ui-event-scene-index="1"]').click();
      expect(await menuIds(page)).toEqual(rerolledMenu);
      expect(await randomCalls(page)).toBe(0);
      await page.locator("#event-content-buttons button").first().click();
      expect(await randomCalls(page)).toBe(0);
      await page.locator('#event-content-buttons button[data-event-choice-id="close"]').click();
      await page.locator('[data-ui-open-event-history-id*="-activity-result-"]').click();
      await trackRandom(page, 0.99);
      for (const sceneIndex of [0, 1, 2, 1]) {
        await page.locator(`[data-ui-event-scene-index="${sceneIndex}"]`).click();
        expect(await randomCalls(page)).toBe(0);
      }
    } finally {
      await page.close();
    }
  }, 30_000);
});
