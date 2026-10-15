import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

describe("responsive score histories", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });
  it("keeps short histories visible, long histories scrollable and restores desktop coordinates", async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    try {
      await page.route("**/__score_mobile__", route => route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:12px"><main id="app" style="max-width:700px"></main><script type="module">
      import '/src/styles/global.css';
      import { renderThesisReviewReports } from '/src/app/v2-render-graduation.ts';
      import { renderJournalAcceptanceEvent } from '/src/app/v2-render-paper-review.ts';
      import { createResponsiveScoreCharts } from '/src/app/v2-responsive-score-charts.ts';
      const root = document.querySelector('#app');
      const thesis = { stage:'overview', degree:'phd', title:'移动端论文', pointScores:[12,24,35], scoreHistory:[{totalMonths:60,pointScores:[12,24,35],title:'移动端论文'}], review:{} };
      const journal = { stage:'timeline', paperTitle:'投稿轨迹', journalName:'PAMI', submissionScore:100, acceptanceScore:150, submissionThreshold:100, acceptanceThreshold:125, scoreHistory:[{totalMonths:1,score:100},{totalMonths:2,score:125},{totalMonths:3,score:150}] };
      root.innerHTML = '<section id="short-thesis">'+renderThesisReviewReports(thesis)+'</section><section id="short-journal">'+renderJournalAcceptanceEvent(journal,'')+'</section><section id="long-journal">'+renderJournalAcceptanceEvent({...journal,scoreHistory:Array.from({length:24},(_,i)=>({totalMonths:i+1,score:100+i*2}))},'')+'</section>';
      createResponsiveScoreCharts(root).sync();
      </script></body></html>` }));
      await page.goto(server.resolvedUrls!.local[0] + "__score_mobile__");
      await page.locator("#short-thesis circle").first().waitFor({ state: "attached" });
      const original = await page.locator("#short-thesis circle").first().getAttribute("cx");
      for (const width of [320, 360, 390, 430, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.locator("#short-thesis svg").evaluate(svg => Number(svg.getAttribute("width")) <= svg.parentElement!.clientWidth)).toBe(true);
        for (const selector of ["#short-thesis", "#short-journal"]) {
          expect(await page.locator(selector).evaluate(section => {
            const container = section.querySelector('[role="region"]')!.getBoundingClientRect();
            return [...section.querySelectorAll('circle')].every(point => {
              const bounds = point.getBoundingClientRect();
              return bounds.x >= container.x && bounds.right <= container.right;
            });
          })).toBe(true);
        }
        expect(await page.locator("#long-journal .journal-chart-scroll").evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        expect(await page.locator("#short-thesis svg text").first().evaluate(element => getComputedStyle(element).fontSize)).toBe("11px");
      }
      await page.locator("#long-journal .journal-chart-scroll").evaluate(element => { element.scrollLeft = element.scrollWidth; });
      expect(await page.locator("#long-journal .journal-chart-scroll").evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      await page.setViewportSize({ width: 1100, height: 900 });
      await expect.poll(() => page.locator("#short-thesis svg").getAttribute("width")).toBe("680");
      expect(Number(await page.locator("#short-thesis circle").first().getAttribute("cx"))).toBe(Number(original));
    } finally { await page.close(); }
  }, 30_000);
});
