import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";

declare global {
  interface Window {
    announcementHarness: {
      render: (page: number) => void;
      bind: () => void;
      dispose: () => void;
    };
  }
}

const fixture = `<!doctype html><html><head><style>
  body { margin: 0; font: 16px/20px sans-serif; }
  .announcement-body { max-height: 320px; overflow: hidden; }
  [data-announcement-expanded="true"] .announcement-body { max-height: none; }
  .announcement-toggle[hidden] { display: none; }
  .announcement-changes { margin: 0; padding: 0; list-style: none; }
  .announcement-changes li { padding: 8px 0; }
  .announcement-changes p { margin: 0; overflow-wrap: anywhere; }
</style></head><body><main id="test-root"></main><script type="module">
  import { renderAnnouncementPage, bindAnnouncementCollapse } from '/src/app/v2-render-announcements.ts';
  const root = document.getElementById('test-root');
  let dispose = () => {};
  window.announcementHarness = {
    render(page) {
      root.innerHTML = renderAnnouncementPage(page);
      this.bind();
    },
    bind() { dispose = bindAnnouncementCollapse(root); },
    dispose() { dispose(); },
  };
  window.announcementHarness.render(0);
</script></body></html>`;

describe("announcement overflow controls", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.route("**/__announcement_test__", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__announcement_test__`);
    await page.waitForFunction(() => Boolean(window.announcementHarness));
  });

  afterEach(async () => {
    await page?.close();
  });

  const expanded = () => page.locator(".announcement-card").getAttribute("data-announcement-expanded");
  const toggle = () => page.locator("[data-announcement-toggle]");

  it("shows a toggle only when measured content exceeds the collapsed height", async () => {
    for (const height of [20, 320, 321]) {
      await page.locator(".announcement-changes").evaluate((element, contentHeight) => {
        element.innerHTML = `<li style="height:${contentHeight}px;padding:0">公告</li>`;
        window.announcementHarness.bind();
      }, height);
      expect(await toggle().isVisible()).toBe(height > 320);
      expect(await expanded()).toBe("false");
    }
  });

  it("expands the full announcement and supports keyboard collapse with accessible state", async () => {
    const body = page.locator("[data-announcement-body]");
    expect(await body.evaluate((element) => element.clientHeight)).toBe(320);
    expect(await toggle().getAttribute("aria-controls")).toBe(await body.getAttribute("id"));
    await toggle().focus();
    await page.keyboard.press("Enter");
    expect(await expanded()).toBe("true");
    expect(await toggle().getAttribute("aria-expanded")).toBe("true");
    expect(await toggle().textContent()).toBe("收起");
    expect(await body.evaluate((element) => element.clientHeight)).toBeGreaterThan(320);
    await page.keyboard.press("Space");
    expect(await expanded()).toBe("false");
    expect(await toggle().getAttribute("aria-expanded")).toBe("false");
    expect(await toggle().textContent()).toBe("展开");
    expect(await body.evaluate((element) => element.clientHeight)).toBe(320);
  });

  it("retains independent date choices across page changes and full rerenders without duplicate listeners", async () => {
    await toggle().click();
    await page.evaluate(() => window.announcementHarness.render(1));
    expect(await expanded()).toBe("false");
    await page.evaluate(() => window.announcementHarness.render(0));
    expect(await expanded()).toBe("true");
    await page.evaluate(() => {
      window.announcementHarness.render(0);
      window.announcementHarness.bind();
      window.announcementHarness.bind();
    });
    await toggle().click();
    expect(await expanded()).toBe("false");
    await page.evaluate(() => window.announcementHarness.render(0));
    expect(await expanded()).toBe("false");
  });

  it("remeasures wrapping on resize and keeps the expansion preference when content temporarily fits", async () => {
    await page.locator(".announcement-changes").evaluate((element) => {
      element.innerHTML = `<li>${"An announcement with text that wraps. ".repeat(20)}</li>`;
      window.announcementHarness.bind();
    });
    await toggle().click();
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect.poll(() => toggle().isVisible()).toBe(false);
    expect(await expanded()).toBe("false");
    await page.setViewportSize({ width: 320, height: 800 });
    await expect.poll(expanded).toBe("true");
    expect(await toggle().isVisible()).toBe(true);
  });

  it("observes content growth and measures cards after their hidden container becomes visible", async () => {
    await page.locator(".announcement-changes").evaluate((element) => {
      element.innerHTML = "<li>简短公告</li>";
    });
    await expect.poll(() => toggle().isVisible()).toBe(false);
    await page.locator("#test-root").evaluate((root) => {
      (root as HTMLElement).style.display = "none";
      window.announcementHarness.render(0);
    });
    expect(await toggle().getAttribute("hidden")).toBe("");
    await page.locator("#test-root").evaluate((root) => {
      (root as HTMLElement).style.display = "block";
    });
    await expect.poll(() => toggle().isVisible()).toBe(true);
    expect(await expanded()).toBe("false");
  });

  it("disposes listeners while preserving state for a later binding", async () => {
    await toggle().click();
    await page.evaluate(() => window.announcementHarness.dispose());
    await toggle().click();
    expect(await expanded()).toBe("true");
    await page.evaluate(() => window.announcementHarness.render(0));
    expect(await expanded()).toBe("true");
    await toggle().click();
    expect(await expanded()).toBe("false");
  });
});
