import { mkdir } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startGameFromLobby } from "./helpers/v2-start-game";
import { createServer, type ViteDevServer } from "vite";

const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("timeline scrolling through the real app handlers", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      logLevel: "error",
      // Other browser suites start their own Vite servers in parallel. Sharing
      // the optimizer cache can invalidate a dependency while this page loads.
      cacheDir: "node_modules/.vite-timeline-test",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/timeline", { recursive: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function action(actionId: string, extra: Record<string, string> = {}) {
    await page.evaluate(({ actionId, extra }) => {
      const button = document.createElement("button");
      Object.assign(button.dataset, { action: actionId, ...extra });
      document.querySelector("#app")!.append(button);
      button.click();
      button.remove();
    }, { actionId, extra });
  }

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const startupErrors: string[] = [];
    page.on("pageerror", error => startupErrors.push(`page: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") startupErrors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", request => startupErrors.push(`request: ${request.url()} ${request.failure()?.errorText}`));
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(server.resolvedUrls!.local[0]!).origin
      ? route.continue()
      : route.abort());
    await page.route("**/__timeline_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__timeline_test__`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector("[data-action='start-game']:not(:disabled)");
    } catch (error) {
      throw new Error(`Timeline app did not finish starting: ${startupErrors.join("\n") || "no browser errors"}`, { cause: error });
    }
    await startGameFromLobby(page);
    await action("debug-shift-month", { delta: "18" });
    const initialScroll = await page.locator(".event-timeline-track").evaluate(element => {
      const marker = element.querySelector<HTMLElement>(".event-timeline-marker.is-current")!;
      element.scrollLeft = marker.offsetLeft - (element.clientWidth - marker.offsetWidth) / 2;
      return element.scrollLeft;
    });
    expect(initialScroll).toBeGreaterThan(0);
  }, 60_000);

  afterEach(async () => { await page?.close(); });

  const scroll = () => page.locator(".event-timeline-track").evaluate(element => element.scrollLeft);
  const selected = () => page.locator(".event-timeline-marker.is-current").getAttribute("data-ui-log-page-index");

  it("keeps the timeline strip legible at desktop and narrow widths", async () => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.mouse.move(0, 0);
      const track = page.locator(".event-timeline-track");
      await track.screenshot({ path: `artifacts/timeline/strip-${width}.png`, animations: "disabled" });
      await page.screenshot({ path: `artifacts/timeline/page-${width}.png`, animations: "disabled" });
      expect(await track.evaluate(element => {
        const labels = [...element.querySelectorAll<HTMLElement>(".event-timeline-marker-label")];
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.borderRadius === "0px" && labels.every(label => {
          const labelBounds = label.getBoundingClientRect();
          return labelBounds.top >= bounds.top && labelBounds.bottom <= bounds.bottom;
        });
      })).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await action("debug-trigger-ending", { eventId: "master" });
    await page.locator(".event-timeline-marker[data-ui-ending-page]").waitFor();
    await page.locator(".event-timeline-track").screenshot({ path: "artifacts/timeline/strip-ending.png", animations: "disabled" });
  }, 30_000);

  it("keeps the scrolled viewport when clicking a month cell away from its dot", async () => {
    const before = await scroll();
    const marker = page.locator(".event-timeline-marker.is-current");
    const index = await selected();
    await marker.click({ position: { x: 8, y: 7 } });
    expect(await selected()).toBe(index);
    expect(await scroll()).toBeCloseTo(before, 0);
    await page.locator(`button[data-ui-log-page-index="${Number(index) - 1}"]`).click();
    expect(await selected()).toBe(String(Number(index) - 1));
    expect(await scroll()).toBeCloseTo(before, 0);
  });

  it("preserves horizontal dragging and does not select a month on release", async () => {
    const index = await selected();
    const before = await scroll();
    const track = (await page.locator(".event-timeline-track").boundingBox())!;
    await page.mouse.move(track.x + 180, track.y + 8);
    await page.mouse.down();
    await page.mouse.move(track.x + 300, track.y + 8, { steps: 8 });
    await page.mouse.up();
    expect(await scroll()).toBeLessThan(before - 80);
    expect(await selected()).toBe(index);
    const dragged = await scroll();
    await page.locator('[data-ui-play-tab="relationship"]').click();
    await page.locator('[data-ui-play-tab="events"]').click();
    expect(await scroll()).toBeCloseTo(dragged, 0);
    expect(await selected()).toBe(index);
  });

  it("still brings the latest month into view when the calendar advances", async () => {
    const latest = Number(await selected());
    await page.locator(`button[data-ui-log-page-index="${latest - 1}"]`).click();
    await action("debug-shift-month", { delta: "1" });
    expect(await selected()).toBe(String(latest + 1));
    const visible = await page.locator(".event-timeline-marker.is-current").evaluate(element => {
      const marker = element.getBoundingClientRect();
      const track = element.closest(".event-timeline-track")!.getBoundingClientRect();
      return marker.left >= track.left && marker.right <= track.right;
    });
    expect(visible).toBe(true);
  });

  it("shows SAN changes in the month strip and opens a navigable chart", async () => {
    await action("debug-trigger-ending", { eventId: "quit" });
    await action("settle-and-return");
    await startGameFromLobby(page);
    for (const choiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
      await page.locator(`.event-content-buttons [data-event-choice-id="${choiceId}"]`).click();
    }
    await action("debug-adjust-stat", { debugStatId: "san", delta: "-5" });
    await action("force-next-month");
    await action("debug-adjust-stat", { debugStatId: "san", delta: "-4" });
    await action("force-next-month");

    const markerCount = await page.locator(".event-timeline-marker").count();
    expect(markerCount).toBe(4);
    expect(await page.locator(".event-timeline-san-segment").count()).toBe(markerCount - 1);
    expect(await page.locator(".event-timeline-node").evaluateAll((nodes) => (
      new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size > 1
    ))).toBe(true);

    const panelHeight = await page.locator("#event-log-panel").evaluate((element) => (element as HTMLElement).offsetHeight);
    await page.locator("[data-ui-san-chart-toggle]").click();
    expect(await page.locator(".san-chart-point").count()).toBe(markerCount);
    expect(await page.locator("#event-log-panel").evaluate((element) => (element as HTMLElement).offsetHeight)).toBe(panelHeight);
    await page.locator('.san-chart-point[data-ui-log-page-index="1"]').click();
    expect(await page.locator("#event-log-panel").getAttribute("data-log-page-index")).toBe("1");
    expect(await page.locator("[data-ui-san-chart-toggle]").getAttribute("aria-expanded")).toBe("true");

    await page.setViewportSize({ width: 390, height: 844 });
    const chartBounds = await page.locator(".san-chart-panel").boundingBox();
    expect(chartBounds).not.toBeNull();
    expect(chartBounds!.x).toBeGreaterThanOrEqual(0);
    expect(chartBounds!.x + chartBounds!.width).toBeLessThanOrEqual(391);
    await page.locator("[data-ui-san-chart-toggle]").click();
    expect(await page.locator(".san-chart-panel").count()).toBe(0);
  }, 30_000);

  it("keeps the SAN line connected after the blind-review debug jump", async () => {
    await action("debug-trigger-event", { eventId: "thesis-progress" });
    const markers = await page.locator(".event-timeline-marker").count();
    expect(markers).toBeGreaterThan(20);
    expect(await page.locator(".event-timeline-san-segment").count()).toBe(markers - 1);
    await page.locator(".event-timeline-track").screenshot({ path: "artifacts/timeline/strip-blind-review.png", animations: "disabled" });
    await page.locator("[data-ui-san-chart-toggle]").click();
    expect(await page.locator(".san-chart-point").count()).toBe(markers);
    expect(await page.locator(".san-chart-line").getAttribute("d")).toMatch(/L[\d.]+ [\d.]+/u);
  });

  it("fits every recorded SAN month into a long-career chart with sparse axis labels", async () => {
    await action("debug-trigger-ending", { eventId: "quit" });
    await action("settle-and-return");
    await startGameFromLobby(page);
    for (const choiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
      await page.locator(`.event-content-buttons [data-event-choice-id="${choiceId}"]`).click();
    }
    for (let month = 0; month < 60; month += 1) {
      if (month === 15 || month === 30 || month === 45) {
        await action("debug-adjust-stat", { debugStatId: "san", delta: "-4" });
      }
      await action("force-next-month");
    }

    const monthCount = await page.locator(".event-timeline-marker:not([data-ui-ending-page])").count();
    await page.locator("[data-ui-san-chart-toggle]").click();
    expect(await page.locator(".san-chart-point").count()).toBe(monthCount);
    expect(await page.locator(".san-chart-month:visible").count()).toBeLessThan(monthCount / 3);
    expect(await page.locator(".san-chart-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.locator(".san-chart-line").getAttribute("d")).toMatch(/L[\d.]+ [\d.]+/u);

    const firstPoint = page.locator('.san-chart-point[data-ui-log-page-index="0"]');
    const lastPoint = page.locator(`.san-chart-point[data-ui-log-page-index="${monthCount - 1}"]`);
    expect(await firstPoint.isVisible()).toBe(true);
    expect(await lastPoint.isVisible()).toBe(true);
    await firstPoint.click();
    expect(await page.locator("#event-log-panel").getAttribute("data-log-page-index")).toBe("0");
    await lastPoint.click();
    expect(await page.locator("#event-log-panel").getAttribute("data-log-page-index")).toBe(String(monthCount - 1));
    await page.mouse.move(0, 0);
    await page.locator(".san-chart-panel").screenshot({ path: "artifacts/timeline/san-career.png", animations: "disabled" });

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator(".san-chart-month:visible").count()).toBeLessThanOrEqual(4);
    expect(await page.locator(".san-chart-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.locator(".play-help-toggle").isVisible()).toBe(false);
    await page.mouse.move(0, 0);
    await page.locator(".san-chart-panel").screenshot({ path: "artifacts/timeline/san-career-narrow.png", animations: "disabled" });
  }, 60_000);
});
