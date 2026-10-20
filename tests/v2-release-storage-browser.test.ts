import { startGameFromLobby } from "./helpers/v2-start-game";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, webkit, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { RoleId } from "../src/core/v2-types";

const roles: RoleId[] = ["normal", "rich", "genius", "social", "teacher-child", "chosen",
  "normal-reversed", "rich-reversed", "genius-reversed", "social-reversed", "teacher-child-reversed", "chosen-reversed"];

// WebKit is an optional local release check; CI installs Chromium only.
for (const engine of [chromium, webkit]) {
  describe.skipIf(!existsSync(engine.executablePath()))(`release storage / ${engine.name()}`, () => {
    let server: ViteDevServer;
    let browser: Browser;
    beforeAll(async () => {
      await mkdir("artifacts/release-storage", { recursive: true });
      server = await createServer({ configFile: false, cacheDir: `node_modules/.vite-release-storage-${engine.name()}`,
        logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
      await server.listen();
      browser = await engine.launch();
    }, 30_000);
    afterAll(async () => { await browser?.close(); await server?.close(); });

    it("persists 12 independent 70-month histories, measures writes and prunes only the rewound role", async () => {
      const page = await browser.newPage();
      const url = server.resolvedUrls!.local[0]!;
      const origin = new URL(url).origin;
      await page.route("**/*", route => {
        const request = route.request();
        if (new URL(request.url()).origin !== origin) return route.abort();
        if (request.isNavigationRequest()) return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Storage stress fixture</title>" });
        return route.continue();
      });
      try {
        await page.goto(url);
        const metrics = await page.evaluate(async roleIds => {
          const load = new Function("path", "return import(path)");
          const saves = await load("/src/core/v2-run-saves.ts");
          const factory = await load("/src/core/v2-engine-state-factory.ts");
          const paperRules = await load("/src/core/v2-paper-rules.ts");
          const replayRules = await load("/src/core/v2-run-replay.ts");
          const errors: string[] = [];
          const repository = saves.createRunSaveRepository({ onError: (error: { message: string }) => errors.push(error.message) });
          await repository.ready();
          const writeMs: number[] = [], commitMs: number[] = [];
          let maxJournalBytes = 0, totalRecordJsonBytes = 0, finalStateJsonBytes = 0;
          for (const roleId of roleIds) {
            const state = factory.createStartedGameState(roleId);
            const replay = replayRules.createRunReplay(factory.createInitialState(), state, { roleId });
            // Synthetic, deliberately dense storage load, not a gameplay reachability claim.
            for (let totalMonths = 0; totalMonths <= 70; totalMonths++) {
              state.totalMonths = totalMonths;
              state.year = 1 + Math.floor(totalMonths / 12);
              state.month = totalMonths % 12;
              state.playerName = `${roleId}-saved`;
              for (let index = 0; index < 40; index++) state.log.push({ id: `${totalMonths}:${index}`, month: totalMonths,
                text: "Storage stress: monthly event, research, relationship and purchase history retained for deterministic saves." });
              for (let index = 0; index < 20; index++) replay.commands.push({ kind: "action", actionId: "read-paper", payload: {} });
              if (totalMonths % 3 === 0) state.papers.push(paperRules.createDraftPaper(totalMonths, state.papers.length, () => 0.4));
              const before = performance.now();
              repository.commit(state, { monthStart: true, replay });
              commitMs.push(performance.now() - before);
              maxJournalBytes = Math.max(maxJournalBytes, new TextEncoder().encode(localStorage.getItem(`${saves.RUN_SAVE_JOURNAL_PREFIX}${roleId}`) ?? "").length);
              const diskStart = performance.now();
              await repository.flush();
              writeMs.push(performance.now() - diskStart);
            }
            const record = repository.get(roleId);
            totalRecordJsonBytes += new TextEncoder().encode(JSON.stringify(record)).length;
            finalStateJsonBytes = Math.max(finalStateJsonBytes, new TextEncoder().encode(JSON.stringify(record.latest.state)).length);
          }
          const summary = (items: number[]) => {
            const sorted = [...items].sort((a, b) => a - b);
            return { median: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
          };
          const estimate = await navigator.storage?.estimate?.();
          return { errors, totalRecordJsonBytes, finalStateJsonBytes, maxJournalBytes, commitMs: summary(commitMs),
            writeMs: summary(writeMs), storageEstimate: estimate, roles: roleIds.length, commandsPerRun: 1421,
            counts: roleIds.map(roleId => repository.get(roleId).months.length) };
        }, roles);
        expect(metrics.errors).toEqual([]);
        expect(metrics.counts).toEqual(roles.map(() => 70));
        await page.reload();
        const restored = await page.evaluate(async roleIds => {
          const load = new Function("path", "return import(path)");
          const saves = await load("/src/core/v2-run-saves.ts");
          const errors: string[] = [];
          const repository = saves.createRunSaveRepository({ onError: (error: { message: string }) => errors.push(error.message) });
          const begin = performance.now();
          await repository.ready();
          const reloadMs = performance.now() - begin;
          const records = roleIds.map(roleId => ({ roleId, name: repository.get(roleId)?.latest.state.playerName,
            month: repository.get(roleId)?.latest.totalMonths, count: repository.get(roleId)?.months.length }));
          const oldRandom = JSON.stringify(repository.get("normal").months.find((month: { totalMonths: number }) => month.totalMonths === 35).state.randomState);
          repository.rewind("normal", "month:35");
          await repository.flush();
          return { errors, reloadMs, records, randomPreserved: oldRandom === JSON.stringify(repository.get("normal").latest.state.randomState) };
        }, roles);
        expect(restored.errors).toEqual([]);
        expect(restored.randomPreserved).toBe(true);
        expect(restored.records).toEqual(roles.map(roleId => ({ roleId, name: `${roleId}-saved`, month: 70, count: 70 })));
        await page.reload();
        const after = await page.evaluate(async roleIds => {
          const load = new Function("path", "return import(path)");
          const saves = await load("/src/core/v2-run-saves.ts");
          const repository = saves.createRunSaveRepository();
          await repository.ready();
          const normal = repository.get("normal");
          const otherCounts = roleIds.filter(id => id !== "normal").map(id => repository.get(id).months.length);
          const request = indexedDB.open(saves.RUN_SAVE_DATABASE_NAME, saves.RUN_SAVE_VERSION);
          const db: IDBDatabase = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
          const tx = db.transaction("months", "readonly");
          const count = tx.objectStore("months").count();
          const persistedMonthCount = await new Promise<number>((resolve, reject) => { count.onsuccess = () => resolve(count.result); count.onerror = () => reject(count.error); });
          db.close();
          return { month: normal.latest.totalMonths, future: normal.months.some((month: { totalMonths: number }) => month.totalMonths > 35),
            otherCounts, persistedMonthCount, replayCommands: normal.replay.commands.length };
        }, roles);
        expect(after.month).toBe(35);
        expect(after.future).toBe(false);
        expect(after.otherCounts).toEqual(Array(11).fill(70));
        expect(after.persistedMonthCount).toBe(35 + 11 * 70);
        expect(after.replayCommands).toBe(721);
        await writeFile(`artifacts/release-storage/${engine.name()}-metrics.json`, JSON.stringify({ ...metrics, restored, after }, null, 2));
      } finally { await page.close(); }
    }, 120_000);

    it("keeps mobile navigation and read-save controls usable without page overflow", async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      const url = server.resolvedUrls!.local[0]!;
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
      try {
        await page.goto(url);
        await startGameFromLobby(page, true);
        for (const id of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
          await page.locator(`[data-event-choice-id="${id}"]:visible`).tap();
        }
        for (const tab of ["workstation", "research", "relationship", "shop", "talent", "events", "settings"]) {
          await page.locator(`[data-ui-play-tab="${tab}"]`).tap();
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
          await page.screenshot({ path: `artifacts/release-storage/${engine.name()}-mobile-${tab}.png`, fullPage: true, animations: "disabled" });
        }
        await page.locator('[data-ui-open-run-saves]:visible').tap();
        expect(await page.locator('.run-save-card').count()).toBeGreaterThan(0);
        await page.locator('[data-ui-play-tab="research"]').tap();
        expect(await page.locator('.run-saves').count()).toBe(0);
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }, 45_000);
  });
}
