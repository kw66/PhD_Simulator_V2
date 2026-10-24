import { describe, expect, it } from "vitest";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { applyPrepublicationPaperDecay, createDraftPaper } from "../src/core/v2-paper-rules";
import { getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { getRoleKindReviewerBonus } from "../src/core/v2-role-talent-state";
import { settleFellowRecruitmentTalent } from "../src/core/v2-role-talent-relationships";
import {
  initializeRoleTalents, applyRoleTalentAdvisorAssignment, applyRoleTalentPhdTransfer,
  settleRoleTalentMonthStart, settleRoleTalentYearEnd, syncRoleTalentFellows, settleRoleTalentDiseaseMilestones,
  settleRoleTalentMonthEnd, settleRoleTalentPaperRejection,
} from "../src/core/v2-role-talent-lifecycle";
import type { GameState, RoleId } from "../src/core/v2-types";

function run(role: RoleId, levels: Record<string, number>): GameState {
  return { ...createStartedGameState(role), roleTalents: { levels } };
}
function month(state: GameState, totalMonths: number): GameState {
  return { ...state, totalMonths, year: Math.floor((totalMonths - 1) / 12) + 1, month: ((totalMonths - 1) % 12) + 1 };
}
function paper(id: string, target: "A" | "B" | "C", nonFirstAuthor = false) {
  return { ...createDraftPaper(1, 0, () => 0), id, target, status: "published" as const, nonFirstAuthor };
}
function fellow(id: string, research: number) {
  return createCustomFellowProgressProfile({ identitySeed: id, type: "peer", gender: "male", research, affinity: 1, startTotalMonths: 1 });
}

describe("role talent lifecycle", () => {
  it("scales osmosis to twenty percent at rank two", () => {
    const before = month(run("teacher-child", { "learning-by-osmosis": 2 }), 12);
    before.player = { ...before.player, research: 1, favor: 10 };
    expect(settleRoleTalentYearEnd(before).player.research).toBe(3);
  });
  it.each(["master", "phd"] as const)("settles osmosis at August end in %s with ordinary research resistance and no fellow changes", (degree) => {
    const before = month(run("teacher-child", { "learning-by-osmosis": 1 }), degree === "master" ? 12 : 36);
    before.degree = degree;
    before.player = { ...before.player, research: 6, favor: 15 };
    before.fellowProgressState = [fellow("unaffected", 8)];
    expect(settleRoleTalentYearEnd({ ...before, month: 11 }).player.research).toBe(6);
    expect(settleRoleTalentMonthStart(before).player.research).toBe(6);
    const after = settleRoleTalentYearEnd(before);
    expect(after.player.research).toBe(7.2);
    expect(after.player.favor).toBe(15);
    expect(after.roleTalents?.growthTotals?.research).toBe(1.2);
    expect(after.fellowProgressState).toEqual(before.fellowProgressState);
    expect(settleRoleTalentYearEnd(after)).toBe(after);
    const nextYear = settleRoleTalentYearEnd(month(after, before.totalMonths + 12));
    expect(nextYear.player.research).toBe(8.4);
  });

  it("uses the updated annual favor for osmosis and respects the research cap", () => {
    const before = month(run("teacher-child", { "learning-by-osmosis": 1, "growing-familiarity": 1 }), 12);
    before.player = { ...before.player, research: 1, favor: 6 };
    const after = settleRoleTalentYearEnd(before);
    expect(after.player.favor).toBe(6.8);
    expect(after.player.research).toBe(1.68);
    const nearCap = { ...before, player: { ...before.player, research: 19.8, favor: 18 } };
    expect(settleRoleTalentYearEnd(nearCap).player.research).toBe(20);
    const capped = { ...before, player: { ...before.player, research: 20, favor: 18 } };
    expect(settleRoleTalentYearEnd(capped).player.research).toBe(20);
  });

  it("does not apply osmosis at enrollment, without its talent, or in r27", () => {
    const before = run("teacher-child", { "learning-by-osmosis": 1 });
    before.player = { ...before.player, research: 3, favor: 18 };
    expect(initializeRoleTalents(before).player.research).toBe(3);
    expect(settleRoleTalentYearEnd(month({ ...before, roleTalents: { levels: {} } }, 12)).player.research).toBe(3);
    for (const degree of ["master", "phd"] as const) {
      const legacy = withGameplayRuleset("20261022-r27", () => settleRoleTalentYearEnd(month({ ...before, degree }, 12)));
      expect(legacy.player.research).toBe(3);
    }
  });

  it("settles a paper milestone immediately after annual favor crosses its threshold", () => {
    const before = month(run("teacher-child", { "growing-familiarity": 1, "family-patronage": 1 }), 12);
    before.player.favor = 11.8;
    expect(before.externalPublications).toHaveLength(0);
    const after = settleRoleTalentYearEnd(before);
    expect(after.player.favor).toBeGreaterThanOrEqual(12);
    expect(after.externalPublications.map(paper => paper.target)).toEqual(["C"]);
    expect(after.roleTalents?.familyPatronageGrantedIds).toEqual(["family-patronage"]);
    expect(settleRoleTalentYearEnd(after)).toBe(after);
    expect(settleRoleTalentYearEnd(month(after, 24)).externalPublications).toEqual(after.externalPublications);
    const legacy = withGameplayRuleset("20261022-r27", () => settleRoleTalentYearEnd(before));
    expect(legacy.player.favor).toBeGreaterThanOrEqual(12);
    expect(legacy.externalPublications).toEqual([]);
  });

  it("settles enrollment milestone papers after initial favor, without a transfer or second initialization grant", () => {
    const before = run("teacher-child", { "near-the-source": 1, "family-patronage": 1 });
    before.player.favor = 11.8;
    const after = initializeRoleTalents(before);
    expect(after.degree).toBe("master");
    expect(after.player.favor).toBeGreaterThanOrEqual(12);
    expect(after.externalPublications.map(paper => paper.target)).toEqual(["C"]);
    expect(after.roleTalents?.familyPatronageGrantedIds).toEqual(["family-patronage"]);
    expect(initializeRoleTalents(after)).toBe(after);
    const legacy = withGameplayRuleset("20261022-r27", () => initializeRoleTalents(before));
    expect(legacy.externalPublications).toHaveLength(0);
  });

  it("social and advisor initial and annual growth use ordinary resistance", () => {
    for (const [role, initial, annual, stat] of [["social", "natural-charisma", "growing-connections", "social"], ["teacher-child", "near-the-source", "growing-familiarity", "favor"]] as const) {
      const state = initializeRoleTalents(run(role, { [initial]: 5, [annual]: 1 }));
      expect(state.player[stat]).toBe(6);
      expect(settleRoleTalentYearEnd(month(state, 12)).player[stat]).toBeCloseTo(6.8);
    }
  });

  it("social reviewer bonus starts after transfer and follows current actual social", () => {
    const before = run("social", { "circle-of-friends": 2, "kindly-reviewed": 2 });
    before.player.social = 20;
    before.fellowProgressState = [fellow("one", 1), fellow("two", 1)];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(getPlayerAttributeCap(next, "social")).toBe(24);
    expect(next.player.social).toBeCloseTo(21.6);
    expect(getRoleKindReviewerBonus(before)).toBe(0);
    expect(getRoleKindReviewerBonus(next)).toBeCloseTo(0.432);
    expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: 10 } })).toBeCloseTo(0.2);
    expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: 30 } })).toBeCloseTo(0.6);
    withGameplayRuleset("20261023-r35", () => {
      expect(getRoleKindReviewerBonus(next)).toBeCloseTo(0.864);
    });
    withGameplayRuleset("20261023-r29", () => {
      expect(getRoleKindReviewerBonus(next)).toBeCloseTo(0.432);
      expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: 10 } })).toBeCloseTo(0.2);
      expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: 30 } })).toBeCloseTo(0.6);
    });
    expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: -1 } })).toBe(0);
    expect(getRoleKindReviewerBonus({ ...next, player: { ...next.player, social: 100 } })).toBe(1);
    expect(getRoleKindReviewerBonus({ ...next, selectedRoleId: "normal" })).toBe(0);
    expect(getRoleKindReviewerBonus({ ...next, roleTalents: { levels: {} } })).toBe(0);
    expect(applyRoleTalentPhdTransfer(before, next)).toBe(next);
  });

  it("advisor family transfer grants real first-author publications and persistent reimbursement uses once", () => withGameplayRuleset("20261022-r27", () => {
    const before = run("teacher-child", { "family-patronage": 2, "computing-support": 2, "workspace-renewal": 1 });
    before.player.favor = 12.9;
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.externalPublications).toHaveLength(4);
    expect(new Set(next.externalPublications.map((item) => item.id)).size).toBe(4);
    expect(next.externalPublications.every((item) => item.status === "published" && item.target === "C" && !item.nonFirstAuthor && item.publication)).toBe(true);
    expect(next.totalResearchScore).toBe(before.totalResearchScore + 4);
    expect(next.shopState.entitlements.gpuTransaction).toBe(before.shopState.entitlements.gpuTransaction + 2);
    expect(next.shopState.entitlements.workstationTransaction).toBe(before.shopState.entitlements.workstationTransaction + 1);
    expect(applyRoleTalentPhdTransfer(before, next)).toBe(next);
  }));

  it("sloth initial and transfer bonuses retain decimal gains and upgrade the fixed SAN curse", () => {
    let state = initializeRoleTalents(run("normal-reversed", { "sloth-head-start": 1, "post-phd-growth": 1 }));
    expect(state.player.research).toBe(2);
    expect(state.buffs.find((buff) => buff.id === "role-sloth-san")?.activeOperationSanMultiplier).toBe(2);
    state = { ...state, player: { ...state.player, research: 3, social: 3, favor: 3 } };
    const next = applyRoleTalentPhdTransfer(state, { ...state, degree: "phd" });
    expect(next.player.research).toBe(4.5);
    expect(next.buffs.find((buff) => buff.id === "role-sloth-san")?.activeOperationSanMultiplier).toBe(3);
  });

  it("sloth monthly cap counts only tracked unused ordinary actions and never repeats", () => {
    const state = month(run("normal-reversed", { "san-cap-reserve": 1 }), 1);
    state.actionState.limit = 50;
    state.roleTalents = { ...state.roleTalents!, regularActionBudget: 2, regularActionsSpent: 1 };
    const next = settleRoleTalentMonthEnd(state);
    expect(next.sanCap).toBe(state.sanCap + 1);
    expect(next.player.san).toBe(state.player.san);
    expect(settleRoleTalentMonthEnd(next)).toBe(next);
    expect(settleRoleTalentMonthEnd({ ...state, totalMonths: 0 }).sanCap).toBe(state.sanCap);
  });

  it("preserves the r48 twenty-point 日渐圆润 cap", () => withGameplayRuleset("20261024-r48", () => {
    let state = month(run("normal-reversed", { "san-cap-reserve": 1 }), 1);
    state.roleTalents = { ...state.roleTalents!, regularActionBudget: 25, regularActionsSpent: 0 };
    state = settleRoleTalentMonthEnd(state);
    expect(state.sanCap).toBe(40);
    expect(state.roleTalents?.sanCapReserveBonus).toBe(20);
    const next = settleRoleTalentMonthEnd({ ...state, sanCap: 35, totalMonths: 2, roleTalents: {
      ...state.roleTalents!, lastMonthEndSettlement: undefined, regularActionBudget: 4, regularActionsSpent: 0,
    } });
    expect(next.sanCap).toBe(35);
    expect(next.roleTalents?.sanCapReserveBonus).toBe(20);
  }));

  it("reversed genius opens extra slots and counts only published first-author papers at transfer", () => {
    const before = createStartedGameState("genius-reversed", { "paper-opening": 3, "learning-from-rejection": 1, "research-network": 1 });
    expect(before.paperSlotsUnlocked).toBe(4);
    before.papers = [createDraftPaper(1, 0), { ...paper("review", "A"), status: "reviewing" }];
    before.externalPublications = [paper("first", "C"), paper("coauthor", "A", true)];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.research).toBe(before.player.research + 1);
  });

  it("preserves the r32 first-rejection research reward", () => withGameplayRuleset("20261023-r32", () => {
    const state = run("genius-reversed", { "learning-from-rejection": 1 });
    const submitted = { ...createDraftPaper(1, 0), status: "reviewing" as const };
    const next = settleRoleTalentPaperRejection(state, submitted);
    expect(next.player.research).toBe(state.player.research + 1);
    expect(settleRoleTalentPaperRejection(next, submitted)).toBe(next);
    expect(settleRoleTalentPaperRejection(state, { ...submitted, rejectionCount: 1 })).toBe(state);
    expect(settleRoleTalentPaperRejection(state, { ...submitted, nonFirstAuthor: true })).toBe(state);
    expect(settleRoleTalentPaperRejection(state, { ...submitted, leadAuthorId: "fellow-1" })).toBe(state);
    expect(settleRoleTalentPaperRejection(state, { ...submitted, leadAuthorId: "player" }).player.research).toBe(state.player.research + 1);
    const phd = { ...state, degree: "phd" as const };
    expect(settleRoleTalentPaperRejection(phd, submitted)).toBe(phd);
  }));

  it.each(["rich", "genius", "genius-reversed"] as const)("%s transfer deduplicates publications and excludes fellow-led papers without a coauthor flag", (role) => {
    const before = run(role, { "knowledge-is-wealth": 1, "knowledge-is-wealth-beta": 1, "proven-by-papers": 1, "research-network": 1 });
    const ordinary = paper("ordinary", "A");
    const explicitPlayer = { ...paper("explicit-player", "A"), leadAuthorId: "player" };
    const fellowLed = { ...paper("fellow-led", "A"), leadAuthorId: "fellow-1" };
    const giftedC = paper("advisor-gift", "C");
    before.papers = [ordinary, explicitPlayer, fellowLed, paper("coauthor", "A", true)];
    before.externalPublications = [ordinary, explicitPlayer, giftedC];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    if (role === "rich") expect(next.player.money).toBe(before.player.money + 5);
    else if (role === "genius") {
      expect(next.player.research).toBe(before.player.research + 2);
      expect(getPlayerAttributeCap(next, "research")).toBe(getPlayerAttributeCap(before, "research") + 2);
    } else expect(next.player.research).toBe(before.player.research + 3);
  });

  it("preserves the previous teacher-child reversed cap reduction in r51 recordings", () => withGameplayRuleset("20261024-r51", () => {
    const state = run("teacher-child-reversed", { "favor-reset-decrease": 4 });
    const next = initializeRoleTalents(state);
    expect(getPlayerAttributeCap(next, "favor")).toBe(16);
    expect(initializeRoleTalents(next)).toBe(next);
    const low = initializeRoleTalents({ ...state, roleTalents: { levels: state.roleTalents!.levels, capBonuses: { favor: -12 } } });
    expect(getPlayerAttributeCap(low, "favor")).toBe(6);
  }));

  it("uses the current teacher-child reversed cap talent and keeps initialization idempotent", () => {
    const state = run("teacher-child-reversed", { "favor-reset": 2 });
    const next = initializeRoleTalents(state);
    expect(getPlayerAttributeCap(next, "favor")).toBe(12);
    expect(withGameplayRuleset("20261024-r52", () => getPlayerAttributeCap(initializeRoleTalents(state), "favor"))).toBe(10);
    expect(initializeRoleTalents(next)).toBe(next);
  });

  it("preserves r48 two-month social stagnation and reset timing", () => withGameplayRuleset("20261024-r48", () => {
    const state = run("social-reversed", {});
    const september = settleRoleTalentMonthEnd(month(state, 1));
    expect(september.roleTalents?.socialStagnantMonths).toBe(1);
    const october = settleRoleTalentMonthStart(month(september, 2), () => 0);
    expect(october.player.research).toBe(state.player.research);
    const octoberEnd = settleRoleTalentMonthEnd(october);
    expect(octoberEnd.roleTalents?.socialStagnantMonths).toBe(2);
    const november = settleRoleTalentMonthStart(month(octoberEnd, 3), () => 0);
    expect(november.player.research).toBe(state.player.research - 1);
    const changed = settleRoleTalentMonthEnd({ ...november, roleTalents: { ...november.roleTalents!, socialChangedMonth: 3 } });
    expect(changed.roleTalents?.socialStagnantMonths).toBe(0);
    expect(settleRoleTalentMonthStart(month(changed, 4), () => 0).player.research).toBe(changed.player.research);
  }));
  it("initial bonuses and permanent action buffs apply only once", () => {
    const state = run("genius", { "innate-insight": 4, "idea-insight": 2, "experiment-practice": 3, "writing-mastery": 1 });
    const next = initializeRoleTalents(state);
    expect(next.player.research).toBe(state.player.research + 4);
    expect(next.buffs.map((buff) => buff.actionEffects)).toEqual([{ idea: { bonus: 6 } }, { experiment: { bonus: 9 } }, { writing: { bonus: 3 } }]);
    expect(initializeRoleTalents(next)).toBe(next);
    expect(state.buffs).toHaveLength(0);
  });

  it("preserves r26 starting research and two-point action buffs in saved recordings", () => {
    withGameplayRuleset("20261022-r26", () => {
      const next = createStartedGameState("genius", {
        "innate-insight": 5, "idea-insight": 2, "experiment-practice": 1, "writing-mastery": 1,
      });
      expect(next.player.research).toBe(6);
      expect(next.buffs.map(buff => buff.actionEffects)).toEqual([
        { idea: { bonus: 4 } }, { experiment: { bonus: 2 } }, { writing: { bonus: 2 } },
      ]);
    });
  });

  it("rich starting money and assigned advisor funding are independent one-time awards", () => {
    const state = initializeRoleTalents(run("rich", { heiress: 4, "bring-funding": 4 }));
    expect(state.player.money).toBe(createStartedGameState("rich").player.money + 8);
    expect(applyRoleTalentAdvisorAssignment(state)).toBe(state);
    const assigned = { ...state, selectedAdvisorName: "测试导师" };
    const next = applyRoleTalentAdvisorAssignment(assigned);
    expect(next.advisorProgressState.funding).toBe(assigned.advisorProgressState.funding + 80);
    expect(next.advisorProgressState.cumulativeFunding).toBe((assigned.advisorProgressState.cumulativeFunding ?? 30) + 80);
    expect(applyRoleTalentAdvisorAssignment(next)).toBe(next);
  });

  it("grants 100 funding at rank five and preserves the previous rate in r23 recordings", () => {
    const assigned = { ...run("rich", { "bring-funding": 5 }), selectedAdvisorName: "测试导师" };
    const next = applyRoleTalentAdvisorAssignment(assigned);
    expect(next.advisorProgressState.funding).toBe(assigned.advisorProgressState.funding + 100);
    expect(applyRoleTalentAdvisorAssignment(next)).toBe(next);
    const legacy = { ...assigned, roleTalents: { levels: { "bring-funding": 4 } } };
    const old = withGameplayRuleset("20261022-r23", () => applyRoleTalentAdvisorAssignment(legacy));
    expect(old.advisorProgressState.funding).toBe(legacy.advisorProgressState.funding + 60);
  });

  it("rich transfer bonuses share pre-reward money and settle separate authorship talents", () => {
    const before = run("rich", { "wealth-growth": 2, "knowledge-is-wealth": 3, "knowledge-is-wealth-beta": 2 });
    before.player.money = 5.5;
    before.papers = [paper("a", "A"), paper("co", "A", true), createDraftPaper(1, 5, () => 0)];
    before.externalPublications = [paper("b", "B")];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.money).toBe(16.25);
    expect(applyRoleTalentPhdTransfer(before, next)).toBe(next);
    expect(withGameplayRuleset("20261022-r24", () => applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" })).player.money).toBe(14.25);
  });

  it("rich paper rewards deduplicate both authorship classes and exclude unfinished papers", () => {
    const before = run("rich", { "knowledge-is-wealth": 5, "knowledge-is-wealth-beta": 5 });
    const first = paper("first", "C");
    const cooperation = paper("cooperation", "A", true);
    const fellowLed = { ...paper("fellow-led", "B"), leadAuthorId: "fellow-1" };
    before.papers = [first, cooperation, fellowLed, { ...paper("reviewing", "A"), status: "reviewing" }];
    before.externalPublications = [first, cooperation, fellowLed, createDraftPaper(1, 0)];
    const snapshot = structuredClone(before);
    const after = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(after.player.money).toBe(before.player.money + 15);
    expect(applyRoleTalentPhdTransfer(before, after)).toBe(after);
    expect(before).toEqual(snapshot);
  });

  it.each([
    [{ "knowledge-is-wealth": 2 }, 2],
    [{ "knowledge-is-wealth-beta": 3 }, 6],
    [{ "knowledge-is-wealth": 2, "knowledge-is-wealth-beta": 3 }, 8],
  ] as const)("rich authorship talents reward only their own publication category: %j", (levels, reward) => {
    const before = run("rich", { ...levels });
    before.papers = [paper("first", "A"), paper("coauthor", "A", true),
      { ...paper("fellow", "B"), leadAuthorId: "fellow-1" }];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.money).toBe(before.player.money + reward);
  });

  it("normal percentage bonus retains the fractional raw increment then resists", () => {
    const before = run("normal", { "self-determination": 1 });
    before.player = { ...before.player, research: 12, social: 6, favor: 1 };
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.research).toBeCloseTo(12.72);
    expect(next.player.social).toBeCloseTo(6.48);
    expect(next.player.favor).toBe(1.1);
    expect(applyRoleTalentPhdTransfer(before, next)).toBe(next);
    const replayed = withGameplayRuleset("20261020-r12", () => applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" }));
    expect(replayed.player.research).toBeCloseTo(13.2);
    expect(replayed.player.social).toBeCloseTo(6.8);
    expect(replayed.player.favor).toBe(2);
  });

  it("rechecks tiers for fractional transfer gains and still respects the cap", () => {
    const before = run("normal", { "self-determination": 2 });
    before.player = { ...before.player, research: 5.9, social: 19.9, favor: 0.04 };
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.research).toBeCloseTo(7.044);
    expect(next.player.social).toBe(20);
    expect(next.player.favor).toBeCloseTo(0.048);
  });

  it("genius transfer cap is available to the same batch of research growth", () => {
    const before = run("genius", { "proven-by-papers": 3 });
    before.player.research = 20;
    before.papers = [paper("a", "A"), paper("co", "A", true), paper("b", "B")];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(getPlayerAttributeCap(next, "research")).toBe(23);
    expect(next.player.research).toBeCloseTo(21.2);
  });

  it("freezes academic confidence from pre-transfer papers but activates after transfer growth", () => {
    const before = run("genius", { "academic-confidence": 2, "proven-by-papers": 3 });
    before.player.research = 20;
    before.papers = [paper("a", "A"), paper("co", "A", true), paper("b", "B"), { ...paper("draft", "A"), status: "draft" }];
    before.externalPublications = [paper("a", "A")];
    expect(previewPlayerAttributeChange(before, "research", -1).effectiveChange).toBe(-0.4);
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.roleTalents?.researchGrowthResistanceReduction).toBe(0.2);
    expect(next.player.research).toBeCloseTo(21.2);
    expect(previewPlayerAttributeChange(next, "research", -1).effectiveChange).toBe(-0.4);
    expect(previewPlayerAttributeChange(next, "research", 1).effectiveChange).toBe(0.6);
    const later = { ...next, externalPublications: [...next.externalPublications, paper("later", "A")] };
    expect(applyRoleTalentPhdTransfer(before, later)).toBe(later);
    expect(later.roleTalents?.researchGrowthResistanceReduction).toBe(0.2);
  });

  it("academic confidence cannot turn resistance into bonus growth", () => {
    const before = run("genius", { "academic-confidence": 1 });
    before.papers = Array.from({ length: 8 }, (_, index) => paper(`a-${index}`, "A"));
    before.player.research = 18;
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.roleTalents?.researchGrowthResistanceReduction).toBe(0.6);
    expect(previewPlayerAttributeChange(next, "research", 1).effectiveChange).toBe(1);
  });

  it.each([[1, 0.1], [2, 0.2]] as const)("academic confidence rank %i counts only unique published first-author A papers", (rank, reduction) => {
    const before = run("genius", { "academic-confidence": rank });
    const first = paper("first", "A");
    before.papers = [first, paper("coauthor", "A", true),
      { ...paper("fellow-led", "A"), leadAuthorId: "fellow-1" },
      { ...paper("unpublished", "A"), status: "reviewing" }, paper("b", "B")];
    before.externalPublications = [first];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.roleTalents?.researchGrowthResistanceReduction).toBe(reduction);
    expect(next.player.research).toBe(before.player.research);
  });

  it("academic confidence rank two caps at sixty percentage points", () => {
    const before = run("genius", { "academic-confidence": 2 });
    before.papers = Array.from({ length: 4 }, (_, index) => paper(`a-${index}`, "A"));
    expect(applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" }).roleTalents?.researchGrowthResistanceReduction).toBe(0.6);
  });

  it("r26 recordings keep separate cap rewards and count coauthored A for academic confidence", () => {
    const before = run("genius", { "proven-by-papers": 3, "boundless-study": 5, "academic-confidence": 1 });
    before.player.research = 20;
    before.papers = [paper("first", "A"), paper("coauthor", "A", true)];
    const next = withGameplayRuleset("20261022-r26", () => applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" }));
    expect(getPlayerAttributeCap(next, "research")).toBe(25);
    expect(next.player.research).toBe(21.2);
    expect(next.roleTalents?.researchGrowthResistanceReduction).toBe(0.2);
  });

  it("each fellow receives the post-transfer boost once, including later recruits", () => {
    let state = run("genius", { "rise-together": 3 });
    state = { ...state, fellowProgressState: [fellow("first", 18)] };
    expect(syncRoleTalentFellows(state)).toBe(state);
    const initial = syncRoleTalentFellows({ ...state, degree: "phd" });
    expect(initial.fellowProgressState[0]!.research).toBeCloseTo(20);
    expect(syncRoleTalentFellows(initial)).toBe(initial);
    const added = syncRoleTalentFellows({ ...initial, fellowProgressState: [...initial.fellowProgressState, fellow("second", 5)] });
    expect(added.fellowProgressState[0]!.research).toBeCloseTo(20);
    expect(added.fellowProgressState[1]!.research).toBeCloseTo(10);
    const legacy = withGameplayRuleset("20261022-r27", () => syncRoleTalentFellows({ ...state, degree: "phd" }));
    expect(legacy.fellowProgressState[0]!.research).toBeCloseTo(19.2);
  });

  it("academic atmosphere improves the joining fellow rather than the player and deduplicates rejoins", () => {
    const state = { ...run("genius", { "academic-atmosphere": 3 }),
      fellowProgressState: [fellow("first", 5), fellow("near-cap", 19.8), fellow("at-cap", 20)] };
    const snapshot = structuredClone(state);
    const next = settleFellowRecruitmentTalent({ ...state, fellowProgressState: [] }, state);
    expect(next.player).toEqual(state.player);
    expect(next.fellowProgressState.map(item => item.research)).toEqual([7.6, 20, 20]);
    expect(settleFellowRecruitmentTalent(next, next)).toBe(next);
    const absent = { ...next, fellowProgressState: [] };
    const rejoined = settleFellowRecruitmentTalent(absent, { ...absent, fellowProgressState: [next.fellowProgressState[0]!] });
    expect(rejoined.fellowProgressState[0]!.research).toBe(7.6);
    expect(state).toEqual(snapshot);
  });

  it("academic atmosphere and post-transfer growth have independent once-per-fellow settlements", () => {
    const before = { ...run("genius", { "academic-atmosphere": 3, "rise-together": 3 }),
      fellowProgressState: [fellow("master-recruit", 1)] };
    const joined = settleFellowRecruitmentTalent({ ...before, fellowProgressState: [] }, before);
    expect(joined.fellowProgressState[0]!.research).toBe(4);
    const transferred = applyRoleTalentPhdTransfer(joined, { ...joined, degree: "phd" });
    expect(transferred.fellowProgressState[0]!.research).toBe(9.2);
    expect(syncRoleTalentFellows(transferred)).toBe(transferred);
    const later = syncRoleTalentFellows(settleFellowRecruitmentTalent(transferred, { ...transferred,
      fellowProgressState: [...transferred.fellowProgressState, fellow("phd-recruit", 1)] }));
    expect(later.fellowProgressState.map(item => item.research)).toEqual([9.2, 9.2]);
    expect(later.player).toEqual(before.player);
    expect(syncRoleTalentFellows(later)).toBe(later);
    const legacy = withGameplayRuleset("20261022-r26", () => settleFellowRecruitmentTalent({ ...before, fellowProgressState: [] }, before));
    expect(legacy).toBe(before);
  });

  it("chosen equalization bypasses resistance with or without fortune and preserves r38 replay behavior", () => {
    const before = run("chosen", { "complete-potential": 1, "lasting-fortune": 1 });
    before.player = { ...before.player, research: 20, social: 6, favor: 6 };
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.social).toBe(20);
    expect(next.player.favor).toBe(20);
    const full = { ...before, roleTalents: { levels: { "complete-potential": 1, "lasting-fortune": 3 } } };
    expect(applyRoleTalentPhdTransfer(full, { ...full, degree: "phd" }).player.social).toBe(20);
    const legacy = withGameplayRuleset("20261023-r38", () => applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" }));
    expect(legacy.player.social).toBeCloseTo(17.2);
    expect(legacy.player.favor).toBeCloseTo(17.2);
  });

  it("annual rewards occur at the first August end, once per academic year", () => {
    const state = createStartedGameState("genius", { "innate-insight": 1, "tireless-scholar": 1 });
    expect(state.player.research).toBe(2);
    expect(settleRoleTalentMonthStart(month(state, 1)).player.research).toBe(2);
    expect(settleRoleTalentYearEnd(month(state, 11)).player.research).toBe(state.player.research);
    const august = settleRoleTalentYearEnd(month(state, 12));
    expect(august.player.research).toBe(state.player.research + 1);
    expect(settleRoleTalentYearEnd(august)).toBe(august);
    expect(settleRoleTalentYearEnd(month(august, 24)).player.research).toBe(state.player.research + 2);
  });

  it("all tied minimum attributes receive chosen annual growth from the same snapshot", () => {
    const state = month(run("chosen", { "balanced-growth": 2 }), 12);
    state.degree = "phd";
    state.player = { ...state.player, research: 5, social: 5, favor: 10 };
    const next = settleRoleTalentYearEnd(state);
    expect(next.player.research).toBeCloseTo(6.8);
    expect(next.player.social).toBeCloseTo(6.8);
    expect(next.player.favor).toBe(10);
  });

  it("first month recovery is October, semesters March and later September, with cap-only rebound", () => {
    const state = run("normal", { "first-month-drive": 1, "first-month-drive-plus": 2, burnout: 1 });
    state.player.san = 0;
    expect(settleRoleTalentMonthStart(state).player.san).toBe(0);
    expect(settleRoleTalentMonthStart(month(state, 1)).player.san).toBe(0);
    expect(settleRoleTalentMonthStart(month(state, 2)).player.san).toBe(5);
    expect(settleRoleTalentMonthStart(month(state, 7)).player.san).toBe(2);
    expect(settleRoleTalentMonthStart(month(state, 13)).player.san).toBe(2);
    const rebound = settleRoleTalentMonthStart({ ...month(state, 3), sanCap: 7 });
    expect(rebound.sanCap).toBe(8);
    expect(rebound.player.san).toBe(0);
    expect(settleRoleTalentMonthStart(rebound)).toBe(rebound);
  });

  it("first-month drive occurs once and the semester talent still recovers twice per academic year", () => {
    let state = run("normal", { "first-month-drive": 1, "first-month-drive-plus": 2 });
    const recoveries: number[] = [];
    for (let total = 1; total <= 25; total += 1) {
      const next = settleRoleTalentMonthStart({ ...month(state, total), player: { ...state.player, san: 0 } });
      recoveries.push(next.player.san);
      expect(settleRoleTalentMonthStart(next)).toBe(next);
      state = next;
    }
    expect(recoveries.map((amount, index) => [index + 1, amount]).filter(([, amount]) => amount! > 0))
      .toEqual([[2, 5], [7, 2], [13, 2], [19, 2], [25, 2]]);
  });

  it.each([1, 2])("rebound level %s checks the threshold once, adds only cap and settles once per month", (rank) => {
    const state = month(run("normal", { burnout: rank }), 3);
    state.sanCap = 7;
    state.player.san = 2;
    const next = settleRoleTalentMonthStart(state);
    expect(next.sanCap).toBe(7 + rank);
    expect(next.player.san).toBe(2);
    expect(settleRoleTalentMonthStart(next)).toBe(next);
    expect(settleRoleTalentMonthStart(month(next, 4)).sanCap).toBe(7 + rank);
    expect(settleRoleTalentMonthStart({ ...state, sanCap: 8 }).sanCap).toBe(8);
  });

  it("r21 recordings retain six-point drive recovery and one-point rebound", () => {
    const state = month(run("normal", { "first-month-drive": 3, burnout: 2 }), 2);
    state.player.san = 0;
    state.sanCap = 7;
    const old = withGameplayRuleset("20261022-r21", () => settleRoleTalentMonthStart(state));
    expect(old.player.san).toBe(6);
    expect(old.sanCap).toBe(8);
    const current = settleRoleTalentMonthStart(state);
    expect(current.player.san).toBe(5);
    expect(current.sanCap).toBe(9);
  });

  it("fractional extra actions carry across months without floating-point loss", () => {
    let state = run("normal", { diligence: 1 });
    state.degree = "phd";
    for (let total = 2; total <= 11; total++) state = settleRoleTalentMonthStart({ ...month(state, total), actionState: { ...state.actionState, limit: 3 } });
    expect(state.actionState.limit).toBe(4);
    expect(state.roleTalents?.actionRemainder).toBe(0);
    state = settleRoleTalentMonthStart(month(state, 12));
    expect(state.actionState.limit).toBe(3);
    expect(state.roleTalents?.monthlyActionBonus).toBe(0);
  });

  it("negative disease milestones are historical, retain probability and allow multiple new milestones", () => {
    const state = run("chosen", { "misfortune-to-fortune": 2, "lasting-fortune": 3 });
    state.player = { ...state.player, research: 0, social: 0, favor: 0 };
    state.illnessProbability = -205;
    const next = settleRoleTalentDiseaseMilestones(state);
    expect(next.player.research).toBe(8);
    expect(next.player.social).toBe(8);
    expect(next.player.favor).toBe(8);
    expect(next.player.san).toBe(state.player.san);
    expect(next.player.money).toBe(state.player.money);
    expect(next.illnessProbability).toBe(-205);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(4);
    expect(next.log[0]!.text).toContain("否极泰来");
    expect(next.log[0]!.text).toContain("新领取4档奖励");
    expect(settleRoleTalentDiseaseMilestones({ ...next, illnessProbability: -99 }).player).toEqual(next.player);
    expect(settleRoleTalentDiseaseMilestones(next)).toBe(next);
  });

  it.each([1, 2, 3])("awards rank %s only on new fifty-point negative disease milestones", (rank) => {
    let state = run("chosen", { "misfortune-to-fortune": rank, "lasting-fortune": 3 });
    state.player = { ...state.player, research: 0, social: 0, favor: 0 };
    state.illnessProbability = -49.9;
    expect(settleRoleTalentDiseaseMilestones(state)).toBe(state);
    state = settleRoleTalentDiseaseMilestones({ ...state, illnessProbability: -50 });
    for (const stat of ["research", "social", "favor"] as const) expect(state.player[stat]).toBe(rank);
    expect(state.roleTalents?.negativeDiseaseMilestone).toBe(1);
    expect(settleRoleTalentDiseaseMilestones({ ...state, illnessProbability: -99.9 }).player).toEqual(state.player);
    const second = settleRoleTalentDiseaseMilestones({ ...state, illnessProbability: -100 });
    for (const stat of ["research", "social", "favor"] as const) expect(second.player[stat]).toBe(rank * 2);
    expect(second.roleTalents?.negativeDiseaseMilestone).toBe(2);
    const recovered = settleRoleTalentDiseaseMilestones({ ...second, illnessProbability: 20 });
    const crossedAgain = settleRoleTalentDiseaseMilestones({ ...recovered, illnessProbability: -100 });
    expect(crossedAgain.player).toEqual(second.player);
    expect(crossedAgain.roleTalents?.negativeDiseaseMilestone).toBe(2);
  });

  it("retains ordinary attribute resistance and caps in high-rank negative disease rewards", () => {
    const state = run("chosen", { "misfortune-to-fortune": 3, "lasting-fortune": 3 });
    state.player = { ...state.player, research: 18, social: 19.8, favor: 20 };
    state.illnessProbability = -50;
    const next = settleRoleTalentDiseaseMilestones(state);
    expect(next.player.research).toBe(20);
    expect(next.player.social).toBe(20);
    expect(next.player.favor).toBe(20);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(1);
    expect(settleRoleTalentDiseaseMilestones(next)).toBe(next);
  });

  it("keeps one-hundred-point illness milestones and full fortune equalization in r30 recordings", () => withGameplayRuleset("20261023-r30", () => {
    const before = run("chosen", { "misfortune-to-fortune": 2, "lasting-fortune": 3, "complete-potential": 1 });
    before.player = { ...before.player, research: 0, social: 0, favor: 0 };
    before.illnessProbability = -99.9;
    expect(settleRoleTalentDiseaseMilestones(before)).toBe(before);
    const next = settleRoleTalentDiseaseMilestones({ ...before, illnessProbability: -205 });
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(2);
    expect(next.player.research).toBe(4);
    expect(next.player.social).toBe(4);
    expect(next.player.favor).toBe(4);
    expect(settleRoleTalentDiseaseMilestones(next)).toBe(next);
    const transfer = { ...before, player: { ...before.player, research: 20, social: 6, favor: 6 } };
    expect(applyRoleTalentPhdTransfer(transfer, { ...transfer, degree: "phd" }).player.social).toBe(20);
  }));

  it("supports rank-five health and rank-three annual growth without duplicating annual rewards", () => {
    const before = run("chosen", { "fortunate-health": 5, "misfortune-to-fortune": 1 });
    before.illnessProbability = -45;
    const next = settleRoleTalentMonthStart(month(before, 2));
    expect(next.illnessProbability).toBe(-50);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(1);
    const growth = month(run("chosen", { "balanced-growth": 3, "lasting-fortune": 3 }), 12);
    growth.degree = "phd";
    growth.player = { ...growth.player, research: 1, social: 1, favor: 10 };
    const after = settleRoleTalentYearEnd(growth);
    expect(after.player.research).toBe(4);
    expect(after.player.social).toBe(4);
    expect(after.player.favor).toBe(10);
    expect(settleRoleTalentYearEnd(after)).toBe(after);
  });

  it("talent history records actual rewards without blocking events or mutating the input", () => {
    const state = month(run("normal", { "first-month-drive": 1 }), 2);
    state.player.san = state.sanCap - 2;
    const original = structuredClone(state);
    const next = settleRoleTalentMonthStart(state);
    expect(next.log[0]!.text).toContain("满怀干劲");
    expect(next.log[0]!.text).toContain("SAN +2");
    expect(next.eventHistory[0]!.stages[0]!.talentTrigger?.name).toBe("满怀干劲");
    expect(next.eventQueue).toEqual(state.eventQueue);
    expect(state).toEqual(original);
    expect(settleRoleTalentMonthStart(next).log).toBe(next.log);
    expect(settleRoleTalentMonthStart({ ...state, player: { ...state.player, san: state.sanCap } }).log).toEqual(state.log);
  });

  it("pure monthly preview skips random permutations but still quotes the curse", () => {
    const state = month(run("chosen-reversed", { "attribute-swap": 1, "san-money-swap": 1 }), 2);
    const original = structuredClone(state);
    const next = settleRoleTalentMonthStart(state, () => { throw new Error("preview must not roll"); }, { skipSwaps: true });
    expect(next.player.research).toBe(state.player.research);
    expect(next.player.san).toBe(state.player.san);
    expect(next.sanCap).toBe(state.sanCap - 1);
    expect(next.log[0]!.text).toContain("命运反噬");
    expect(next.eventQueue).toEqual(state.eventQueue);
    expect(state).toEqual(original);
  });

  it("swap directly permutes a shared snapshot, skips admission and preserves r41 recordings", () => {
    const state = run("chosen-reversed", { "attribute-swap": 1 });
    state.player = { ...state.player, research: 18, social: 6, favor: 1, san: 10 };
    expect(settleRoleTalentMonthStart(month(state, 1), () => 0).player).toEqual(state.player);
    const next = settleRoleTalentMonthStart(month(state, 2), () => 0);
    expect(next.player.research).toBe(6);
    expect(next.player.social).toBe(1);
    expect(next.player.favor).toBe(18);
    const legacy = withGameplayRuleset("20261023-r41", () => settleRoleTalentMonthStart(month(state, 2), () => 0));
    expect(legacy.player.research).toBeCloseTo(10.8);
    expect(legacy.player.social).toBeCloseTo(1.2);
    expect(legacy.player.favor).toBeCloseTo(14.8);
    expect(next.player.san).toBe(10);
    expect(next.sanCap).toBe(state.sanCap - 1);
    expect(state.player.research).toBe(18);
    expect(settleRoleTalentMonthStart(next, () => 0)).toBe(next);
  });

  it("unbounded SAN swap keeps excess without increasing its cap", () => {
    const state = run("chosen-reversed", { "san-money-swap": 1, "swap-breaks-cap": 1 });
    state.player.san = 10;
    state.player.money = 50;
    const next = settleRoleTalentMonthStart(month(state, 2), () => 0);
    expect(next.player.san).toBe(50);
    expect(next.player.money).toBe(10);
    expect(next.sanCap).toBe(state.sanCap - 1);
  });

  it("swapping x and y twice restores both values regardless of resistance talents", () => {
    for (const rank of [0, 3]) for (const [x, y] of [[1, 20], [6.2, 18.7], [20, 10]]) {
      const state = run("chosen-reversed", { "attribute-swap": 1, "reverse-meter-alpha": rank, "reverse-meter-beta": rank });
      state.player = { ...state.player, research: x!, social: y!, favor: 5 };
      // Leave favor in place and isolate two swaps on SAN-cap curse months.
      const exchange = (value: GameState, totalMonths: number) => {
        const rolls = [0.99, 0];
        return settleRoleTalentMonthStart(month(value, totalMonths), () => rolls.shift()!);
      };
      const first = exchange(state, 2);
      expect(first.player).toMatchObject({ research: y, social: x, favor: 5 });
      const restored = exchange(JSON.parse(JSON.stringify(first)), 9);
      expect(restored.player).toMatchObject({ research: x, social: y, favor: 5 });
      expect(restored.roleTalents?.growthTotals).toBeUndefined();
      expect(restored.roleTalents?.lossTotals).toBeUndefined();
      expect(state.player.research).toBe(x);
    }
  });

  it("five-way swapping moves money into research exactly, applying only the destination cap", () => {
    for (const uncapped of [0, 1]) {
      const state = run("chosen-reversed", { "post-phd-swap": 1, "swap-breaks-cap": uncapped });
      state.degree = "phd";
      state.player = { research: 1, social: 18, favor: 6, san: 9, money: 50 };
      const rolls = [0, 0.99, 0.99, 0.99];
      const next = settleRoleTalentMonthStart(month(state, 2), () => rolls.shift()!);
      expect(next.player).toEqual({ research: uncapped ? 50 : 20, social: 18, favor: 6, san: 9, money: 1 });
      expect(next.researchCapacityState).toEqual(state.researchCapacityState);
      expect(next.personalSpending).toBe(state.personalSpending);
    }
  });

  it("the five-stat permutation replaces both smaller swaps and preserves ordinary reward counters", () => {
    const state = run("chosen-reversed", { "attribute-swap": 1, "san-money-swap": 1, "post-phd-swap": 1, "swap-breaks-cap": 1 });
    state.degree = "phd";
    state.player = { research: 1, social: 2, favor: 3, san: 4, money: 50 };
    let rolls = 0;
    const next = settleRoleTalentMonthStart(month(state, 2), () => { rolls++; return 0; });
    expect(rolls).toBe(4);
    expect(next.player).toEqual({ research: 2, social: 3, favor: 4, san: 50, money: 1 });
    expect(next.personalSpending).toBe(state.personalSpending);
    expect(next.roleTalents?.growthTotals).toBeUndefined();
    expect(next.roleTalents?.lossTotals).toBeUndefined();
    expect(next.researchCapacityState).toEqual(state.researchCapacityState);
  });

  it("without unbounded rotation excess is lost instead of silently increasing caps", () => {
    const state = run("chosen-reversed", { "san-money-swap": 1 });
    state.player.san = 10;
    state.player.money = 50;
    const next = settleRoleTalentMonthStart(month(state, 2), () => 0);
    expect(next.player.san).toBe(state.sanCap);
    expect(next.player.money).toBe(10);
    expect(next.sanCap).toBe(state.sanCap - 1);
  });

  it("monthly fortune cannot go negative until misfortune talent is active", () => {
    const state = run("chosen", { "fortunate-health": 4 });
    state.illnessProbability = 1;
    expect(settleRoleTalentMonthStart(month(state, 2)).illnessProbability).toBe(0);
    const negative = { ...state, roleTalents: { levels: { "fortunate-health": 4, "misfortune-to-fortune": 1 }, negativeDiseaseMilestone: 1 }, illnessProbability: -98 };
    const next = settleRoleTalentMonthStart(month(negative, 2));
    expect(next.illnessProbability).toBe(-102);
    expect(next.player.research).toBe(state.player.research + 1);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(2);
  });

  it("lasting work subtracts percentage points only after transfer and never turns decay into growth", () => {
    const state = run("genius", { "lasting-work": 5 });
    const draft = { ...createDraftPaper(1, 0, () => 0), idea: 10, experiment: 10, writing: 10, prepublicationDecayRate: 0.15 };
    state.papers = [draft];
    expect(applyPrepublicationPaperDecay(state).papers[0]!.idea).toBe(8);
    expect(applyPrepublicationPaperDecay({ ...state, degree: "phd" }).papers[0]!.idea).toBe(10);
    const slower = { ...state, degree: "phd" as const, papers: [{ ...draft, prepublicationDecayRate: 0.151 }] };
    expect(applyPrepublicationPaperDecay(slower).papers[0]!.idea).toBe(9);
    // Journals already have zero prepublication decay for everyone.
    const journal = { ...state, papers: [{ ...draft, status: "journal-reviewing" as const }] };
    expect(applyPrepublicationPaperDecay(journal).papers[0]!.idea).toBe(10);
  });
});
