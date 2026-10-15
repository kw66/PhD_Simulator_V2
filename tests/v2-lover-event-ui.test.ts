import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import type { createStore } from "../src/core/v2-store";

type LoverEventWindow = typeof window & {
  loverEventStore: ReturnType<typeof createStore>;
  installParallelLoverEvents: () => { firstId: string; secondId: string; firstName: string; secondName: string };
};

const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
import { createEventQueueItem } from '/src/core/v2-event-queue.ts';
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from '/src/core/v2-lover-events.ts';
bootstrapApp(document.getElementById('app'));
globalThis.installParallelLoverEvents = () => {
  const store = globalThis.loverEventStore;
  store.dispatch('start-game', { roleId: 'normal' });
  for (const eventChoiceId of ['before-grad-school-open-advisor-info', 'before-grad-school-confirm', 'before-grad-school-finish']) {
    store.dispatch('resolve-event', { eventChoiceId });
  }
  store.dispatch('next-month');
  const state = store.getState();
  const firstName = '李明华';
  const secondName = '周晓宁';
  const create = (type, name, order) => {
    const context = buildLoverDevelopmentContext({
      conferenceEncounterState: state.conferenceEncounterState,
      totalMonths: state.totalMonths,
      type,
      playerGender: 'male',
      state,
      contact: { id: 'test-contact-' + type, name, gender: 'female', encounterCount: 3 },
    }, () => 0.5);
    return createEventQueueItem(createLoverDevelopmentAct1(context), order);
  };
  const first = create('beautiful', firstName, 1);
  const second = create('smart', secondName, 2);
  state.eventQueue.splice(0, state.eventQueue.length, first, second);
  store.dispatch('debug-adjust-action-points', { delta: 0 });
  return { firstId: first.id, secondId: second.id, firstName, secondName };
};
</script></body></html>`;

describe("parallel lover event scenes", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
      plugins: [{ name: "lover-event-ui-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.loverEventStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("keeps each person's second and result scenes attached to their own pending event", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.route("**/__lover_event_ui__", route => route.fulfill({ contentType: "text/html", body: fixture }));
      await page.goto(`${server.resolvedUrls!.local[0]}__lover_event_ui__`);
      await page.waitForSelector('[data-action="start-game"]:not(:disabled)');
      const { firstId, secondId, firstName, secondName } = await page.evaluate(() =>
        (window as LoverEventWindow).installParallelLoverEvents());

      await page.locator(`[data-ui-open-event-id="${firstId}"]`).click();
      const content = page.locator("#event-content-box");
      await expect.poll(() => content.textContent()).toContain(firstName);
      await content.locator('[data-action="resolve-event"][data-event-choice-id="continue"]').click();
      await expect.poll(() => content.textContent()).toContain(firstName);
      expect(await content.textContent()).not.toContain(secondName);
      expect(await content.locator('[data-action="resolve-event"][data-event-choice-id="decline"]').count()).toBe(1);

      await content.locator('[data-action="resolve-event"][data-event-choice-id="decline"]').click();
      await expect.poll(() => content.textContent()).toContain(firstName);
      expect(await content.textContent()).not.toContain(secondName);
      await content.locator('[data-action="resolve-event"][data-event-choice-id="close"]').click();
      expect(await page.evaluate(id => (window as LoverEventWindow).loverEventStore.getState().eventQueue.some(event => event.id === id), secondId)).toBe(true);

      await page.locator(`[data-ui-open-event-id="${secondId}"]`).click();
      await content.locator('[data-action="resolve-event"][data-event-choice-id="continue"]').click();
      await expect.poll(() => content.textContent()).toContain(secondName);
      expect(await content.textContent()).not.toContain(firstName);
    } finally {
      await page.close();
    }
  }, 30_000);
});
