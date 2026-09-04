import { describe, expect, it } from "vitest";

import { createAiBuffs, getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyResearchOperation, previewResearchOperation } from "../src/core/v2-research-operation";

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
});
