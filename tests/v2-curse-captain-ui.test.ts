import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { renderCaptainTags } from "../src/app/v2-render-captain-tags";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createCaptainRunState } from "../src/core/v2-captain-state";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { hasUnpaidCurseDebt } from "../src/core/v2-curse-system";
import type { RoleId } from "../src/core/v2-types";

function enroll(roleId: RoleId) {
  let state = dispatchAction(createInitialState(), "start-game", { roleId, curseDifficulty: 2 });
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    state = dispatchAction(state, "resolve-event", { eventChoiceId });
  }
  return dispatchAction(state, "next-month");
}

describe("curse and captain UI", () => {
  it("uses persisted difficulty selection, locks later ranks and offers no allocation controls", () => {
    const account = createDefaultAccountProfile();
    account.selectedLobbyRoleId = "cursed-debt";
    account.roleProgress["cursed-debt"].unlocked = true;
    account.curseDifficultyUnlocked = { "cursed-debt": 2 };
    account.curseDifficultyByRole = { "cursed-debt": 2 };
    const html = renderApp(createInitialState(), account);
    const nodes = html.split("<button").filter(part => part.includes("data-curse-difficulty="));
    expect(nodes).toHaveLength(4);
    expect(nodes[1]).toContain("is-selected");
    expect(nodes[1].split(">")[0]).not.toContain(" disabled");
    expect(nodes[2].split(">")[0]).toContain('disabled aria-disabled="true"');
    expect(html).not.toContain('data-ui-talent-reset=');
    expect(html).not.toContain('class="lobby-talent-points-hint"');
    expect(nodes.some(part => part.split(">")[0].includes("data-talent-id="))).toBe(false);
  });

  it("shows the actual run difficulty and a debt repayment entry without allowing mid-run difficulty changes", () => {
    const state = enroll("cursed-debt");
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "settings" });
    expect(html).toContain('data-curse-read-only="true"');
    expect(html).toMatch(/is-selected[^>]*data-curse-difficulty="2"/);
    expect(html).toContain("待偿债务");
    expect(html).toContain('data-action="repay-debt" data-delta="1"');
    expect(html).toContain("尽力还款");
  });

  it.each([[1e-10, 0.01], [0.00496, 0.01], [0.0100000001, 0.02], [0.024, 0.03], [127.3400000001, 127.35], [127.34496, 127.35]])("shows the payable cents for debt %s and clears it with the displayed amount", (debt, payoff) => {
    const state = enroll("cursed-debt");
    state.curseState = { ...state.curseState!, debt };
    state.player.money = payoff;
    const account = createDefaultAccountProfile();
    const html = renderApp(state, account, { activePlayTab: "settings" });
    expect(html).toContain(`结清需${payoff}金币`);
    expect(html).not.toContain("待偿债务 0 金币");
    if (debt < 0.01) expect(html).toContain("待偿债务 &lt;0.01 金币");
    expect(html).toContain('data-action="repay-debt">尽力还款');
    expect(hasUnpaidCurseDebt(state)).toBe(true);
    const cleared = dispatchAction(state, "repay-debt");
    expect(cleared.player.money).toBe(0);
    expect(hasUnpaidCurseDebt(cleared)).toBe(false);
    const paidHtml = renderApp(cleared, account, { activePlayTab: "settings" });
    expect(paidHtml).toContain("待偿债务 0 金币");
    expect(paidHtml).not.toContain("结清需");
    expect(paidHtml).toContain('data-action="repay-debt" disabled>尽力还款');
  });

  it("renders captain run levels independently from later account level changes", () => {
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 10;
    const run = createCaptainRunState({ normal: 2 });
    const direct = renderCaptainTags(account.roleProgress, 0, run.levels);
    expect(direct).toContain("大多数 Lv2");
    expect(direct).not.toContain("大多数 Lv10");
    const state = { ...enroll("research-captain"), captainState: run };
    const html = renderApp(state, account, { activePlayTab: "talent", activeTalentTab: "character", captainTagRoleProgress: account.roleProgress });
    expect(html).toContain("大多数 Lv2");
    expect(html).not.toContain("标签等级在本局开局时确定");
  });

  it("uses captain progress caps and tags in relationship cards", () => {
    let state = enroll("research-captain");
    state = { ...state, captainState: { ...createCaptainRunState({ social: 10 }), tags: { advisor: "social" } } };
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "relationship" });
    expect(html).toContain('class="rel-type rel-captain-tag">社交达人 Lv10</span>');
    expect(html).toMatch(/data-advisor-project="horizontal"[\s\S]*?aria-valuemax="50"/);
    expect(html).toContain("满50：");
  });
});
