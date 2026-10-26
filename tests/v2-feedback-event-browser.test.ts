import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";
import { createFeedbackEvent } from "../src/core/v2-fixed-events-feedback";
import { createEventQueueItem } from "../src/core/v2-event-queue";

type FeedbackWindow = Window & { feedbackStore: ReturnType<typeof createStore> };

describe("single-scene feedback invitation", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", define: { __LOCAL_PLAYGROUND__: false },
      server: { host: "127.0.0.1", port: 0, hmr: false }, plugins: [{ name: "feedback-fixture", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code
          .replace("const store = createStore();", "const store = createStore(); globalThis.feedbackStore = store;")
          .replace("const statisticsUploadEnabled = isRemoteWriteEnabled();", "const statisticsUploadEnabled = true;");
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/feedback-event", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  async function prepare(page: Page) {
    await page.route("**/__feedback_event__", route => route.fulfill({ contentType: "text/html", body: `
      <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
      <div id="app"></div><script type="module">
      import '/src/styles/global.css';
      import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
      await bootstrapApp(document.querySelector('#app'));
      </script></body></html>` }));
    await page.goto(`${server.resolvedUrls!.local[0]}__feedback_event__`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-action="start-game"]').waitFor();
    await page.evaluate(async event => {
      const store = (window as unknown as FeedbackWindow).feedbackStore;
      await store.ready();
      store.dispatch("start-game", { roleId: "normal" });
      const state = store.getState();
      Object.assign(state, { year: 3, month: 4, totalMonths: 28, selectedAdvisorName: "马海斌", eventQueue: [] });
      Object.assign(state.player, { money: 100, san: 20 });
      state.eventQueue = [event];
      store.dispatch("set-linear-event-blocking", { blockLinearEvents: false });
    }, createEventQueueItem(createFeedbackEvent(), 1));
    await page.locator('[data-ui-open-event-id="midterm-message-y3-m4"]').click();
    await page.locator('#event-feedback-content').waitFor();
  }

  it.each([390, 1440])("publishes only on a player click and resolves after success at %s px", async width => {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(8_000);
    const posts: unknown[] = [];
    const errors: string[] = [];
    let fail = true;
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*.supabase.co/**", async route => {
      const request = route.request();
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("messages")) {
        posts.push(request.postDataJSON());
        return route.fulfill({ status: fail ? 503 : 201, json: fail ? {} : [{ id: 123 }] });
      }
      return route.fulfill({ contentType: "application/json", headers: { "Content-Range": "*/0" }, body: "[]" });
    });
    try {
      await prepare(page);
      expect(posts).toHaveLength(0);
      expect(await page.locator('#event-content-box .event-scene-tab').count()).toBe(1);
      expect(await page.locator('#event-content-buttons button').allTextContents()).toEqual(["发布留言", "这次先不写"]);
      await page.locator('#event-feedback-nickname').fill("测试玩家");
      await page.locator('#event-feedback-content').fill("游玩体会与bug反馈测试");
      await page.locator('#event-content-box').screenshot({ path: `artifacts/feedback-event/${width}.png` });
      const send = page.locator('[data-community-event-id="midterm-message-y3-m4"]');
      await send.click();
      await expect.poll(() => page.locator('[data-community-notice="feedback"]').textContent()).toContain("发送失败");
      expect(await page.locator('#event-feedback-content').inputValue()).toBe("游玩体会与bug反馈测试");
      fail = false;
      await send.click();
      await expect.poll(() => page.evaluate(() => (window as unknown as FeedbackWindow).feedbackStore.getState().eventHistory
        .some(e => e.chainId === "midterm-message"))).toBe(true);
      expect(posts).toHaveLength(2);
      expect(posts[1]).toMatchObject({ nickname: "测试玩家", content: "游玩体会与bug反馈测试", source: "feedback", parent_id: null });
      expect(await page.evaluate(() => (window as unknown as FeedbackWindow).feedbackStore.getState().eventHistory
        .find(e => e.chainId === "midterm-message")?.stages.length)).toBe(1);
      expect(await page.evaluate(() => JSON.stringify((window as unknown as FeedbackWindow).feedbackStore.getState()))).not.toContain("游玩体会与bug反馈测试");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 40_000);

  it("skips or leaves for next month without posting", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    let writes = 0;
    await page.route("**/*.supabase.co/**", route => {
      if (route.request().method() === "POST" && new URL(route.request().url()).pathname.endsWith("messages")) writes++;
      return route.fulfill({ json: [], headers: { "Content-Range": "*/0" } });
    });
    try {
      await prepare(page);
      await page.locator('[data-event-choice-id="midterm-message-skip"]').click();
      expect(await page.evaluate(() => (window as unknown as FeedbackWindow).feedbackStore.getState().eventQueue.length)).toBe(0);
      expect(writes).toBe(0);
      await prepare(page);
      await page.evaluate(() => (window as unknown as FeedbackWindow).feedbackStore.dispatch("next-month"));
      expect(await page.evaluate(() => (window as unknown as FeedbackWindow).feedbackStore.getState().eventQueue
        .some(e => e.chainId === "midterm-message"))).toBe(false);
      expect(writes).toBe(0);
    } finally { await page.close(); }
  }, 40_000);
});
