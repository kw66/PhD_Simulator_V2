import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type MobileShellWindow = typeof window & { mobileShellStore: ReturnType<typeof createStore> };

describe("mobile navigation and readable status", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-mobile-shell", logLevel: "error",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
      plugins: [{ name: "mobile-shell-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.mobileShellStore = store;");
        }
      } }],
    });
    await server.listen(); browser = await chromium.launch();
    await mkdir("artifacts/mobile-one-hand", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([320, 390, 430])("keeps %spx status and navigation reachable while scrolling and switching panels", async width => {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    page.setDefaultTimeout(8_000);
    const url = server.resolvedUrls!.local[0]!;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
    try {
      await page.goto(url);
      expect(await page.locator('[data-ui-role-rail-view="announcements"]').getAttribute('aria-selected')).toBe('true');
      await page.locator('[data-ui-role-rail-view="achievements"]').tap();
      await page.locator('.lobby-profile-achievement').first().tap();
      expect(await page.locator('#relationship-tooltip').isVisible()).toBe(true);
      const bounds = await page.locator('#relationship-tooltip').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.locator('.lobby-profile-achievement').first().tap();
      expect(await page.locator('#relationship-tooltip').isVisible()).toBe(false);
      await page.locator('[data-action="start-game"]').tap();
      expect(await page.locator('[data-action="next-month"]').isDisabled()).toBe(true);
      await page.locator('.mobile-month-summary').tap();
      expect(await page.locator('#event-content-box').isVisible()).toBe(true);
      await page.evaluate(() => {
        const store = (window as MobileShellWindow).mobileShellStore;
        const state = store.getState();
        Object.assign(state, { year: 2, month: 3, totalMonths: 15, selectedAdvisorName: "张老师",
          eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [] });
        Object.assign(state.player, { san: 20, money: 200, research: 12, social: 12 });
        state.actionState.used = 0;
        state.advisorProgressState.funding = 1000;
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      });
      expect(await page.locator('[data-action="next-month"]').isEnabled()).toBe(true);
      expect(await page.locator('.play-left-rail').isVisible()).toBe(false);
      expect(await page.locator('#mobile-secondary-tabs').isVisible()).toBe(false);
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const visibleButtons = [...document.querySelectorAll('.center-main-tabs button')]
          .filter(button => button.getBoundingClientRect().width > 0);
        return { documentWidth: document.documentElement.scrollWidth,
          statusTop: rect('[data-ui-mobile-status]').top, statusHeight: rect('[data-ui-mobile-status]').height,
          navigationBottom: rect('.center-main-tabs').bottom,
          tabs: visibleButtons.map(button => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })),
        };
      });
      expect(metrics.documentWidth).toBeLessThanOrEqual(width);
      expect(metrics.statusTop).toBeGreaterThanOrEqual(0);
      expect(metrics.statusTop).toBeLessThan(24);
      expect(metrics.statusHeight).toBeGreaterThanOrEqual(44);
      expect(metrics.statusHeight).toBeLessThan(100);
      expect(metrics.navigationBottom).toBeGreaterThanOrEqual(824);
      expect(metrics.navigationBottom).toBeLessThanOrEqual(844);
      expect(metrics.tabs).toHaveLength(7);
      expect(metrics.tabs.every(button => button.height >= 44 && button.width >= 44)).toBe(true);
      for (const tab of ["workstation", "events", "relationship", "shop", "research", "talent", "settings"]) {
        expect(await page.locator(`[data-ui-play-tab="${tab}"]`).count()).toBe(1);
      }

      const status = page.locator('[data-ui-mobile-status]');
      await status.tap();
      expect(await status.getAttribute("aria-expanded")).toBe("true");
      expect(await page.locator('.play-left-rail').isVisible()).toBe(true);
      expect(await page.locator('.play-left-rail [data-player-stat="san"]').isVisible()).toBe(true);
      await page.locator('.mobile-status-close[data-ui-mobile-close]').tap();
      expect(await page.locator('.play-left-rail').isVisible()).toBe(false);
      await status.tap();
      await page.keyboard.press("Escape");
      expect(await status.getAttribute("aria-expanded")).toBe("false");
      expect(await page.locator('.play-left-rail').isVisible()).toBe(false);
      await status.tap();
      const backdrop = page.locator('.mobile-shell-backdrop[data-ui-mobile-close]');
      const backdropBounds = await backdrop.boundingBox();
      const statusBounds = await status.boundingBox();
      await backdrop.tap({ position: { x: 8, y: statusBounds!.y + statusBounds!.height + 12 - backdropBounds!.y } });
      expect(await page.locator('.play-left-rail').isVisible()).toBe(false);

      await page.locator('[data-ui-play-tab="shop"]').tap();
      await page.locator('[data-ui-shop-tab="gear"]').tap();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const scrolled = await page.evaluate(() => ({ scrollY, viewport: innerHeight,
        statusTop: document.querySelector('[data-ui-mobile-status]')!.getBoundingClientRect().top,
        navigationBottom: document.querySelector('.center-main-tabs')!.getBoundingClientRect().bottom,
      }));
      expect(scrolled.scrollY).toBeGreaterThan(100);
      expect(scrolled.statusTop).toBeCloseTo(metrics.statusTop, 0);
      expect(scrolled.navigationBottom).toBeCloseTo(metrics.navigationBottom, 0);
      await page.locator('[data-ui-play-tab="workstation"]').tap();
      await page.waitForFunction(() => {
        const panels = document.querySelector('#center-main-panels')!.getBoundingClientRect();
        const status = document.querySelector('[data-ui-mobile-status]')!.getBoundingClientRect();
        return panels.top >= status.bottom - 2 && panels.top < 200;
      });
      const expectedBefore = await page.evaluate(() => {
        const state = (window as MobileShellWindow).mobileShellStore.getState();
        return { remaining: state.actionState.limit - state.actionState.used, limit: state.actionState.limit };
      });
      expect((await status.innerText()).replace(/\s+/g, "")).toContain(`${expectedBefore.remaining}/${expectedBefore.limit}`);
      const rest = page.locator('[data-action="rest"]');
      await rest.scrollIntoViewIfNeeded();
      const beforeActionScroll = await page.evaluate(() => scrollY);
      await rest.tap();
      const afterAction = await page.evaluate(() => {
        const state = (window as MobileShellWindow).mobileShellStore.getState();
        return { remaining: state.actionState.limit - state.actionState.used, limit: state.actionState.limit, scrollY };
      });
      expect(afterAction.remaining).toBe(expectedBefore.remaining - 1);
      await expect.poll(async () => (await status.innerText()).replace(/\s+/g, ""))
        .toContain(`${afterAction.remaining}/${afterAction.limit}`);
      expect(Math.abs(afterAction.scrollY - beforeActionScroll)).toBeLessThanOrEqual(2);

      const beforeMonth = await page.evaluate(() => (window as MobileShellWindow).mobileShellStore.getState().totalMonths);
      await page.locator('[data-ui-mobile-more]').tap();
      await page.locator('[data-action="next-month"]').tap();
      expect(await page.evaluate(() => (window as MobileShellWindow).mobileShellStore.getState().totalMonths)).toBe(beforeMonth + 1);
      expect(await page.locator('#mobile-secondary-tabs').isVisible()).toBe(false);
      expect(await page.locator('.mobile-shell-backdrop').isVisible()).toBe(false);

      for (const tab of ["research", "talent", "settings"]) {
        await page.locator('[data-ui-mobile-more]').tap();
        expect(await page.locator('#mobile-secondary-tabs').isVisible()).toBe(true);
        expect(await page.locator('#mobile-secondary-tabs [data-ui-play-tab]').count()).toBe(3);
        await page.locator(`[data-ui-play-tab="${tab}"]`).tap();
        expect(await page.locator(`[data-tab-panel="${tab}"]`).isVisible()).toBe(true);
        expect(await page.locator('#mobile-secondary-tabs').isVisible()).toBe(false);
      }
      await page.locator('[data-ui-mobile-more]').tap();
      await page.keyboard.press("Escape");
      expect(await page.locator('#mobile-secondary-tabs').isVisible()).toBe(false);
      await page.locator('[data-ui-open-run-saves]:visible').tap();
      await page.locator('[data-ui-play-tab="events"]').tap();
      expect(await page.locator('.run-saves').count()).toBe(0);
      expect(await page.locator('[data-tab-panel="events"]').isVisible()).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.screenshot({ path: `artifacts/mobile-one-hand/shell-${width}.png` });
      await page.close();
    }
  }, 40_000);
});
