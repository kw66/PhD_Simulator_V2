import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<div id="app" style="padding:24px;min-height:1800px">
  <span id="note" class="play-tooltip" role="note" tabindex="0" aria-describedby="existing-description" data-tooltip="每局经验由科研分与经验倍率计算，完成角色成就也会获得经验。" style="display:block;padding:16px">
    <strong id="note-child" aria-hidden="true" data-tooltip="">经验规则</strong>
  </span>
  <div id="bar" role="note" tabindex="0" data-tooltip="经验条的完整提示" style="height:32px;background:#ddd;margin:16px 0"><span id="bar-child" aria-hidden="true">12/20</span></div>
  <span id="title-note" title="标题提示" style="display:block;padding:16px">另一个提示</span>
  <button id="action" type="button" data-tooltip="执行普通操作"><span id="action-child">执行操作</span></button>
  <span id="long-note" data-achievement-id="test" data-card-tooltip data-tooltip="${"完整成就说明。".repeat(300)}" style="display:block;padding:16px">长成就提示</span>
  <div id="outside" style="height:80px;margin-top:20px">空白处</div>
</div>
<script type="module">
import '/src/styles/global.css';
import { createRelationshipTooltips } from '/src/app/v2-relationship-tooltips.ts';
createRelationshipTooltips(document.getElementById('app'));
document.querySelector('#action').addEventListener('click', event => {
  event.currentTarget.dataset.clicks = String(Number(event.currentTarget.dataset.clicks ?? 0) + 1);
});
</script></body></html>`;

describe("touch tooltip gestures", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-tooltip-touch", logLevel: "error",
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  async function openFixture(touch = true): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: touch ? 390 : 1280, height: 844 }, hasTouch: touch, isMobile: touch });
    await page.route("**/__tooltip_touch__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__tooltip_touch__`);
    await page.waitForSelector("#relationship-tooltip", { state: "attached" });
    return page;
  }

  it("opens on a nested tap, suppresses duplicate hover hints, and closes on a second tap", async () => {
    const page = await openFixture();
    try {
      await page.locator("#note-child").tap();
      const tooltip = page.locator("#relationship-tooltip");
      expect(await tooltip.isVisible()).toBe(true);
      expect(await tooltip.textContent()).toContain("完成角色成就");
      expect(await page.locator("#note").getAttribute("aria-describedby")).toBe("existing-description relationship-tooltip");
      expect(await page.locator("#note").evaluate(element => getComputedStyle(element, "::after").display)).toBe("none");
      const bounds = await tooltip.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(8);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(382);
      await page.locator("#note-child").tap();
      expect(await tooltip.isHidden()).toBe(true);
      expect(await page.locator("#note").getAttribute("aria-describedby")).toBe("existing-description");
      // A delayed compatibility click must not reopen a tooltip just dismissed
      // by pointerup, nor should keyboard focus from that tap open it again.
      await page.locator("#note-child").dispatchEvent("click", { bubbles: true });
      await page.locator("#note").focus();
      expect(await tooltip.isHidden()).toBe(true);
    } finally { await page.close(); }
  });

  it("switches between notes, reads bar children, and leaves ordinary action taps intact", async () => {
    const page = await openFixture();
    try {
      const tooltip = page.locator("#relationship-tooltip");
      await page.locator("#note-child").tap();
      await page.locator("#bar-child").tap();
      expect(await tooltip.textContent()).toBe("经验条的完整提示");
      await page.locator("#title-note").tap();
      expect(await tooltip.isVisible()).toBe(true);
      expect(await tooltip.textContent()).toBe("标题提示");
      expect(await page.locator("#title-note").getAttribute("title")).toBeNull();
      await page.locator("#action-child").tap();
      expect(await page.locator("#action").getAttribute("data-clicks")).toBe("1");
      expect(await tooltip.isHidden()).toBe(true);
      await page.locator("#bar-child").tap();
      await page.locator("#outside").tap();
      expect(await tooltip.isHidden()).toBe(true);
    } finally { await page.close(); }
  });

  it("does not open during a real touch scroll and dismisses a pinned hint when its page scrolls", async () => {
    const page = await openFixture();
    try {
      const client = await page.context().newCDPSession(page);
      const bounds = (await page.locator("#note-child").boundingBox())!;
      const x = bounds.x + bounds.width / 2;
      const y = bounds.y + bounds.height / 2;
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 40 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      expect(await page.locator("#relationship-tooltip").isHidden()).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.locator("#bar-child").tap();
      expect(await page.locator("#relationship-tooltip").isVisible()).toBe(true);
      await page.evaluate(() => window.scrollBy(0, 100));
      await expect.poll(() => page.locator("#relationship-tooltip").isHidden()).toBe(true);
      await client.detach();
    } finally { await page.close(); }
  });

  it("supports click-only touch activation and scrolling a long tooltip itself", async () => {
    const page = await openFixture();
    try {
      await page.locator("#bar-child").dispatchEvent("click", { bubbles: true });
      const tooltip = page.locator("#relationship-tooltip");
      expect(await tooltip.isVisible()).toBe(true);
      await page.locator("#bar-child").dispatchEvent("click", { bubbles: true });
      expect(await tooltip.isHidden()).toBe(true);
      await page.locator("#long-note").tap();
      expect(await tooltip.evaluate(element => getComputedStyle(element).pointerEvents)).toBe("auto");
      await tooltip.evaluate(element => { element.scrollTop = 80; });
      await expect.poll(() => tooltip.evaluate(element => element.scrollTop)).toBe(80);
      expect(await tooltip.isVisible()).toBe(true);
    } finally { await page.close(); }
  });

  it("keeps native-free desktop hover and keyboard dismissal", async () => {
    const page = await openFixture(false);
    try {
      await page.locator("#title-note").hover();
      expect(await page.locator("#relationship-tooltip").textContent()).toBe("标题提示");
      expect(await page.locator("#relationship-tooltip").isVisible()).toBe(true);
      await page.keyboard.press("Escape");
      expect(await page.locator("#relationship-tooltip").isHidden()).toBe(true);
    } finally { await page.close(); }
  });

  it.each([false, true])("keeps long hints inside the left and right cards (touch: %s)", async touch => {
    const page = await openFixture(touch);
    try {
      await page.evaluate(() => {
        document.querySelector("#app")!.innerHTML = `<div style="display:flex;gap:12px">
          ${["left", "right"].map(side => `<div class="paper-card" style="position:relative;width:calc(50% - 6px);min-width:0;height:160px">
            <span id="${side}-card-note" data-card-tooltip data-tooltip="更换研究方向。热门方向提升引用，但论文分数衰减也更快。&#10;毕业论文需要同方向的一作支撑。" style="position:absolute;${side}:35%;top:30px">说明</span>
          </div>`).join("")}</div>`;
      });
      for (const side of ["left", "right"]) {
        const note = page.locator(`#${side}-card-note`);
        if (touch) await note.tap();
        else await note.hover();
        const tooltip = page.locator("#relationship-tooltip");
        expect(await tooltip.isVisible()).toBe(true);
        const hint = (await tooltip.boundingBox())!;
        const card = await note.evaluate(element => {
          const bounds = element.closest(".paper-card")!.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        });
        expect(hint.x).toBeGreaterThanOrEqual(card.left - 1);
        expect(hint.x + hint.width).toBeLessThanOrEqual(card.right + 1);
        expect(hint.x).toBeGreaterThanOrEqual(7);
        expect(hint.x + hint.width).toBeLessThanOrEqual(touch ? 383 : 1273);
      }
    } finally { await page.close(); }
  });
});
