import { describe, expect, it } from "vitest";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyMonthlyEffects, applyMonthStartSubscriptions, previewNextMonthEffects, resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import { activateRemoteInternship, getInternshipSalaryPayment } from "../src/core/v2-internship-system";
import { investRoleTalentMoney, settleRoleTalentInvestments } from "../src/core/v2-role-talent-investments";
import type { GameState } from "../src/core/v2-types";
import { renderApp } from "../src/app/v2-render";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";

function playing(role: GameState["selectedRoleId"], levels: Record<string, number>): GameState {
  const state = createInitialState();
  return { ...state, selectedRoleId: role, phase: "playing", totalMonths: 1, month: 9,
    roleTalents: { levels }, player: { ...state.player, money: 100, san: 20 } };
}

describe("role talent monthly economy", () => {
  it("toggles gold power without consuming resources and preserves the choice across months", () => {
    const state = playing("rich", { "gold-power-alpha": 1 });
    const enabled = dispatchAction(state, "toggle-gold-power");
    expect(enabled.roleTalents?.goldPowerEnabled).toBe(true);
    expect(enabled.player).toEqual(state.player);
    expect(enabled.actionState).toEqual(state.actionState);
    expect(state.roleTalents?.goldPowerEnabled).toBeUndefined();
    expect(applyMonthlyEffects(enabled).nextState.roleTalents?.goldPowerEnabled).toBe(true);
    expect(dispatchAction(enabled, "toggle-gold-power").roleTalents?.goldPowerEnabled).toBe(false);
  });

  it("ignores gold switching without the rich talent or outside a playing run", () => {
    for (const state of [playing("rich", {}), playing("normal", { "gold-power-alpha": 1 }),
      { ...playing("rich", { "gold-power-alpha": 1 }), phase: "setup" as const },
      { ...playing("rich", { "gold-power-alpha": 1 }), phase: "finished" as const }]) {
      expect(dispatchAction(state, "toggle-gold-power").roleTalents?.goldPowerEnabled).not.toBe(true);
    }
  });

  it("renders an unchecked gold switch beside the coin balance and reflects its active state", () => {
    const state = playing("rich", { "gold-power-alpha": 1 });
    state.player.money = 1;
    const options = { activePlayTab: "research" as const };
    const html = renderApp(state, createDefaultAccountProfile(), options);
    expect(html).toMatch(/class="new-currency-value"[\s\S]*?data-action="toggle-gold-power" aria-pressed="false"/);
    expect(html.match(/<button[^>]*data-action="toggle-gold-power"[^>]*>/)?.[0]).not.toContain("disabled");
    const enabled = dispatchAction(state, "toggle-gold-power");
    expect(renderApp(enabled, createDefaultAccountProfile(), options)).toContain('data-action="toggle-gold-power" aria-pressed="true"');
    expect(renderApp(playing("rich", {}), createDefaultAccountProfile(), options)).not.toContain('data-action="toggle-gold-power"');
  });
  it("invests multiple principals without recording spending and returns each once after twelve months", () => {
    const initial = playing("rich", { "investment-savvy": 2 });
    const first = investRoleTalentMoney(initial);
    const second = investRoleTalentMoney(first.state);
    expect(first.success).toBe(true);
    expect(second.state.player.money).toBe(90);
    expect(second.state.personalSpending).toBe(initial.personalSpending);
    expect(second.state.actionState).toEqual(initial.actionState);
    expect(second.state.roleTalents?.investments?.map((item) => item.id)).toEqual([1, 2]);
    expect(settleRoleTalentInvestments({ ...second.state, totalMonths: 12 }).count).toBe(0);
    const settled = settleRoleTalentInvestments({ ...second.state, totalMonths: 13 });
    expect(settled).toMatchObject({ principal: 10, interest: 4, count: 2, state: { player: { money: 104 } } });
    expect(settleRoleTalentInvestments(settled.state).count).toBe(0);
  });

  it("requires a learned talent and sufficient funds", () => {
    expect(investRoleTalentMoney(playing("rich", {})).success).toBe(false);
    const state = playing("rich", { "investment-savvy": 1 });
    state.player.money = 4.99;
    expect(investRoleTalentMoney(state)).toMatchObject({ success: false, state });
  });

  it("settles due investment in preview and month-start without mutating the source", () => {
    const invested = investRoleTalentMoney(playing("rich", { "investment-savvy": 1 })).state;
    const state = { ...invested, totalMonths: 13 };
    const before = structuredClone(state);
    const preview = resolveMonthlyEffects(state);
    const settled = applyMonthlyEffects(state);
    expect(preview.items.find((item) => item.id === "talent-investment-return")?.appliedStats.money).toBe(6);
    expect(settled.nextState.player.money).toBe(100);
    expect(settled.nextState.roleTalents?.investments).toEqual([]);
    expect(settled.nextState.personalSpending).toBe((state.personalSpending ?? 0) + 1);
    expect(state).toEqual(before);
  });

  it("multiplies internship income including remote internships", () => {
    const state = playing("rich", { "work-pays-off": 1 });
    state.totalMonths = 2;
    state.internshipState = activateRemoteInternship(1);
    expect(getInternshipSalaryPayment(state).payment).toBe(1.5);
    state.roleTalents!.levels["work-pays-off"] = 2;
    expect(getInternshipSalaryPayment(state).payment).toBe(2);
  });

  it("resists each raw attribute change separately and retains breakthrough counters and caps", () => {
    const state = playing("normal", { breakthrough: 1 });
    state.player.social = 20;
    state.buffs = [1, -1].map((social, index) => ({ id: `test-${index}`, name: "test", source: "test",
      timing: "monthly", remainingMonths: 1, monthlyStats: { social } }));
    const result = applyMonthlyEffects(state);
    expect(result.nextState.player.social).toBe(20);
    expect(result.nextState.roleTalents?.capBonuses?.social).toBe(1);
    expect(result.nextState.roleTalents?.breakthroughCounts?.social).toBe(1);
  });

  it("replaces separate SAN drains despite recoveries and counts replacement spending once", () => {
    const state = playing("rich", { "gold-power-alpha": 1 });
    state.roleTalents!.goldPowerEnabled = true;
    state.month = 5;
    state.totalMonths = 5;
    state.buffs = [{ id: "test", name: "test", source: "test", timing: "monthly", remainingMonths: 1,
      monthlyStats: { san: -2, money: 5 } }];
    const result = applyMonthlyEffects(state);
    expect(result.nextState.player.san).toBe(20);
    expect(result.nextState.player.money).toBe(101); // -1 living, -1 winter, +5 income, -2 drain
    expect(result.nextState.personalSpending).toBe((state.personalSpending ?? 0) + 4);
  });

  it("uses resisted actual social losses for gold substitution in r24 recordings", () => withGameplayRuleset("20261022-r24", () => {
    const state = playing("rich", { "gold-power-gamma": 1 });
    state.player.social = 18;
    state.buffs = [{ id: "test", name: "test", source: "test", timing: "monthly", remainingMonths: 1,
      monthlyStats: { social: -1 } }];
    const result = applyMonthlyEffects(state);
    expect(result.nextState.player.social).toBe(18);
    expect(result.nextState.player.money).toBe(99.2);
    expect(result.nextState.personalSpending).toBe((state.personalSpending ?? 0) + 0.8);
  }));

  it("does not clamp untouched overflow attributes or SAN at month-start", () => {
    const state = playing("chosen-reversed", {});
    state.player = { ...state.player, research: 50, social: 50, favor: 50, san: 50 };
    const result = applyMonthlyEffects(state);
    expect(result.nextState.player).toMatchObject({ research: 50, social: 50, favor: 50, san: 50 });
  });

  it("previews first-month and semester recovery without consuming their settlement", () => {
    const first = playing("normal", { "first-month-drive": 1, "first-month-drive-plus": 5 });
    first.month = 1;
    first.player.san = 5;
    const before = structuredClone(first);
    const preview = previewNextMonthEffects(first);
    expect(preview.items.find((item) => item.id === "monthly-role-growth")).toMatchObject({
      name: "满怀干劲", appliedStats: { san: 5 },
    });
    expect(preview.player.san).toBe(12);
    expect(first).toEqual(before);
    const semester = { ...first, totalMonths: 6, month: 6 };
    expect(previewNextMonthEffects(semester).items.find((item) => item.id === "monthly-role-growth"))
      .toMatchObject({ name: "满怀干劲+", appliedStats: { san: 5 } });
    expect(previewNextMonthEffects(semester)).toEqual(previewNextMonthEffects(semester));
  });

  it("previews next action allowance and yearly gains with no mutation", () => {
    const state = playing("normal", { diligence: 5, epiphany: 1 });
    state.degree = "phd";
    state.totalMonths = 12;
    state.month = 12;
    state.roleTalents!.actionRemainder = 0.5;
    const before = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "monthly-role-actions")?.label).toBe("行动 +1");
    expect(preview.items.find((item) => item.id === "annual-role-growth")?.appliedStats)
      .toMatchObject({ research: 1, social: 1, favor: 1 });
    expect(state).toEqual(before);
  });

  it("never samples random swaps while previewing but still shows their qualitative notice", () => {
    const state = playing("chosen-reversed", { "attribute-swap": 1, "san-money-swap": 1 });
    state.month = 1;
    state.player = { ...state.player, research: 1, social: 10, favor: 18, san: 5, money: 100 };
    const before = structuredClone(state);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "monthly-role-random-swap")?.label).toBe("随机交换");
    expect(preview.items.find((item) => item.id === "monthly-role-curse-cap"))
      .toMatchObject({ name: "命运反噬", label: "SAN上限 -1", appliedStats: {} });
    expect(preview.player).toMatchObject({ research: 1, social: 10, favor: 18 });
    expect(previewNextMonthEffects(state)).toEqual(preview);
    expect(state).toEqual(before);
  });

  it("retains substituted spending exactly once in the r24 engine's early month-start failure path", () => withGameplayRuleset("20261022-r24", () => {
    const state = playing("rich", { "gold-power-gamma": 1 });
    state.month = 2;
    state.totalMonths = 2;
    state.player.social = 18;
    state.buffs = [{ id: "fatal-month", name: "test", source: "test", timing: "monthly", remainingMonths: 1,
      monthlyStats: { social: -1, san: -100 } }];
    const next = dispatchAction(state, "next-month");
    expect(next.phase).toBe("finished");
    expect(next.player.social).toBe(18);
    expect(next.player.money).toBe(98.2);
    expect(next.personalSpending).toBe((state.personalSpending ?? 0) + 1.8);
  }));

  it("renders talent recovery and qualitative random swaps in the next-month effect rail", () => {
    const normal = playing("normal", { "first-month-drive": 1 });
    normal.month = 1;
    normal.player.san = 5;
    expect(renderApp(normal, createDefaultAccountProfile(), { activePlayTab: "research" })).toContain("满怀干劲 +5");
    const reversed = playing("chosen-reversed", { "attribute-swap": 1 });
    reversed.month = 1;
    const html = renderApp(reversed, createDefaultAccountProfile(), { activePlayTab: "research" });
    expect(html).toContain("随机交换");
    expect(html).toContain("月初随机确定交换结果");
  });

  it("checks funding-shield threshold separately for each automatic AI renewal", () => {
    const state = playing("teacher-child", { "funding-shield": 1 });
    state.advisorProgressState.funding = 60;
    state.player.money = 5;
    state.aiShopState.subscriptions.gpt.enabled = true;
    state.aiShopState.subscriptions.claude.enabled = true;
    const result = applyMonthStartSubscriptions(state);
    expect(result.nextState.advisorProgressState.funding).toBe(58);
    expect(result.nextState.player.money).toBe(3);
    expect(result.resolution.items.find((item) => item.id === "ai-renewal-gpt")?.note).toContain("经费护航");
    expect(result.resolution.items.find((item) => item.id === "ai-renewal-claude")?.appliedStats.money).toBe(-2);
  });

  it("preserves gifts reserved for other shop purchases during funding-shield renewal", () => {
    const state = playing("teacher-child", { "funding-shield": 1 });
    state.advisorProgressState.funding = 60;
    state.loverProgressState.giftCoupons = 1;
    state.aiShopState.subscriptions.gpt.enabled = true;
    const result = applyMonthStartSubscriptions(state);
    expect(result.nextState.advisorProgressState.funding).toBe(58);
    expect(result.nextState.loverProgressState.giftCoupons).toBe(1);
    expect(result.resolution.items.find((item) => item.id === "ai-renewal-gpt")?.note).toContain("经费护航");
  });

  it("applies sloth monthly loss multipliers without changing recovery amounts", () => {
    const state = playing("normal-reversed", { "monthly-san-recovery": 2, "post-phd-recovery": 1 });
    state.month = 5;
    state.totalMonths = 5;
    state.player.san = 10;
    expect(resolveMonthlyEffects(state).player.san).toBe(11); // +1 base +2 talent -2 winter
    state.degree = "phd";
    expect(resolveMonthlyEffects(state).player.san).toBe(11); // +1 base +2 talent +1 missing -3 winter
  });
});
