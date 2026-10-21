import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createThreeStageEvent } from "../src/core/v2-random-events-core-shared";
import type { PendingEvent } from "../src/core/v2-types";

type TestWindow = Window & {
  eventPreferencesStore: ReturnType<typeof import("../src/core/v2-store").createStore>;
  levelStatsSyncCalls: Array<{ missingOnly?: boolean }>;
};

function scene(id: string, branching: boolean): PendingEvent {
  const choices = [{ id: `${id}-a`, label: "接受", outcome: "获得金币", effects: { money: 1 } },
    ...(branching ? [{ id: `${id}-b`, label: "拒绝", outcome: "结束", effects: {} }] : [])];
  return createThreeStageEvent({ id, title: id === "branch" ? "分支事件" : "无分支事件", description: "",
    source: "system", blocking: true, deadlineMonths: 0, chainId: id, stage: "act1", choices }, {
    introDescription: "这是第一幕，仍可回看。", decisionTitle: "作出选择", decisionDescription: "这是第二幕。",
    results: Object.fromEntries(choices.map(choice => [choice.id, { title: "结果", description: "这是第三幕。" }])),
  });
}

describe("event preferences and compact mobile agenda", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-event-preferences",
      plugins: [{ name: "expose-event-preferences-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.eventPreferencesStore = store;")
            .replace("  const community = createCommunityMessages", `
              globalThis.levelStatsSyncCalls = [];
              const originalLevelSync = roleLevelStats.syncAccount;
              roleLevelStats.syncAccount = (account, options) => {
                globalThis.levelStatsSyncCalls.push(options ?? {});
                return originalLevelSync(account, options);
              };
              const community = createCommunityMessages`);
        }
      } }], server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("checks levels on initial backfill, final settlement and role unlock, without checking during routine actions", async () => {
    const page = await browser.newPage();
    const base = server.resolvedUrls!.local[0]!;
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.waitForFunction(() => (window as unknown as TestWindow).levelStatsSyncCalls?.length === 1);
      const checks = await page.evaluate(async () => {
        const test = window as unknown as TestWindow;
        const store = test.eventPreferencesStore;
        const startup = structuredClone(test.levelStatsSyncCalls);
        store.dispatch("start-game", { roleId: "normal" });
        store.dispatch("set-event-intro-skipping", { skipBranchEventIntro: true });
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: false });
        const routine = structuredClone(test.levelStatsSyncCalls);
        store.dispatch("quit-game");
        store.dispatch("settle-and-return");
        await store.whenIdle();
        const settled = structuredClone(test.levelStatsSyncCalls);
        const phase = store.getState().phase;
        store.getLobbyState().roleProgress.genius.unlocked = true;
        store.dispatch("set-event-intro-skipping", { skipBranchEventIntro: false });
        return { startup, routine, settled, unlocked: test.levelStatsSyncCalls, phase };
      });
      expect(checks.startup).toEqual([{ missingOnly: true }]);
      expect(checks.routine).toEqual(checks.startup);
      expect(checks.phase).toBe("setup");
      expect(checks.settled).toEqual([{ missingOnly: true }, {}]);
      expect(checks.unlocked).toEqual([{ missingOnly: true }, {}, {}]);
    } finally { await page.close(); }
  }, 20_000);

  it.each([320, 390, 820, 1440])("keeps the two switches independent and introductions reviewable at %ipx", async width => {
    const touch = width <= 820;
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: touch, isMobile: touch,
      reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    const base = server.resolvedUrls!.local[0]!;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.waitForFunction(() => !!(window as unknown as TestWindow).eventPreferencesStore);
      await page.evaluate(async events => {
        const store = (window as unknown as TestWindow).eventPreferencesStore;
        await store.ready();
        store.dispatch("start-game", { roleId: "normal" });
        Object.assign(store.getState(), { eventQueue: events, year: 1, month: 4, totalMonths: 4,
          availableRandomEvents: [], pendingRandomEvents: [] });
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      }, [createEventQueueItem(scene("branch", true), 1), createEventQueueItem(scene("linear", false), 2)]);
      const introToggle = page.getByRole("button", { name: "跳过有分支事件第一幕", exact: true });
      const linearToggle = page.getByRole("button", { name: "跳过无分支事件", exact: true });
      await (touch ? introToggle.tap() : introToggle.click());
      expect(await introToggle.getAttribute("aria-pressed")).toBe("true");
      expect(await linearToggle.getAttribute("aria-pressed")).toBe("false");
      expect(await introToggle.locator("svg").getAttribute("data-lucide")).toBe("git-fork");
      if (touch) {
        await page.locator("#relationship-tooltip").waitFor({ state: "visible", timeout: 5000 });
        const hint = page.getByRole("button", { name: "小提示", exact: true });
        expect(await hint.textContent()).toContain("小提示");
        expect(await hint.getAttribute("title")).toBeNull();
        await hint.tap();
        const bounds = await page.locator("#play-help-panel").boundingBox();
        const row = await page.locator(".new-time-row").boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(row!.y + row!.height);
        await hint.tap();
        const columns = await page.locator(".todo-group").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
        expect(columns).toBe(2);
        const positions = await page.locator(".new-identity-money-header").evaluate(element => {
          const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
          const action = element.querySelector(".new-player-action-points")!;
          return { actionRight: rect(".new-player-action-points").right, moneyLeft: rect(".new-currency-value").left,
            border: getComputedStyle(action).borderWidth };
        });
        expect(positions.actionRight).toBeLessThanOrEqual(positions.moneyLeft);
        expect(positions.border).toBe("0px");
      }
      await page.locator('[data-ui-open-event-id="branch"]').click();
      expect(await page.locator("#event-content-body").textContent()).toContain("这是第二幕");
      if (touch) {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: `artifacts/event-open-${width}.png` });
        const position = await page.evaluate(() => ({ top: document.querySelector("#event-content-box")!.getBoundingClientRect().top,
          bottom: document.querySelector("#event-content-box")!.getBoundingClientRect().bottom, height: window.innerHeight,
          scroll: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }));
        expect(position.top < 200 || Math.abs(position.scroll - position.max) < 2, JSON.stringify(position)).toBe(true);
        expect(position.bottom).toBeLessThanOrEqual(position.height);
      }
      await page.locator('[data-ui-event-scene-index="0"]').click();
      expect(await page.locator("#event-content-body").textContent()).toContain("这是第一幕");
      await page.locator('[data-ui-close-event-content]').click();
      await page.locator('[data-ui-open-event-id="linear"]').click();
      expect(await page.locator("#event-content-body").textContent()).toContain("这是第一幕");
      await page.locator('[data-ui-close-event-content]').click();
      await (touch ? linearToggle.tap() : linearToggle.click());
      expect(await linearToggle.getAttribute("aria-pressed")).toBe("true");
      expect(await introToggle.getAttribute("aria-pressed")).toBe("true");
      await (touch ? introToggle.tap() : introToggle.click());
      expect(await introToggle.getAttribute("aria-pressed")).toBe("false");
      expect(await introToggle.locator("svg").getAttribute("data-lucide")).toBe("git-fork");
      expect(await linearToggle.locator("svg").getAttribute("data-lucide")).toBe("fast-forward");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/event-preferences-${width}.png` });
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
