import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

describe("local startup with unavailable remote fonts", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      logLevel: "error",
      cacheDir: "node_modules/.vite-startup-test",
      define: { __LOCAL_PLAYGROUND__: false },
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("renders the lobby before font CSS responds and applies it when available", async () => {
    const page = await browser.newPage();
    const origin = new URL(server.resolvedUrls!.local[0]!).origin;
    let releaseFont!: () => void;
    const fontGate = new Promise<void>(resolve => { releaseFont = resolve; });
    let fontRequested = false;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.hostname === "fonts.googleapis.com") {
        fontRequested = true;
        await fontGate;
        return route.fulfill({ contentType: "text/css", body: ":root { --startup-font-loaded: yes; }" });
      }
      return route.abort();
    });
    try {
      await page.goto(`${origin}/?start=setup`, { waitUntil: "commit" });
      await page.locator(".lobby-start-button").first().waitFor({ state: "visible", timeout: 20_000 });
      expect(fontRequested).toBe(true);
      expect(await page.locator("body").evaluate(element => getComputedStyle(element).fontFamily)).toContain("sans-serif");
      expect(errors).toEqual([]);
      releaseFont();
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--startup-font-loaded").trim())).toBe("yes");
    } finally {
      releaseFont();
      await page.close();
    }
  }, 30_000);
});
