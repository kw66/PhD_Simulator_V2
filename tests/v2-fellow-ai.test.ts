import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiBuffs, createAiShopState, getAiModelForTotalMonths, getAiModelTimeline, polishUnsubmittedPapers } from "../src/core/v2-ai-shop";
import { applyFellowAiResearch, getFellowAiBudget, scoreFellowAiModel, subscribeFellowAi } from "../src/core/v2-fellow-ai";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { createLabGpuFailureBuff } from "../src/core/v2-lab-compute";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import type { GameState, PaperActionType } from "../src/core/v2-types";

function makeState(totalMonths = 4, money = 0): GameState {
  const base = createStartedGameState("normal");
  const profile = { ...createCustomFellowProgressProfile({
    type: "peer", gender: "female", name: "林青", research: 10, affinity: 1, startTotalMonths: 1,
  }), id: "fellow" };
  const state = ensureFellowPapers({
    ...base, ...getCalendarForTotalMonths(totalMonths, "phd"), totalMonths, degree: "phd", maxMonths: 70,
    selectedAdvisorName: "导师", availableRandomEvents: [], eventQueue: [],
    player: { san: 20, research: 10, social: 5, favor: 5, money: 20 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [profile], fellowFinanceAccounts: { fellow: { name: "林青", money }, departed: { name: "离校同学", money: 7 } },
  }, () => 0);
  return { ...state, fellowPapers: state.fellowPapers!.map((paper) => ({
    ...paper, createdTotalMonths: 1, prepublicationDecayRate: 0,
  })) };
}

afterEach(() => vi.restoreAllMocks());

describe("fellow AI selection and payment", () => {
  it("uses free Doubao with zero budget and never draws global randomness for selection", () => {
    const state = makeState();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Selection drew randomness"); });
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.slot).toBe("doubao");
    expect(selected.state.fellowFinanceAccounts?.fellow).toMatchObject({ money: 0, aiSlot: "doubao", aiSubscribedTotalMonths: 4 });
    expect(selected.state.player).toEqual(state.player);
    expect(selected.state.advisorProgressState).toEqual(state.advisorProgressState);
    expect(random).not.toHaveBeenCalled();
  });

  it("reserves only one experiment despite unpaid conference and journal publications", () => {
    const state = makeState(4, 4);
    state.fellowPapers![0]!.idea = 100;
    const pending = {
      ...createDraftPaper(1, 0, () => 0), id: "unpaid", status: "published" as const,
      leadAuthorId: "fellow", target: "A" as const, submittedMonth: 1, submittedYear: 1, conferenceHandled: false,
    };
    state.externalPublications = [pending, { ...pending, id: "other", leadAuthorId: "departed" },
      { ...pending, id: "journal", target: null, journalTarget: "nature" }];
    state.fellowPapers!.push({ ...pending });
    state.papers = [{ ...pending }];
    expect(getFellowAiBudget(state, "fellow")).toBe(1);
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.slot).toBe("deepseek");
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(3);
    expect(selected.state.fellowFinanceAccounts?.departed).toEqual(state.fellowFinanceAccounts?.departed);
    expect(selected.state.advisorProgressState).toEqual(state.advisorProgressState);
    expect(selected.state.player).toEqual(state.player);
    expect(selected.state.externalPublications).toEqual(state.externalPublications);
  });

  it("reserves the current experiment cost exactly once even with ample lab funding", () => {
    const state = makeState(4, 5);
    state.buffs = [createLabGpuFailureBuff()];
    state.fellowPapers![0]!.idea = 100;
    expect(getFellowAiBudget(state, "fellow")).toBe(1);
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.slot).toBe("deepseek");
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(4);
    expect(selected.state.advisorProgressState.funding).toBe(100);
    state.advisorProgressState.funding = 0;
    expect(getFellowAiBudget(state, "fellow")).toBe(1);
  });

  it("chooses the more useful model at the same price for the current high-score task", () => {
    const state = makeState(4, 20);
    state.fellowPapers![0] = { ...state.fellowPapers![0]!, idea: 100 };
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.slot).toBe("claude");
    expect(selected.model!.price).toBe(getAiModelForTotalMonths(4, "gpt").price);
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(18);
    expect(scoreFellowAiModel(state.fellowPapers![0]!, "idea", 10, selected.model!))
      .toBeGreaterThan(scoreFellowAiModel(state.fellowPapers![0]!, "idea", 10, getAiModelForTotalMonths(4, "gpt")));
  });

  it("selects affordable DeepSeek for a high-score task when paid alternatives exceed the reserved budget", () => {
    const state = makeState(4, 4);
    state.fellowPapers![0] = { ...state.fellowPapers![0]!, idea: 100 };
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.slot).toBe("deepseek");
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(3);
  });

  it.each([0, 2, 3, 3.99])("keeps the experiment reserve with wallet %s and no affordable paid model", (money) => {
    const state = makeState(4, money);
    state.fellowPapers![0] = { ...state.fellowPapers![0]!, idea: 100 };
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(getFellowAiBudget(state, "fellow")).toBe(Math.max(0, Math.round((money - 3) * 100) / 100));
    expect(selected.model?.slot).toBe("doubao");
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(money);
  });

  it("leaves journal revisions unchanged without subscribing or submitting them to a conference", () => {
    const state = makeState(16, 20);
    const paper = { ...state.fellowPapers![0]!, status: "journal-reviewing" as const, journalTarget: "pami" as const,
      idea: 100, experiment: 100, writing: 100 };
    state.fellowPapers = [paper];
    const selected = subscribeFellowAi(state, "fellow", paper.id, "writing");
    expect(selected).toEqual({ state, model: null, subscribed: false });
    const next = advanceFellowResearch(state, () => 0);
    expect(next.fellowPapers![0]).toEqual(paper);
    expect(next.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
    expect(next.fellowProgressState[0]!.monthlyActivity).not.toContain("订阅");
  });

  it("picks Claude for useful multi-field polishing and charges/polishes only once per month", () => {
    const state = makeState(16, 20);
    const paper = { ...state.fellowPapers![0]!, idea: 100, experiment: 100, writing: 100 };
    state.fellowPapers = [paper];
    const selected = subscribeFellowAi(state, "fellow", paper.id, "writing");
    expect(selected.model?.slot).toBe("claude");
    expect(selected.state.fellowPapers![0]).toMatchObject({ idea: 102, experiment: 102, writing: 100 });
    expect(selected.state.fellowFinanceAccounts?.fellow?.money).toBe(18);
    const repeated = subscribeFellowAi(selected.state, "fellow", paper.id, "idea");
    expect(repeated.subscribed).toBe(false);
    expect(repeated.state).toBe(selected.state);
    expect(repeated.model?.id).toBe(selected.model?.id);
    const nextMonth = subscribeFellowAi({ ...selected.state, month: 5, totalMonths: 17 }, "fellow", paper.id, "writing");
    expect(nextMonth.state.fellowFinanceAccounts?.fellow).toMatchObject({ money: 16, aiSubscribedTotalMonths: 17 });
    expect(nextMonth.state.fellowPapers![0]).toMatchObject({ idea: 104, experiment: 104, writing: 100 });
  });

  it.each(["reviewing", "project", "joined"] as const)("does not subscribe while %s", (caseId) => {
    const state = makeState(4, 20);
    if (caseId === "reviewing") state.fellowPapers![0]!.status = "reviewing";
    if (caseId === "project") state.fellowProgressState[0]!.nextMonthlyAction = "project";
    if (caseId === "joined") state.fellowProgressState[0]!.startTotalMonths = 4;
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected).toEqual({ state, model: null, subscribed: false });
    expect(selected.state).toBe(state);
  });

  it("uses the current-year model and preserves the locked monthly subscription after funds change", () => {
    const state = makeState(52, 20);
    const selected = subscribeFellowAi(state, "fellow", state.fellowPapers![0]!.id, "idea");
    expect(selected.model?.id).toBe(getAiModelForTotalMonths(52, selected.model!.slot).id);
    const changed = { ...selected.state, fellowFinanceAccounts: {
      ...selected.state.fellowFinanceAccounts, fellow: { ...selected.state.fellowFinanceAccounts!.fellow!, money: 100 },
    } };
    const repeated = subscribeFellowAi(changed, "fellow", state.fellowPapers![0]!.id, "writing");
    expect(repeated.state).toBe(changed);
    expect(repeated.model?.id).toBe(selected.model?.id);
  });
});

describe("fellow AI shares the player research formula", () => {
  const models = getAiModelTimeline().filter((model) => ["gpt", "deepseek", "doubao", "claude"].includes(model.slot));
  it.each(models)("matches player research for $id without modifying collaboration scores", (model) => {
    for (const field of ["idea", "experiment", "writing"] as const satisfies readonly PaperActionType[]) {
      const base = makeState();
      const original = {
        ...createDraftPaper(1, 0, () => 0), idea: 30, experiment: 40, writing: 50,
        collaborationScores: { idea: 7, experiment: 11, writing: 13 },
        collaborators: [{ id: "helper", name: "帮助者" }],
      };
      const paper = polishUnsubmittedPapers([original], model).papers[0]!;
      const ai = createAiShopState();
      ai.subscriptions[model.slot] = { enabled: true, active: true, paused: false, modelId: model.id, lastRenewalTotalMonths: 4 };
      const state = { ...base, papers: [paper], aiShopState: ai, buffs: createAiBuffs(ai) };
      const sequence = () => { let index = 0; return () => [0.1, 0.9, 0.8, 0.2, 0.5, 0.4, 0.99, 0][index++ % 8]!; };
      const player = applyResearchOperation(state, paper.id, field, sequence()).papers[0]!;
      const fellow = applyFellowAiResearch(paper, field, state.player.research, model, sequence());
      expect(fellow[field]).toBe(player[field]);
      expect(fellow.collaborationScores).toEqual(original.collaborationScores);
      expect(fellow.collaborators).toEqual(original.collaborators);
    }
  });

  it("applies free-model research in the monthly pipeline without affecting SAN, cooperation or salary fields", () => {
    const state = makeState();
    state.fellowProgressState[0] = { ...state.fellowProgressState[0]!, monthlySalaryPaid: 1, lastSalaryTotalMonths: 4 };
    const next = advanceFellowResearch(state, () => 0);
    expect(next.fellowPapers![0]!.idea).toBe(6);
    expect(next.fellowProgressState[0]).toMatchObject({ taskProgress: 1, monthlySalaryPaid: 1, lastSalaryTotalMonths: 4 });
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain("订阅豆包 Seed 1（免费）");
    expect(next.fellowProgressState[0]!.monthlyActivity).not.toContain("自费 -0");
    expect(next.fellowFinanceAccounts?.fellow?.money).toBe(0);
    expect(next.player).toEqual(state.player);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

  it("adds Doubao's point only to own research in the monthly pipeline", () => {
    const state = makeState();
    state.fellowPapers![0] = { ...state.fellowPapers![0]!, idea: 7, experiment: 30, writing: 40,
      collaborationScores: { idea: 7, experiment: 11, writing: 13 },
      collaborators: [{ id: "player", name: "玩家" }],
    };
    const next = advanceFellowResearch(state, () => 0);
    const paper = next.fellowPapers![0]!;
    expect(getPaperScoreBreakdown(paper, "idea")).toEqual({ own: 6, collaboration: 7, total: 13 });
    expect(paper.collaborationScores).toEqual(state.fellowPapers![0]!.collaborationScores);
    expect(paper.collaborators).toEqual(state.fellowPapers![0]!.collaborators);
    expect(next.player).toEqual(state.player);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

  it("charges one experiment for DeepSeek repetitions and keeps collaboration scores untouched", () => {
    const state = makeState(4, 4);
    state.advisorProgressState.funding = 0;
    state.fellowPapers![0] = { ...state.fellowPapers![0]!, idea: 100, experiment: 100, writing: 200,
      collaborationScores: { experiment: 10 } };
    const paper = state.fellowPapers![0]!;
    const selected = subscribeFellowAi(state, "fellow", paper.id, "experiment");
    expect(selected.model?.slot).toBe("deepseek");
    const research = applyFellowAiResearch(paper, "experiment", 10, selected.model, () => 0);
    expect(research.experiment).toBe(102);
    expect(research.collaborationScores).toEqual(paper.collaborationScores);
    const next = advanceFellowResearch({
      ...selected.state,
      fellowPapers: [{ ...paper, idea: 200 }],
    }, () => 0);
    expect(next.advisorProgressState.funding).toBe(0);
    expect(next.fellowFinanceAccounts?.fellow?.money).toBe(0);
    expect(next.player).toEqual(state.player);
    expect(next.fellowPapers![0]!.experiment).toBe(102);
  });
});
