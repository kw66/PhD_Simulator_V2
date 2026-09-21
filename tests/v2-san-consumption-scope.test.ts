import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { getActualResearchMiscSanChange, getActualSanChange } from "../src/core/v2-sanity-rules";
import { getActiveOperationSanCostForState } from "../src/core/v2-buffs";
import { getAdvisorTaskSanCost } from "../src/core/v2-advisor-progress";
import { getLoverRouteCost } from "../src/core/v2-lover-progression";
import { getPaperPromotionCost } from "../src/core/v2-publication-rules";
import { applyPaperCompetitionResolution, previewPaperCompetitionResolution } from "../src/core/v2-paper-competition";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import { refreshPaperReviewEvents } from "../src/core/v2-publication-system";
import type { Buff, GameState } from "../src/core/v2-types";

function modifierBuff(effect: Partial<Buff>): Buff {
  return { id: "modifier", name: "测试", source: "测试", timing: "monthly", remainingMonths: 1, ...effect };
}

function stateForMonth(month = 2): GameState {
  const initial = createStartedGameState("normal");
  return { ...initial, month, totalMonths: month, year: 1, eventQueue: [], buffs: [],
    player: { ...initial.player, research: 18, favor: 8, san: 20 }, selectedAdvisorName: "导师" };
}

function resolveChain(state: GameState, chainId: string): GameState {
  for (let stage = 0; stage < 3; stage += 1) {
    const event = state.eventQueue.find((entry) => entry.chainId === chainId)!;
    expect(event).toBeDefined();
    state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
  }
  return state;
}

describe("shared immediate SAN consumption", () => {
  it.each([
    { month: 2, parasol: false, expected: 5 },
    { month: 8, parasol: false, expected: 4 },
    { month: 11, parasol: false, expected: 6 },
    { month: 11, parasol: true, expected: 5 },
  ])("applies illness before seasonal and lover additions: $month / $parasol", ({ month, parasol, expected }) => {
    const state = stateForMonth(month);
    state.eventSupport.hasParasol = parasol;
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 1.5, activeOperationSanDelta: -1 })];
    expect(getActiveOperationSanCostForState(state, 4, "writing")).toBe(expected);
    expect(getLoverRouteCost(state, "study").san).toBe(expected);
    expect(getPaperPromotionCost("github", state)).toBe(expected);
    expect(getActualSanChange(-4, month, state.eventSupport, state.buffs)).toBe(-expected);
    expect(getActualSanChange(4, month, state.eventSupport, state.buffs)).toBe(4);
    expect(getActualSanChange(0, month, state.eventSupport, state.buffs)).toBe(0);
    expect(getLoverRouteCost(state, "play").san).toBe(0);
    expect(getLoverRouteCost(state, "shopping").san).toBe(0);
    expect(getPaperPromotionCost("quantum", state)).toBe(0);
  });

  it("shares relationship-only discounts with advisor and lover but not events or promotion", () => {
    const state = stateForMonth(11);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 1.5, relationshipOperationSanDelta: -1, activeOperationSanDelta: -1 })];
    expect(getAdvisorTaskSanCost(state)).toBe(7);
    expect(getLoverRouteCost(state, "study").san).toBe(5);
    expect(getPaperPromotionCost("github", state)).toBe(6);
    expect(getActualSanChange(-4, state.month, state.eventSupport, state.buffs)).toBe(-6);
  });

  it("clamps every covered consumption to zero without turning free actions into costs", () => {
    const state = stateForMonth(11);
    state.buffs = [modifierBuff({ activeOperationSanDelta: -100 })];
    expect(getAdvisorTaskSanCost(state)).toBe(0);
    expect(getLoverRouteCost(state, "study").san).toBe(0);
    expect(getPaperPromotionCost("github", state)).toBe(0);
    expect(getActualSanChange(-2, state.month, state.eventSupport, state.buffs)).toBe(0);
    expect(getActualResearchMiscSanChange(-2, 18, state.month, state.eventSupport, state.buffs)).toBe(0);
    expect(getActiveOperationSanCostForState({ ...state, buffs: [] }, 0, "read")).toBe(0);
  });

  it("ignores expired modifiers and leaves fixed monthly deductions and restoration unchanged", () => {
    const state = stateForMonth(11);
    state.shopState.bikeOwned = true;
    state.shopState.bikeLevel = 1;
    state.buffs = [modifierBuff({ monthlyStats: { san: -2 } })];
    const original = resolveMonthlyEffects(state);
    const modified = { ...state, buffs: [...state.buffs, modifierBuff({ id: "global", activeOperationSanMultiplier: 2.5, activeOperationSanDelta: -4 })] };
    expect(resolveMonthlyEffects(modified)).toEqual(original);
    expect(getActualSanChange(-4, 2, state.eventSupport, [modifierBuff({ remainingMonths: 0, activeOperationSanMultiplier: 2, activeOperationSanDelta: -1 })])).toBe(-4);
    expect(getActualSanChange(6, 11, state.eventSupport, modified.buffs)).toBe(6);
  });
});

describe("event SAN scope", () => {
  it("includes a new illness in treatment costs and keeps rest recovery separate", () => {
    let state = stateForMonth();
    state.buffs = [modifierBuff({ activeOperationSanDelta: -1 })];
    state = dispatchAction(state, "debug-trigger-event", { eventId: "illness-flu" });
    const intro = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: intro.id, eventChoiceId: intro.choices[0]!.id });
    const decision = state.eventQueue[0]!;
    const medicine = decision.choices.find((entry) => entry.label === "先买药")!;
    const rest = decision.choices.find((entry) => entry.label === "休息")!;
    expect(medicine.effects.san).toBe(-1);
    expect(rest.effects.san).toBe(-11);
    expect(rest.outcome).toContain("休息（SAN+2");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: rest.id });
    const result = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(state.player.san).toBe(11);
    expect(state.buffs.some((buff) => buff.activeOperationSanMultiplier)).toBe(false);
  });

  it.each([1, 6, 12, 18])("does not discount the old internship branch at research %i", (research) => {
    const state = stateForMonth(11);
    state.player.research = research;
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 1.5, activeOperationSanDelta: -1, relationshipOperationSanDelta: -10 })];
    const event = createRandomEventById(5, state, () => 0).event!;
    const choice = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((entry) => entry.label === "提出远程实习")!;
    expect(choice.effects.san).toBe(-8);
    expect(choice.outcome).toContain("SAN -8");
    expect(choice.outcome).not.toContain("减免");
  });

  it("shows and settles an event cost exactly once with all global modifiers", () => {
    let state = stateForMonth(8);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 1.5, activeOperationSanDelta: -1 })];
    const event = createRandomEventById(1, state, () => 0).event!;
    state.eventQueue = [createEventQueueItem(event, 1)];
    const intro = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: intro.id, eventChoiceId: intro.choices[0]!.id });
    const decision = state.eventQueue[0]!;
    const choice = decision.choices.find((entry) => entry.label === "亲自指导")!;
    expect(choice.effects.san).toBe(-1);
    expect(choice.outcome).toContain("SAN -1");
    state = dispatchAction(state, "resolve-event", { eventId: decision.id, eventChoiceId: choice.id });
    expect(state.player.san).toBe(20);
    const result = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(state.player.san).toBe(19);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toContain("SAN -1");
  });

  it.each(["idea", "experiment"] as const)("applies research-tier reduction to %s competition with live matching previews", (field) => {
    const state = stateForMonth(8);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 1.5, activeOperationSanDelta: -1 })];
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40 };
    state.papers = [paper];
    const resolution = { paperId: paper.id, field, multiplier: 1.25, sanCost: 6 };
    expect(previewPaperCompetitionResolution(state, resolution).resolvedOutcome).toContain("SAN-4");
    expect(applyPaperCompetitionResolution(state, resolution).nextState.player.san).toBe(16);
    const free = { ...resolution, multiplier: 0.25, sanCost: 0 };
    expect(applyPaperCompetitionResolution({ ...state, month: 11 }, free).nextState.player.san).toBe(20);
  });
});

describe("reviewer SAN consumption", () => {
  it.each([false, true])("refreshes pending review costs after curing illness without changing decisions, accepted=%s", (accepted) => {
    let state = stateForMonth(11);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 2 })];
    const score = accepted ? 100 : 1;
    state.papers = [{ ...createDraftPaper(1, 0), idea: score, experiment: score, writing: score,
      status: "reviewing", target: "C", reviewMonthsLeft: 0, submittedYear: 1 }];
    state = resolveDuePaperReviews(state, () => 0.99).state;
    for (let stage = 0; stage < 2; stage += 1) {
      const event = state.eventQueue[0]!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    }
    const originalSettlement = state.eventQueue[0]!.choices[0]!.effects.paperReviewSettlement!;
    expect(originalSettlement.reviewerSanChange).toBe(-15);
    expect(originalSettlement.accepted).toBe(accepted);
    state = { ...state, buffs: [], eventSupport: { ...state.eventSupport, hasParasol: true } };
    state = refreshPaperReviewEvents(state);
    const event = state.eventQueue[0]!;
    const settlement = event.choices[0]!.effects.paperReviewSettlement!;
    expect(settlement.reviewerSanChange).toBe(-6);
    expect(settlement.reports.map((report) => report.baseSanChange)).toEqual([-2, -2, -2]);
    expect(settlement.totalReviewScore).toBe(originalSettlement.totalReviewScore);
    expect(settlement.accepted).toBe(originalSettlement.accepted);
    expect(event.description).toContain("审稿影响 SAN -6");
    expect(refreshPaperReviewEvents(state)).toBe(state);
    state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toContain("审稿影响 SAN -6");
    expect(state.log.some((entry) => entry.text.includes("审稿影响 SAN -6"))).toBe(true);
    const history = structuredClone(state.eventHistory);
    state = refreshPaperReviewEvents({ ...state, buffs: [modifierBuff({ activeOperationSanMultiplier: 3 })] });
    expect(state.eventHistory).toEqual(history);
    if (!accepted) expect(state.player.san).toBe(14);
  });

  it.each([false, true])("uses the new month's modifiers for review SAN, lover discount=%s", (discount) => {
    const state = stateForMonth(1);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 2 })];
    state.loverProgressState.sanDiscountMonths = discount ? [2] : [];
    state.papers = [{ ...createDraftPaper(1, 0), idea: 1, experiment: 1, writing: 1,
      status: "reviewing", target: "C", reviewMonthsLeft: 0, submittedYear: 1 }];
    const queued = resolveDuePaperReviews(state, () => 0.99).state;
    queued.eventQueue = [];
    queued.papers[0]!.reviewMonthsLeft = 1;
    const savedRandom = Math.random;
    Math.random = () => 0.99;
    let advanced: GameState;
    try { advanced = dispatchAction(queued, "next-month"); } finally { Math.random = savedRandom; }
    const event = advanced.eventQueue.find((entry) => entry.source === "review")!;
    const settlement = event.choices[0]!.effects.enqueueEvents![0]!.choices[0]!.effects.enqueueEvents![0]!.choices[0]!.effects.paperReviewSettlement!;
    expect(settlement.reviewerSanChange).toBe(discount ? -3 : -6);
  });

  it.each([8, 11])("modifies hostile losses separately from kind recovery in month %i and settles once", (month) => {
    const state = stateForMonth(month);
    state.buffs = [modifierBuff({ activeOperationSanMultiplier: 2, activeOperationSanDelta: -1, relationshipOperationSanDelta: -10 })];
    state.papers = [{ ...createDraftPaper(1, 0), idea: 1, experiment: 1, writing: 1,
      status: "reviewing", target: "C", reviewMonthsLeft: 0, submittedYear: 1 }];
    const rolls = [0.95, 0.75, 0.75];
    const queued = resolveDuePaperReviews(state, () => rolls.shift() ?? 0.99).state;
    const first = queued.eventQueue[0]!;
    const final = first.choices[0]!.effects.enqueueEvents![0]!.choices[0]!.effects.enqueueEvents![0]!;
    const settlement = final.choices[0]!.effects.paperReviewSettlement!;
    const expectedLoss = month === 8 ? -2 : -4;
    expect(settlement.reports.map((report) => report.sanChange)).toEqual([expectedLoss, 1, 1]);
    expect(settlement.reviewerSanChange).toBe(expectedLoss + 2);
    expect(queued.player.san).toBe(20);
    const settled = resolveChain(queued, first.chainId);
    expect(settled.player.san).toBe(20 + expectedLoss + 2);
  });
});
