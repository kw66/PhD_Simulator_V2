import { describe, expect, it } from "vitest";
import { getAdvisorGrantResultContext, settleAdvisorGrantResult, settleAdvisorMonth } from "../src/core/v2-advisor-progress";
import { getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { payFellowResearchCost } from "../src/core/v2-fellow-finance";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabPayroll, getNextMonthLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { advanceSharedLabProject } from "../src/core/v2-lab-projects";
import { applyMonthlyEffects, applyMonthStartSubscriptions, previewNextMonthEffects } from "../src/core/v2-monthly-effects";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation, getResearchExperimentCostBreakdown, previewResearchOperation } from "../src/core/v2-research-operation";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import type { AdvisorGrantApplication, GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  const fellow = createCustomFellowProgressProfile({
    type: "peer", gender: "female", startTotalMonths: 1, academicYear: 1,
    degree: "master", research: 6, affinity: 1,
  });
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 4, totalMonths: 4,
    eventQueue: [], buffs: [], player: { ...base.player, money: 100, san: 20 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [fellow], fellowFinanceAccounts: { [fellow.id]: { name: fellow.name!, money: 10 } },
    labFinanceLedger: { totalMonths: 4, amounts: { other: 2 } },
  };
}

function withAiRenewal(state: GameState): GameState {
  return { ...state,
    eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: state.totalMonths },
    aiShopState: { subscriptions: { ...state.aiShopState.subscriptions,
      gpt: { ...state.aiShopState.subscriptions.gpt, enabled: true,
        modelId: getAiModelForTotalMonths(state.totalMonths, "gpt").id },
    } },
  };
}

describe("lab finance settlement hooks", () => {
  it("records the full payroll, including mandatory wages that leave debt", () => {
    const state = makeState();
    state.advisorProgressState.funding = 0.5;
    const before = structuredClone(state);
    const total = getLabPayroll(state).total;
    const paid = settleLabPayroll(state);
    expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "student-wages": -total });
    expect(paid.advisorProgressState.funding).toBe(0.5 - total);
    expect(settleLabPayroll({ ...state, totalMonths: 1 }).labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(state).toEqual(before);
  });

  it("records gross horizontal income and labor separately for every completion", () => {
    const state = makeState();
    const before = structuredClone(state);
    const result = advanceSharedLabProject(state, "horizontal", 200, () => 0);
    expect(result.completed).toBe(2);
    expect(result.state.labFinanceLedger?.amounts).toEqual({ other: 2, "horizontal-income": 100, labor: -10 });
    expect(result.state.advisorProgressState.funding).toBe(190);
    expect(advanceSharedLabProject(state, "horizontal", 1).state.labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(state).toEqual(before);
  });

  it("preserves horizontal records through the advisor monthly state spread", () => {
    const state = makeState();
    state.advisorProgressState.horizontalProgress = 90;
    const paid = settleAdvisorMonth(state, () => 0);
    expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "horizontal-income": 50, labor: -5 });
    expect(paid.advisorProgressState.funding).toBe(145);
    expect(settleAdvisorMonth(paid, () => 0)).toBe(paid);
  });

  it.each([0, 0.75, 3])("records only the fellow's lab-funded portion at funding %s", (funding) => {
    const state = makeState();
    state.advisorProgressState.funding = funding;
    const before = structuredClone(state);
    const paid = payFellowResearchCost(state, state.fellowProgressState[0]!.id, 2);
    const labCost = Math.min(funding, 2);
    expect(paid).toMatchObject({ paid: true, labCost, personalCost: 2 - labCost });
    expect(paid.state.labFinanceLedger?.amounts).toEqual({ other: 2, ...(labCost > 0 ? { "student-experiment": -labCost } : {}) });
    expect(paid.state.advisorProgressState.funding).toBe(funding - labCost);
    expect(payFellowResearchCost(state, state.fellowProgressState[0]!.id, 100).state).toBe(state);
    expect(state).toEqual(before);
  });

  it("records grants only on successful settlement, preserving other records", () => {
    const state = makeState();
    const application: AdvisorGrantApplication = { id: "youth", calendarYear: 2024, researchSnapshot: 25, resultRoll: 0 };
    state.advisorProgressState.pendingApplication = application;
    const before = structuredClone(state);
    expect(getAdvisorGrantResultContext(state, application).success).toBe(true);
    const paid = settleAdvisorGrantResult(state, application);
    expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "grant-income": 30 });
    expect(paid.advisorProgressState.funding).toBe(130);
    expect(settleAdvisorGrantResult(paid, application)).toBe(paid);
    const failedApplication = { ...application, researchSnapshot: 0, resultRoll: 0.9 };
    const failed = settleAdvisorGrantResult({ ...state,
      advisorProgressState: { ...state.advisorProgressState, pendingApplication: failedApplication },
    }, failedApplication);
    expect(failed.labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(failed.advisorProgressState.funding).toBe(100);
    expect(state).toEqual(before);
  });

  it("records player experiments only after eligibility and funding checks", () => {
    const state = makeState();
    state.papers = [{ ...createDraftPaper(1, 0, () => 0), idea: 5 }];
    const paperId = state.papers[0]!.id;
    const before = structuredClone(state);
    const cost = getResearchExperimentCostBreakdown(state).advisorFunding;
    previewResearchOperation(state, "experiment", 3);
    const paid = applyResearchOperation(state, paperId, "experiment", () => 0);
    expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "player-experiment": -cost });
    expect(paid.advisorProgressState.funding).toBe(100 - cost);
    expect(applyResearchOperation({ ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } },
      paperId, "experiment", () => 0).labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(applyResearchOperation(state, paperId, "idea", () => 0).labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(state).toEqual(before);
  });

  it("records equipment reimbursement once and leaves rejected purchases unrecorded", () => {
    const state = makeState();
    state.shopState.labReimbursements = { totalMonths: state.totalMonths, gpuTransaction: 1, workstationTransaction: 0 };
    const before = structuredClone(state);
    getShopActionPrice(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    const paid = applyShopAction(state, "buy-shop-item", { shopItemId: "gpu_buy" });
    const cost = 100 - paid.advisorProgressState.funding;
    expect(cost).toBeGreaterThan(0);
    expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "student-reimbursement": -cost });
    expect(paid.shopState.labReimbursements.gpuTransaction).toBe(0);
    expect(applyShopAction({ ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } },
      "buy-shop-item", { shopItemId: "gpu_buy" }).labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(state).toEqual(before);
  });

  it("records manual and automatic AI reimbursements without double-recording repeat attempts", () => {
    const state = withAiRenewal(makeState());
    const before = structuredClone(state);
    const cost = getAiModelForTotalMonths(state.totalMonths, "gpt").price;
    const manual = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    const automatic = applyMonthStartSubscriptions(state).nextState;
    for (const paid of [manual, automatic]) {
      expect(paid.labFinanceLedger?.amounts).toEqual({ other: 2, "student-reimbursement": -cost });
      expect(paid.advisorProgressState.funding).toBe(100 - cost);
      expect(applyShopAction(paid, "buy-ai-month", { aiSlotId: "gpt" }).labFinanceLedger).toEqual(paid.labFinanceLedger);
      expect(applyMonthStartSubscriptions(paid).nextState.labFinanceLedger).toEqual(paid.labFinanceLedger);
    }
    const poor = { ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } };
    expect(applyMonthStartSubscriptions(poor).nextState.labFinanceLedger).toEqual(state.labFinanceLedger);
    expect(state).toEqual(before);
  });

  it("keeps previews immutable and retains payroll alongside AI reimbursement during monthly settlement", () => {
    const state = withAiRenewal(makeState());
    state.eventSupport.aiCostsCoveredUntilTotalMonths = state.totalMonths + 1;
    const before = structuredClone(state);
    getNextMonthLabPayroll(state);
    previewNextMonthEffects(state);
    previewNextMonthEffects(state);
    expect(state).toEqual(before);
    const nextMonth = { ...state, month: 5, totalMonths: 5 };
    const paid = applyMonthlyEffects(nextMonth).nextState;
    const wages = getLabPayroll(nextMonth).total;
    expect(paid.labFinanceLedger).toEqual({ totalMonths: 5,
      amounts: { "student-wages": -wages, "student-reimbursement": -2 },
    });
    expect(paid.advisorProgressState.funding).toBe(100 - wages - 2);
    const projected = settleAdvisorMonth({ ...paid,
      advisorProgressState: { ...paid.advisorProgressState, horizontalProgress: 90 },
    }, () => 0);
    expect(projected.labFinanceLedger?.amounts).toEqual({
      "student-wages": -wages, "student-reimbursement": -2, "horizontal-income": 50, labor: -5,
    });
    const application: AdvisorGrantApplication = { id: "youth", calendarYear: 2024, researchSnapshot: 25, resultRoll: 0 };
    const granted = settleAdvisorGrantResult({ ...projected,
      advisorProgressState: { ...projected.advisorProgressState, pendingApplication: application },
    }, application);
    expect(granted.labFinanceLedger?.amounts).toEqual({
      "student-wages": -wages, "student-reimbursement": -2, "horizontal-income": 50, labor: -5, "grant-income": 30,
    });
    expect(granted.advisorProgressState.funding).toBe(100 - wages - 2 + 50 - 5 + 30);
    expect(state).toEqual(before);
  });
});
