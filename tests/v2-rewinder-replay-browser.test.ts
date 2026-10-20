import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startGameFromLobby } from "./helpers/v2-start-game";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type RewinderWindow = typeof window & { rewinderReplayStore: ReturnType<typeof createStore> };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import '/src/styles/mobile-panels.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("universal event choices through the real browser handlers", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-rewinder-replay-test",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{
        name: "rewinder-replay-store", transform(code, id) {
          if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code.replace(
            "const store = createStore();", "const store = createStore(); globalThis.rewinderReplayStore = store;",
          );
        },
      }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/rewinder-event-replay", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([1440, 390, 320].flatMap(width => (["normal", "rewinder"] as const).map(roleId => ({ width, roleId }))))("reselects $roleId branches with fixed outcomes and locks confirmed history at $width px", async ({ width, roleId }) => {
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1000 },
      isMobile: width < 600, hasTouch: width < 600, reducedMotion: "reduce" });
    page.setDefaultTimeout(8_000);
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.abort(); return; }
      if (url.pathname === "/__rewinder_replay_test__") {
        await route.fulfill({ contentType: "text/html", body: fixture }); return;
      }
      await route.continue();
    });
    try {
      await page.goto(`${origin}/__rewinder_replay_test__`);
      await page.locator('[data-action="start-game"]').waitFor();
      await page.evaluate(roleId => {
        const store = (window as RewinderWindow).rewinderReplayStore;
        // Account setup only: the complete run below uses ordinary UI actions.
        store.getLobbyState().roleProgress[roleId].unlocked = true;
        store.getState().randomState = { seed: 1700000000, cursor: 0 };
        store.dispatch("select-role", { roleId });
      }, roleId);
      await startGameFromLobby(page);
      for (const choiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
        await page.locator(`[data-event-choice-id="${choiceId}"]:visible`).click();
      }
      // The enrollment confirmation advances September through bootstrap itself.
      expect(await page.evaluate(() => (window as RewinderWindow).rewinderReplayStore.getState().totalMonths)).toBe(1);
      await page.locator('[data-ui-open-event-id^="teachers-day-"]').first().click();
      await page.locator('#event-content-buttons button[data-event-choice-id^="teachers-day-continue-"]').click();
      const originalId = await page.locator('#event-content-buttons button[data-event-choice-id^="teachers-day-gift-"]').getAttribute("data-event-choice-id");
      const alternateId = await page.locator('#event-content-buttons button[data-event-choice-id^="teachers-day-message-"]').getAttribute("data-event-choice-id");
      expect(originalId).toBeTruthy(); expect(alternateId).toBeTruthy();
      const before = await page.evaluate(() => {
        const store = (window as RewinderWindow).rewinderReplayStore;
        return { player: store.getState().player, random: store.getState().randomState };
      });
      await page.locator(`#event-content-buttons button[data-event-choice-id="${originalId}"]`).click();
      const originalText = await page.locator("#event-content-body").textContent();
      const returnButton = page.locator('#event-content-buttons .is-event-rewind');
      expect(await returnButton.textContent()).toBe("回溯");
      expect(await page.locator('#event-content-box [data-action="debug-replay-event"]').count()).toBe(0);
      const fit = await page.locator("#event-content-buttons").evaluate(bar => {
        const box = bar.getBoundingClientRect();
        const button = bar.querySelector(".is-event-rewind")!.getBoundingClientRect();
        const confirm = bar.querySelector('[data-action="resolve-event"]')!.getBoundingClientRect();
        return { overflow: bar.scrollWidth - bar.clientWidth, right: box.right, viewport: innerWidth,
          sameRow: Math.abs(confirm.y - button.y) < 1, buttonInside: button.left >= box.left && button.right <= box.right + 1 };
      });
      expect(fit.overflow).toBeLessThanOrEqual(1);
      expect(fit.right).toBeLessThanOrEqual(fit.viewport + 1);
      expect(fit.buttonInside).toBe(true);
      expect(fit.sameRow).toBe(true);
      await page.locator("#event-content-box").screenshot({ path: `artifacts/rewinder-event-replay/${roleId}-${width}-result.png` });

      await returnButton.click();
      expect(await page.locator('#event-content-buttons [data-action="resolve-event"]').count()).toBe(3);
      await page.locator(`#event-content-buttons button[data-event-choice-id="${alternateId}"]`).click();
      expect(await page.locator("#event-content-body").textContent()).not.toBe(originalText);
      await returnButton.click();
      await page.locator(`#event-content-buttons button[data-event-choice-id="${originalId}"]`).click();
      expect(await page.locator("#event-content-body").textContent()).toBe(originalText);

      // Historical tabs expose the same normal ability directly on each choice.
      await page.locator('[data-ui-event-scene-index="1"]').click();
      expect(await page.locator(`#event-content-buttons button[data-event-choice-id="${originalId}"]`).getAttribute("data-action")).toBe("replay-event");
      expect(await page.locator(`#event-content-buttons button[data-event-choice-id="${originalId}"] [aria-label="已选择"]`).count()).toBe(1);
      await page.locator("#event-content-box").screenshot({ path: `artifacts/rewinder-event-replay/${roleId}-${width}-history-choices.png` });
      await page.locator(`#event-content-buttons button[data-event-choice-id="${alternateId}"]`).click();
      await page.locator('[data-ui-event-scene-index="1"]').click();
      await page.locator(`#event-content-buttons button[data-event-choice-id="${originalId}"]`).click();
      expect(await page.locator("#event-content-body").textContent()).toBe(originalText);
      expect(await page.evaluate(() => {
        const state = (window as RewinderWindow).rewinderReplayStore.getState();
        return { player: state.player, random: state.randomState };
      })).toEqual(before);

      await page.locator('#event-content-buttons button[data-action="resolve-event"]').click();
      await expect.poll(() => page.evaluate(() => (window as RewinderWindow).rewinderReplayStore.getState()
        .eventQueue.some(event => event.chainId === "teachers-day"))).toBe(false);
      const finished = await page.evaluate(() => {
        const store = (window as RewinderWindow).rewinderReplayStore;
        return { money: store.getState().player.money, history: store.getState().eventHistory.filter(event => event.chainId === "teachers-day").length,
          debugged: store.isCurrentRunDebugged(), disqualified: store.isCurrentRunDisqualified() };
      });
      expect(finished).toEqual({ money: before.player.money - 1, history: 1, debugged: false, disqualified: false });
      await page.locator('[data-ui-open-event-history-id*="teachers-day-result-"]').first().click();
      for (const index of [0, 1, 2]) {
        await page.locator(`[data-ui-event-scene-index="${index}"]`).click();
        expect(await page.locator('#event-content-box [data-action="replay-event"]').count()).toBe(0);
        expect(await page.locator('#event-content-buttons button:not(:disabled)').count()).toBe(0);
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 45_000);
});
