import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { getRoleOptions } from "../src/core/v2-progression";
import { isRoleTalentImplemented } from "../src/core/v2-role-talent-definitions";
import { getStartTalentReminderPoints } from "../src/app/v2-start-talent-reminder";
import type { createStore } from "../src/core/v2-store";

type ReminderWindow = Window & { reminderStore: ReturnType<typeof createStore> };

describe("unallocated talent reminder", () => {
  it("checks the frozen allocation for continuing runs and skips finished or passive talent roles", () => {
    const account = createDefaultAccountProfile();
    expect(getStartTalentReminderPoints(account, "normal", false)).toBe(10);
    expect(getStartTalentReminderPoints(account, "normal", true)).toBeNull();
    for (const role of getRoleOptions().filter(role => !isRoleTalentImplemented(role.id))) {
      expect(getStartTalentReminderPoints(account, role.id, false)).toBeNull();
    }
    account.talentAllocation = { normal: { "first-month-drive": 1 } };
    expect(getStartTalentReminderPoints(account, "normal", false)).toBeNull();
    expect(getStartTalentReminderPoints(account, "normal", true, { phase: "playing", levels: {} })).toBe(10);
    expect(getStartTalentReminderPoints(account, "normal", true, { phase: "playing", levels: { "first-month-drive": 1 } })).toBeNull();
    expect(getStartTalentReminderPoints(account, "normal", true, { phase: "finished", levels: {} })).toBeNull();
  });

  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", cacheDir: "node_modules/.vite-talent-reminder",
      server: { host: "127.0.0.1", port: 0, watch: null, hmr: false },
      plugins: [{ name: "talent-reminder-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); window.reminderStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([390, 1440])("offers allocation or an explicit start without counting the reminder as a run at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const base = server.resolvedUrls!.local[0]!;
    const origin = new URL(base).origin;
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.locator('[data-action="start-game"]').click();
      const dialog = page.getByRole("dialog", { name: "别忘了点亮天赋" });
      await dialog.waitFor();
      expect(await dialog.textContent()).toContain("10 点");
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getLobbyState().roleProgress.normal.startedRuns)).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-talent-reminder-initial-focus"))).toBe(true);
      const bounds = await dialog.locator(".game-confirm-dialog").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: `artifacts/start-talent-reminder-${width}.png` });
      await page.getByRole("button", { name: "去加点", exact: true }).click();
      expect(await dialog.count()).toBe(0);
      expect(await page.evaluate(() => document.activeElement?.classList.contains("lobby-talent-tree-node"))).toBe(true);
      await page.locator('[data-action="start-game"]').click();
      await page.keyboard.press("Escape");
      expect(await dialog.count()).toBe(0);
      await page.locator('[data-action="start-game"]').click();
      await page.getByRole("button", { name: "仍然开始", exact: true }).click();
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getState().phase)).toBe("playing");
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getLobbyState().roleProgress.normal.startedRuns)).toBe(1);
      await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.flushSaves());
      await page.reload();
      await page.locator('[data-action="start-game"]').click();
      await dialog.waitFor();
      expect(await dialog.textContent()).toContain("本局还没有加点");
      await page.getByRole("button", { name: "仍然继续", exact: true }).click();
      expect(await dialog.count()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getState().phase)).toBe("playing");
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getLobbyState().roleProgress.normal.startedRuns)).toBe(1);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);

  it("retires a continuing unallocated run once before returning to the talent tree", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 960 } });
    const base = server.resolvedUrls!.local[0]!;
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.locator('[data-action="start-game"]').click();
      await page.getByRole("button", { name: "仍然开始", exact: true }).click();
      await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.dispatch("reset-game"));
      await page.locator('[data-action="start-game"]').click();
      await page.getByRole("button", { name: "重开加点", exact: true }).click();
      await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.whenIdle());
      const result = await page.evaluate(() => {
        const store = (window as unknown as ReminderWindow).reminderStore;
        return { phase: store.getState().phase, saved: store.hasRoleSave("normal"),
          starts: store.getLobbyState().roleProgress.normal.startedRuns,
          quitRewarded: store.getLobbyState().achievementRewardedIds?.includes("global:ending-quit") };
      });
      expect(result).toEqual({ phase: "setup", saved: false, starts: 1, quitRewarded: true });
      expect(await page.evaluate(() => document.activeElement?.classList.contains("lobby-talent-tree-node"))).toBe(true);
      await page.locator('[data-talent-id="first-month-drive"]').click();
      await page.locator('[data-action="start-game"]').click();
      expect(await page.locator(".talent-start-reminder").count()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getLobbyState().roleProgress.normal.startedRuns)).toBe(2);
    } finally { await page.close(); }
  }, 30_000);

  it("starts directly after the player allocates a point", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const base = server.resolvedUrls!.local[0]!;
    await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    try {
      await page.goto(base);
      await page.locator('[data-talent-id="first-month-drive"]').click();
      await page.locator('[data-action="start-game"]').click();
      expect(await page.locator(".talent-start-reminder").count()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as ReminderWindow).reminderStore.getState().phase)).toBe("playing");
    } finally { await page.close(); }
  }, 30_000);
});
