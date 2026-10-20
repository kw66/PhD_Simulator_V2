import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import type { RunSaveSummary } from "../src/core/v2-run-saves";
import { renderApp } from "../src/app/v2-render";
import { renderRunSaves } from "../src/app/v2-render-run-saves";

const saved: RunSaveSummary = {
  id: "latest", kind: "latest", totalMonths: 2, year: 1, month: 2,
  phase: "playing", playerName: "小明", degree: "master", san: 18, sanCap: 20,
  researchScore: 8, savedAt: "2026-10-17T10:30:00.000Z",
};

describe("run save presentation", () => {
  it("continues an existing role and prevents starting while saves hydrate", () => {
    const account = createDefaultAccountProfile();
    expect(renderApp(createInitialState(), account, { hasRoleSave: true })).toContain('lobby-start-button-label">继续游戏');
    expect(renderApp(createInitialState(), account, { hasRoleSave: true, isSaveLoading: true })).toContain('disabled aria-busy="true"');
  });

  it("lists latest and monthly snapshots with academic date and explicit branch warning", () => {
    const html = renderRunSaves(createInitialState(), {
      isRunSavePanelOpen: true,
      runSaves: [saved, { ...saved, id: "month:2", kind: "month" }],
    });
    expect(html).toContain("1/70个月");
    expect(html).toContain("2023年10月");
    expect(html).toContain("SAN 18/20");
    expect(html).toContain("科研分 8");
    expect(html).toContain('data-ui-load-run-save="latest"');
    expect(html).toContain('data-ui-load-run-save="month:2"');
    expect(html).toContain("回溯会删除该时间点之后的存档与本局成就进度");
    expect(html).not.toContain("手动存档");
    expect(html).not.toContain('class="run-save-load"');
  });

  it("presents identical latest and month progress once while retaining the month load target", () => {
    const html = renderRunSaves(createInitialState(), {
      isRunSavePanelOpen: true,
      runSaves: [{ ...saved, sameAsMonthId: "month:2" }, { ...saved, id: "month:2", kind: "month" }],
    });
    expect(html.match(/data-ui-load-run-save=/g)).toHaveLength(1);
    expect(html).toContain('data-ui-load-run-save="month:2"');
    expect(html).toContain('class="run-save-card is-latest"');
    expect(html).toContain("1/70个月");
  });

  it("does not hide latest progress if its matching month is missing", () => {
    const html = renderRunSaves(createInitialState(), {
      isRunSavePanelOpen: true, runSaves: [{ ...saved, sameAsMonthId: "month:2" }],
    });
    expect(html).toContain('data-ui-load-run-save="latest"');
  });

  it("opens load settings from an ending without changing the finished run", () => {
    const state = { ...dispatchAction(createInitialState(), "start-game", { roleId: "normal" }), phase: "finished" as const, ending: "master" as const };
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "settings", isRunSavePanelOpen: true, runSaves: [saved] });
    expect(html).toContain('data-phase="finished"');
    expect(html).toContain('class="center-main-panel active" data-tab-panel="settings"');
    expect(html).toContain("返回结局");
    expect(html).toContain("结算并返回");
    expect(html).toContain("我要回溯");
    expect(state.phase).toBe("finished");
  });

  it("escapes player names and status strings in saved records", () => {
    const html = renderRunSaves(createInitialState(), { isRunSavePanelOpen: true, runSaves: [{ ...saved, playerName: '<img src=x>' }], saveStatus: '<script>fail</script>' });
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).toContain('&lt;script&gt;fail&lt;/script&gt;');
  });
});
