import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { STATISTICS_MAX_BATCH_BYTES } from "../src/app/v2-statistics-client";

describe("long-run statistics through the browser Fetch transport", () => {
  let server: ViteDevServer;
  let browser: Browser;
  const requests: Array<{ bytes: number; records: Array<{ kind: string; payload: Record<string, unknown> }> }> = [];
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 }, plugins: [{
      name: "statistics-size-fixture",
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-statistics-client.ts")) {
          return code.replace(/const RPC_URL = "[^"]+";/, 'const RPC_URL = "/__size_statistics";');
        }
      },
      configureServer(dev) {
        dev.middlewares.use((req, res, next) => {
          if (req.url === "/__size_fixture") { res.setHeader("Content-Type", "text/html"); res.end("<!doctype html><title>Statistics transport fixture</title>"); return; }
          if (!req.url?.startsWith("/__size_statistics/")) { next(); return; }
          const chunks: Buffer[] = [];
          req.on("data", chunk => chunks.push(Buffer.from(chunk)));
          req.on("end", () => {
            const body = Buffer.concat(chunks);
            const records = JSON.parse(body.toString("utf8")).p_records ?? [];
            requests.push({ bytes: body.byteLength, records });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(records.map((row: { payload: { p_id: string } }) => row.payload.p_id)));
          });
        });
      },
    }] });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("delivers more than 64 KiB of finalized evidence in small keepalive requests, including successful endings", async () => {
    const page = await browser.newPage();
    await page.goto(`${server.resolvedUrls!.local[0]}__size_fixture`);
    try {
      const outcome = await page.evaluate(async () => {
        const load = new Function("path", "return import(path)");
        const { createStatisticsClient } = await load("/src/app/v2-statistics-client.ts");
        // Exercise the native browser body limit while it behaves as a hidden page.
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        let oldTransportRejected = false;
        try { await fetch("/__size_statistics/oversized", { method: "POST", keepalive: true, body: "x".repeat(70_000) }); }
        catch { oldTransportRejected = true; }
        const client = createStatisticsClient({ uploadEnabled: true });
        const run = '[901,"normal"]';
        const finalizedRunId = crypto.randomUUID();
        const context = { version: 1, roleId: "normal", runKey: run, paperId: "paper", totalMonths: 65,
          scores: Object.fromEntries(["idea", "experiment", "writing"].map(key => [key, { own: 40, collaboration: 0, total: 40 }])),
          note: "论文".repeat(2200) };
        for (let index = 0; index < 8; index++) client.enqueue("conference", run, `paper-${index}`, {
          p_rule_version: "v2-review-20261009", p_conference_name: "CVPR", p_conference_year: 2026, p_target: "A",
          p_accepted: true, p_accept_type: "Poster", p_score: 120, p_context: context,
        }, finalizedRunId);
        client.enqueue("thesis", run, "phd", { p_rule_version: "v2-thesis-20261013", p_degree: "phd",
          p_submitted: true, p_passed: true, p_excellent: true }, finalizedRunId);
        const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
        client.enqueue("activity", run, "finish", { p_event: "finish", p_day: day,
          p_run_key: run, p_role_id: "normal", p_ending: "phd", p_total_months: 70, p_degree: "phd" }, finalizedRunId);
        for (let batch = 0; batch < 5; batch++) {
          await client.flush();
          const now = Date.now; Date.now = () => now() + 31_000;
        }
        const saved = JSON.parse(localStorage.getItem("phd_simulator_v2_statistics_v2") ?? "{}");
        client.dispose();
        return { oldTransportRejected, pending: saved.results.filter(([, row]: [string, { payload?: unknown }]) => row.payload).length };
      });
      expect(outcome).toEqual({ oldTransportRejected: true, pending: 0 });
      expect(requests.length).toBeGreaterThan(1);
      expect(requests.reduce((sum, request) => sum + request.bytes, 0)).toBeGreaterThan(65_536);
      expect(requests.every(request => request.bytes <= STATISTICS_MAX_BATCH_BYTES)).toBe(true);
      const records = requests.flatMap(request => request.records);
      expect(records).toHaveLength(10);
      expect(new Set(records.map(row => row.payload.p_id)).size).toBe(10);
      expect(records.find(row => row.kind === "thesis")?.payload).toMatchObject({ p_passed: true, p_excellent: true });
      expect(records.find(row => row.kind === "activity")?.payload).toMatchObject({ p_ending: "phd", p_total_months: 70, p_degree: "phd" });
      expect(new Set(records.map(row => row.payload.p_finalized_run_id)).size).toBe(1);
    } finally { await page.close(); }
  }, 20_000);
});
