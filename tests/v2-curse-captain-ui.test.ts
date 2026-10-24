import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { renderCaptainTags } from "../src/app/v2-render-captain-tags";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createCaptainRunState, getCaptainLoverId } from "../src/core/v2-captain-state";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
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
    expect(html).toMatch(/class="rel-type rel-captain-tag"[^>]*data-relationship-tooltip[^>]*tabindex="0"[^>]*>社交达人 Lv10<\/span>/);
    expect(html).toContain("导师效果：横向项目进度条上限−50。");
    expect(html).toContain("团队加成：每月使能力最低的非社交达人成员对应的社交／亲密／默契+0.5（玩家、恋人、同学）。");
    expect(html).toMatch(/data-advisor-project="horizontal"[\s\S]*?aria-valuemax="50"/);
    expect(html).toContain("满50：");
  });

  it.each([
    ["normal", "每月项目自动推进+3", "每月行动点+0.3", "各进度条上限−15"],
    ["rich", "每月科研经费+2.4", "每月自身收入+1.2金币", "每月给予玩家1.2金币"],
    ["genius", "每月科研积累+1.2", "科研能力及上限+3", "科研能力及上限+3"],
    ["social", "横向项目进度条上限−15", "默契度及上限+3", "亲密度及上限+3"],
    ["teacher-child", "纵向项目进度条上限−15", "受导师指导效果+60%", "协作玩家效果+60%"],
    ["chosen", "挂名论文引用倍率+30%", "每月协作自动推进+0.3次", "每月自动推进+0.3次"],
  ] as const)("explains %s for each relationship using the opening level snapshot", (tag, advisorEffect, fellowEffect, loverEffect) => {
    const state = enroll("research-captain");
    state.fellowProgressState = (["senior", "peer", "junior"] as const).map(type =>
      createCustomFellowProgressProfile({ type, gender: "female", name: type, research: 8, affinity: 4, startTotalMonths: 1 }));
    state.loverState = { ...state.loverState, active: true, name: "恋人", type: "smart", gender: "female", startTotalMonths: 1 };
    state.loverProgressState = { ...createLoverProgressState("smart", () => 0.5), active: true };
    state.relationshipState.loverCount = 1;
    state.captainState = { ...createCaptainRunState({ [tag]: 3 }), tags: {
      advisor: tag, [getCaptainLoverId(state)]: tag,
      ...Object.fromEntries(state.fellowProgressState.map(profile => [profile.id, tag])),
    } };
    const account = createDefaultAccountProfile();
    account.roleProgress[tag].level = 10;
    const html = renderApp(state, account, { activePlayTab: "relationship" });
    const badges = html.match(/<span class="rel-type rel-captain-tag"[^>]*>[\s\S]*?<\/span>/g)!;
    expect(badges).toHaveLength(5);
    expect(badges.filter(badge => badge.includes(`导师效果：${advisorEffect}。`))).toHaveLength(1);
    expect(badges.filter(badge => badge.includes(`同学效果：${fellowEffect}。`))).toHaveLength(3);
    expect(badges.filter(badge => badge.includes(`恋人效果：${loverEffect}。`))).toHaveLength(1);
    for (const badge of badges) {
      expect(badge).toContain(" Lv3</span>");
      expect(badge).toContain("团队加成：");
      expect(badge).not.toContain("本局开局等级");
      expect(badge).not.toContain("团队加成按");
      expect(badge).not.toContain("档位抵抗");
      expect(badge).toContain('data-relationship-tooltip');
      expect(badge).toContain('tabindex="0"');
      expect(badge).toContain('aria-description=');
      expect(badge).not.toContain("Lv10");
      expect(badge).not.toContain("/级");
    }
  });
});
