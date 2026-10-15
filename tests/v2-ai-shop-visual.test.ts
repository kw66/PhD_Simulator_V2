import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let browser: Browser;
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

beforeAll(async () => {
  server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
    plugins: [{ name: "ai-shop-preview", transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
        return code.replace("const store = createStore();", "const store = createStore(); globalThis.aiPreviewStore = store;");
      }
    } }],
  });
  await server.listen();
  browser = await chromium.launch();
  await mkdir("artifacts/ai-shop", { recursive: true });
}, 30_000);

afterAll(async () => { await browser?.close(); await server?.close(); });

it("unifies shop surfaces without changing geometry or wrapping across tabs", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  try {
    await page.route("**/__ai_shop__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__ai_shop__`);
    await page.waitForSelector('[data-action="start-game"]:not(:disabled)');
    await page.evaluate(() => {
      const store = (window as typeof window & { aiPreviewStore: ReturnType<typeof import("../src/core/v2-store").createStore> }).aiPreviewStore;
      store.dispatch("start-game", { roleId: "normal" });
      const state = store.getState();
      Object.assign(state, { year: 1, month: 1, totalMonths: 1, eventQueue: [] });
      state.player.money = 1;
      Object.assign(state.aiShopState.subscriptions.claude, { active: true, enabled: true });
      Object.assign(state.aiShopState.subscriptions.gpt, { enabled: true, paused: true });
      store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
    });
    await page.locator('[data-ui-play-tab="shop"]').click();
    await page.locator('[data-ui-shop-tab="ai"]').click();
    const measure = async (disabled: boolean) => page.evaluate(async disabled => {
      for (const filename of ["shop-unified.css"]) {
        document.querySelector<HTMLStyleElement>(`style[data-vite-dev-id$="/${filename}"]`)!.sheet!.disabled = disabled;
      }
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => undefined)));
      return [...document.querySelectorAll<HTMLElement>(".shop-item-row, .shop-item-row *")].filter(element => element instanceof HTMLElement).map(element => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x: Math.round(bounds.x + scrollX), y: Math.round(bounds.y + scrollY), width: Math.round(bounds.width), height: Math.round(bounds.height),
          scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
          font: style.font, padding: style.padding, margin: style.margin, text: element.textContent };
      });
    }, disabled);
    for (const width of [1920, 1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const before = await measure(true);
      await page.locator(".shop-panel").screenshot({ path: `artifacts/ai-shop/before-${width}.png` });
      const after = await measure(false);
      expect(after).toEqual(before);
      await page.locator(".shop-panel").screenshot({ path: `artifacts/ai-shop/after-${width}.png` });
      expect(await page.locator(".shop-item-row.is-ai").count()).toBe(6);
      expect(await page.locator(".shop-item-row.is-ai").evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth))).toBe(true);
    }
    const colors = await page.locator(".is-ai .shop-item-btn").evaluateAll(buttons => buttons.map(button => ({
      current: button.classList.contains("is-current"), disabled: (button as HTMLButtonElement).disabled,
      background: getComputedStyle(button).background,
    })));
    expect(new Set(colors.map(color => color.background)).size).toBeGreaterThanOrEqual(3);
    const buy = page.locator('.is-ai [data-action="buy-ai-month"]:not(:disabled)').first();
    await buy.scrollIntoViewIfNeeded();
    await page.keyboard.press("Tab");
    await buy.focus();
    expect(await buy.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await buy.click();
    const toggle = page.locator('.is-ai [data-action="toggle-ai-subscription"][data-ai-slot-id="claude"]');
    await toggle.click();
    expect(await toggle.getAttribute("aria-checked")).toBe("false");
    for (const owned of [false, true]) {
      await page.evaluate(owned => {
        const store = (window as typeof window & { aiPreviewStore: ReturnType<typeof import("../src/core/v2-store").createStore> }).aiPreviewStore;
        const state = store.getState();
        state.shopState.chairOwned = owned;
        state.coffeeState.machineOwned = owned;
        state.player.money = owned ? 100 : 0;
        store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
      }, owned);
      for (const tab of ["coffee", "gear", "life", "rest"]) {
        await page.locator(`[data-ui-shop-tab="${tab}"]`).click();
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          const before = await measure(true);
          expect(await measure(false), `${tab} ${width} owned:${owned}`).toEqual(before);
          const activeTab = await page.locator(".shop-panel .ui-tab-slider-shop").evaluate(element => getComputedStyle(element).backgroundImage);
          expect(activeTab).toBe("linear-gradient(rgb(243, 223, 178), rgb(232, 203, 145))");
          expect(await page.locator(".shop-panel .shop-tab-btn.active").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
          const cards = page.locator(".shop-item-row");
          const surfaces = await cards.evaluateAll(cards => cards.map(card => {
            const style = getComputedStyle(card);
            return { opacity: style.opacity, image: style.backgroundImage, overflow: card.scrollWidth - card.clientWidth };
          }));
          expect(surfaces.length).toBeGreaterThan(0);
          for (const surface of surfaces) {
            expect(surface.opacity).toBe("1");
            expect(surface.image).not.toMatch(/rgba|transparent/);
            expect(surface.overflow).toBeLessThanOrEqual(1);
          }
          await page.locator(".shop-panel").screenshot({ path: `artifacts/ai-shop/${tab}-${owned ? "owned" : "locked"}-${width}.png` });
        }
        if (owned && (tab === "rest" || tab === "coffee")) {
          const option = page.locator('button.shop-item-row.is-upgrade-option:not(:disabled)').first();
          await option.click();
          expect(await option.getAttribute("class")).toContain("is-selected");
          expect(await measure(false)).toEqual(await measure(true));
          await measure(false);
          const selected = await option.evaluate(element => getComputedStyle(element).backgroundImage);
          expect(selected).not.toMatch(/rgba|transparent/);
          expect(await option.locator(".shop-upgrade-check").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(165, 143, 73)");
          await page.locator(".shop-panel").screenshot({ path: `artifacts/ai-shop/${tab}-selected-390.png` });
          if (tab === "coffee") {
            await page.locator('[data-action="upgrade-coffee-machine"]').click();
            expect(await page.locator('.shop-item-btn.is-current').count()).toBeGreaterThan(0);
            expect(await measure(false)).toEqual(await measure(true));
            await measure(false);
            await page.locator(".shop-panel").screenshot({ path: "artifacts/ai-shop/coffee-upgraded-390.png" });
          }
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('[data-ui-shop-tab="ai"]').click();
      await page.evaluate(async () => {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
      });
      const motion = await page.evaluate(async () => {
        document.querySelector<HTMLButtonElement>('[data-ui-shop-tab="rest"]')!.click();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const slider = document.querySelector<HTMLElement>(".ui-tab-slider-shop")!;
        const intermediate = getComputedStyle(slider);
        const moving = slider.getAnimations().length > 0;
        const between = Math.abs(parseFloat(intermediate.left) - parseFloat(slider.style.left)) > 1
          || Math.abs(parseFloat(intermediate.top) - parseFloat(slider.style.top)) > 1;
        const clearOverlay = [...document.querySelectorAll<HTMLElement>(".shop-panel .shop-tab-btn")].every(button => {
          const style = getComputedStyle(button);
          return style.borderRightWidth === "0px" && style.boxShadow === "none";
        });
        await Promise.all(slider.getAnimations().map(animation => animation.finished));
        const final = getComputedStyle(slider);
        return { moving, between, clearOverlay, landed: Math.abs(parseFloat(final.left) - parseFloat(slider.style.left)) < 1
          && Math.abs(parseFloat(final.top) - parseFloat(slider.style.top)) < 1 };
      });
      expect(motion).toEqual({ moving: true, between: true, clearOverlay: true, landed: true });
    }
  } finally { await page.close(); }
}, 45_000);
