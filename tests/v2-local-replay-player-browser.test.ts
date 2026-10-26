import { mkdir } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { captureReplayRecording } from "../src/core/v2-local-replay";
import { createRunReplay, executeReplayCommand, replayStateDigest, type ReplayCommand } from "../src/core/v2-run-replay";
import manifest from "../src/app/v2-official-replay-manifest.json";

function sample() {
  const initial = createInitialState();
  initial.randomState = { seed: 1700000000, cursor: 0 };
  let state = dispatchAction(initial, "start-game", { roleId: "normal" });
  const replay = createRunReplay(initial, state, { roleId: "normal" });
  function action(command: ReplayCommand) {
    replay.commands.push(command); state = executeReplayCommand(state, command);
    replay.checkpoints.push({ index: replay.commands.length, digest: replayStateDigest(state), totalMonths: state.totalMonths });
  }
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    const event = state.eventQueue.find(event => event.chainId === "before-grad-school")!;
    action({ kind: "action", actionId: "resolve-event", payload: { eventId: event.id, eventChoiceId } });
  }
  action({ kind: "action", actionId: "next-month", payload: {} });
  for (let i = 0; i < 20 && state.eventQueue.length; i++) {
    const event = state.eventQueue[0]!;
    action({ kind: "action", actionId: "resolve-event", payload: { eventId: event.id, eventChoiceId: event.choices[0]!.id } });
  }
  action({ kind: "action", actionId: "create-paper", payload: { paperSlotIndex: 0 } });
  const paper = state.papers[0]!;
  action({ kind: "action", actionId: "research-paper", payload: { paperId: paper.id, paperActionType: "idea" } });
  action({ kind: "action", actionId: "rest", payload: {} });
  action({ kind: "action", actionId: "buy-coffee", payload: {} });
  action({ kind: "action", actionId: "next-month", payload: {} });
  action({ kind: "action", actionId: "quit-game", payload: {} });
  return captureReplayRecording(replay, state, { id: "browser-replay-test", now: "2026-10-21T08:00:00.000Z" });
}
const fixture = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>';
describe("isolated local replay browser player", () => {
  let server: ViteDevServer;
  let browser: Browser;
  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", define: { __LOCAL_PLAYGROUND__: false }, server: { host: "127.0.0.1", port: 0 } });
    await server.listen(); browser = await chromium.launch();
    await mkdir("artifacts/local-replay", { recursive: true });
  }, 30_000);
  afterAll(async () => { await browser?.close(); await server?.close(); });

  it.each([390, 1440])("imports, plays and browses at %spx without account or RPC writes", async width => {
    const page = await browser.newPage({ viewport: { width, height: 1040 }, acceptDownloads: true });
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (/supabase|\/rpc\//.test(request.url())) requests.push(request.url()); });
    try {
      await page.route("**/__replay_test__*", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.addInitScript(() => { localStorage.setItem("account-sentinel", "do not change"); });
      await page.goto(`${server.resolvedUrls!.local[0]}__replay_test__?replay=library`);
      await page.waitForSelector("[data-replay-import]:not(:disabled)");
      const localBefore = await page.evaluate(() => ({ ...localStorage }));
      expect(await page.locator("h1").textContent()).toBe("录像与攻略");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `artifacts/local-replay/empty-${width}.png`, fullPage: true });
      const data = sample();
      await page.locator("[data-replay-file]").setInputFiles({ name: "sample.phdreplay.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForSelector("[data-replay-open]");
      expect(await page.locator(".replay-card-metrics > div").count()).toBe(6);
      expect(await page.locator(".replay-card-metrics").textContent()).toContain("科研分");
      expect(await page.locator(".replay-card-metrics").textContent()).toContain("金币");
      expect(await page.locator(".replay-card-metrics dd span").count()).toBe(4);
      expect(await page.locator("[data-replay-results], .replay-results-dialog").count()).toBe(0);
      expect(await page.locator(".replay-card-portrait").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: `artifacts/local-replay/library-${width}.png`, fullPage: true });
      await page.locator("[data-replay-open]").click();
      await page.waitForSelector(".replay-viewer .play-page");
      expect(await page.locator(".replay-app > .replay-toolbar").count()).toBe(0);
      expect(await page.locator(".play-right-rail [data-replay-play]").count()).toBe(1);
      expect(await page.locator("[data-ui-help-toggle], #play-help-panel").count()).toBe(0);
      expect(await page.locator("[data-replay-speed]").isEnabled()).toBe(true);
      expect(await page.locator("[data-action][aria-disabled='true']").count()).toBeGreaterThan(0);
      expect(await page.locator("[data-action]:not(:disabled)").count()).toBeGreaterThan(0);
      expect(await page.locator(".replay-inline-progress output").textContent()).toBe(`1 / ${data.replay.commands.length} 步`);
      await page.locator("[data-replay-step='1']").click();
      await page.waitForFunction(() => document.querySelector(".replay-inline-progress output")?.textContent?.startsWith("2 /"));
      await page.locator("[data-replay-step='-1']").click();
      await page.waitForFunction(() => document.querySelector(".replay-inline-progress output")?.textContent?.startsWith("1 /"));
      await page.locator("[data-replay-speed]").selectOption("8");
      await page.locator("[data-replay-play]").click();
      // Pause in the same browser turn that observes progress; at 8x the next
      // render can replace the button before a second Playwright call reaches it.
      await page.waitForFunction(() => {
        if (Number(document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value) <= 3) return false;
        const pause = document.querySelector<HTMLButtonElement>('[data-replay-play][aria-label="暂停"]');
        if (!pause) return false;
        pause.click(); return true;
      });
      expect(await page.locator("[data-replay-play]").getAttribute("aria-label")).toBe("播放");
      const paused = await page.locator("[data-replay-seek]").inputValue();
      await page.waitForTimeout(200);
      expect(await page.locator("[data-replay-seek]").inputValue()).toBe(paused);
      await page.locator("[data-replay-month]").selectOption({ label: "第1学年 · 9月" });
      await page.waitForFunction(() => document.querySelector(".replay-inline-title small")?.textContent?.startsWith("第1学年 · 9月"));
      await page.locator("[data-ui-play-tab='workstation']").click();
      await page.waitForSelector(".workstation-section:visible");
      await page.screenshot({ path: `artifacts/local-replay/player-${width}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await page.locator("[data-ui-play-tab='relationship']").click();
      expect(await page.locator("[data-ui-play-tab='relationship']").getAttribute("aria-pressed")).toBe("true");
      await page.locator("[data-replay-seek]").fill(String(data.replay.commands.length));
      await page.locator("[data-replay-seek]").dispatchEvent("change");
      await page.waitForFunction(() => document.querySelector(".play-page")?.getAttribute("data-phase") === "finished");
      await page.screenshot({ path: `artifacts/local-replay/ending-${width}.png`, fullPage: true });
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-replay-export]").click();
      expect((await downloadPromise).suggestedFilename()).toContain(".phdreplay.json");
      await page.locator("[data-replay-library]").click();
      await page.waitForSelector("[data-replay-card]");
      await page.locator("[data-replay-delete]").click();
      expect(await page.locator("[data-replay-card]").count()).toBe(1);
      await page.locator("[data-replay-confirm-delete]").click();
      await page.waitForSelector(".replay-empty");
      expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(localBefore);
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 40_000);

  it.each([390, 1440])("shows the exact event, research and shop button before execution at %spx", async width => {
    const page = await browser.newPage({ viewport: { width, height: 1040 } });
    try {
      await page.route("**/__replay_cue__*", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__replay_cue__?replay=library`);
      await page.waitForSelector("[data-replay-import]:not(:disabled)");
      const data = sample();
      await page.locator("[data-replay-file]").setInputFiles({ name: "cue.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
      await page.locator("[data-replay-open]").click();
      await page.waitForSelector("[data-replay-seek]");
      for (const [action, tab] of [["resolve-event", "events"], ["research-paper", "workstation"], ["buy-coffee", "shop"]]) {
        const beforeIndex = data.replay.commands.findIndex(command => command.kind === "action" && command.actionId === action);
        await page.locator("[data-replay-seek]").fill(String(beforeIndex));
        await page.locator("[data-replay-seek]").dispatchEvent("change");
        await page.waitForFunction(index => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === String(index), beforeIndex);
        await page.locator("[data-replay-speed]").selectOption("0.5");
        await page.locator('[data-replay-step="1"]').click();
        // Read the transient cue and its surrounding view atomically, before
        // the preview timer executes the recorded action.
        const cue = await page.waitForFunction(({ action, tab }) => {
          const target = document.querySelector<HTMLElement>(`.replay-click-target[data-action="${action}"]`);
          if (!target) return null;
          return { action: target.dataset.action, paperAction: target.dataset.paperActionType,
            tabPressed: document.querySelector(`[data-ui-play-tab="${tab}"]`)?.getAttribute("aria-pressed"),
            index: document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value };
        }, { action, tab });
        const shown = await cue.jsonValue();
        if (!shown) throw new Error(`Missing preview for ${action}`);
        expect(shown.action).toBe(action);
        expect(shown.tabPressed).toBe("true");
        expect(shown.index).toBe(String(beforeIndex));
        if (action === "research-paper") expect(shown.paperAction).toBe("idea");
        await page.screenshot({ path: `artifacts/local-replay/cue-${action}-${width}.png`, fullPage: true });
        await page.waitForFunction(index => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === String(index + 1), beforeIndex);
        expect(await page.locator(".replay-click-cue").count()).toBe(0);
      }
      await page.locator("[data-replay-seek]").fill("1");
      await page.locator("[data-replay-seek]").dispatchEvent("change");
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === "1");
      await page.locator("[data-replay-play]").click();
      await page.waitForFunction(() => {
        if (!document.querySelector(".replay-click-cue")) return false;
        const pause = document.querySelector<HTMLButtonElement>('[data-replay-play][aria-label="暂停"]');
        if (!pause) return false;
        pause.click(); return true;
      });
      await page.waitForTimeout(1400);
      expect(await page.locator("[data-replay-seek]").inputValue()).toBe("1");
      expect(await page.locator(".replay-click-cue").count()).toBe(0);
      const monthIndex = data.replay.commands.findIndex(command => command.kind === "action" && command.actionId === "next-month");
      await page.locator("[data-replay-seek]").fill(String(monthIndex));
      await page.locator("[data-replay-seek]").dispatchEvent("change");
      await page.waitForFunction(index => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === String(index), monthIndex);
      await page.locator('[data-replay-step="1"]').click();
      await page.waitForSelector('.replay-click-target[data-action="next-month"]');
      expect(await page.locator("[data-replay-seek]").inputValue()).toBe(String(monthIndex));
      await page.waitForFunction(index => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === String(index + 1), monthIndex);
      expect(await page.locator(".replay-click-cue").count()).toBe(0);
    } finally { await page.close(); }
  }, 40_000);

  it("reports malformed imports and missing recordings without hiding the library", async () => {
    const page = await browser.newPage();
    try {
      await page.route("**/__replay_missing__*", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__replay_missing__?replay=missing`);
      await page.waitForSelector(".replay-message.is-error");
      expect(await page.locator(".replay-message").textContent()).toContain("不在当前浏览器");
      await page.locator("[data-replay-file]").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":1}') });
      await page.waitForFunction(() => document.querySelector(".replay-message.is-error")?.textContent?.includes("回放无效"));
      await page.waitForSelector("[data-replay-import]:not(:disabled)");
    } finally { await page.close(); }
  }, 30_000);

  it.each([390, 1440])("filters official routes and visits talents without rebuilding the screen at %spx", async width => {
    const page = await browser.newPage({ viewport: { width, height: 1040 } });
    try {
      await page.goto(`${server.resolvedUrls!.local[0]}?replay=official`);
      await page.waitForSelector("[data-replay-card]");
      expect(await page.locator("[data-replay-route]").count()).toBe(5);
      const phd10 = manifest.filter(item => item.route === "phd-10");
      expect(await page.locator("[data-replay-card]").count()).toBe(phd10.length);
      expect(await page.locator(".replay-card-metrics > div").count()).toBe(phd10.length * 6);
      expect(await page.locator(".replay-card-metrics dd span").count()).toBe(phd10.length * 4);
      expect(await page.locator(".replay-card-metrics").first().textContent()).not.toContain("…");
      expect(await page.locator("[data-replay-results]").count()).toBe(0);
      await page.locator('[data-replay-route="master-10"]').click();
      expect(await page.locator("[data-replay-card]").count()).toBe(manifest.filter(item => item.route === "master-10").length);
      for (const route of ["cursed", "special"]) {
        await page.locator(`[data-replay-route="${route}"]`).click();
        expect(await page.locator(`[data-replay-route="${route}"]`).getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator("[data-replay-card]").count()).toBe(0);
        expect(await page.locator(".replay-empty").textContent()).toContain("暂无录像");
      }
      await page.locator('[data-replay-route="phd-10"]').click();
      await page.locator('[data-replay-open="official-normal-phd-10"]').click();
      await page.waitForSelector("[data-replay-seek]");
      await page.locator("[data-replay-speed]").selectOption("0.5");
      await page.locator('[data-replay-step="1"]').click();
      await page.waitForSelector(".replay-click-target[data-ui-open-event-id]");
      expect(await page.locator("#event-content-box:visible").count()).toBe(0);
      expect(await page.locator("[data-replay-seek]").inputValue()).toBe("1");
      await page.screenshot({ path: `artifacts/local-replay/cue-event-entry-${width}.png`, fullPage: true });
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === "2");
      await page.locator("[data-replay-seek]").fill("4");
      await page.locator("[data-replay-seek]").dispatchEvent("change");
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === "4");
      await page.locator('[data-replay-step="1"]').click();
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === "5");
      await page.locator("[data-replay-speed]").selectOption("2");
      await page.locator('[data-replay-step="1"]').click();
      await page.waitForSelector('.replay-click-target[data-ui-play-tab="talent"]');
      expect(await page.locator('[data-ui-play-tab="talent"]').getAttribute("aria-pressed")).toBe("false");
      await page.screenshot({ path: `artifacts/local-replay/cue-main-tab-${width}.png`, fullPage: true });
      await page.waitForSelector(".replay-click-target[data-ui-talent-tree-node]");
      await page.waitForSelector(".replay-click-cue", { state: "detached" });
      expect(await page.locator('[data-ui-play-tab="talent"]').getAttribute("aria-pressed")).toBe("true");
      const lit = page.locator('[data-ui-talent-tree-node][data-current-level]:not([data-current-level="0"])');
      const purchased = await lit.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-ui-talent-tree-node")));
      expect(purchased.length).toBeGreaterThan(0);
      const viewer = await page.locator(".replay-viewer").elementHandle();
      const tree = await page.locator(".lobby-talent-tree").elementHandle();
      const portrait = await page.locator(".play-page img").first().elementHandle();
      await page.locator("[data-replay-speed]").selectOption("8");
      for (const key of purchased.slice(1)) {
        await page.locator('[data-replay-step="1"]').click();
        await page.waitForFunction(key => document.querySelector(`[data-ui-talent-tree-node="${key}"]`)?.getAttribute("aria-pressed") === "true" && !document.querySelector(".replay-click-cue"), key);
        expect(await page.locator("[data-replay-seek]").inputValue()).toBe("5");
        expect(await page.locator(".lobby-normal-tree-detail:visible").count()).toBe(1);
        expect(await viewer!.evaluate(node => node.isConnected)).toBe(true);
        expect(await tree!.evaluate(node => node.isConnected)).toBe(true);
        expect(await portrait!.evaluate(node => node.isConnected)).toBe(true);
      }
      // Manual selection uses the existing details and does not modify allocation.
      const allocation = await lit.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-current-level")));
      await page.locator(`[data-ui-talent-tree-node="${purchased[0]}"]`).click();
      expect(await page.locator(`[data-ui-talent-tree-node="${purchased[0]}"]`).getAttribute("aria-pressed")).toBe("true");
      expect(await lit.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-current-level")))).toEqual(allocation);
      expect(await viewer!.evaluate(node => node.isConnected)).toBe(true);
      expect(await tree!.evaluate(node => node.isConnected)).toBe(true);
      expect(await page.locator(`[data-ui-talent-tree-node="${purchased[0]}"]`).evaluate(node => node === document.activeElement)).toBe(true);
      // Playing and pausing also preserve the current panel and its animations.
      await page.locator("[data-replay-play]").evaluate((button: HTMLButtonElement) => button.click());
      await page.locator("[data-replay-play]").evaluate((button: HTMLButtonElement) => button.click());
      expect(await viewer!.evaluate(node => node.isConnected)).toBe(true);
      expect(await page.locator("[data-replay-play]").getAttribute("aria-label")).toBe("播放");
      await page.locator('[data-replay-step="1"]').click();
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>("[data-replay-seek]")?.value === "6");
      const downloadPromise = page.waitForEvent("download");
      await page.locator("[data-replay-export]").click();
      expect((await downloadPromise).suggestedFilename()).toContain("official-normal-phd-10");
    } finally { await page.close(); }
  }, 30_000);

});
