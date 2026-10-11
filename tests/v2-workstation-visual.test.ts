import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import type { createStore } from "../src/core/v2-store";

type WorkstationWindow = typeof window & { workstationVisualStore: ReturnType<typeof createStore> };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="app"></div><script type="module">
import '/src/styles/global.css';
import { bootstrapApp } from '/src/app/v2-bootstrap.ts';
bootstrapApp(document.getElementById('app'));
</script></body></html>`;
const titles = [
  "A Simple Baseline",
  "Unified Learning of Robust Representations for Cross-Modal Retrieval and Open-World Visual Understanding with Limited Annotations",
  "Learning to Match",
  "Understanding Generalization across Domains through Structure-Aware Representation Learning and Collaborative Visual Reasoning",
];

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

describe("workstation visual layout through real bootstrap", () => {
  let server: ViteDevServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await createServer({ configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0 },
      plugins: [{ name: "workstation-visual-store", transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/app/v2-bootstrap.ts")) {
          return code.replace("const store = createStore();", "const store = createStore(); globalThis.workstationVisualStore = store;");
        }
      } }],
    });
    await server.listen();
    browser = await chromium.launch();
    await mkdir("artifacts/workstation-visual", { recursive: true });
  }, 30_000);

  afterAll(async () => { await browser?.close(); await server?.close(); });

  async function openWorkstation(page: Page) {
    page.setDefaultTimeout(5000);
    await page.route("**/__workstation_visual__", route => route.fulfill({ contentType: "text/html", body: fixture }));
    await page.goto(`${server.resolvedUrls!.local[0]}__workstation_visual__`);
    await page.waitForSelector('[data-action="start-game"]');
    const papers = titles.map((title, index) => ({
      ...createDraftPaper(index + 1, 0, () => 0.5), id: `visual-paper-${index}`, paperSlotIndex: index, title,
      idea: 40 + index, experiment: 45 + index, writing: 50 + index,
      collaborationScores: { idea: index, experiment: index * 2, writing: index * 3 },
    }));
    const fellow = createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "林青", research: 12, affinity: 5, startTotalMonths: 1,
    });
    await page.evaluate(({ papers, fellow }) => {
      const store = (window as WorkstationWindow).workstationVisualStore;
      store.dispatch("start-game", { roleId: "normal" });
      const state = store.getState();
      Object.assign(state, { year: 1, month: 4, totalMonths: 4, selectedAdvisorName: "张老师",
        eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [], illnessProbability: 0,
        papers, selectedPaperId: papers[0]!.id, fellowProgressState: [fellow] });
      Object.assign(state.player, { research: 20, san: 20, money: 100, social: 12 });
      state.advisorProgressState.funding = 1000;
      state.actionState.used = 0;
      store.dispatch("set-linear-event-blocking", { blockLinearEvents: true });
    }, { papers, fellow });
    await page.locator('[data-ui-play-tab="workstation"]').click();
    await settleLayout(page);
  }

  it.each([1920, 390])("keeps an empty paper card the same height after creation at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1080 }, reducedMotion: "reduce" });
    try {
      await openWorkstation(page);
      await page.evaluate(() => {
        const store = (window as WorkstationWindow).workstationVisualStore;
        store.getState().papers = store.getState().papers.filter(paper => paper.paperSlotIndex !== 0);
        store.getState().selectedPaperId = null;
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      const slot = page.locator('[data-paper-slot-index="0"].paper-slot-card');
      await slot.locator('[data-action="create-paper"]').waitFor();
      const before = await slot.evaluate(card => card.getBoundingClientRect().height);
      await slot.locator('[data-action="create-paper"]').click();
      await page.locator('[data-paper-slot-index="0"].paper-card-filled').waitFor();
      const after = await slot.evaluate(card => card.getBoundingClientRect().height);
      expect(after).toBeCloseTo(before, 0);
    } finally {
      await page.close();
    }
  }, 15_000);

  it.each([1920, 390])("shows every paper contributor in score order at %ipx", async width => {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1080 }, reducedMotion: "reduce" });
    try {
      await openWorkstation(page);
      await page.evaluate(() => {
        const store = (window as WorkstationWindow).workstationVisualStore;
        const paper = store.getState().papers[0]!;
        paper.collaborationScores = { idea: 13, experiment: 7, writing: 17 };
        paper.collaborators = [
          { id: "peer-low", name: "陈同学", contributionScores: { idea: 3 } },
          { id: "advisor", name: "张老师", contributionScores: { writing: 15 } },
          { id: "peer-high", name: "李同学", contributionScores: { idea: 10 } },
          { id: "peer-extra", name: "王同学", contributionScores: { writing: 2 } },
          { id: "peer-mid", name: "林同学", contributionScores: { experiment: 7 } },
        ];
        store.dispatch("set-date-display-mode", { dateDisplayMode: "academic" });
      });
      const card = page.locator('#workstation-paper-grid .paper-slot-card[data-paper-id="visual-paper-0"]');
      const avatars = card.locator(".paper-collaborator-avatar");
      expect(await avatars.evaluateAll(elements => elements.map(element => element.getAttribute("data-paper-participant-id"))))
        .toEqual(["player", "peer-high", "peer-mid", "peer-low", "peer-extra", "advisor"]);
      expect(await card.evaluate(element => {
        const header = element.querySelector(".paper-card-header")!.getBoundingClientRect();
        return [...element.querySelectorAll(".paper-collaborator-avatar")].every(avatar => {
          const bounds = avatar.getBoundingClientRect();
          return bounds.left >= header.left && bounds.right <= header.right && bounds.bottom <= header.bottom;
        });
      })).toBe(true);
      await page.mouse.move(0, 0);
      await card.screenshot({ path: `artifacts/workstation-visual/contributors-${width}.png`, animations: "disabled" });
    } finally {
      await page.close();
    }
  }, 15_000);

  it("fits four drafts at 1920, 1440 and 390 with aligned titles, scores and submissions", async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await openWorkstation(page);
      expect(await page.locator("#workstation-paper-grid .paper-card-filled").count()).toBe(4);
      expect(await page.locator("#workstation-paper-grid .paper-card-locked").count()).toBe(0);
      expect(await page.locator('.workstation-paper-action-btn:not(:disabled)').count()).toBe(3);
      for (const width of [1920, 1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
        for (const selectedIndex of [0, 1]) {
          await page.locator(`[data-ui-select-workstation-paper="visual-paper-${selectedIndex}"]`).click();
          await page.mouse.move(0, 0);
          await settleLayout(page);
          expect(await page.evaluate(() => (window as WorkstationWindow).workstationVisualStore.getState().selectedPaperId))
            .toBe(`visual-paper-${selectedIndex}`);
          expect(await page.locator("#workstation-paper-grid .is-selected").filter({ has: page.locator(".paper-title") }).count()).toBe(1);
          await page.locator("#workstation-section").screenshot({ path: `artifacts/workstation-visual/workstation-${width}-selected-${selectedIndex}.png`, animations: "disabled" });
          const layout = await page.locator("#workstation-paper-grid .paper-card-filled").evaluateAll(cards => cards.map(card => {
            const bounds = card.getBoundingClientRect();
            const title = card.querySelector<HTMLElement>(".paper-title")!;
            const titleBounds = title.getBoundingClientRect();
            const meta = card.querySelector(".paper-topic-meta")!.getBoundingClientRect();
            const titleRange = document.createRange();
            titleRange.selectNodeContents(title);
            const titleRects = [...titleRange.getClientRects()];
            const lastTitle = titleRects.at(-1)!;
            const scores = card.querySelector(".paper-score-breakdown")!.getBoundingClientRect();
            const style = getComputedStyle(card);
            const header = getComputedStyle(card.querySelector(".paper-card-header")!);
            return { id: card.getAttribute("data-paper-id"), top: bounds.top, left: bounds.left, right: bounds.right,
              overflow: card.scrollWidth - card.clientWidth,
              titleHeight: titleBounds.height, lineHeight: parseFloat(getComputedStyle(title).lineHeight),
              title: title.textContent, fullTitle: title.getAttribute("title"), metaTop: meta.top, titleBottom: titleBounds.bottom,
              titleLines: new Set(titleRects.map(rect => Math.round(rect.top))).size,
              metaInline: meta.top < lastTitle.bottom && meta.left >= lastTitle.right - 1,
              titleClipped: getComputedStyle(title).overflow === "hidden",
              metaRight: meta.right, scoreTop: scores.top, scoreBottom: scores.bottom,
              selected: card.classList.contains("is-selected"), borderWidth: parseFloat(style.borderTopWidth),
              border: style.borderTopColor, leftBorder: style.borderLeftColor, shadow: style.boxShadow,
              headerBackground: header.background,
            };
          }));
          for (const [index, card] of layout.entries()) {
            const label = `${width}px ${card.id}`;
            expect.soft(card.overflow, label).toBeLessThanOrEqual(1);
            expect.soft(card.left, label).toBeGreaterThanOrEqual(-1);
            expect.soft(card.right, label).toBeLessThanOrEqual(width + 1);
            expect.soft(card.titleClipped, label).toBe(false);
            expect.soft(card.titleHeight, label).toBeGreaterThan(0);
            if (index === 0) expect.soft(card.metaInline, label).toBe(true);
            expect.soft(card.metaRight, label).toBeLessThanOrEqual(card.right + 1);
            expect.soft(card.title, label).toBe(titles[index]);
            expect.soft(card.fullTitle, label).toBe(titles[index]);
            expect.soft(card.borderWidth, label).toBeLessThanOrEqual(1);
            expect.soft(card.shadow, label).not.toBe("none");
            if (card.selected) expect.soft(card.leftBorder, label).not.toBe(card.border);
          }
          const selected = layout.find(card => card.selected)!;
          expect.soft(selected.headerBackground, `${width}px selected header`).not.toBe(layout.find(card => !card.selected)!.headerBackground);
          let sameRowPairs = 0;
          for (const [index, card] of layout.entries()) {
            for (const peer of layout.slice(index + 1).filter(peer => Math.abs(peer.top - card.top) <= 1)) {
              sameRowPairs += 1;
              expect.soft(Math.abs(card.scoreTop - peer.scoreTop), `${width}px score table tops`).toBeLessThanOrEqual(1);
              expect.soft(Math.abs(card.scoreBottom - peer.scoreBottom), `${width}px score table bottoms`).toBeLessThanOrEqual(1);
            }
          }
          if (width > 390) expect.soft(sameRowPairs, `${width}px desktop card rows`).toBeGreaterThan(0);
          const buttons = await page.locator(".workstation-submit-target > button").evaluateAll(elements => elements.map(element => ({
            height: element.getBoundingClientRect().height, overflow: element.scrollWidth - element.clientWidth,
          })));
          expect(buttons).toHaveLength(6);
          expect.soft(Math.max(...buttons.map(button => button.height)) - Math.min(...buttons.map(button => button.height)), `${width}px submission heights`).toBeLessThanOrEqual(1);
          expect.soft(buttons.every(button => button.height > 0 && button.overflow <= 1), `${width}px submission content`).toBe(true);
          expect(await page.locator(".workstation-submit-info-item").count()).toBe(0);
          const targets = page.locator(".workstation-submit-target");
          for (const targetIndex of [0, 3]) {
            const target = targets.nth(targetIndex);
            await target.hover();
            const tooltip = page.locator("#relationship-tooltip");
            expect(await tooltip.isVisible()).toBe(true);
            expect(await tooltip.textContent()).toContain(targetIndex === 0 ? "参考分" : "送审分");
            expect(await target.locator("button").getAttribute("title")).toBeNull();
            const bounds = await tooltip.boundingBox();
            expect(bounds!.x).toBeGreaterThanOrEqual(0);
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
            await target.focus();
            expect(await tooltip.isVisible()).toBe(true);
            await page.keyboard.press("Escape");
            expect(await tooltip.isHidden()).toBe(true);
          }
          expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px page overflow`).toBe(true);
        }
      }
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 45_000);

  it("anchors research and relationship hints immediately below their trigger on either side", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
    try {
      await openWorkstation(page);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1080 });
        for (const tab of ["workstation", "relationship"]) {
          await page.locator(`[data-ui-play-tab="${tab}"]`).click();
          await settleLayout(page);
          const targets = page.locator(tab === "workstation"
            ? '.workstation-submit-target, .graduation-point-bar[data-tooltip], .graduation-career-bar[data-tooltip], .workstation-paper-action-btn[data-card-tooltip]'
            : '.rel-card [data-relationship-tooltip]');
          expect(await targets.count()).toBeGreaterThan(5);
          for (let index = 0; index < await targets.count(); index += 1) {
            const target = targets.nth(index);
            if (!await target.isVisible()) continue;
            await target.evaluate(element => element.scrollIntoView({ block: "center" }));
            await target.hover();
            const position = await target.evaluate(element => {
              const anchor = element.getBoundingClientRect();
              const tooltip = document.querySelector<HTMLElement>("#relationship-tooltip")!;
              const bounds = tooltip.getBoundingClientRect();
              const region = element.closest(".rel-card, .paper-card")?.getBoundingClientRect()
                ?? element.closest("#workstation-section, .relationship-panel")?.getBoundingClientRect();
              const regionLeft = Math.max(8, region?.left ?? 8);
              const regionRight = Math.min(document.documentElement.clientWidth - 8, region?.right ?? document.documentElement.clientWidth - 8);
              const right = element.getAttribute("data-tooltip-align") === "right"
                || (element.getAttribute("data-tooltip-align") !== "left" && anchor.left + anchor.width / 2 > (regionLeft + regionRight) / 2);
              const expectedLeft = Math.max(8, Math.min(right ? anchor.right - bounds.width : anchor.left, document.documentElement.clientWidth - 8 - bounds.width));
              return { hidden: tooltip.hidden, gap: bounds.top - anchor.bottom, roomBelow: anchor.bottom + 2 + bounds.height <= innerHeight - 8,
                left: bounds.left, right: bounds.right, expectedLeft, viewport: document.documentElement.clientWidth };
            });
            expect(position.hidden, `${tab} ${width} trigger ${index}`).toBe(false);
            if (position.roomBelow) expect(Math.abs(position.gap - 2)).toBeLessThanOrEqual(1);
            expect(Math.abs(position.left - position.expectedLeft)).toBeLessThanOrEqual(1);
            expect(position.left).toBeGreaterThanOrEqual(7);
            expect(position.right).toBeLessThanOrEqual(position.viewport - 7);
            await page.keyboard.press("Escape");
          }
          await targets.first().hover();
          await page.screenshot({ path: `artifacts/workstation-visual/${tab}-tooltips-${width}.png` });
        }
      }
    } finally { await page.close(); }
  }, 60_000);

  it("removes shared icon underlines on hover while preserving keyboard focus", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
    try {
      await openWorkstation(page);
      for (const tab of ["workstation", "relationship"]) {
        await page.locator(`[data-ui-play-tab="${tab}"]`).click();
        await settleLayout(page);
        const icons = page.locator("button[data-card-icon-action]:visible:not(:disabled)");
        expect(await icons.count()).toBeGreaterThanOrEqual(3);
        expect(await page.locator('[data-card-icon-action][data-action="set-date-display-mode"]:visible').count()).toBe(1);
        if (tab === "relationship") expect(await page.getByRole("button", { name: "停止合作", exact: true }).count()).toBe(1);
        for (let index = 0; index < await icons.count(); index += 1) {
          const icon = icons.nth(index);
          const label = await icon.getAttribute("aria-label");
          await icon.hover();
          await settleLayout(page);
          if (label === "切换日期显示") {
            expect(await icon.getAttribute("title")).toBeNull();
            expect(await page.locator("#relationship-tooltip").textContent()).toBe("切换日期显示");
          }
          const hover = await icon.evaluate(element => {
            const style = getComputedStyle(element);
            const after = getComputedStyle(element, "::after");
            return { background: style.backgroundColor, decoration: style.textDecorationLine,
              afterVisible: after.content === '""' && after.display !== "none"
                && parseFloat(after.opacity) > 0 && parseFloat(after.height) > 0,
            };
          });
          expect.soft(hover.afterVisible, `${tab} ${label} hover underline`).toBe(false);
          expect.soft(hover.decoration, `${tab} ${label} text underline`).not.toContain("underline");
          expect.soft(hover.background, `${tab} ${label} hover surface`).not.toBe("rgba(0, 0, 0, 0)");
          await page.keyboard.press("Tab");
          await page.keyboard.press("Shift+Tab");
          await icon.focus();
          const focus = await icon.evaluate(element => {
            const style = getComputedStyle(element);
            const after = getComputedStyle(element, "::after");
            return { active: document.activeElement === element, visible: element.matches(":focus-visible"),
              outline: style.outlineStyle, width: parseFloat(style.outlineWidth),
              afterVisible: after.content === '""' && after.display !== "none"
                && parseFloat(after.opacity) > 0 && parseFloat(after.height) > 0,
            };
          });
          expect.soft(focus.active && focus.visible, `${tab} ${label} keyboard focus`).toBe(true);
          expect.soft(focus.outline, `${tab} ${label} focus outline`).not.toBe("none");
          expect.soft(focus.width, `${tab} ${label} focus width`).toBeGreaterThan(0);
          expect.soft(focus.afterVisible, `${tab} ${label} focus underline`).toBe(false);
        }
        await page.screenshot({ path: `artifacts/workstation-visual/${tab}-icon-focus.png`, fullPage: true, animations: "disabled" });
      }
    } finally { await page.close(); }
  }, 45_000);

  it("keeps season hints native-free and uses the shared tooltip in the debug popup", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
    try {
      await openWorkstation(page);
      const season = page.locator("#new-time-season");
      expect(await season.getAttribute("title")).toBeNull();
      await season.hover();
      await settleLayout(page);
      expect(await season.evaluate(element => getComputedStyle(element, "::after").opacity)).toBe("1");
      expect(await page.locator("#relationship-tooltip").isHidden()).toBe(true);
      await page.context().route("**/*debugPanel=*", route => route.fulfill({ contentType: "text/html",
        body: '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
      }));
      const opened = page.waitForEvent("popup");
      await page.evaluate(() => {
        const button = document.createElement("button");
        button.setAttribute("data-ui-open-debug-window", "");
        document.querySelector("#app")!.append(button);
        button.click();
        button.remove();
      });
      const popup = await opened;
      const nextMonth = popup.locator('[data-action="force-next-month"]');
      await nextMonth.waitFor();
      await popup.waitForFunction(() => document.querySelector('[data-debug-connection]')?.textContent === "已连接主游戏");
      expect(await nextMonth.getAttribute("title")).toBeNull();
      await nextMonth.hover();
      const tooltip = popup.locator("#relationship-tooltip");
      expect(await tooltip.isVisible()).toBe(true);
      expect(await tooltip.textContent()).toBe("删除当前阻塞事件并真实结算下一月");
      await nextMonth.focus();
      expect(await nextMonth.getAttribute("aria-describedby")).toBe("relationship-tooltip");
      await popup.keyboard.press("Escape");
      expect(await tooltip.isHidden()).toBe(true);
      await popup.close();
    } finally { await page.close(); }
  }, 30_000);
});
