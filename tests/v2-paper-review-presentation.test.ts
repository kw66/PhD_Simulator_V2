import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createPaperReviewResultEvent } from "../src/core/v2-publication-system";
import type { GameState, PaperReviewSettlement } from "../src/core/v2-types";

function fixture(accepted: boolean) {
  const paper = { ...createDraftPaper(1, 0), status: "reviewing" as const, target: "A" as const,
    submittedMonth: 3, submittedYear: 1, submittedIdea: 30, submittedExperiment: 30, submittedWriting: 30,
    rejectionCount: 3, title: '<Paper> & "review"' };
  const settlement: PaperReviewSettlement = {
    paperId: paper.id, target: "A", accepted, acceptType: accepted ? "Poster" : null,
    submittedScore: 90, totalReviewScore: accepted ? 3 : -3, borderlineChance: null,
    venueInfluence: 1.1, reviewStrictnessMultiplier: 1, scoreGain: accepted ? 4 : 0, reviewerSanChange: -2,
    reports: [{ reviewer: "新颖性审稿人", focus: "idea", effectiveScore: 30,
      reviewScore: accepted ? 1 : -1, decision: accepted ? "Accept" : "Reject",
      improvementAction: "idea", improvementAmount: 5, sanChange: -2, comment: "需要解释方法差异" }],
  };
  const state: GameState = { ...createStartedGameState("normal"), papers: [paper], eventQueue: [
    createEventQueueItem(createPaperReviewResultEvent(paper, settlement), 1),
  ] };
  return { state, paper, settlement };
}

function advance(state: GameState) {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
}

function content(state: GameState) {
  const html = renderApp(state, undefined, { activePlayTab: "events", activeEventId: state.eventQueue[0]!.id, isEventContentOpen: true });
  return html.match(/<section class="paper-review-event[\s\S]*?<\/section>\s*<p class="paper-review-event-footnote">[\s\S]*?<\/section>/)?.[0] ?? html;
}

describe("paper review presentation", () => {
  it("keeps talent rewards out of review results and records them as separate completed events", () => {
    const { state } = fixture(true);
    const decision = advance(advance(state));
    const html = content(decision);
    expect(html).toContain("科研分+4");
    expect(html).not.toContain("paper-review-talents");
    expect(decision.eventHistory).toHaveLength(0);
    expect(html).toContain("审稿影响 SAN -2");
    expect(html).toContain("&lt;Paper&gt; &amp; &quot;review&quot;");
    expect(html).not.toContain("奖励递减");
    const confirmed = advance(decision);
    const history = confirmed.eventHistory.find((entry) => entry.chainId === decision.eventQueue[0]!.chainId)!;
    expect(history.stages.at(-1)?.paperReviewPresentation).not.toHaveProperty("talentRewards");
    const triggers = confirmed.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger ? [stage.talentTrigger] : []));
    expect(triggers.map((trigger) => trigger.name)).toEqual(["研究之始", "初露锋芒", "越挫越勇"]);
    const historicalHtml = renderApp(confirmed, undefined, { activePlayTab: "events", activeEventHistoryId: history.id, isEventContentOpen: true });
    expect(historicalHtml).toContain("结算记录");
    expect(historicalHtml.match(/class="paper-review-settlement"[\s\S]*?<\/section>/)?.[0]).not.toContain("天赋");
    const repeated = { ...state, publicationTalentState: confirmed.publicationTalentState };
    expect(advance(advance(advance(repeated))).eventHistory.flatMap((entry) => entry.stages).some((stage) => stage.talentTrigger)).toBe(false);
  });

  it("separates conditional revision gains from review SAN and shows actual rejection feedback", () => {
    const { state } = fixture(false);
    const reviewers = advance(state);
    expect(content(reviewers)).toContain("拒稿后修改");
    expect(content(reviewers)).toContain("审稿影响");
    const decision = advance(reviewers);
    const html = content(decision);
    expect(html).toContain("修改反馈：idea+5");
    expect(html).toContain("审稿影响 SAN -2");
    expect(html).not.toContain("paper-review-talent-row");
    expect(advance(decision).papers[0]?.rejectionCount).toBe(4);
  });
});
