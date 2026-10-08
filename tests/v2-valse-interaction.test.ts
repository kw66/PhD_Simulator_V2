import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const fixture = `<!doctype html><html><body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;

describe("VALSE pending event through real bootstrap handlers", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function action(actionId: string, extra: Record<string, string> = {}) {
    await page.evaluate(({ actionId, extra }) => {
      const button = document.createElement("button");
      Object.assign(button.dataset, { action: actionId, ...extra });
      document.querySelector("#app")!.append(button);
      button.click();
      button.remove();
    }, { actionId, extra });
  }

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route("**/__valse_test__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__valse_test__`);
    await page.waitForSelector("[data-action='start-game']");
    await action("start-game", { roleId: "normal" });
    await action("debug-shift-month", { delta: "33" });
    await action("debug-adjust-stat", { debugStatId: "money", delta: "20" });
    await action("debug-trigger-event", { eventId: "ccig" });
    await page.locator('[data-ui-open-event-id="ccig-y3-m9"]').click();
  });

  afterEach(async () => { await page?.close(); });

  it.each([0, 1])("keeps Continue on the pending chain after shifting %i months instead of opening completed history", async (delta) => {
    const content = page.locator("#event-content-body");
    expect(await content.textContent()).toContain("VALSE 2026");
    expect(await content.textContent()).toContain("武汉");
    if (delta) await action("debug-shift-month", { delta: String(delta) });
    await page.locator('#event-content-buttons button[data-action="resolve-event"]').filter({ hasText: "继续" }).click();
    const choices = page.locator("#event-content-buttons");
    expect(await choices.textContent()).toContain("自费参会");
    expect(await choices.textContent()).toContain("请导师报销");
    expect(await choices.locator('[aria-label="已选择"]').count()).toBe(0);
    const selfPay = choices.locator('button[data-action="resolve-event"]').filter({ hasText: "自费参会" });
    expect(await selfPay.isEnabled()).toBe(true);
    expect(await selfPay.getAttribute("data-event-id")).toBe("ccig-decision-act2-y3-m9");
    await selfPay.click();
    expect(await content.textContent()).toContain("VALSE 2026");
    expect(await content.textContent()).toContain("武汉");
    const confirm = choices.locator('button[data-action="resolve-event"]').filter({ hasText: "确定" });
    expect(await confirm.isEnabled()).toBe(true);
    expect(await confirm.getAttribute("data-event-id")).toBe("ccig-attend-result-y3-m9-self");
    expect(await page.locator('[data-ui-open-event-history-id^="ccig-"]').count()).toBe(0);
    await confirm.click();
    expect(await page.locator('[data-ui-open-event-history-id^="ccig-"]').count()).toBe(1);
  }, 20_000);
});
