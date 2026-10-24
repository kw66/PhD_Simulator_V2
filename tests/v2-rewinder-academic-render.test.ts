import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { renderAcademicArchive } from "../src/app/v2-render-rewinder-academic";
import { renderRewinderPreview } from "../src/app/v2-render-rewinder";
import { createInitialState } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { captureAcademicYear } from "../src/core/v2-rewinder-academic-record";
import { completeAcademicArchive, prepareAcademicArchive, selectAcademicSource } from "../src/core/v2-rewinder-academic";
import type { GameState } from "../src/core/v2-types";
import { getRoleChibiPortraitUrl } from "../src/app/v2-role-portrait-assets";

function fixture(): GameState {
  const base = createStartedGameState("rewinder");
  const previous = captureAcademicYear({ ...base, phase: "playing", totalMonths: 12, month: 12, year: 1,
    selectedAdvisorName: "此前导师", player: { ...base.player, research: 17, money: 60 },
    coffeeState: { ...base.coffeeState, machineOwned: true, machineUpgrade: "advanced" },
    fellowProgressState: [createCustomFellowProgressProfile({ type: "peer", gender: "female", name: "林清", research: 15, affinity: 12, startTotalMonths: 1 })] });
  return prepareAcademicArchive({ ...base, phase: "playing", totalMonths: 12, month: 12, year: 1,
    selectedAdvisorName: "本次导师", player: { ...base.player, money: 23 },
    coffeeState: { ...base.coffeeState, machineOwned: true, machineUpgrade: "automatic" },
    rewinderState: { ...base.rewinderState!, cycleNumber: 3, academic: { startYear: 1, history: { version: 1, years: { 1: previous } } } } });
}

describe("academic archive pages", () => {
  it("shows one distinct act at a time and only offers final confirmation in act three", () => {
    const state = fixture();
    const first = renderAcademicArchive(state, 0);
    expect(first).toContain('role="dialog"');
    expect(first).toContain('data-academic-act-page="0"');
    expect(first).toContain("金币");
    expect(first).toContain("60");
    expect(first).not.toContain('data-action="select-rewinder-archive-papers"');
    expect(first).not.toContain('data-action="confirm-rewinder-archive"');
    expect(first).not.toContain("data-ui-rewinder-act");
    const second = renderAcademicArchive(state, 1);
    expect(second).toContain('data-action="select-rewinder-archive-papers"');
    expect(second).toContain('data-action="select-rewinder-archive-coffee"');
    expect(second).not.toContain("academic-attribute-grid");
    const third = renderAcademicArchive(state, 2);
    expect(third).toContain('data-action="confirm-rewinder-archive"');
    expect(third).toContain("林清");
    expect(third).toContain("本次导师");
    expect(third).toContain("此前导师");
    expect(third).not.toContain("academic-paper-options");
    expect(third).not.toContain("undefined");
  });

  it("renders whole-paper selection from saved core state and blocks ordinary gameplay under the modal", () => {
    const state = selectAcademicSource(fixture(), "paperSource", "previous");
    const html = renderApp(state, undefined, { activePlayTab: "workstation", academicArchiveAct: 1 });
    expect(html).toContain('<section class="play-stage-shell" inert>');
    expect(html).toContain('data-rewinder-paper-source="previous" aria-pressed="true"');
    expect(html).toContain('data-rewinder-paper-source="current" aria-pressed="false"');
    expect(html.match(/data-academic-act-page=/g)).toHaveLength(1);
  });

  it("offers only unlocked start years and disables switching during an unfinished attempt", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "rewinder";
    account.roleProgress.rewinder.unlocked = true;
    account.rewinderAcademicArchive = { version: 1, years: { 1: captureAcademicYear(fixture()) } };
    const setup = createInitialState();
    const html = renderApp(setup, account);
    expect(html).toContain("开始第2学年");
    expect(html).toMatch(/data-ui-rewinder-start-year="2"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-ui-rewinder-start-year="3"[^>]*aria-pressed="false"[^>]*disabled/);
    expect(html.match(/data-rewinder-year=/g)).toHaveLength(6);
    expect(html).not.toContain("rewinder-year-picker");
    expect(html.match(new RegExp(`<img class="special-role-avatar" src="${getRoleChibiPortraitUrl("rewinder")}"`, "g"))).toHaveLength(6);
    const resumed = renderApp(setup, account, { hasRoleSave: true });
    expect(resumed).toContain("继续本学年");
    expect(resumed).toMatch(/data-ui-rewinder-start-year="1"[^>]*aria-pressed="false"[^>]*disabled/);
    expect(renderApp(setup, account, { rewinderStartYear: 1 })).toContain("开始第1学年");
  });

  it("keeps the compact special rule in the first talent row", () => {
    const html = renderRewinderPreview(6, 8, 4);
    expect(html).toContain("第8次轮回 · 第4学年");
    expect(html).toContain("第8次轮回");
    expect(html).toContain("每次挑战一个学年，8月归档，9月承接上一年成果");
    expect(html).not.toContain("事件可回退，结果固定");
    expect(html).toContain("grid-column:4;grid-row:1");
    expect(html).not.toContain("局内轮回");
    expect(html).not.toContain("正式结算后留给下一世");
  });

  it("keeps the setup talent preview free of the cycle banner", () => {
    const html = renderRewinderPreview(3, 1, 1, false);
    expect(html).not.toContain("rewinder-cycle-banner");
    expect(html).toContain("rewinder-preview-card is-setup-preview");
  });

  it("shows storage failure inside the modal and freezes chosen records while allowing a save retry", () => {
    const completed = completeAcademicArchive(fixture());
    const html = renderAcademicArchive(completed, 2, "账户进度未能保存，请释放浏览器存储空间后重试");
    expect(html).toContain('role="alert"');
    expect(html).toContain("账户进度未能保存");
    expect(html).toContain("重试归档并返回");
    const choices = html.match(/<button\b[^>]*data-action="toggle-rewinder-archive-person"[^>]*>/g)!;
    expect(choices.every(button => button.includes(" disabled"))).toBe(true);
    expect(html.match(/<button\b[^>]*data-action="confirm-rewinder-archive"[^>]*>/)?.[0]).not.toContain("disabled");
  });
});
