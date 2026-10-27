import { mkdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

describe("replay guide and aggregate play counts", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", define: { __LOCAL_PLAYGROUND__: false },
      server: { host: "127.0.0.1", port: 0, hmr: false }, plugins: [{ name: "mock-production-replay-stats", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-official-replay-stats.ts")) return code
          .replace("options.enabled ?? import.meta.env.PROD", "options.enabled ?? true")
          .replace("options.writeEnabled ?? isRemoteWriteEnabled()", "options.writeEnabled ?? true");
      } }],
    });
    await server.listen(); browser = await chromium.launch();
    await mkdir("artifacts/replay-guide", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([390, 1440])("shows compact routes and counts only successful official opens at %s px", async width => {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const id = "official-normal-phd-10";
    const requests: { name: string; body: unknown }[] = [];
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*.supabase.co/**", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
      requests.push({ name, body: route.request().postDataJSON() });
      return route.fulfill({ json: name.startsWith("get_") ? { [id]: 12 } : 13 });
    });
    try {
      await page.goto(`${server.resolvedUrls!.local[0]}?replay=official`, { waitUntil: "domcontentloaded" });
      await page.locator(`[data-replay-plays="${id}"]`).getByText("播放 12", { exact: true }).waitFor();
      expect(await page.locator("h1").textContent()).toBe("录像与攻略");
      expect(await page.locator('[data-replay-route="phd-20"]').count()).toBe(0);
      expect(await page.locator('.replay-source-tabs a').allTextContents()).toEqual(["官方录像攻略", "玩家录像"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `artifacts/replay-guide/official-${width}.png`, fullPage: true });
      expect(requests).toHaveLength(1);
      await page.locator(`[data-replay-open="${id}"]`).click();
      await page.locator("[data-replay-seek]").waitFor();
      await page.locator('[data-replay-play][aria-label="暂停"]').waitFor();
      await page.waitForFunction(() => Number(document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value) > 1);
      await expect.poll(() => requests.filter(r => r.name.startsWith("record_")).length).toBe(1);
      expect(requests.at(-1)?.body).toEqual({ p_replay_id: id });
      await page.locator("[data-replay-library]").click();
      await page.locator(`[data-replay-plays="${id}"]`).getByText("播放 13", { exact: true }).waitFor();
      await page.locator(`[data-replay-open="${id}"]`).click();
      await page.locator("[data-replay-seek]").waitFor();
      await page.locator("[data-replay-library]").click();
      expect(requests.filter(r => r.name.startsWith("record_"))).toHaveLength(1);
      await page.locator('.replay-source-tabs a[href*="library"]').click();
      await page.locator("[data-replay-import]").waitFor();
      expect(await page.locator('.replay-source-tabs [aria-current="page"]').textContent()).toBe("玩家录像");
      expect(requests).toHaveLength(2);
      await page.screenshot({ path: `artifacts/replay-guide/player-${width}.png`, fullPage: true });
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 40_000);
});
