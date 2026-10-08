import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
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
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    browser = await chromium.launch();
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
    await page.route("**/__timeline_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__timeline_test__`);
    await page.waitForSelector("[data-action='start-game']");
    await action("start-game", { roleId: "normal" });
    await action("debug-shift-month", { delta: "18" });
    await page.waitForFunction(() => (document.querySelector(".event-timeline-track")?.scrollLeft ?? 0) > 0);
  });

  afterEach(async () => { await page?.close(); });

  const scroll = () => page.locator(".event-timeline-track").evaluate(element => element.scrollLeft);
  const selected = () => page.locator(".event-timeline-marker.is-current").getAttribute("data-ui-log-page-index");

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
});
