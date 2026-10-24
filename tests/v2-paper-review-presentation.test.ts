import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { describe, expect, it } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createPaperReviewResultEvent, refreshPaperReviewEvent } from "../src/core/v2-publication-system";
import { createConferenceStats } from "../src/app/v2-conference-stats";
import { renderPaperReviewEvent } from "../src/app/v2-render-paper-review";
import { renderEventSettlementSummary } from "../src/app/v2-render-play";
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
  const event = state.eventQueue[0]!;
  return renderPaperReviewEvent(event.paperReviewPresentation!, false, renderEventSettlementSummary);
}

describe("paper review presentation", () => {
  it("introduces the conference before the paper, with real stats and separate rule references", async () => {
    const stats = createConferenceStats({ onChange: () => {}, storage: null,
      fetch: async () => new Response(JSON.stringify({ epoch: DATA_EPOCH, submissions: 100, accepted: 40,
        counts: { Poster: 30, Spotlight: 3, Oral: 5, "Best Paper Candidate": 1, "Best Paper": 1 },
        acceptedMeanScore: 85, rejectedMeanScore: 45,
        means: { Reject: 45, Poster: 80, Spotlight: 82, Oral: 85, "Best Paper Candidate": 90, "Best Paper": 95 },
        p90: 100, p99: 130, updatedAt: "2026-10-09T00:00:00Z" })) });
    const { state } = fixture(true);
    const presentation = state.eventQueue[0]!.paperReviewPresentation!;
    if (presentation.kind !== "overview") throw new Error("Expected overview");
    await stats.load(presentation.conferenceName, presentation.conferenceYear, presentation.target);
    const html = content(state);
    expect(html).toContain(`<h2>${presentation.conferenceName}${presentation.conferenceYear}</h2>`);
    expect(html).toContain(presentation.conferenceFullName);
    expect(html).not.toContain("全球统计");
    expect(html).toContain("40.0%");
    expect(html).toContain("投稿数");
    expect(html).toContain('data-tooltip="最佳论文候选">Best Paper Candidate</span>');
    expect(html).toContain("paper-review-distribution-grid");
    expect(html).not.toContain("<table");
    expect(html).not.toMatch(/P90|P99|审稿通知|参考分/);
    expect(html).not.toContain("&lt;Paper&gt; &amp; &quot;review&quot;");
    const reviewers = content(advance(state));
    expect(reviewers).toContain("&lt;Paper&gt; &amp; &quot;review&quot;");
    expect(reviewers).toContain("paper-review-paper-block");
  });

  it("does not fabricate counts when global stats cannot be loaded", async () => {
    const stats = createConferenceStats({ onChange: () => {}, storage: null,
      fetch: async () => new Response("unavailable", { status: 503 }) });
    const { state } = fixture(false);
    const presentation = state.eventQueue[0]!.paperReviewPresentation!;
    if (presentation.kind !== "overview") throw new Error("Expected overview");
    await stats.load(presentation.conferenceName, presentation.conferenceYear, presentation.target);
    expect(content(state)).toContain("paper-review-global-totals");
    expect(content(state)).toContain("投稿数");
    expect(content(state)).toContain("−");
    expect(content(state)).toContain("统计暂未同步");
    expect(content(state)).toContain("paper-review-distribution-grid");
  });

  it("keeps stored reviewer weights and submitted scores visible in the second act", () => {
    const { state } = fixture(true);
    const reviewers = advance(state);
    const presentation = reviewers.eventQueue[0]!.paperReviewPresentation!;
    if (presentation.kind !== "reviewers") throw new Error("Expected reviewers");
    presentation.reports[0] = { ...presentation.reports[0]!, reviewerType: "novelty", weightInfo: "idea×2 · 实验×0.5 · 写作×0.5" };
    const html = content(reviewers);
    expect(reviewers.eventQueue[0]!.title).toContain("审稿人意见");
    expect(html).toContain('aria-label="送审期间四项分数变化"');
    expect(html).toContain('paper-review-score-item is-total is-decayed');
    expect(html).toContain("衰减 90");
    expect(html).toMatch(/Review [A-Za-z]{4}/);
    expect(html).toContain("idea×2 · 实验×0.5 · 写作×0.5");
    expect(html).toContain("有效分");
    expect(html).toContain('data-tooltip="拒稿">Reject</span> 阈值');
    expect(html).toContain('data-tooltip="接收">Accept</span> 阈值');
    expect(html).not.toMatch(/接收\+1 · 边缘0|你的三个审稿人/);
  });

  it("shows the actual score loss during review without exposing the final decision", () => {
    const { state, paper, settlement } = fixture(false);
    const decayedPaper = { ...paper, idea: 27, experiment: 29, writing: 28 };
    state.papers = [decayedPaper];
    state.eventQueue = [createEventQueueItem(createPaperReviewResultEvent(decayedPaper, settlement), 1)];
    const html = content(advance(state));
    expect(html).toContain("衰减 3");
    expect(html).toContain("衰减 1");
    expect(html).toContain("衰减 2");
    expect(html).toContain("衰减 6");
    expect(html).toContain('paper-review-score-item is-total is-decayed');
    expect(html).not.toContain("PC Meta Review");
  });

  it("keeps four-letter Review codes through later scenes and refresh", () => {
    const { state, paper, settlement } = fixture(true);
    state.conferenceLocationSeed = 12345;
    settlement.reports = [settlement.reports[0]!,
      { ...settlement.reports[0]!, reviewer: "实验审稿人" },
      { ...settlement.reports[0]!, reviewer: "普通审稿人" }];
    const root = createPaperReviewResultEvent(paper, settlement, state);
    const reviewers = root.choices[0]!.effects.enqueueEvents![0]!;
    const decision = reviewers.choices[0]!.effects.enqueueEvents![0]!;
    const codes = reviewers.paperReviewPresentation?.kind === "reviewers"
      ? reviewers.paperReviewPresentation.reports.map((report) => report.reviewCode) : [];
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z]{4}$/);
    expect(decision.paperReviewPresentation?.kind === "decision"
      ? decision.paperReviewPresentation.reports?.map((report) => report.reviewCode) : []).toEqual(codes);
    const refreshed = refreshPaperReviewEvent(state, reviewers);
    expect(refreshed.paperReviewPresentation?.kind === "reviewers"
      ? refreshed.paperReviewPresentation.reports.map((report) => report.reviewCode) : []).toEqual(codes);
    expect(renderPaperReviewEvent(decision.paperReviewPresentation!, false, renderEventSettlementSummary))
      .toContain(`Review ${codes[0]}`);
  });

  it("orders PC comments, prominent decision and final score table", () => {
    const { state } = fixture(false);
    const html = content(advance(advance(state)));
    expect(html).toContain('data-tooltip="程序委员会综合评审意见">PC Meta Review</span>');
    expect(html).toContain("综合评审后，论文暂未达到本届录用要求");
    expect(html).toContain("需要解释方法差异");
    expect(html.indexOf("PC Meta Review")).toBeLessThan(html.indexOf('class="paper-review-decision-head"'));
    expect(html.indexOf('class="paper-review-decision-head"')).toBeLessThan(html.indexOf("event-settlement-summary"));
    expect(html).toContain("论文总分 90 → 5");
    expect(html).not.toMatch(/<table|确认后论文退回草稿|PC综合意见/);
  });
  it("keeps talent rewards out of review results and records them as separate completed events", () => {
    const { state } = fixture(true);
    const decision = advance(advance(state));
    const html = content(decision);
    expect(html).toContain("科研分 +4");
    expect(html).toContain("定稿时请结合审稿意见完善论证与实验");
    expect(html).not.toContain("定稿时建议回应");
    expect(html).not.toContain("需要解释方法差异");
    expect(html).toContain("注册费：科研经费 -1（导师支付）");
    expect(decision.advisorProgressState.funding).toBe(state.advisorProgressState.funding);
    expect(html).not.toContain("paper-review-talents");
    expect(decision.eventHistory).toHaveLength(0);
    expect(html).toContain("审稿影响 SAN -2");
    expect(html).not.toContain("&lt;Paper&gt; &amp; &quot;review&quot;");
    expect(html).not.toContain("奖励递减");
    const confirmed = advance(decision);
    const history = confirmed.eventHistory.find((entry) => entry.chainId === decision.eventQueue[0]!.chainId)!;
    expect(history.stages.at(-1)?.paperReviewPresentation).not.toHaveProperty("talentRewards");
    const triggers = confirmed.eventHistory.flatMap((entry) => entry.stages.flatMap((stage) => stage.talentTrigger ? [stage.talentTrigger] : []));
    expect(triggers.map((trigger) => trigger.name)).toEqual(["研究之始", "初露锋芒", "越挫越勇", "论文熟手"]);
    const historicalHtml = renderApp(confirmed, undefined, { activePlayTab: "events", activeEventHistoryId: history.id, isEventContentOpen: true });
    expect(historicalHtml).toContain("结算记录");
    expect(historicalHtml.match(/class="paper-review-settlement"[\s\S]*?<\/section>/)?.[0]).not.toContain("天赋");
    const repeated = { ...state, publicationTalentState: confirmed.publicationTalentState, paperMasteryState: confirmed.paperMasteryState };
    expect(advance(advance(advance(repeated))).eventHistory.flatMap((entry) => entry.stages).some((stage) => stage.talentTrigger)).toBe(false);
  });

  it("separates conditional revision gains from review SAN and shows actual rejection feedback", () => {
    const { state } = fixture(false);
    const reviewers = advance(state);
    expect(content(reviewers)).toContain("若拒稿，修改可得");
    expect(content(reviewers)).toContain("审稿影响");
    const decision = advance(reviewers);
    const html = content(decision);
    expect(html).toContain("idea 30 → 5");
    expect(html).not.toContain("注册费");
    expect(html).toContain("审稿影响 SAN -2");
    expect(html).not.toContain("paper-review-talent-row");
    expect(advance(decision).papers[0]?.rejectionCount).toBe(4);
  });
});
