import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { getAllAchievementDefinitions } from "../src/core/v2-role-lobby-meta";
import type { createStore } from "../src/core/v2-store";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";

type TestWindow = Window & { achievementStore: ReturnType<typeof createStore> };

describe("global achievement statistics in the actual game", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-achievement-stats-test",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false }, plugins: [{
        name: "achievement-network-fixture", transform(code, id) {
          if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code
            .replace("const store = createStore();", "const store = createStore(); window.achievementStore = store;")
            .replace('const statisticsUploadEnabled = import.meta.env.PROD && window.location.protocol === "https:";', "const statisticsUploadEnabled = true;");
        },
      }],
    });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("renders one cached bulk read and uploads only explicitly settled non-debug runs", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    const errors: string[] = [];
    let reads = 0;
    const starts: string[] = [];
    const writes: Array<{ p_player_id: string; p_run_id: string; p_role_id: string; p_achievement_ids: string[] }> = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) { await route.continue(); return; }
      if (url.pathname.endsWith("/get_phd_simulator_v2_achievement_stats_v2")) {
        reads++;
        await route.fulfill({ json: { version: 2, epoch: DATA_EPOCH, achievements: getAllAchievementDefinitions().map(definition => ({
          id: definition.id, achievedPlayers: 5, eligiblePlayers: 20,
        })) } }); return;
      }
      if (url.pathname.endsWith("/record_phd_simulator_v2_achievement_run")) {
        writes.push(route.request().postDataJSON()); await route.fulfill({ json: true }); return;
      }
      if (url.pathname.endsWith("/record_phd_simulator_v2_achievement_start")) {
        starts.push(route.request().postDataJSON().p_player_id); await route.fulfill({ json: true }); return;
      }
      // Other online features are irrelevant here; never contact a real server.
      await route.abort();
    });
    try {
      await page.goto(server.resolvedUrls!.local[0]!);
      await expect.poll(() => page.locator('.achievement-global-rate').first().textContent()).toBe("25%");
      expect(await page.locator('.lobby-profile-achievement').count()).toBe(11);
      expect(await page.locator('.lobby-profile-achievement .achievement-completion-fill').first().getAttribute("style")).toBe("width:25%");
      // Global popularity must never look like this account has unlocked a card.
      const colors = await page.locator('.lobby-profile-achievement').first().evaluate(card => {
        const fill = card.querySelector('.achievement-completion-fill')!;
        const globalFill = getComputedStyle(fill).backgroundImage;
        card.classList.add('is-unlocked');
        const completed = { fillDisplay: getComputedStyle(fill).display, background: getComputedStyle(card).backgroundImage };
        card.classList.remove('is-unlocked');
        return { globalFill, completed, background: getComputedStyle(card).backgroundImage };
      });
      expect(colors.globalFill).toContain('101, 120, 120');
      expect(colors.completed.fillDisplay).toBe('none');
      expect(colors.completed.background).not.toBe(colors.background);
      await page.locator('[data-action="select-role"][data-role-id="rich"]').click();
      await expect.poll(() => page.locator('.lobby-profile-achievement').first().getAttribute('data-achievement-id')).toBe('normal:first-pot');
      expect(await page.locator('.lobby-profile-achievement').evaluateAll(cards =>
        cards.slice(0, 4).map(card => card.getAttribute('data-achievement-id')))).toEqual([
        'normal:first-pot', 'rich:ending-master', 'rich:ending-phd', 'unlock:rich-reversed',
      ]);
      expect(await page.locator('.lobby-profile-achievement').count()).toBe(11);
      await page.locator('[data-action="select-role"][data-role-id="normal"]').click();
      await expect.poll(() => page.locator('.lobby-profile-achievement').first().getAttribute('data-achievement-id')).toBe('normal:ending-master');
      for (let index = 0; index < 3; index++) await page.locator('[data-action="change-role-achievement-page"][data-delta="1"]').click();
      expect(reads).toBe(1);
      await page.locator('[data-action="start-game"]').click();
      await expect.poll(() => starts.length).toBe(1);
      for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
        await page.locator(`[data-event-choice-id="${id}"]:visible`).click();
      }
      await page.evaluate(() => (window as unknown as TestWindow).achievementStore.dispatch("quit-game"));
      expect(writes).toHaveLength(0);
      const id = await page.evaluate(() => (window as unknown as TestWindow).achievementStore.getCurrentRunId());
      await page.locator('[data-action="reset-game"]:visible').click();
      await page.locator('[data-action="start-game"]').click();
      expect(writes).toHaveLength(0);
      await page.locator('[data-action="restart-game"]').click();
      await expect.poll(() => writes.length).toBe(1);
      expect(writes[0]).toMatchObject({ p_run_id: id, p_role_id: "normal" });
      expect(writes[0].p_achievement_ids).toContain("global:ending-quit");
      expect(writes[0].p_player_id).toBe(await page.evaluate(() => localStorage.getItem("phd_simulator_v2_activity_visitor_id")));
      expect(starts).toEqual([writes[0].p_player_id]);
      await page.evaluate(() => {
        const store = (window as unknown as TestWindow).achievementStore;
        store.markCurrentRunAsDebugged(); store.dispatch("quit-game"); store.dispatch("restart-game");
      });
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      expect(writes).toHaveLength(1);
      expect(reads).toBe(1);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
