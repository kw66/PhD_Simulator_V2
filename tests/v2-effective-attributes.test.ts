import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getEffectiveResearch, getEffectiveSocial } from "../src/core/v2-effective-attributes";
import { applyPlayerAttributeChange, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { getAvailablePaperSlotCount, createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import { calculateMonthlyCareerProgress } from "../src/core/v2-career-rules";
import { createAdvisorTalkRandomEvent } from "../src/core/v2-random-events-lab-advisor-talk";
import { getPlayerAnnualResearchGrowth, getAnnualLabSocialRewards } from "../src/core/v2-lab-talent";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { renderApp } from "../src/app/v2-render";
import type { GameState, RoleId } from "../src/core/v2-types";

function stateFor(role: RoleId, levels: Record<string, number> = {}): GameState {
  const state = createStartedGameState(role);
  return { ...state, totalMonths: 1, month: 1, eventQueue: [], roleTalents: { levels },
    player: { ...state.player, research: 18, social: 18, favor: 12, san: 20 }, sanCap: 20 };
}

describe("effective talent attributes", () => {
  it.each(["master", "phd"] as const)("uses real research rather than advisor favor for %s osmosis", (degree) => {
    const state = { ...stateFor("teacher-child", { "learning-by-osmosis": 1 }), degree };
    state.player = { ...state.player, research: 3, favor: 18 };
    expect(getEffectiveResearch(state)).toBe(3);
    expect(calculateMonthlyCareerProgress(state, "internet")).toBe(1);
    expect(getAvailablePaperSlotCount(state)).toBe(getAvailablePaperSlotCount({ ...state, roleTalents: { levels: {} } }));
    expect(getEffectiveResearch({ ...state, player: { ...state.player, research: 19, favor: 2 } })).toBe(19);
  });

  it("hides cursed research from ability checks but keeps real resistance and growth", () => {
    const state = stateFor("genius-reversed");
    expect(getEffectiveResearch(state)).toBe(0);
    expect(calculateMonthlyCareerProgress(state, "internet")).toBe(0);
    expect(getAvailablePaperSlotCount(state)).toBe(1);
    expect(previewPlayerAttributeChange(state, "research", 1).effectiveChange).toBe(0.4);
    const next = applyPlayerAttributeChange(state, "research", 1).state;
    expect(next.player.research).toBe(18.4);
    expect(getEffectiveResearch(next)).toBe(0);
    expect(getEffectiveResearch({ ...state, roleTalents: undefined })).toBe(18);
  });

  it("breaks the curse using real research and restores ability readings", () => {
    const state = stateFor("genius-reversed", { "break-research-curse": 1 });
    state.player.research = 19.8;
    const next = applyPlayerAttributeChange(state, "research", 1).state;
    expect(next.roleTalents?.researchCurseBroken).toBe(true);
    expect(getEffectiveResearch(next)).toBe(next.player.research);
    expect(getAvailablePaperSlotCount(next)).toBe(4);
  });

  it("uses advisor favor only for the purchased post-PhD talent", () => withGameplayRuleset("20261022-r27", () => {
    const state = stateFor("teacher-child", { "learning-by-osmosis": 1 });
    state.player.research = 3;
    expect(getEffectiveResearch(state)).toBe(3);
    const phd: GameState = { ...state, degree: "phd" };
    expect(getEffectiveResearch(phd)).toBe(12);
    expect(calculateMonthlyCareerProgress(phd, "internet")).toBe(6);
    expect(previewPlayerAttributeChange(phd, "research", 1).effectiveChange).toBe(1);
    expect(getEffectiveResearch({ ...phd, roleTalents: { levels: {} } })).toBe(3);
  }));

  it("subtracts the dynamic favor cap, never current favor, without mutating real stats", () => {
    const state = stateFor("teacher-child-reversed");
    state.roleTalents!.capBonuses = { favor: -10 };
    state.player.favor = 1;
    expect(getEffectiveResearch(state)).toBe(8);
    expect(getEffectiveSocial(state)).toBe(8);
    expect(getAnnualLabSocialRewards(state).fellowAffinity).toBe(1);
    expect(previewPlayerAttributeChange(state, "social", -1).effectiveChange).toBe(-0.4);
    expect(state.player.research).toBe(18);
    expect(getEffectiveSocial({ ...state, player: { ...state.player, social: 5 } })).toBe(0);
  });

  it("preserves the full-SAN snapshot after payment and allows overflow SAN", () => {
    const initial = stateFor("normal-reversed", { "full-san-research": 1 });
    const paid: GameState = { ...initial, player: { ...initial.player, san: 15 } };
    expect(getEffectiveResearch(initial)).toBe(22);
    expect(getEffectiveResearch(paid)).toBe(18);
    expect(getEffectiveResearch(paid, initial)).toBe(22);
    expect(getEffectiveResearch({ ...initial, sanCap: 31, player: { ...initial.player, san: 31 } })).toBeCloseTo(24.2);
    expect(getEffectiveResearch({ ...initial, player: { ...initial.player, san: 25 } })).toBe(23);
    expect(previewPlayerAttributeChange(initial, "research", 1).effectiveChange).toBe(0.4);
  });

  it("keeps bonus or previously unlocked paper slots while cursed", () => {
    const state = stateFor("genius-reversed");
    state.paperSlotsUnlocked = 3;
    expect(getAvailablePaperSlotCount(state)).toBe(3);
  });

  it("uses effective ability for produced scores and event branches", () => {
    const state = stateFor("genius-reversed");
    const paper = createDraftPaper(1, 1, () => 0);
    state.papers = [paper];
    const result = applyResearchOperation(state, paper.id, "idea", () => 0.5);
    expect(result.papers[0]!.idea).toBe(3);
    expect(result.player.research).toBe(18);
    const event = createAdvisorTalkRandomEvent(state, () => 0.5);
    expect(event.choices[0]!.outcome).not.toContain("科研 ≥ 6");
  });

  it("compares effective research for inheritance but resists its reward using real research", () => {
    const state = stateFor("genius-reversed");
    state.fellowProgressState = [createCustomFellowProgressProfile({ identitySeed: "effective-test", type: "peer", gender: "female", research: 1, affinity: 1, startTotalMonths: 1 })];
    expect(getPlayerAnnualResearchGrowth(state)).toBe(0.4);
  });

  it("shows real stats and explains their effective values in the attribute tooltip", () => {
    const state = stateFor("genius-reversed");
    const html = renderApp(state);
    expect(html).toContain('data-player-stat="research"');
    expect(html).toContain('data-stat-value="18"');
    expect(html).toContain("当前能力视为0");
    expect(html).toContain("真实值18");
    expect(html).toContain("科研任务SAN减免0");
  });

  it("shows the chosen growth-only reduction and reversed per-attribute reductions", () => {
    const chosen = stateFor("chosen", { "lasting-fortune": 3 });
    expect(renderApp(chosen)).toContain("科研增长抵抗30%｜下降抵抗60%");
    const reversed = stateFor("chosen-reversed", { "reverse-meter-alpha": 3, "reverse-meter-beta": 2, "reverse-meter-gamma": 1 });
    const html = renderApp(reversed);
    expect(html).toContain("科研增长抵抗30%｜下降抵抗90%");
    expect(html).toContain("社交增长抵抗40%｜下降抵抗80%");
    expect(html).toContain("好感增长抵抗30%｜下降抵抗50%");
  });
});
