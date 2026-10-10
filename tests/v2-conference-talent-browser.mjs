import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const artifactDirectory = resolve("artifacts/conference-talents");
await mkdir(artifactDirectory, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, open: false, hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/", async (route) => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div></body></html>' });
      } else {
        await route.continue();
      }
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.evaluate(async () => {
      await import("/src/styles/global.css");
      const { createStartedGameState } = await import("/src/core/v2-engine-state-factory.ts");
      const { activateInternship } = await import("/src/core/v2-internship-system.ts");
      const { renderPlayScreen, renderRelationTalentCard } = await import("/src/app/v2-render-play.ts");
      const { getPlayHelpContext, renderPlayHelpPanel } = await import("/src/app/v2-play-help.ts");
      const { createIcons, icons } = await import("/node_modules/lucide/dist/esm/lucide.mjs");
      const state = createStartedGameState("normal");
      state.month = 1;
      state.totalMonths = 1;
      state.internshipState = activateInternship({ id: "browser-offer", company: "星河科技", position: "多模态算法研究实习生", baseMonthlyIncome: 2, monthlySanCost: 6, experimentBonus: 4 });
      state.conferenceEncounterState.bigBullCooperation = true;
      state.conferenceEncounterState.jointTrainingReward = { mentorId: "browser-mentor", mentorName: "林晓明", ideaBonus: 6, writingBonus: 6, capBonus: 2 };
      const ui = { activePlayTab: "talent", activeTalentTab: "relation", internshipPage: 1, labInheritancePage: 0 };
      document.querySelector("#app").innerHTML = renderPlayScreen(state, ui);
      const updateIcons = () => createIcons({ icons });
      document.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        for (const [attribute, field, cardId] of [
          ["data-ui-lab-inheritance-page", "labInheritancePage", "lab-mutual-growth"],
          ["data-ui-internship-page", "internshipPage", "internship"],
        ]) {
          if (!button.hasAttribute(attribute)) continue;
          ui[field] = Number(button.getAttribute(attribute));
          document.querySelector(`[data-talent-item-id="${cardId}"]`).outerHTML = renderRelationTalentCard(state, cardId, ui);
          updateIcons();
        }
      });
      window.showHelpForCheck = (activePlayTab, index) => {
        const helpUi = { activePlayTab, activeTalentTab: "relation", isHelpOpen: true };
        const context = getPlayHelpContext(helpUi);
        helpUi.helpPageByContext = { [context.key]: index };
        document.querySelector(".play-help-area").outerHTML = renderPlayHelpPanel(helpUi);
        updateIcons();
        return { title: context.pages[index].title, count: context.pages.length };
      };
      updateIcons();
    });
    await page.locator('[data-talent-item-id="internship"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(artifactDirectory, `talents-${viewport.width}.png`), fullPage: true });
    const measure = () => page.evaluate(() => {
      const ids = ["lab-mutual-growth", "internship", "joint-training"];
      return Object.fromEntries(ids.map((id) => {
        const card = document.querySelector(`[data-talent-item-id="${id}"]`);
        const footer = card.querySelector(".talent-item-desc");
        const cardRect = card.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const style = getComputedStyle(footer);
        const clippedMetrics = [...card.querySelectorAll(".talent-item-metric > strong")].filter((metric) => metric.scrollWidth > metric.clientWidth + 1).map((metric) => metric.textContent);
        return [id, {
          height: cardRect.height,
          footerLines: footerRect.height / parseFloat(style.lineHeight),
          bottomGap: cardRect.bottom - footerRect.bottom,
          overflow: card.scrollWidth > card.clientWidth + 1,
          clippedMetrics,
        }];
      }));
    });
    const first = await measure();
    await page.locator('[data-ui-lab-inheritance-page="1"]').click();
    const second = await measure();
    assert.ok(Math.abs(first["lab-mutual-growth"].height - second["lab-mutual-growth"].height) < 1, "inheritance pages must have equal heights");
    for (const measurement of [first, second]) {
      for (const [id, card] of Object.entries(measurement)) {
        assert.ok(!card.overflow, `${viewport.width}: ${id} must not overflow`);
        assert.deepEqual(card.clippedMetrics, [], `${viewport.width}: ${id} values must fit`);
        assert.ok(card.bottomGap <= 12, `${viewport.width}: ${id} footer must sit at bottom`);
        assert.ok(card.footerLines <= (id === "lab-mutual-growth" ? 2.05 : 1.05), `${viewport.width}: ${id} footer must remain compact`);
      }
    }
    await page.locator('[data-ui-internship-page="0"]').click();
    const remote = await measure();
    assert.ok(Math.abs(remote.internship.height - second.internship.height) < 1, "internship pages must have equal heights");
    await page.locator('[data-ui-internship-page="1"]').click();
    const helpChecks = [];
    for (const activePlayTab of ["relationship", "talent"]) {
      let index = 0;
      let count = 1;
      while (index < count) {
        const info = await page.evaluate(({ tab, pageIndex }) => window.showHelpForCheck(tab, pageIndex), { tab: activePlayTab, pageIndex: index });
        count = info.count;
        if (/会场|大牛|搭讪|企业|实习|联培|抵抗/.test(info.title)) {
          const help = await page.locator(".play-help-body").evaluate((element) => ({ overflow: element.scrollWidth > element.clientWidth + 1, scrollable: element.scrollHeight > element.clientHeight + 1 }));
          assert.ok(!help.overflow, `${viewport.width}: ${info.title} must not overflow horizontally`);
          helpChecks.push({ title: info.title, ...help });
          if (/大厂实习|会场活动/.test(info.title)) await page.locator(".play-help-panel").screenshot({ path: resolve(artifactDirectory, `help-${activePlayTab}-${viewport.width}.png`) });
        }
        index += 1;
      }
    }
    assert.deepEqual(errors, [], "browser must not report runtime errors");
    results.push({ viewport, first, second, remote, helpChecks, errors });
    await page.close();
  }
  await writeFile(resolve(artifactDirectory, "layout-report.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await server.close();
}
