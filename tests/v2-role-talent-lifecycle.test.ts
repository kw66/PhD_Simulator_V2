import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { applyPrepublicationPaperDecay, createDraftPaper } from "../src/core/v2-paper-rules";
import { getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
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
  it("social and advisor initial and annual growth use ordinary resistance", () => {
    for (const [role, initial, annual, stat] of [["social", "natural-charisma", "growing-connections", "social"], ["teacher-child", "near-the-source", "growing-familiarity", "favor"]] as const) {
      const state = initializeRoleTalents(run(role, { [initial]: 5, [annual]: 1 }));
      expect(state.player[stat]).toBe(6);
      expect(settleRoleTalentYearEnd(month(state, 12)).player[stat]).toBeCloseTo(6.8);
    }
  });

  it("social transfer first raises cap and stat, then freezes reviewer bonus", () => {
    const before = run("social", { "circle-of-friends": 2, "kindly-reviewed": 2 });
    before.player.social = 20;
    before.fellowProgressState = [fellow("one", 1), fellow("two", 1)];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(getPlayerAttributeCap(next, "social")).toBe(24);
    expect(next.player.social).toBeCloseTo(21.6);
    expect(next.roleTalents?.kindReviewerBonus).toBeCloseTo(0.432);
  });

  it("advisor family transfer grants real first-author publications and persistent reimbursement uses once", () => {
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
  });

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

  it("reversed genius opens extra slots and counts only published first-author papers at transfer", () => {
    const before = createStartedGameState("genius-reversed", { "paper-opening": 3, "papers-to-insight": 1 });
    expect(before.paperSlotsUnlocked).toBe(4);
    before.papers = [createDraftPaper(1, 0), { ...paper("review", "A"), status: "reviewing" }];
    before.externalPublications = [paper("first", "C"), paper("coauthor", "A", true)];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.research).toBe(before.player.research + 1);
  });

  it("rejection reward requires first rejection as master first author and cannot repeat", () => {
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
  });

  it.each(["rich", "genius", "genius-reversed"] as const)("%s transfer deduplicates publications and excludes fellow-led papers without a coauthor flag", (role) => {
    const before = run(role, { "knowledge-is-wealth": 1, "proven-by-papers": 1, "boundless-study": 1, "papers-to-insight": 1 });
    const ordinary = paper("ordinary", "A");
    const explicitPlayer = { ...paper("explicit-player", "A"), leadAuthorId: "player" };
    const fellowLed = { ...paper("fellow-led", "A"), leadAuthorId: "fellow-1" };
    const giftedC = paper("advisor-gift", "C");
    before.papers = [ordinary, explicitPlayer, fellowLed, paper("coauthor", "A", true)];
    before.externalPublications = [ordinary, explicitPlayer, giftedC];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    if (role === "rich") expect(next.player.money).toBe(before.player.money + 3);
    else if (role === "genius") {
      expect(next.player.research).toBe(before.player.research + 2);
      expect(getPlayerAttributeCap(next, "research")).toBe(getPlayerAttributeCap(before, "research") + 2);
    } else expect(next.player.research).toBe(before.player.research + 3);
  });

  it("reversed teacher static favor cap reduction happens once and respects minimum six", () => {
    const state = run("teacher-child-reversed", { "favor-reset-decrease": 4 });
    const next = initializeRoleTalents(state);
    expect(getPlayerAttributeCap(next, "favor")).toBe(16);
    expect(initializeRoleTalents(next)).toBe(next);
    const low = initializeRoleTalents({ ...state, roleTalents: { levels: state.roleTalents!.levels, capBonuses: { favor: -12 } } });
    expect(getPlayerAttributeCap(low, "favor")).toBe(6);
  });

  it("social stagnation counts complete months including September, resets on any actual social movement", () => {
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
  });
  it("initial bonuses and permanent action buffs apply only once", () => {
    const state = run("genius", { "innate-insight": 5, "idea-insight": 2, "experiment-practice": 3, "writing-mastery": 1 });
    const next = initializeRoleTalents(state);
    expect(next.player.research).toBe(state.player.research + 5);
    expect(next.buffs.map((buff) => buff.actionEffects)).toEqual([{ idea: { bonus: 4 } }, { experiment: { bonus: 6 } }, { writing: { bonus: 2 } }]);
    expect(initializeRoleTalents(next)).toBe(next);
    expect(state.buffs).toHaveLength(0);
  });

  it("rich starting money and assigned advisor funding are independent one-time awards", () => {
    const state = initializeRoleTalents(run("rich", { heiress: 4, "bring-funding": 4 }));
    expect(state.player.money).toBe(createStartedGameState("rich").player.money + 8);
    expect(applyRoleTalentAdvisorAssignment(state)).toBe(state);
    const assigned = { ...state, selectedAdvisorName: "测试导师" };
    const next = applyRoleTalentAdvisorAssignment(assigned);
    expect(next.advisorProgressState.funding).toBe(assigned.advisorProgressState.funding + 60);
    expect(next.advisorProgressState.cumulativeFunding).toBe((assigned.advisorProgressState.cumulativeFunding ?? 30) + 60);
    expect(applyRoleTalentAdvisorAssignment(next)).toBe(next);
  });

  it("rich transfer bonuses share pre-reward money and count only published first-author work", () => {
    const before = run("rich", { "wealth-growth": 2, "knowledge-is-wealth": 3 });
    before.player.money = 5.5;
    before.papers = [paper("a", "A"), paper("co", "A", true), createDraftPaper(1, 5, () => 0)];
    before.externalPublications = [paper("b", "B")];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.money).toBe(14.25);
    expect(applyRoleTalentPhdTransfer(before, next)).toBe(next);
  });

  it("normal percentage bonus rounds the raw increment then resists", () => {
    const before = run("normal", { "self-determination": 1 });
    before.player = { ...before.player, research: 12, social: 6, favor: 1 };
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.research).toBeCloseTo(13.2);
    expect(next.player.social).toBeCloseTo(6.8);
    expect(next.player.favor).toBe(2);
  });

  it("genius transfer cap is available to the same batch of research growth", () => {
    const before = run("genius", { "proven-by-papers": 3, "boundless-study": 5 });
    before.player.research = 20;
    before.papers = [paper("a", "A"), paper("co", "A", true), paper("b", "B")];
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(getPlayerAttributeCap(next, "research")).toBe(25);
    expect(next.player.research).toBeCloseTo(21.2);
  });

  it("freezes academic confidence from unique published A papers including coauthored papers before transfer growth", () => {
    const before = run("genius", { "academic-confidence": 1, "proven-by-papers": 3, "boundless-study": 5 });
    before.player.research = 20;
    before.papers = [paper("a", "A"), paper("co", "A", true), paper("b", "B"), { ...paper("draft", "A"), status: "draft" }];
    before.externalPublications = [paper("a", "A")];
    expect(previewPlayerAttributeChange(before, "research", -1).effectiveChange).toBe(-0.4);
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.roleTalents?.researchGrowthResistanceReduction).toBe(0.2);
    expect(next.player.research).toBeCloseTo(21.8);
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

  it("each fellow receives the post-transfer boost once, including later recruits", () => {
    let state = run("genius", { "rise-together": 4 });
    state = { ...state, fellowProgressState: [fellow("first", 18)] };
    expect(syncRoleTalentFellows(state)).toBe(state);
    const initial = syncRoleTalentFellows({ ...state, degree: "phd" });
    expect(initial.fellowProgressState[0]!.research).toBeCloseTo(19.6);
    expect(syncRoleTalentFellows(initial)).toBe(initial);
    const added = syncRoleTalentFellows({ ...initial, fellowProgressState: [...initial.fellowProgressState, fellow("second", 5)] });
    expect(added.fellowProgressState[0]!.research).toBeCloseTo(19.6);
    expect(added.fellowProgressState[1]!.research).toBeCloseTo(8.4);
  });

  it("chosen equalization resists once and full fortune eliminates growth resistance", () => {
    const before = run("chosen", { "complete-potential": 1, "lasting-fortune": 1 });
    before.player = { ...before.player, research: 20, social: 6, favor: 6 };
    const next = applyRoleTalentPhdTransfer(before, { ...before, degree: "phd" });
    expect(next.player.social).toBeCloseTo(18.4);
    expect(next.player.favor).toBeCloseTo(18.4);
    const full = { ...before, roleTalents: { levels: { "complete-potential": 1, "lasting-fortune": 3 } } };
    expect(applyRoleTalentPhdTransfer(full, { ...full, degree: "phd" }).player.social).toBe(20);
  });

  it("annual rewards occur at the first August end, once per academic year", () => {
    const state = run("genius", { "tireless-scholar": 1 });
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
    const state = run("normal", { "first-month-drive": 3, "first-month-drive-plus": 2, burnout: 1 });
    state.player.san = 0;
    expect(settleRoleTalentMonthStart(state).player.san).toBe(0);
    expect(settleRoleTalentMonthStart(month(state, 1)).player.san).toBe(0);
    expect(settleRoleTalentMonthStart(month(state, 2)).player.san).toBe(6);
    expect(settleRoleTalentMonthStart(month(state, 7)).player.san).toBe(2);
    expect(settleRoleTalentMonthStart(month(state, 13)).player.san).toBe(2);
    const rebound = settleRoleTalentMonthStart({ ...month(state, 3), sanCap: 7 });
    expect(rebound.sanCap).toBe(8);
    expect(rebound.player.san).toBe(0);
    expect(settleRoleTalentMonthStart(rebound)).toBe(rebound);
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
    const state = run("chosen", { "misfortune-to-fortune": 2 });
    state.illnessProbability = -205;
    const next = settleRoleTalentDiseaseMilestones(state);
    expect(next.player.research).toBe(state.player.research + 4);
    expect(next.illnessProbability).toBe(-205);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(2);
    expect(next.log[0]!.text).toContain("否极泰来");
    expect(next.log[0]!.text).toContain("新领取2档奖励");
    expect(settleRoleTalentDiseaseMilestones({ ...next, illnessProbability: -99 }).player).toEqual(next.player);
    expect(settleRoleTalentDiseaseMilestones(next)).toBe(next);
  });

  it("talent history records actual rewards without blocking events or mutating the input", () => {
    const state = month(run("normal", { "first-month-drive": 3 }), 2);
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
    expect(next.player.san).toBe(state.player.san - 1);
    expect(next.log[0]!.text).toContain("命运反噬");
    expect(next.eventQueue).toEqual(state.eventQueue);
    expect(state).toEqual(original);
  });

  it("swap preserves a shared snapshot, uses resisted differences and skips admission", () => {
    const state = run("chosen-reversed", { "attribute-swap": 1 });
    state.player = { ...state.player, research: 18, social: 6, favor: 1, san: 10 };
    expect(settleRoleTalentMonthStart(month(state, 1), () => 0).player).toEqual(state.player);
    const next = settleRoleTalentMonthStart(month(state, 2), () => 0);
    expect(next.player.research).toBeCloseTo(10.8);
    expect(next.player.social).toBeCloseTo(1.2);
    expect(next.player.favor).toBeCloseTo(14.8);
    expect(next.player.san).toBe(9);
    expect(state.player.research).toBe(18);
    expect(settleRoleTalentMonthStart(next, () => 0)).toBe(next);
  });

  it("unbounded SAN swap keeps excess without increasing its cap", () => {
    const state = run("chosen-reversed", { "san-money-swap": 1, "swap-breaks-cap": 1 });
    state.player.san = 10;
    state.player.money = 50;
    const next = settleRoleTalentMonthStart(month(state, 2), () => 0);
    expect(next.player.san).toBe(49);
    expect(next.player.money).toBe(10);
    expect(next.sanCap).toBe(state.sanCap);
  });

  it("the five-stat permutation replaces both smaller swaps and preserves ordinary reward counters", () => {
    const state = run("chosen-reversed", { "attribute-swap": 1, "san-money-swap": 1, "post-phd-swap": 1, "swap-breaks-cap": 1 });
    state.degree = "phd";
    state.player = { research: 1, social: 2, favor: 3, san: 4, money: 50 };
    let rolls = 0;
    const next = settleRoleTalentMonthStart(month(state, 2), () => { rolls++; return 0; });
    expect(rolls).toBe(4);
    expect(next.player).toEqual({ research: 2, social: 3, favor: 4, san: 49, money: 1 });
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
    expect(next.player.san).toBe(state.sanCap - 1);
    expect(next.player.money).toBe(10);
    expect(next.sanCap).toBe(state.sanCap);
  });

  it("monthly fortune cannot go negative until misfortune talent is active", () => {
    const state = run("chosen", { "fortunate-health": 4 });
    state.illnessProbability = 1;
    expect(settleRoleTalentMonthStart(month(state, 2)).illnessProbability).toBe(0);
    const negative = { ...state, roleTalents: { levels: { "fortunate-health": 4, "misfortune-to-fortune": 1 } }, illnessProbability: -98 };
    const next = settleRoleTalentMonthStart(month(negative, 2));
    expect(next.illnessProbability).toBe(-102);
    expect(next.player.research).toBe(state.player.research + 1);
    expect(next.roleTalents?.negativeDiseaseMilestone).toBe(1);
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
