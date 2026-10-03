import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { getPaperCitationMultiplier } from "../src/core/v2-publication-system";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { createDataLossRandomEvent } from "../src/core/v2-random-events-core-progress";
import type { GameState, Paper, PendingEvent } from "../src/core/v2-types";

type Branch = "stay-up" | "restart" | "pay" | "fake";

function makePaper(id: string, overrides: Partial<Paper> = {}): Paper {
  return {
    ...createDraftPaper(1, 0, () => 0), id, idea: 10, experiment: 6, writing: 8,
    collaborationScores: { idea: 2, experiment: 1, writing: 3 },
    collaborators: [{ id: "peer-one", name: "林知远" }], ...overrides,
  };
}

function makeState(): GameState {
  const initial = createStartedGameState("normal");
  const published = attachPaperPublication(makePaper("published", {
    status: "published", target: "A", conferenceHandled: true,
  }));
  published.publication!.citations = 120;
  const state: GameState = {
    ...initial, month: 6, totalMonths: 6, totalRandomEventCount: 1,
    selectedAdvisorName: "测试导师", selectedPaperId: "draft",
    player: { ...initial.player, san: 20, money: 10, research: 0 },
    totalCitations: 120, citationHistoryByYear: { 2024: 120 },
    papers: [makePaper("draft"), makePaper("reviewing", {
      status: "reviewing", target: "C", reviewMonthsLeft: 3,
      submittedIdea: 10, submittedExperiment: 6, submittedWriting: 8,
    })],
    externalPublications: [published],
    fellowPapers: [makePaper("fellow", { leadAuthorId: "other-fellow" })],
    eventQueue: [], eventHistory: [], log: [], buffs: [],
  };
  return { ...applyPublicationTalentRewards(state), player: state.player, eventHistory: [], log: [] };
}

function makeEvent(state: GameState): PendingEvent {
  const event = createDataLossRandomEvent(state).event;
  if (!event) throw new Error("Missing data loss event");
  return { ...event, randomReplay: { eventId: 16, serial: state.totalRandomEventCount, rolls: [] } };
}

function getChoice(event: PendingEvent, branch: Branch) {
  const decision = event.stage === "act1" ? event.choices[0]!.effects.enqueueEvents![0]! : event;
  return decision.choices.find((choice) => choice.id.startsWith(`random-16-${branch}-`))!;
}

function resolve(state: GameState, branch?: Branch): GameState {
  const event = state.eventQueue[0]!;
  const choice = branch ? getChoice(event, branch) : event.choices[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

function previewResult(state: GameState, branch: Branch): GameState {
  return resolve(resolve({ ...state, eventQueue: [createEventQueueItem(makeEvent(state), 1)] }), branch);
}

afterEach(() => vi.restoreAllMocks());

describe("data loss narrative and choices", () => {
  it("foreshadows the neglected fan on the player's own computer", () => {
    const event = makeEvent(makeState());
    expect(event.description).toContain("电脑总是烫手");
    expect(event.description).toContain("风扇坏了");
    expect(event.description).toContain("等这轮忙完再说");
    expect(event.description).toContain("自己的电脑");
    expect(event.description).not.toContain("**自己的电脑**");
    expect(event.description).not.toContain("服务器");
    const decision = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(decision.description).toContain("报价：3 金币");
    expect(decision.description).not.toContain("报价：4 金币");
    for (const scene of [event, decision, ...decision.choices.map((choice) => choice.effects.enqueueEvents![0]!)]) {
      expect(scene.description.split("\n\n机制结算\n")[0]!.split("\n\n").length).toBeLessThanOrEqual(2);
    }
  });

  it.each([
    ["stay-up", "SAN -5；论文进度保留。"],
    ["restart", "论文进度清0。"],
    ["pay", "金币 -3；论文进度保留。"],
    ["fake", "论文进度保留；符合条件的未投稿一作论文引用 ×0.5；图片误用。"],
  ] as const)("uses a short, consistent result for %s", (branch, outcome) => {
    const state = makeState();
    expect(getChoice(makeEvent(state), branch).outcome).toBe(outcome);
    const result = previewResult(state, branch);
    const html = renderApp(result, undefined, {
      activePlayTab: "events", isEventContentOpen: true, activeEventId: result.eventQueue[0]!.id,
    });
    expect(html).toContain(branch === "restart" ? "论文进度清0" : "论文进度保留");
    expect(html).not.toContain("所有未投稿论文进度清零");
    expect(html).not.toContain("当前未投稿且已有进度的论文");
    if (branch === "fake") expect(html).toContain("符合条件的未投稿一作论文引用 ×0.5");
  });

  it.each([
    [0, 6, -5], [6, 6, -4], [12, 6, -3], [18, 6, -2], [0, 8, -4], [0, 11, -6],
  ])("applies the new base cost at research %s and month %s", (research, month, san) => {
    const state = makeState();
    state.player.research = research;
    state.month = month;
    expect(getChoice(makeEvent(state), "stay-up").effects.san).toBe(san);
  });

  it.each([[1.5, 0, -8], [1, -10, 0]])("retains SAN cost modifiers %s/%s and the zero floor", (multiplier, delta, expected) => {
    const state = makeState();
    state.buffs = [{
      id: "test-cost", name: "Test", source: "test", timing: "monthly", remainingMonths: 1,
      activeOperationSanMultiplier: multiplier, activeOperationSanDelta: delta,
    }];
    expect(getChoice(makeEvent(state), "stay-up").effects.san).toBe(expected);
  });
});

describe("data loss settlement boundaries", () => {
  it.each(["stay-up", "restart", "pay", "fake"] as const)("settles %s only once at final confirmation", (branch) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState();
    const preview = previewResult(initial, branch);
    expect(preview.player).toEqual(initial.player);
    expect(preview.papers).toEqual(initial.papers);
    const state = resolve(preview);
    expect(state.player.san).toBe(branch === "stay-up" ? 15 : 20);
    expect(state.player.money).toBe(branch === "pay" ? 7 : 10);
    const draft = state.papers.find((paper) => paper.id === "draft")!;
    for (const field of ["idea", "experiment", "writing"] as const) {
      expect(getPaperScoreBreakdown(draft, field)).toEqual(branch === "restart"
        ? { own: 0, collaboration: 0, total: 0 } : getPaperScoreBreakdown(initial.papers[0]!, field));
    }
    expect(draft.collaborators).toEqual(initial.papers[0]!.collaborators);
    expect(draft.citationDebuffMultiplierOnPublish).toBe(branch === "fake" ? 0.5 : 1);
    expect(state.papers.find((paper) => paper.id === "reviewing")).toEqual(initial.papers[1]);
    expect(state.externalPublications).toEqual(initial.externalPublications);
    expect(state.fellowPapers).toEqual(initial.fellowPapers);
    expect(state.totalCitations).toBe(120);
    expect(state.citationHistoryByYear).toEqual(initial.citationHistoryByYear);
    expect(state.buffs).toEqual([]);
    const result = preview.eventQueue[0]!;
    const repeated = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.player).toEqual(state.player);
    expect(repeated.papers).toEqual(state.papers);
    expect(repeated.totalCitations).toBe(120);
    expect(repeated.eventHistory).toEqual(state.eventHistory);
  });

  it("penalizes only non-empty unsubmitted first-author papers, not total earned citations", () => {
    const initial = makeState();
    const empty = createDraftPaper(1, 2, () => 0);
    initial.papers.push(empty, makePaper("non-first", { nonFirstAuthor: true }));
    const state = resolve(previewResult(initial, "fake"));
    expect(state.papers.map((paper) => paper.citationDebuffMultiplierOnPublish)).toEqual([0.5, 1, 1, 1]);
    expect(state.totalCitations).toBe(120);
    expect(state.externalPublications[0]!.publication!.citations).toBe(120);
    expect(createDraftPaper(7, 4, () => 0).citationDebuffMultiplierOnPublish).toBe(1);
    const affected = state.papers[0]!;
    const published = attachPaperPublication({ ...affected, status: "published", target: "C", conferenceHandled: true }, affected.citationDebuffMultiplierOnPublish);
    const unaffected = attachPaperPublication({ ...affected, status: "published", target: "C", conferenceHandled: true }, 1);
    expect(getPaperCitationMultiplier(state, published)).toBeCloseTo(getPaperCitationMultiplier(state, unaffected) * 0.5);
  });
});
