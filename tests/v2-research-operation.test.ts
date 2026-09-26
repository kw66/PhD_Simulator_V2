import { describe, expect, it } from "vitest";

import { createAiBuffs, getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyResearchOperation, getResearchExperimentCostBreakdown, getResearchExperimentMoneyCost, previewResearchOperation } from "../src/core/v2-research-operation";
import { activateInternship, activateRemoteInternship, createInternshipState } from "../src/core/v2-internship-system";
import { settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { applyShopAction } from "../src/core/v2-shop-transactions";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import type { GameState, PaperActionType } from "../src/core/v2-types";

function admittedState() {
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-open-advisor-info" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-confirm" });
  state = dispatchAction(state, "resolve-event", { eventChoiceId: "before-grad-school-finish" });
  state = dispatchAction(state, "next-month");
  return {
    ...state,
    eventQueue: [],
    buffs: [],
    player: { ...state.player, research: 4, san: 20 },
  };
}

describe("v2 research operations", () => {
  it("creates a draft for an unlocked slot without spending an action", () => {
    const state = admittedState();
    const created = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    expect(created.log).toBe(state.log);

    expect(created.papers).toHaveLength(1);
    expect(created.papers[0]).toMatchObject({ idea: 0, experiment: 0, writing: 0, status: "draft" });
    expect(created.selectedPaperId).toBe(created.papers[0]?.id);
    expect(created.actionState).toEqual(state.actionState);
    expect(dispatchAction(created, "create-paper", { paperSlotIndex: 0 })).toBe(created);
  });

  it("keeps exactly one editable paper selected", () => {
    const first = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const withResearch = {
      ...first,
      player: { ...first.player, research: 6 },
    };
    const second = dispatchAction(withResearch, "create-paper", { paperSlotIndex: 1 });
    const firstId = second.papers[0]!.id;
    const secondId = second.papers[1]!.id;

    expect(second.selectedPaperId).toBe(secondId);
    const selectedFirst = dispatchAction(second, "select-paper", { paperId: firstId });
    expect(selectedFirst.selectedPaperId).toBe(firstId);
    const selectedAgain = dispatchAction(selectedFirst, "select-paper", { paperId: firstId });
    expect(selectedAgain).toBe(selectedFirst);
    expect(selectedAgain.selectedPaperId).toBe(firstId);
  });

  it("creates drafts in any unlocked empty workstation slot", () => {
    const admitted = admittedState();
    const base = {
      ...admitted,
      player: { ...admitted.player, research: 12 },
    };
    const slotTwo = dispatchAction(base, "create-paper", { paperSlotIndex: 2 });

    expect(slotTwo.papers).toHaveLength(1);
    expect(slotTwo.papers[0]).toMatchObject({ paperSlotIndex: 2, status: "draft" });
    expect(dispatchAction(slotTwo, "create-paper", { paperSlotIndex: 2 })).toBe(slotTwo);

    const slotOne = dispatchAction(slotTwo, "create-paper", { paperSlotIndex: 1 });
    expect(slotOne.papers).toHaveLength(2);
    expect(slotOne.papers.find((paper) => paper.paperSlotIndex === 1)).toBeDefined();
    expect(slotOne.papers.find((paper) => paper.paperSlotIndex === 2)).toBeDefined();

    const slotZero = dispatchAction(slotOne, "create-paper", { paperSlotIndex: 0 });
    expect(slotZero.papers).toHaveLength(3);
    expect(new Set(slotZero.papers.map((paper) => paper.paperSlotIndex))).toEqual(new Set([0, 1, 2]));
    expect(dispatchAction(slotZero, "create-paper", { paperSlotIndex: 3 })).toBe(slotZero);

    const slotOneId = slotZero.papers.find((paper) => paper.paperSlotIndex === 1)!.id;
    const slotTwoId = slotZero.papers.find((paper) => paper.paperSlotIndex === 2)!.id;
    const clearedSlotOne = dispatchAction(slotZero, "discard-paper", { paperId: slotOneId });
    const reusedSlotOne = dispatchAction(clearedSlotOne, "create-paper", { paperSlotIndex: 1 });
    expect(reusedSlotOne.papers).toHaveLength(3);
    expect(reusedSlotOne.papers.find((paper) => paper.paperSlotIndex === 1)).toMatchObject({ status: "draft" });
    expect(reusedSlotOne.papers.find((paper) => paper.paperSlotIndex === 2)?.id).toBe(slotTwoId);
  });

  it("unlocks later paper slots immediately when research reaches their thresholds", () => {
    const base = admittedState();
    const first = dispatchAction(base, "create-paper", { paperSlotIndex: 0 });
    const state = {
      ...first,
      paperSlotsUnlocked: 1,
      player: { ...first.player, research: 6 },
    };
    const second = dispatchAction(state, "create-paper", { paperSlotIndex: 1 });

    expect(second.papers).toHaveLength(2);
    expect(second.paperSlotsUnlocked).toBe(2);
    expect(second.selectedPaperId).toBe(second.papers[1]?.id);
  });

  it("writes a deterministic idea score and spends one SAN/action settlement", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const paperId = created.papers[0]!.id;
    const researched = applyResearchOperation(created, paperId, "idea", () => 0);

    expect(researched.papers[0]?.idea).toBe(2);
    expect(researched.player.san).toBe(18);
    expect(researched.actionState.used).toBe(1);
    expect(researched.actionState.aiResearchBonusUsed).toBe(false);
  });

  it("applies GPU and active AI bonuses to every internal research execution", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const activeSlots = new Set(["gpt", "deepseek", "doubao"]);
    const aiShopState = {
      subscriptions: Object.fromEntries(
        Object.entries(created.aiShopState.subscriptions).map(([slot, subscription]) => [
          slot,
          activeSlots.has(slot)
            ? {
                ...subscription,
                active: true,
                modelId: getAiModelForTotalMonths(created.totalMonths, slot as keyof typeof created.aiShopState.subscriptions).id,
              }
            : subscription,
        ]),
      ) as typeof created.aiShopState.subscriptions,
    };
    const state = {
      ...created,
      aiShopState,
      buffs: createAiBuffs(aiShopState),
      shopState: { ...created.shopState, gpuLevel: 1 },
      papers: created.papers.map((paper) => ({ ...paper, idea: 1 })),
    };

    expect(previewResearchOperation(state, "experiment", 3)).toMatchObject({
      scoreBonus: 5,
      extraActions: 2,
      sanCost: 4,
    });

    const researched = applyResearchOperation(state, state.papers[0]!.id, "experiment", () => 0);

    expect(researched.papers[0]?.experiment).toBe(9);
    expect(researched.player.san).toBe(16);
    expect(researched.log[0]?.text).toContain("共 3 次");
  });

  it("applies the remote internship experiment bonus, discount and multiplier", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const state = {
      ...created,
      internshipState: activateRemoteInternship(created.totalMonths - 1),
      papers: created.papers.map((paper) => ({ ...paper, idea: 1 })),
    };

    expect(previewResearchOperation(state, "experiment", 3)).toMatchObject({
      scoreBonus: 4,
      scoreMultiplier: 1,
    });

    const researched = applyResearchOperation(state, state.papers[0]!.id, "experiment", () => 0);
    expect(researched.papers[0]?.experiment).toBe(6);
    expect(researched.player.money).toBe(state.player.money);
    expect(researched.advisorProgressState.funding).toBe(8);
  });

  it("gives GPT-7 and GPT-8 the persistent high-tier multiplier at five coins", () => {
    for (const totalMonths of [49, 61]) {
      const model = getAiModelForTotalMonths(totalMonths, "gpt");
      expect(model.price).toBe(5);
      const bonus = totalMonths === 49 ? 7 : 8;
      expect(model.researchEffects.idea).toEqual({ bonus, multiplier: 1.25 });
      expect(model.researchEffects.experiment).toEqual({ bonus, multiplier: 1.25 });
      expect(model.researchEffects.writing).toEqual({ bonus, multiplier: 1.25 });
    }
  });

  it.each([0, 4, 8])("applies remote discounts before funding at GPU level %i", (gpuLevel) => {
    const initial = admittedState();
    const cost = gpuLevel === 8 ? 0 : gpuLevel === 4 ? 1 : 2;
    for (const funding of [0, 1, 10]) {
      const state = { ...initial, internshipState: activateRemoteInternship(initial.totalMonths - 1),
        shopState: { ...initial.shopState, gpuLevel },
        advisorProgressState: { ...initial.advisorProgressState, funding } };
      expect(getResearchExperimentCostBreakdown(state)).toEqual({
        total: cost, advisorFunding: Math.min(funding, cost), playerMoney: Math.max(0, cost - funding),
      });
      const created = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
      created.papers[0]!.idea = 1;
      created.player.money = 10;
      const researched = applyResearchOperation(created, created.papers[0]!.id, "experiment", () => 0);
      expect(researched.player.money).toBe(10 - Math.max(0, cost - funding));
      expect(researched.advisorProgressState.funding).toBe(Math.max(0, funding - cost));
      expect(getResearchExperimentMoneyCost({ ...state, totalMonths: initial.totalMonths + 3 })).toBe(cost + 1);
      expect(getResearchExperimentMoneyCost({ ...state, internshipState: activateInternship() })).toBe(cost + 1);
    }
  });

  it("keeps remote benefits on repeated experiment actions without changing unrelated scores", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    let state: GameState = { ...created, internshipState: activateRemoteInternship(created.totalMonths - 1),
      actionState: { ...created.actionState, limit: 3 }, papers: created.papers.map((paper) => ({ ...paper, idea: 1, writing: 1 })) };
    const before = structuredClone(state);
    for (const action of ["idea", "writing"] as const) {
      expect(previewResearchOperation(state, action, 0)).toEqual(previewResearchOperation({ ...state, internshipState: createInternshipState() }, action, 0));
    }
    expect(state).toEqual(before);
    state = applyResearchOperation(state, state.papers[0]!.id, "experiment", () => 0);
    expect(state.papers[0]).toMatchObject({ idea: 1, experiment: 6, writing: 1 });
    expect(previewResearchOperation(state, "experiment", 3).scoreBonus).toBe(4);
    state = applyResearchOperation(state, state.papers[0]!.id, "experiment", () => 0);
    expect(state.papers[0]).toMatchObject({ idea: 1, experiment: 7, writing: 1 });
    expect(state.internshipState).toEqual(before.internshipState);
  });

  it("retains remote and GPT effects across extra executions while consuming next-action effects once", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const aiShopState = structuredClone(created.aiShopState);
    aiShopState.subscriptions.gpt = { ...aiShopState.subscriptions.gpt, active: true, modelId: "gpt-6" };
    aiShopState.subscriptions.deepseek = { ...aiShopState.subscriptions.deepseek, active: true, modelId: "deepseek-v2" };
    const state: GameState = { ...created, aiShopState, internshipState: activateRemoteInternship(created.totalMonths - 1),
      papers: created.papers.map((paper) => ({ ...paper, idea: 1 })),
      buffs: [...createAiBuffs(aiShopState), { id: "next", name: "next", source: "test", timing: "next-action", remainingMonths: null,
        actionEffects: { experiment: { multiplier: 0.75, bonus: 2 }, idea: { bonus: 3 } } }] };
    expect(previewResearchOperation(state, "experiment", 3)).toMatchObject({ scoreBonus: 13, scoreMultiplier: 1, extraActions: 1 });
    const rolls = [0, 0, 0.99, 0.99];
    const researched = applyResearchOperation(state, state.papers[0]!.id, "experiment", () => rolls.shift()!);
    expect(researched.papers[0]?.experiment).toBe(25);
    expect(researched.advisorProgressState.funding).toBe(state.advisorProgressState.funding - 2);
    expect(researched.actionState.used).toBe(state.actionState.used + 1);
    expect(researched.buffs.find((buff) => buff.id === "next")?.actionEffects).toEqual({ idea: { bonus: 3 } });
    expect(previewResearchOperation(researched, "experiment", 3)).toMatchObject({ scoreBonus: 11, scoreMultiplier: 1.25 });
  });

  it.each([49, 61])("executes the paid GPT tier multiplier on every research action at month %i", (totalMonths) => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const base: GameState = { ...created, totalMonths, year: Math.floor((totalMonths - 1) / 12) + 1, month: 1,
      player: { ...created.player, money: 10 }, papers: created.papers.map((paper) => ({ ...paper, idea: 1, experiment: 1 })) };
    const bought = applyShopAction(base, "buy-ai-month", { aiSlotId: "gpt" });
    expect(bought.player.money).toBe(5);
    expect(bought.papers).toEqual(base.papers);
    const bonus = totalMonths === 49 ? 7 : 8;
    for (const action of ["idea", "experiment", "writing"] satisfies PaperActionType[]) {
      const researched = applyResearchOperation(bought, bought.papers[0]!.id, action, () => 0);
      expect(researched.papers[0]?.[action]).toBe(3 + bonus);
      expect(previewResearchOperation(researched, action, 0)).toMatchObject({ scoreBonus: bonus, scoreMultiplier: 1.25 });
    }
    const remote = { ...bought, internshipState: activateRemoteInternship(totalMonths - 1) };
    const researched = applyResearchOperation(remote, remote.papers[0]!.id, "experiment", () => 0);
    expect(researched.papers[0]?.experiment).toBe(7 + bonus);
    const poor = applyShopAction({ ...base, player: { ...base.player, money: 4 } }, "buy-ai-month", { aiSlotId: "gpt" });
    expect(poor.aiShopState.subscriptions.gpt.active).toBe(false);
    expect(poor.player.money).toBe(4);
    const renewed = applyMonthlyEffects({ ...bought, totalMonths: totalMonths + 1, month: 2,
      aiShopState: { subscriptions: { ...bought.aiShopState.subscriptions, gpt: { ...bought.aiShopState.subscriptions.gpt, enabled: true } } } });
    expect(renewed.resolution.items.find((item) => item.id === "ai-renewal-gpt")?.appliedStats.money).toBe(-5);
    expect(previewResearchOperation(renewed.nextState, "experiment", 3)).toMatchObject({ scoreBonus: bonus, scoreMultiplier: 1.25 });
    const expired = applyMonthlyEffects({ ...bought, totalMonths: totalMonths + 1, month: 2 }).nextState;
    expect(previewResearchOperation(expired, "experiment", 3)).toMatchObject({ scoreBonus: 0, scoreMultiplier: 1 });
  });

  it("keeps GPT boundary upgrades opt-in without leaking the new multiplier", () => {
    for (const totalMonths of [48, 60]) {
      const base = admittedState();
      const purchased = applyShopAction({ ...base, totalMonths, player: { ...base.player, money: 20 } }, "buy-ai-month", { aiSlotId: "gpt" });
      const state = { ...purchased, totalMonths: totalMonths + 1,
        aiShopState: { subscriptions: { ...purchased.aiShopState.subscriptions, gpt: { ...purchased.aiShopState.subscriptions.gpt, enabled: true } } } };
      const settled = applyMonthlyEffects(state);
      expect(settled.resolution.items.find((item) => item.id === "ai-renewal-gpt")?.appliedStats.money).toBe(0);
      expect(settled.nextState.aiShopState.subscriptions.gpt).toMatchObject({ active: false, enabled: false });
      expect(previewResearchOperation(settled.nextState, "experiment", 3)).toMatchObject({ scoreBonus: 0, scoreMultiplier: 1 });
    }
  });

  it("does not apply internship or GPT modifiers to advisor guidance", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const base = { ...created, selectedAdvisorName: "导师", papers: created.papers.map((paper) => ({ ...paper, idea: 1, experiment: 1 })),
      advisorProgressState: { ...created.advisorProgressState, pendingGuidanceToPlayer: 10 } };
    const expected = settleAdvisorGuidance(base, () => 0.5);
    for (const internshipState of [activateRemoteInternship(base.totalMonths - 1), activateInternship()]) {
      const aiShopState = structuredClone(base.aiShopState);
      aiShopState.subscriptions.gpt = { ...aiShopState.subscriptions.gpt, active: true, modelId: "gpt-6" };
      const actual = settleAdvisorGuidance({ ...base, internshipState, aiShopState, buffs: createAiBuffs(aiShopState) }, () => 0.5);
      expect(actual.papers).toEqual(expected.papers);
      expect(actual.papers[0]).toMatchObject({
        idea: 1, experiment: 1, writing: 10,
        collaborationScores: { idea: 0, experiment: 0, writing: 10 },
      });
    }
  });

  it("leaves fellow help and direct paper rewards independent of research action modifiers", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const fellow = { ...createCustomFellowProgressProfile({ type: "peer", gender: "male", startTotalMonths: 1, research: 10, affinity: 10 }),
      pendingHelpToPlayer: 10, pendingHelpToFellow: 10 };
    const base: GameState = { ...created, fellowProgressState: [fellow],
      papers: created.papers.map((paper) => ({ ...paper, idea: 1, experiment: 1 })),
      fellowPapers: created.papers.map((paper) => ({ ...paper, id: "fellow-paper", leadAuthorId: fellow.id, idea: 1, experiment: 1 })) };
    const augmented: GameState = { ...base, internshipState: activateRemoteInternship(base.totalMonths - 1),
      buffs: [{ id: "research", name: "research", source: "test", timing: "permanent", remainingMonths: null,
        actionEffects: { experiment: { multiplier: 1.25, bonus: 7 } } }] };
    const expectedHelp = settlePendingFellowHelp(base, () => 0.5);
    const actualHelp = settlePendingFellowHelp(augmented, () => 0.5);
    expect(actualHelp.papers).toEqual(expectedHelp.papers);
    expect(actualHelp.fellowPapers).toEqual(expectedHelp.fellowPapers);
    expect(actualHelp.fellowProgressState).toEqual(expectedHelp.fellowProgressState);
    const reward = { id: "paper-reward", label: "论文奖励", outcome: "", effects: {
      paperCollaborations: [{ paperId: base.papers[0]!.id, collaborator: { id: "helper", name: "合作者" }, scores: { experiment: 5 } }],
    } };
    const expectedReward = applyChoiceEffectsToState(base, reward).nextState;
    const actualReward = applyChoiceEffectsToState(augmented, reward).nextState;
    expect(actualReward.papers).toEqual(expectedReward.papers);
    expect(actualReward.papers[0]?.experiment).toBe(6);
  });

  it("keeps experiment and writing locked behind the prior research stage", () => {
    const created = dispatchAction(admittedState(), "create-paper", { paperSlotIndex: 0 });
    const paperId = created.papers[0]!.id;

    const experiment = applyResearchOperation(created, paperId, "experiment", () => 0);
    const writing = applyResearchOperation(created, paperId, "writing", () => 0);

    expect(experiment.papers[0]?.experiment).toBe(0);
    expect(writing.papers[0]?.writing).toBe(0);
    expect(experiment.actionState.used).toBe(0);
    expect(writing.actionState.used).toBe(0);
  });

  it("adds first-author and coauthor papers through the debug bar contract", () => {
    const state = admittedState();
    const firstAuthor = dispatchAction(state, "debug-add-paper", {
      debugPaperTarget: "A",
      debugPaperAuthorship: "first",
    });
    const coauthor = dispatchAction(firstAuthor, "debug-add-paper", {
      debugPaperTarget: "B",
      debugPaperAuthorship: "coauthor",
    });

    expect(firstAuthor.externalPublications[0]).toMatchObject({ target: "A", nonFirstAuthor: false });
    expect(firstAuthor.externalPublications[0]).toMatchObject({
      submittedMonth: expect.any(Number),
      submittedYear: 1,
      conferenceHandled: false,
    });
    expect(firstAuthor.externalPublications[0]?.title).not.toContain("调试");
    expect(firstAuthor.externalPublications[0]?.topicLabel).not.toBe("合作研究");
    expect(firstAuthor.externalPublications[0]?.heatMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(firstAuthor.externalPublications[0]?.publication).toMatchObject({
      acceptType: expect.any(String),
      citations: expect.any(Number),
    });
    expect(firstAuthor.externalPublications[0]?.publication?.monthsSincePublish).toEqual(expect.any(Number));
    expect(firstAuthor.externalPublications[0]?.publication?.influence).toBeGreaterThan(0);
    expect(firstAuthor.totalCitations).toBe(firstAuthor.externalPublications[0]?.publication?.citations);
    expect(firstAuthor.totalResearchScore).toBe(state.totalResearchScore + 4);
    expect(coauthor.externalPublications[1]).toMatchObject({ target: "B", nonFirstAuthor: true });
    expect(["Poster", "Oral"]).toContain(coauthor.externalPublications[1]?.publication?.acceptType);
    expect(coauthor.totalCitations).toBe(
      (coauthor.externalPublications[0]?.publication?.citations ?? 0)
      + (coauthor.externalPublications[1]?.publication?.citations ?? 0),
    );
    expect(coauthor.totalResearchScore).toBe(firstAuthor.totalResearchScore);
  });

  it("adds journal first-author and coauthor papers through the debug bar contract", () => {
    const state = admittedState();
    const firstAuthor = dispatchAction(state, "debug-add-paper", {
      debugJournalTarget: "nmi",
      debugPaperAuthorship: "first",
    });
    const coauthor = dispatchAction(firstAuthor, "debug-add-paper", {
      debugJournalTarget: "pami",
      debugPaperAuthorship: "coauthor",
    });

    expect(firstAuthor.externalPublications[0]).toMatchObject({
      target: null,
      journalTarget: "nmi",
      nonFirstAuthor: false,
      publication: { journalTarget: "nmi", influence: 0.5 },
    });
    expect(firstAuthor.externalPublications[0]?.publication?.effectiveScore).toBeGreaterThanOrEqual(250);
    expect(firstAuthor.totalResearchScore).toBe(state.totalResearchScore + 10);
    expect(coauthor.externalPublications[1]).toMatchObject({
      target: null,
      journalTarget: "pami",
      nonFirstAuthor: true,
      publication: { journalTarget: "pami", influence: 0.5 },
    });
    expect(coauthor.externalPublications[1]?.publication?.effectiveScore).toBeGreaterThanOrEqual(125);
    expect(coauthor.totalResearchScore).toBe(firstAuthor.totalResearchScore);
  });
});
