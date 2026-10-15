import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

describe("run saves in real browser IndexedDB", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-run-save-test", logLevel: "error",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("restores latest and 70 checkpoints across page reload, atomically prunes a branch and preserves other roles", async () => {
    const page = await browser.newPage();
    const baseUrl = server.resolvedUrls!.local[0]!;
    const origin = new URL(baseUrl).origin;
    await page.route("**/*", async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== origin) { await route.abort(); return; }
      if (request.isNavigationRequest()) { await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Save repository test</title>" }); return; }
      await route.continue();
    });
    await page.goto(baseUrl);
    const written = await page.evaluate(async () => {
      const load = new Function("path", "return import(path)");
      const module = await load("/src/core/v2-run-saves.ts");
      const factory = await load("/src/core/v2-engine-state-factory.ts");
      const repository = module.createRunSaveRepository();
      await repository.ready();
      const initial = factory.createStartedGameState("normal");
      for (let totalMonths = 0; totalMonths <= 70; totalMonths += 1) {
        repository.commit({ ...initial, totalMonths, year: 1 + Math.floor(totalMonths / 12), month: totalMonths % 12 }, { monthStart: true });
      }
      repository.commit({ ...factory.createStartedGameState("rich"), playerName: "保留的角色" }, { monthStart: true });
      await repository.flush();
      return { id: repository.get("normal").runId, months: repository.get("normal").months.length };
    });
    expect(written.months).toBe(70);
    await page.reload();
    const restored = await page.evaluate(async () => {
      const load = new Function("path", "return import(path)");
      const module = await load("/src/core/v2-run-saves.ts");
      const repository = module.createRunSaveRepository();
      await repository.ready();
      const before = repository.get("normal");
      repository.rewind("normal", "month:30");
      await repository.flush();
      return { id: before.runId, before: before.latest.totalMonths, retained: repository.get("normal").months.length };
    });
    expect(restored).toEqual({ id: written.id, before: 70, retained: 30 });
    await page.reload();
    const truncated = await page.evaluate(async () => {
      const load = new Function("path", "return import(path)");
      const module = await load("/src/core/v2-run-saves.ts");
      const repository = module.createRunSaveRepository();
      await repository.ready();
      const normal = repository.get("normal");
      repository.clear("normal");
      await repository.flush();
      const fresh = module.createRunSaveRepository();
      await fresh.ready();
      return { month: normal.latest.totalMonths, future: normal.months.some((snapshot: { totalMonths: number }) => snapshot.totalMonths > 30),
        normalGone: !fresh.get("normal"), richName: fresh.get("rich").latest.state.playerName };
    });
    expect(truncated).toEqual({ month: 30, future: false, normalGone: true, richName: "保留的角色" });
    await page.close();
  }, 30_000);
});
