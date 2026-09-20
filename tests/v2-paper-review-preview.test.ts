import { describe, expect, it } from "vitest";
import { buildFutureTodoPreviewItems } from "../src/app/v2-render-play";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { advancePaperReviewDeadlines, resolveDuePaperReviews } from "../src/core/v2-publication-system";
import type { GameState } from "../src/core/v2-types";

function createSubmissionState(): GameState {
  return {
    ...createStartedGameState("normal"),
    totalMonths: 1,
    year: 1,
    month: 1,
    eventQueue: [],
    papers: [0, 1].map((index) => ({
      ...createDraftPaper(1, index, () => 0),
      title: `测试论文${index + 1}`,
      idea: 10,
      experiment: 10,
      writing: 10,
    })),
  };
}

function reviewPreviews(state: GameState) {
  return buildFutureTodoPreviewItems(state).filter((item) => item.title === "论文结果");
}

describe("paper review agenda previews", () => {
  it("appears on submission, counts down and is replaced by the actual result event when due", () => {
    let state = createSubmissionState();
    const paperId = state.papers[0]!.id;
    expect(reviewPreviews(state)).toEqual([]);
    state = dispatchAction(state, "submit-paper", { paperId, paperTarget: "C" });
    expect(reviewPreviews(state)).toMatchObject([{ title: "论文结果", monthsLater: 3, timeText: "3月后 发生" }]);
    expect(renderApp(state)).toMatch(/todo-title">论文结果<\/strong>[\s\S]*?3月后 发生/);
    expect(renderApp(state)).not.toContain('todo-title">论文结果 ·');
    for (const monthsLater of [2, 1]) {
      state = advancePaperReviewDeadlines(state);
      expect(reviewPreviews(state)).toMatchObject([{ monthsLater }]);
    }
    state = resolveDuePaperReviews(advancePaperReviewDeadlines(state), () => 0).state;
    expect(reviewPreviews(state)).toEqual([]);
    expect(state.eventQueue.some((event) => event.chainId === `paper-review-result-${paperId}`)).toBe(true);
    expect(renderApp(state)).toContain(`data-ui-open-event-id="paper-review-result-${paperId}"`);
  });

  it("removes only the withdrawn paper immediately and restarts its countdown after resubmission", () => {
    let state = createSubmissionState();
    const firstPaperId = state.papers[0]!.id;
    const secondPaperId = state.papers[1]!.id;
    state = dispatchAction(state, "submit-paper", { paperId: firstPaperId, paperTarget: "C" });
    state = advancePaperReviewDeadlines(state);
    state = dispatchAction(state, "submit-paper", { paperId: secondPaperId, paperTarget: "B" });
    expect(reviewPreviews(state)).toMatchObject([
      { title: "论文结果", monthsLater: 2 },
      { title: "论文结果", monthsLater: 3 },
    ]);
    state = dispatchAction(state, "withdraw-paper", { paperId: firstPaperId });
    expect(reviewPreviews(state)).toMatchObject([{ title: "论文结果", monthsLater: 3 }]);
    expect(renderApp(state).match(/todo-title">论文结果<\/strong>/g)).toHaveLength(1);
    state = dispatchAction(state, "submit-paper", { paperId: firstPaperId, paperTarget: "A" });
    expect(reviewPreviews(state)).toMatchObject([
      { title: "论文结果", monthsLater: 3 },
      { title: "论文结果", monthsLater: 3 },
    ]);
  });

  it("does not invent deadlines for journal revisions or dates beyond the remaining game duration", () => {
    const base = createSubmissionState();
    const submitted = dispatchAction(base, "submit-paper", { paperId: base.papers[0]!.id, paperTarget: "C" });
    expect(reviewPreviews({ ...submitted, totalMonths: submitted.maxMonths - 2 })).toEqual([]);
    expect(reviewPreviews({
      ...submitted,
      papers: submitted.papers.map((paper) => ({ ...paper, status: "journal-reviewing", journalTarget: "pami" })),
    })).toEqual([]);
  });
});
