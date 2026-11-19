import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import { ACCOUNT_STORAGE_KEY, loadAccountProfile } from "../src/core/v2-account-storage";
import { RUN_SAVE_DATABASE_NAME, type RunSaveRecord } from "../src/core/v2-run-saves";
import { startGameFromLobby } from "./helpers/v2-start-game";

// Inspect persisted output only: the production bundle is neither transformed nor
// given a test-only store handle, and no source modules are imported in the browser.
async function savedRun(page: Page): Promise<RunSaveRecord | undefined> {
  return page.evaluate(async databaseName => {
    const request = indexedDB.open(databaseName);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const read = db.transaction("runs", "readonly").objectStore("runs").get("normal");
      return await new Promise<RunSaveRecord | undefined>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally { db.close(); }
  }, RUN_SAVE_DATABASE_NAME);
}

async function account(page: Page) {
  const raw = await page.evaluate(key => localStorage.getItem(key), ACCOUNT_STORAGE_KEY);
  return loadAccountProfile({ getItem: key => key === ACCOUNT_STORAGE_KEY ? raw : null, setItem() {} });
}

describe("public test mode in the production build", () => {
  let output: string;
  let server: PreviewServer;
  let browser: Browser;
  let url: string;
  beforeAll(async () => {
    output = await mkdtemp(join(tmpdir(), "v2-public-test-mode-"));
    await build({ base: "/", mode: "production", logLevel: "error", build: { outDir: output, emptyOutDir: true } });
    server = await preview({ base: "/", mode: "production", logLevel: "error", build: { outDir: output },
      preview: { host: "127.0.0.1", port: 0, open: false } });
    url = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
    if (output) await rm(output, { recursive: true, force: true });
  });

  it("confirms before opening, runs the actual popup and preserves reward exclusion after reload", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const origin = new URL(url).origin;
    const errors: string[] = [];
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    try {
      await page.goto(url);
      expect(await page.locator("[data-local-playground]").count()).toBe(0);
      await startGameFromLobby(page);
      await page.locator('[data-ui-play-tab="settings"]').click();
      const opener = page.locator('[data-ui-open-debug-window]');
      expect(await opener.isVisible()).toBe(true);
      expect(await opener.textContent()).toContain("测试模式");
      await expect.poll(async () => (await savedRun(page))?.debugUsed).toBe(false);

      const before = await savedRun(page);
      const nativeDialogs: string[] = [];
      page.on("dialog", async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
      await opener.click();
      const confirmation = page.locator('[data-test-mode-dialog]');
      expect(await confirmation.textContent()).toContain("当前存档将失去正常结算资格");
      expect(await confirmation.textContent()).toContain("经验、成就和后续统计");
      await confirmation.getByRole("button", { name: "取消", exact: true }).click();
      expect(context.pages()).toHaveLength(1);
      expect((await savedRun(page))?.debugUsed).toBe(false);

      await opener.click();
      const [popup] = await Promise.all([page.waitForEvent("popup"), page.locator('[data-test-mode-confirm]').click()]);
      expect(await confirmation.count()).toBe(0);
      expect(nativeDialogs).toEqual([]);
      await expect.poll(() => popup.locator("[data-debug-connection]").textContent()).toBe("已连接主游戏");
      expect(new URL(popup.url()).searchParams.has("debugPanel")).toBe(true);
      await expect.poll(async () => (await savedRun(page))?.debugUsed).toBe(true);
      expect((await savedRun(page))?.latest.state).toEqual(before?.latest.state);
      await mkdir("artifacts/public-test-mode", { recursive: true });
      await page.screenshot({ path: "artifacts/public-test-mode/production-settings.png", fullPage: true, animations: "disabled" });
      await popup.screenshot({ path: "artifacts/public-test-mode/production-popup.png", fullPage: true, animations: "disabled" });
      await popup.locator('[data-action="debug-adjust-stat"][data-debug-stat-id="money"][data-delta="1"]').click();
      await expect.poll(async () => (await savedRun(page))?.latest.state.player.money).toBe(before!.latest.state.player.money + 1);

      // Restore through the normal lobby and open the production tools again.
      await popup.close();
      await page.reload();
      await startGameFromLobby(page);
      await expect.poll(async () => (await savedRun(page))?.debugUsed).toBe(true);
      expect((await savedRun(page))?.latest.state.player.money).toBe(before!.latest.state.player.money + 1);
      await page.locator('[data-ui-play-tab="settings"]').click();
      const [resumedPopup] = await Promise.all([
        page.waitForEvent("popup"), page.locator('[data-ui-open-debug-window]').click(),
      ]);
      await expect.poll(() => resumedPopup.locator("[data-debug-connection]").textContent()).toBe("已连接主游戏");
      await resumedPopup.locator('[data-action="debug-trigger-ending"][data-event-id="phd"]').click();
      await expect.poll(async () => (await savedRun(page))?.latest.state.phase).toBe("finished");
      await expect.poll(() => page.locator(".ending-experience").textContent()).toContain("不结算成就、经验及后续统计");
      await page.locator('[data-action="settle-and-return"]').click();
      await page.locator('[data-action="start-game"]').waitFor();
      const settled = await account(page);
      expect(settled.account.roleProgress.normal.exp).toBe(0);
      expect(settled.account.roleProgress.normal.playedRuns).toBe(0);
      expect(settled.account.achievementRewardedIds).toEqual([]);
      expect(settled.finalizedOutbox).toEqual([]);
      await expect.poll(async () => (await savedRun(page))?.runId).toBeUndefined();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, 60_000);

  it.each([320, 390, 1440])("matches feedback styling and cancels safely at %spx", async width => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    const origin = new URL(url).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const nativeDialogs: string[] = [];
    page.on("dialog", async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
    try {
      await page.goto(url);
      await startGameFromLobby(page);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await expect.poll(async () => (await savedRun(page))?.debugUsed).toBe(false);
      await page.locator('[data-ui-open-feedback]').click();
      const style = await page.locator('.community-feedback-dialog').evaluate(node => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, border: css.border, shadow: css.boxShadow, radius: css.borderRadius };
      });
      await page.keyboard.press('Escape');
      const opener = page.locator('[data-ui-open-debug-window]');
      await opener.click();
      const dialog = page.locator('[data-test-mode-dialog]');
      const actual = await dialog.locator('.game-confirm-dialog').evaluate(node => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, border: css.border, shadow: css.boxShadow, radius: css.borderRadius };
      });
      expect(actual).toEqual(style);
      expect(await page.locator('#app').evaluate(node => (node as HTMLElement).inert)).toBe(true);
      for (let index = 0; index < 5; index++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-test-mode-dialog]')))).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const box = await dialog.locator('.game-confirm-dialog').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await mkdir('artifacts/public-test-mode', { recursive: true });
      await page.screenshot({ path: `artifacts/public-test-mode/confirmation-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      expect(await dialog.count()).toBe(0);
      expect(await opener.evaluate(node => node === document.activeElement)).toBe(true);
      await opener.click();
      await page.locator('[data-test-mode-cancel].game-confirm-backdrop').click({ position: { x: 2, y: 2 } });
      expect(await dialog.count()).toBe(0);
      expect(await page.locator('#app').evaluate(node => (node as HTMLElement).inert)).toBe(false);
      expect((await savedRun(page))?.debugUsed).toBe(false);
      expect(context.pages()).toHaveLength(1);
      expect(nativeDialogs).toEqual([]);
    } finally { await context.close(); }
  }, 30_000);

  it("keeps the save eligible when the confirmed popup is blocked", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const origin = new URL(url).origin;
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    try {
      await page.goto(url);
      await startGameFromLobby(page);
      await page.locator('[data-ui-play-tab="settings"]').click();
      await expect.poll(async () => (await savedRun(page))?.debugUsed).toBe(false);
      await page.evaluate(() => { window.open = () => null; });
      const dialogs: string[] = [];
      page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
      await page.locator('[data-ui-open-debug-window]').click();
      await page.locator('[data-test-mode-confirm]').click();
      expect(await page.locator('[data-test-mode-dialog]').textContent()).toContain("当前存档未因此失效");
      expect(dialogs).toEqual([]);
      expect((await savedRun(page))?.debugUsed).toBe(false);
      expect(context.pages()).toHaveLength(1);
    } finally { await context.close(); }
  }, 30_000);
});
