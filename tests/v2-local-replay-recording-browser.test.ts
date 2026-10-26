import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { startGameFromLobby } from "./helpers/v2-start-game";
import type { createStore } from "../src/core/v2-store";
import { readFile, mkdir } from "node:fs/promises";
import { parseReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";

type RecordingWindow = Window & { recordingStore: ReturnType<typeof createStore> };
describe("real game local recording integration", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-replay-recording",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
      plugins: [{ name: "recording-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) return code.replace("const store = createStore();", "const store = createStore(); window.recordingStore = store;");
      } }],
    });
    await server.listen(); browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });
  it("downloads from the ending page without automatic archives and plays the downloaded file", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 1040 } });
    const page = await context.newPage();
    const base = server.resolvedUrls!.local[0]!;
    const origin = new URL(base).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(base);
      await startGameFromLobby(page);
      for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
        await page.locator(`[data-event-choice-id="${id}"]:visible`).click();
      }
      await page.locator('[data-ui-play-tab="settings"]').click();
      expect(await page.locator('.settings-sections > button').first().getAttribute("data-action")).toBe("reset-game");
      expect(await page.locator('.settings-sections [data-ui-download-replay], .settings-sections [data-ui-open-local-replays]').count()).toBe(0);
      const viewer = await context.newPage();
      await viewer.goto(`${base}?replay=library`);
      await viewer.waitForSelector('.replay-empty');
      expect(await viewer.locator('[data-replay-card]').count()).toBe(0);
      await page.locator('[data-action="quit-game"]').click();
      await page.locator('[data-ui-confirm-quit]').click();
      const finalDownload = page.waitForEvent("download");
      expect(await page.locator('.ending-actions [data-ui-download-replay]').textContent()).toContain('下载本局回放');
      await page.locator('.ending-actions [data-ui-download-replay]').click();
      const finishedFile = await finalDownload;
      const text = await readFile((await finishedFile.path())!, "utf8");
      expect((await verifyReplayRecording(parseReplayRecording(text))).ending).toBe("quit");
      await mkdir("artifacts/local-replay", { recursive: true });
      await page.screenshot({ path: "artifacts/local-replay/download-ending-mobile.png", fullPage: true });
      await page.locator('[data-action="settle-and-return"]').click();
      await page.waitForFunction(() => (window as unknown as RecordingWindow).recordingStore.getState().phase === "setup");
      expect(await page.evaluate(() => (window as unknown as RecordingWindow).recordingStore.hasRoleSave("normal"))).toBe(false);
      const libraryLink = page.locator('.lobby-profile-action-group a[href="?replay=official"]');
      expect(await libraryLink.count()).toBe(1);
      expect(await libraryLink.textContent()).toContain("录像与攻略");
      const legacyLink = page.locator('.lobby-project-links a[href="https://kw66.github.io/PhD_Simulator/"]');
      expect(await legacyLink.count()).toBe(1);
      expect(await legacyLink.textContent()).toContain("旧版 v1.0");
      await viewer.goto(new URL((await libraryLink.getAttribute("href"))!, base).href);
      await viewer.locator('.replay-source-tabs a[href*="library"]').click();
      await viewer.waitForSelector('.replay-empty');
      await viewer.locator('[data-replay-file]').setInputFiles({ name: finishedFile.suggestedFilename(), mimeType: "application/json", buffer: Buffer.from(text) });
      await viewer.waitForSelector('[data-replay-card]');
      expect(await viewer.locator('[data-replay-card]').count()).toBe(1);
      expect(await viewer.locator('[data-replay-card]').textContent()).toContain("主动退学");
      await viewer.locator('[data-replay-open]').click();
      await viewer.waitForSelector('[data-replay-seek]');
      const last = await viewer.locator('[data-replay-seek]').getAttribute("max");
      await viewer.locator('[data-replay-seek]').fill(last!);
      await viewer.locator('[data-replay-seek]').dispatchEvent("change");
      await viewer.waitForSelector('.play-page[data-phase="finished"]');
      expect(await viewer.locator('.replay-message.is-error').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 45_000);
});
