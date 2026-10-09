import { afterEach, describe, expect, it, vi } from "vitest";

import { createImageMisuseBuff } from "../src/core/v2-academic-integrity";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyQueuedEventEffects, getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { Buff, EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

function playingState(overrides: Partial<GameState> = {}): GameState {
  const initial = createInitialState();
  return {
    ...initial,
    phase: "playing",
    year: 3,
    month: 2,
    totalMonths: 26,
    degree: "phd",
    phdStartYear: 1,
    maxMonths: 72,
    player: { ...initial.player, san: 10, money: 20 },
    totalResearchScore: 6,
    papers: [createDraftPaper(26, 0, () => 0)],
    externalPublications: [createGrantedPublishedPaper(20, 0, { target: "A", acceptedScore: 4 })],
    publicationTalentState: { claimedIds: ["first-paper", "first-a-or-journal"] },
    scholarshipState: { lastAwardYear: 2, scoreBaseline: 2, claimedPaperIds: ["prior-paper"] },
    ...overrides,
  };
}

function queueScholarship(state: GameState, roll: () => number = () => 0): GameState {
  vi.spyOn(Math, "random").mockImplementation(roll);
  return { ...state, eventQueue: [createEventQueueItem(createScholarshipEvent(state, roll), 1)] };
}

afterEach(() => vi.restoreAllMocks());

function currentEvent(state: GameState) {
  const event = state.eventQueue.find((item) => item.chainId === "scholarship");
  expect(event).toBeDefined();
  return event!;
}

function resolve(state: GameState, choiceId?: string): GameState {
  const event = currentEvent(state);
  return dispatchAction(state, "resolve-event", {
    eventId: event.id,
    eventChoiceId: choiceId ?? event.choices[0]!.id,
  });
}

function resultPreview(state: GameState): GameState {
  return resolve(resolve(state));
}

function expectUnclaimed(state: GameState, original: GameState): void {
  expect(state.player.money).toBe(original.player.money);
  expect(state.scholarshipState).toEqual(original.scholarshipState);
  expect(state.totalResearchScore).toBe(original.totalResearchScore);
}

describe("image misuse scholarship disqualification", () => {
  it.each([[2, "1分"], [3, "2～4分"], [4, "5～8分"], [5, "8～12分"]] as const)(
    "shows only past cutoffs before applying in year %s", (year, range) => {
      const initial = playingState({ year });
      const earlyRoll = vi.fn(() => 0);
      const lateRoll = vi.fn(() => 0.99);
      const early = createScholarshipEvent(initial, earlyRoll);
      const late = createScholarshipEvent(initial, lateRoll);
      expect(early).toEqual(late);
      expect(earlyRoll).not.toHaveBeenCalled();
      expect(lateRoll).not.toHaveBeenCalled();
      const decision = early.choices[0]!.effects.enqueueEvents![0]!;
      expect(decision.description).toContain(`往年同年级的分数线在${range}`);
      expect(decision.scholarshipContext!.requirement).toBeNull();
      expect(decision.choices[0]!.effects.enqueueEvents).toBeUndefined();
    },
  );

  it("draws the cutoff on application, preserves it on refresh, and refreshes the displayed SAN cost", () => {
    let state = queueScholarship(playingState(), () => 0);
    state = resolve(state);
    const random = vi.mocked(Math.random).mockReturnValue(0.99);
    state = resolve(state);
    expect(currentEvent(state).scholarshipContext!.requirement).toBe(4);
    expect(currentEvent(state).description).toContain("结果：SAN -2");
    random.mockClear();
    state = refreshPendingEventDecisions({ ...state, month: 8 });
    expect(currentEvent(state).description).toContain("结果：SAN -1");
    expect(currentEvent(state).choices[0]!.effects.san).toBe(-1);
    state = refreshPendingEventDecisions(JSON.parse(JSON.stringify(state)));
    expect(currentEvent(state).scholarshipContext!.requirement).toBe(4);
    expect(random).not.toHaveBeenCalled();
    state = resolve(state);
    expect(state.player.san).toBe(9);
    expect(state.log[0]!.text).toContain("SAN -1");
  });

  it("keeps application and scoring normal, then cancels a qualifying award only at confirmation", () => {
    const original = playingState({ buffs: [createImageMisuseBuff()] });
    const roll = vi.fn(() => 0.99);
    const queued = queueScholarship(original, roll);
    expect(currentEvent(queued).choices).toHaveLength(1);
    expect(currentEvent(queued).choices[0]!.effects.san).toBeUndefined();
    expect(currentEvent(queued).description).not.toMatch(/举报|资格取消|分数线/u);
    const scored = resolve(queued);
    expect(currentEvent(scored).stage).toBe("act2");
    expect(currentEvent(scored).choices.map((choice) => choice.label)).toEqual(["准备材料并申报", "暂不申报"]);
    expect(currentEvent(scored).choices[0]!.effects.san).toBeUndefined();
    expect(currentEvent(scored).description).not.toMatch(/举报|资格取消/u);
    expect(currentEvent(scored).description).toContain("往年同年级的分数线在2～4分");
    expect(roll).not.toHaveBeenCalled();
    expect(scored.player.san).toBe(original.player.san);
    expectUnclaimed(scored, original);
    expect(scored.eventHistory).toEqual(original.eventHistory);
    const preview = resolve(scored);
    const result = currentEvent(preview);
    expect(result.title.split(" ➜ ").at(-1)).toBe("资格取消");
    expect(result.description).toMatch(/公示.*举报.*图片误用/u);
    expect(result.description).toContain("举报你用于评奖的论文存在图片误用");
    expect(result.description).toContain("；被举报");
    expect(result.description).not.toContain("举报风险");
    expect(result.description).toContain("4 ≥ 分数线 4");
    expect(result.choices[0]!.effects.money ?? 0).toBe(0);
    expect(result.choices[0]!.effects.scholarshipAward).toBeUndefined();
    expect(result.choices[0]!.effects.san).toBe(-2);
    expect(result.description).toContain("结果：SAN -2");
    expect(result.deferredStatePatch).toBeUndefined();
    expect(preview.player.san).toBe(original.player.san);
    expectUnclaimed(preview, original);
    expect(preview.log).toEqual(original.log);
    expect(roll).toHaveBeenCalledTimes(1);
    const completed = resolve(preview);
    expect(completed.player.san).toBe(8);
    expectUnclaimed(completed, original);
    expect(completed.buffs).toContainEqual(createImageMisuseBuff());
    expect(completed.eventQueue.some((event) => event.chainId === "scholarship")).toBe(false);
    const history = completed.eventHistory.at(-1)!;
    expect(history.stages).toHaveLength(3);
    for (const scene of history.stages) {
      const paragraphs = scene.description.split("机制结算")[0]!.trim().split(/\n\n/u)
        .filter((paragraph) => !paragraph.startsWith("小提示："));
      expect(paragraphs.length).toBeGreaterThanOrEqual(1);
      expect(paragraphs.length).toBeLessThanOrEqual(2);
    }
    expect(JSON.stringify(completed.log)).toContain("国奖评选：SAN -2；国奖资格取消，金币 +0。");
    expect(roll).toHaveBeenCalledTimes(2);
  });

  it("does not report image misuse when the score misses the cutoff", () => {
    const original = playingState({ totalResearchScore: 3, buffs: [createImageMisuseBuff()] });
    const preview = resultPreview(queueScholarship(original));
    expect(currentEvent(preview).title).toContain("遗憾落选");
    expect(currentEvent(preview).description).not.toMatch(/举报|图片误用|资格取消/u);
    const completed = resolve(preview);
    expectUnclaimed(completed, original);
    expect(completed.player.san).toBe(8);
    expect(JSON.stringify(completed.eventHistory)).not.toContain("举报");
  });

  it.each([3, 4])("preserves normal success and consumes the eligible results for year %i", (year) => {
    const original = playingState({ year, totalMonths: (year - 1) * 12 + 2, totalResearchScore: 12 });
    const queued = queueScholarship(original);
    const snapshot = currentEvent(queued).scholarshipContext!;
    const preview = resultPreview(queued);
    expectUnclaimed(preview, original);
    expect(preview.player.san).toBe(10);
    expect(currentEvent(preview).description).not.toMatch(/举报|图片误用/u);
    const completed = resolve(preview);
    expect(completed.player.money).toBe(original.player.money + (year >= 4 ? 9 : 6));
    expect(completed.player.san).toBe(8);
    expect(completed.scholarshipState).toEqual({
      lastAwardYear: year,
      scoreBaseline: snapshot.scoreBaseline + snapshot.score,
      claimedPaperIds: ["prior-paper", ...snapshot.eligiblePaperIds],
    });
  });

  it("keeps cancelling across years without consuming the accumulated results", () => {
    const original = playingState({ totalResearchScore: 30, buffs: [createImageMisuseBuff()] });
    let state = original;
    for (const year of [3, 4, 5, 6]) {
      state = queueScholarship({ ...state, year, totalMonths: (year - 1) * 12 + 2 });
      state = resultPreview(state);
      expect(currentEvent(state).title).toContain("资格取消");
      state = resolve(state);
      expectUnclaimed(state, original);
      expect(state.buffs).toContainEqual(createImageMisuseBuff());
    }
    expect(state.player.san).toBe(2);
    expect(state.eventHistory.filter((event) => event.chainId === "scholarship")).toHaveLength(4);
  });

  it.each(["act1", "act2", "result"] as const)("refreshes a newly added buff during %s without rerolling or settling", (stage) => {
    const original = playingState();
    const roll = vi.fn(() => 0.67);
    let state = queueScholarship(original, roll);
    if (stage !== "act1") state = resolve(state);
    if (stage === "result") state = resolve(state);
    const snapshot = structuredClone(currentEvent(state).scholarshipContext);
    const staleChoiceId = currentEvent(state).choices[0]!.id;
    const originalPatch = structuredClone(currentEvent(state).deferredStatePatch);
    state = { ...state, buffs: [...state.buffs, createImageMisuseBuff()] };
    const refreshed = refreshPendingEventDecisions(state);
    expectUnclaimed(refreshed, original);
    expect(refreshed.player.san).toBe(10);
    expect(refreshed.log).toEqual(original.log);
    expect(currentEvent(refreshed).deferredStatePatch).toEqual(originalPatch);
    expect(currentEvent(refreshed).scholarshipContext).toEqual(snapshot);
    expect(refreshPendingEventDecisions(refreshed)).toBe(refreshed);
    if (stage === "result") expect(currentEvent(refreshed).description).toContain("举报");
    state = resolve(refreshed, staleChoiceId);
    while (state.eventQueue.some((event) => event.chainId === "scholarship")) state = resolve(state);
    expectUnclaimed(state, original);
    expect(state.player.san).toBe(8);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toContain("举报");
    expect(roll).toHaveBeenCalledTimes(2);
  });

  it("checks a stale claim id at final confirmation without a prior refresh", () => {
    const original = playingState();
    const preview = resultPreview(queueScholarship(original));
    const staleEvent = currentEvent(preview);
    const state = { ...preview, buffs: [createImageMisuseBuff()] };
    const completed = resolve(state, staleEvent.choices[0]!.id);
    expectUnclaimed(completed, original);
    expect(completed.player.san).toBe(8);
    expect(completed.eventHistory.at(-1)!.stages.at(-1)!.title).toContain("资格取消");
  });

  it("preserves live changes while rebasing the application SAN and refreshing a result", () => {
    const roll = vi.fn(() => 0.67);
    const preview = resultPreview(queueScholarship(playingState(), roll));
    const snapshot = structuredClone(currentEvent(preview).scholarshipContext);
    const changed: GameState = {
      ...preview,
      player: { ...preview.player, money: 27, san: 9 },
      totalResearchScore: 9,
      externalPublications: [...preview.externalPublications, createGrantedPublishedPaper(26, 1, { target: "B", acceptedScore: 2 })],
      buffs: [createImageMisuseBuff()],
    };
    const refreshed = refreshPendingEventDecisions(changed);
    expect(currentEvent(refreshed).scholarshipContext).toMatchObject({ score: 7, requirement: snapshot!.requirement });
    expect(currentEvent(refreshed).scholarshipContext!.eligiblePaperIds).toEqual(changed.externalPublications.map((paper) => paper.id));
    expect(currentEvent(refreshed).description).toContain("评奖科研分 7 ≥ 分数线 4");
    const completed = resolve(refreshed);
    expectUnclaimed(completed, changed);
    expect(completed.player.san).toBe(7);
    expect(completed.externalPublications).toEqual(changed.externalPublications);
    expect(roll).toHaveBeenCalledTimes(2);
  });

  it.each(["act1", "act2", "result"] as const)("refreshes current achievements during %s while retaining the drawn cutoff", (stage) => {
    const original = playingState({
      totalResearchScore: 3,
      publicationTalentState: { claimedIds: ["first-paper", "first-a-or-journal", "first-coauthor-paper", "first-coauthor-a"] },
    });
    const roll = vi.fn(() => 0.99);
    let state = queueScholarship(original, roll);
    if (stage !== "act1") state = resolve(state);
    if (stage === "result") state = resolve(state);
    const newPaper = createGrantedPublishedPaper(26, 1, { target: "A", acceptedScore: 4 });
    const nonFirst = createGrantedPublishedPaper(26, 2, { target: "A", acceptedScore: 4, nonFirstAuthor: true });
    state = refreshPendingEventDecisions({
      ...state,
      totalResearchScore: 7,
      externalPublications: [...state.externalPublications, newPaper, nonFirst],
    });
    expect(currentEvent(state).scholarshipContext).toMatchObject({ score: 5, requirement: stage === "result" ? 4 : null, success: stage === "result" });
    expect(currentEvent(state).scholarshipContext!.eligiblePaperIds).toContain(newPaper.id);
    expect(currentEvent(state).scholarshipContext!.eligiblePaperIds).not.toContain(nonFirst.id);
    if (stage === "act2") {
      expect(currentEvent(state).description).toContain("这次能计入 5 分");
      expect(currentEvent(state).description).toContain("**6金币**");
    }
    if (stage === "result") expect(currentEvent(state).title).toContain("获得奖学金");
    expectUnclaimed(state, { ...original, totalResearchScore: 7 });
    while (currentEvent(state).stage !== "result") state = resolve(state);
    state = resolve(state);
    expect(state.player.money).toBe(original.player.money + 6);
    expect(state.player.san).toBe(8);
    expect(state.scholarshipState.scoreBaseline).toBe(7);
    expect(state.scholarshipState.claimedPaperIds).toContain(newPaper.id);
    expect(state.scholarshipState.claimedPaperIds).not.toContain(nonFirst.id);
    expect(roll).toHaveBeenCalledTimes(2);
  });

  it("rechecks gains and losses at confirmation even with the previous result's button id", () => {
    for (const [beforeScore, afterScore, awarded] of [[3, 7, true], [7, 3, false]] as const) {
      const original = playingState({ totalResearchScore: beforeScore });
      const preview = resultPreview(queueScholarship(original, () => 0.99));
      const choiceId = currentEvent(preview).choices[0]!.id;
      const completed = resolve({ ...preview, totalResearchScore: afterScore }, choiceId);
      expect(completed.player.money).toBe(original.player.money + (awarded ? 6 : 0));
      expect(completed.player.san).toBe(8);
      expect(completed.eventHistory.at(-1)!.stages.at(-1)!.title).toContain(awarded ? "获得奖学金" : "遗憾落选");
      expect(completed.scholarshipState.scoreBaseline).toBe(awarded ? afterScore : original.scholarshipState.scoreBaseline);
    }
  });

  it.each([false, true])("does not settle twice when a result is replayed (disqualified: %s)", (disqualified) => {
    const preview = resultPreview(queueScholarship(playingState({ buffs: disqualified ? [createImageMisuseBuff()] : [] })));
    const result = currentEvent(preview);
    const choice = result.choices[0]!;
    const completed = resolve(preview);
    const repeated = dispatchAction(completed, "resolve-event", { eventId: result.id, eventChoiceId: choice.id });
    expect(repeated.player).toEqual(completed.player);
    expect(repeated.scholarshipState).toEqual(completed.scholarshipState);
    expect(repeated.eventHistory).toEqual(completed.eventHistory);
    expect(applyQueuedEventEffects(completed, result, choice.id, {
      evaluateImmediateEndings: (state) => state,
      runPostQueuePipeline: (state) => state,
    })).toBe(completed);
  });

  it("rejects the final claim choice before the result scene is queued", () => {
    const original = playingState({ buffs: [createImageMisuseBuff()] });
    const queued = queueScholarship(original);
    const root = currentEvent(queued);
    const claimId = `scholarship-claim-y${root.scholarshipContext!.year}-m${root.scholarshipContext!.month}`;
    for (const state of [queued, resolve(queued)]) {
      const attempted = resolve(state, claimId);
      expectUnclaimed(attempted, original);
      expect(attempted.player.san).toBe(original.player.san);
      expect(attempted.eventQueue).toEqual(state.eventQueue);
      expect(attempted.eventHistory).toEqual(original.eventHistory);
    }
  });

  it("automatically refreshes a preview after another queued event adds the buff", () => {
    const original = playingState();
    const preview = resultPreview(queueScholarship(original));
    const staleChoiceId = currentEvent(preview).choices[0]!.id;
    const integrityEvent: PendingEvent = {
      id: "published-image-misuse", title: "论文发表", description: "你收到了通知。",
      source: "fixed", blocking: true, deadlineMonths: 0, chainId: "publication-notice", stage: "result",
      choices: [{
        id: "notice", label: "确定", outcome: "已确认。", effects: { addBuffs: [createImageMisuseBuff()] },
      }],
    };
    const state = dispatchAction({
      ...preview, eventQueue: [...preview.eventQueue, createEventQueueItem(integrityEvent, 2)],
    }, "resolve-event", { eventId: integrityEvent.id, eventChoiceId: "notice" });
    expect(currentEvent(state).title).toContain("资格取消");
    expect(currentEvent(state).choices[0]!.effects.scholarshipAward).toBeUndefined();
    const completed = resolve(state, staleChoiceId);
    expectUnclaimed(completed, original);
    expect(completed.player.san).toBe(8);
  });

  it("does not disqualify an unpublished draft with a pending image misuse flag", () => {
    const original = playingState();
    original.papers = [{ ...original.papers[0]!, idea: 1, imageMisusePending: true }];
    const preview = resultPreview(queueScholarship(original));
    expect(currentEvent(preview).description).not.toContain("举报");
    const completed = resolve(preview);
    expect(completed.player.money).toBe(original.player.money + 6);
    expect(completed.scholarshipState.lastAwardYear).toBe(3);
    expect(completed.buffs).toEqual(original.buffs);
  });

  it("blocks raw award effects while retaining unrelated effects and their inputs", () => {
    const original = playingState();
    const result = currentEvent(resultPreview(queueScholarship(original)));
    const choice = { ...result.choices[0]!, effects: { ...result.choices[0]!.effects, san: -1 } };
    const snapshot = structuredClone(choice);
    const resolution = applyChoiceEffectsToState({ ...original, buffs: [createImageMisuseBuff()] }, choice);
    expectUnclaimed(resolution.nextState, original);
    expect(resolution.nextState.player.san).toBe(9);
    expect(resolution.resolvedOutcome).toBe("国奖资格取消，金币 +0。");
    expect(choice).toEqual(snapshot);
  });

  it("drops stale award deltas from a deferred patch but retains the application SAN", () => {
    const original = playingState();
    const preview = resultPreview(queueScholarship(original));
    const result = currentEvent(preview);
    const award = result.choices[0]!.effects.scholarshipAward!;
    const state: GameState = {
      ...preview,
      buffs: [createImageMisuseBuff()],
      eventQueue: [{
        ...result,
        deferredStatePatch: [
          ...(result.deferredStatePatch ?? []),
          { path: ["player", "money"], previousValue: original.player.money, value: original.player.money + 6 },
          { path: ["scholarshipState", "lastAwardYear"], previousValue: 2, value: award.year },
          { path: ["scholarshipState", "scoreBaseline"], previousValue: 2, value: award.scoreBaseline },
          { path: ["scholarshipState", "claimedPaperIds"], previousValue: ["prior-paper"], value: ["prior-paper", ...award.paperIds] },
        ],
      }],
    };
    const completed = resolve(state, result.choices[0]!.id);
    expectUnclaimed(completed, original);
    expect(completed.player.san).toBe(8);
  });

  it.each([
    { remainingMonths: 0 },
    { remainingMonths: -1 },
    { scholarshipDisqualified: false },
    { scholarshipDisqualified: undefined },
  ] satisfies Partial<Buff>[])("ignores inactive or absent disqualification flags: %j", (overrides) => {
    const original = playingState({ buffs: [{ ...createImageMisuseBuff(), ...overrides }] });
    const preview = resultPreview(queueScholarship(original));
    expect(currentEvent(preview).description).not.toContain("举报");
    const completed = resolve(preview);
    expect(completed.player.money).toBe(original.player.money + 6);
    expect(completed.scholarshipState.lastAwardYear).toBe(3);
  });

  it("refreshes back to a normal award when a flagged buff is no longer active", () => {
    const preview = resultPreview(queueScholarship(playingState({ buffs: [createImageMisuseBuff()] })));
    const inactive = { ...preview, buffs: preview.buffs.map((buff) => ({ ...buff, remainingMonths: 0 })) };
    const refreshed = getResolvableQueuedEvent(inactive, currentEvent(inactive));
    expect(refreshed.description).not.toContain("举报");
    expect(refreshed.choices[0]!.effects.money).toBe(6);
    const completed = resolve(inactive);
    expect(completed.player.money).toBe(preview.player.money + 6);
  });

  it("allows skipping without SAN loss, award consumption or a report", () => {
    const original = playingState({ buffs: [createImageMisuseBuff()] });
    const queued = queueScholarship(original);
    const decision = resolve(queued);
    const random = vi.mocked(Math.random);
    random.mockClear();
    const preview = resolve(decision, currentEvent(decision).choices[1]!.id);
    expect(random).not.toHaveBeenCalled();
    expect(currentEvent(preview).stage).toBe("result");
    expect(currentEvent(preview).description).toContain("结果：不申报国奖");
    expectUnclaimed(preview, original);
    const completed = resolve(preview);
    expectUnclaimed(completed, original);
    expect(completed.player.san).toBe(original.player.san);
    expect(completed.eventHistory.at(-1)!.stages).toHaveLength(3);
    expect(JSON.stringify(completed.eventHistory)).not.toContain("举报");
  });
});

describe("pending draft image misuse effect mapping", () => {
  function markDrafts(state: GameState, effects: EventChoice["effects"]): GameState {
    return applyChoiceEffectsToState(state, {
      id: "mark-image-misuse", label: "继续", outcome: "继续处理。", effects,
    }).nextState;
  }

  it("marks only first-author drafts with progress and does not immediately add a buff", () => {
    const initial = playingState();
    const draft = { ...initial.papers[0]!, status: "draft" as const, idea: 0, experiment: 0, writing: 0 };
    const papers = [
      { ...draft, id: "idea", idea: 1 },
      { ...draft, id: "experiment", experiment: 1 },
      { ...draft, id: "writing", writing: 1 },
      { ...draft, id: "empty" },
      { ...draft, id: "non-first", idea: 1, nonFirstAuthor: true },
      { ...draft, id: "reviewing", idea: 1, status: "reviewing" as const },
      { ...initial.externalPublications[0]!, id: "published" },
    ];
    const original = { ...initial, papers };
    const completed = markDrafts(original, { markDraftImageMisuse: true });
    for (const [index, paper] of completed.papers.entries()) {
      expect(paper).toEqual(index < 3 ? { ...papers[index], imageMisusePending: true } : papers[index]);
    }
    expect(original.papers.every((paper) => paper.imageMisusePending !== true)).toBe(true);
    expect(completed.buffs).toEqual(original.buffs);
    expect(completed.externalPublications).toEqual(original.externalPublications);
  });

  it("does not create or change citation multipliers when only marking drafts", () => {
    const original = playingState();
    const draft = { ...original.papers[0]!, idea: 1 };
    original.papers = [
      { ...draft, id: "unpenalized", citationDebuffMultiplierOnPublish: undefined },
      { ...draft, id: "penalized", citationDebuffMultiplierOnPublish: 0.5, imageMisusePending: true },
    ];
    const completed = markDrafts(original, { markDraftImageMisuse: true });
    expect(completed.papers[0]!.citationDebuffMultiplierOnPublish).toBeUndefined();
    expect(completed.papers[1]!.citationDebuffMultiplierOnPublish).toBe(0.5);
    expect(completed.papers).toEqual(original.papers.map((paper) => ({ ...paper, imageMisusePending: true })));
  });

  it("retains the existing citation combination when both effects are present", () => {
    const original = playingState();
    const draft = { ...original.papers[0]!, idea: 1 };
    original.papers = [
      { ...draft, id: "first-loss" },
      { ...draft, id: "second-loss", citationDebuffMultiplierOnPublish: 0.5 },
    ];
    const completed = markDrafts(original, { markDraftImageMisuse: true, draftCitationDebuffMultiplier: 0.5 });
    expect(completed.papers.map((paper) => paper.imageMisusePending)).toEqual([true, true]);
    expect(completed.papers.map((paper) => paper.citationDebuffMultiplierOnPublish)).toEqual([0.5, 0]);
    const citationOnly = markDrafts(original, { draftCitationDebuffMultiplier: 0.5 });
    expect(citationOnly.papers.map((paper) => paper.imageMisusePending)).toEqual([undefined, undefined]);
    expect(citationOnly.papers.map((paper) => paper.citationDebuffMultiplierOnPublish)).toEqual([0.5, 0]);
    expect(markDrafts(completed, { markDraftImageMisuse: false }).papers).toEqual(completed.papers);
  });

  it("carries pending markings to final confirmation without applying them in earlier scenes", () => {
    const original = playingState();
    original.papers = [{ ...original.papers[0]!, idea: 1 }];
    const result: PendingEvent = {
      id: "image-misuse-result", title: "数据丢失", description: "你关掉了文件夹。",
      source: "random", blocking: true, deadlineMonths: 0, chainId: "data-loss", stage: "result",
      choices: [{ id: "finish", label: "确定", outcome: "处理完成。", effects: {} }],
    };
    const decision: PendingEvent = {
      ...result, id: "image-misuse-decision", stage: "act2",
      choices: [{
        id: "continue", label: "继续", outcome: "继续处理。",
        effects: { markDraftImageMisuse: true, draftCitationDebuffMultiplier: 0.5, enqueueEvents: [result] },
      }],
    };
    const queued = { ...original, eventQueue: [createEventQueueItem(decision, 1)] };
    const preview = dispatchAction(queued, "resolve-event", { eventId: decision.id, eventChoiceId: "continue" });
    expect(preview.papers).toEqual(original.papers);
    expect(preview.buffs).toEqual(original.buffs);
    expect(preview.eventQueue.find((event) => event.id === result.id)?.deferredStatePatch).toBeDefined();
    const completed = dispatchAction(preview, "resolve-event", { eventId: result.id, eventChoiceId: "finish" });
    expect(completed.papers[0]).toMatchObject({ imageMisusePending: true, citationDebuffMultiplierOnPublish: 0.5 });
    expect(completed.buffs).toEqual(original.buffs);
  });
});
