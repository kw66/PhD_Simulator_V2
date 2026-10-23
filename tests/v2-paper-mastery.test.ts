import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyPaperMastery, getPaperMasteryBonuses, getPaperMasteryCount } from "../src/core/v2-paper-mastery";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { getActionEffect, consumeNextActionBuffs } from "../src/core/v2-buffs";
import { applyRewinderGrowth, captureRewinderGrowth } from "../src/core/v2-rewinder-growth";
import { normalizeRewinderArchive } from "../src/core/v2-rewinder";
import { captureRewinderRelationships } from "../src/core/v2-rewinder-relationships";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { renderApp } from "../src/app/v2-render";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import { dispatchAction, createInitialState } from "../src/core/v2-engine";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createRunReplay, executeReplayCommand, verifyRunReplay, replayStateDigest, type ReplayCommand } from "../src/core/v2-run-replay";
import type { GameState, Paper, PendingEvent } from "../src/core/v2-types";

function paper(id: string, props: Partial<Paper> = {}): Paper {
  return { ...createGrantedPublishedPaper(3, 0, { target: "C", acceptedScore: 30, nonFirstAuthor: false }), id, ...props };
}

describe("paper mastery growth", () => {
  it("cycles idea, experiment and writing once per first-author paper and keeps the buffs permanent", () => {
    let state = createStartedGameState("normal");
    const expected = [[1, 0, 0], [1, 1, 0], [1, 1, 1], [2, 1, 1], [2, 2, 1], [2, 2, 2], [3, 2, 2]];
    for (const [index, bonuses] of expected.entries()) {
      state = applyPaperMastery({ ...state, externalPublications: [...state.externalPublications, paper(`first-${index}`)] });
      expect(Object.values(getPaperMasteryBonuses(state))).toEqual(bonuses);
      expect(getPaperMasteryCount(state)).toBe(index + 1);
      expect(applyPaperMastery(state)).toBe(state);
    }
    expect(state.buffs.filter(buff => buff.id === "paper-mastery")).toHaveLength(1);
    expect(state.buffs.find(buff => buff.id === "paper-mastery")).toMatchObject({ timing: "permanent", remainingMonths: null });
    expect(getActionEffect(consumeNextActionBuffs(state, "idea"), "idea").bonus).toBe(3);
    expect(state.eventHistory.filter(entry => entry.chainId.startsWith("talent:paper-mastery:"))).toHaveLength(7);
  });

  it("deduplicates ids, excludes non-first authors and drafts, and includes journals and granted first authors", () => {
    const original = createStartedGameState("normal");
    const first = paper("conference"), journal = paper("journal", { journalTarget: "pami" });
    const state = { ...original, papers: [first, paper("draft", { status: "draft" })],
      externalPublications: [first, journal, paper("grant", { leadAuthorId: "player" }),
        paper("coauthor", { nonFirstAuthor: true }), paper("fellow", { leadAuthorId: "fellow-1" })] };
    const next = applyPaperMastery(state);
    expect(next.paperMasteryState).toEqual({ count: 3, rewardedPaperIds: ["conference", "journal", "grant"] });
    expect(getPaperMasteryBonuses(next)).toEqual({ idea: 1, experiment: 1, writing: 1 });
    expect(state.paperMasteryState).toBeUndefined();
    expect(applyPaperMastery({ ...next, papers: [], externalPublications: [first, journal] }).paperMasteryState).toEqual(next.paperMasteryState);
  });

  it("projects rewards without mutation or logs and preserves current-life progress across serialization", () => {
    const state = { ...createStartedGameState("normal"), externalPublications: [paper("one")] };
    const saved = structuredClone(state);
    const projected = applyPaperMastery(state, false);
    const applied = applyPaperMastery(state);
    expect(state).toEqual(saved);
    expect(projected.eventHistory).toEqual(state.eventHistory);
    expect(projected.log).toEqual(state.log);
    expect(projected.paperMasteryState).toEqual(applied.paperMasteryState);
    expect(getPaperMasteryBonuses(projected)).toEqual(getPaperMasteryBonuses(applied));
    const restored = JSON.parse(JSON.stringify(applied)) as GameState;
    expect(applyPaperMastery(restored)).toBe(restored);
  });

  it("leaves legacy replay untouched and can award its existing first authors once under current rules", () => {
    const state = { ...createStartedGameState("normal"), externalPublications: [paper("old")] };
    const old = withGameplayRuleset("20261017-r6", () => applyPaperMastery(state));
    expect(old.paperMasteryState).toBeUndefined();
    expect(getPaperMasteryBonuses(old)).toEqual({ idea: 0, experiment: 0, writing: 0 });
    const next = applyPaperMastery(old);
    expect(next.paperMasteryState?.count).toBe(1);
    expect(applyPaperMastery(next)).toBe(next);
  });

  it("inherits the growth sequence without copying permanent buffs, papers, reward ids or errands", () => {
    const past = applyPaperMastery({ ...createStartedGameState("rewinder"), year: 1, month: 12, totalMonths: 12,
      externalPublications: [paper("past-1"), paper("past-2"), paper("past-3"), paper("past-4")] });
    past.eventCounters.teachersDayErrandCount = 99;
    const current = applyPaperMastery({ ...createStartedGameState("rewinder"), externalPublications: [paper("current")] });
    const restored = applyRewinderGrowth(current, captureRewinderGrowth(past));
    expect(restored.paperMasteryState).toEqual({ count: 4, rewardedPaperIds: ["current"] });
    expect(getPaperMasteryBonuses(restored)).toEqual({ idea: 1, experiment: 0, writing: 0 });
    expect(restored.eventCounters.teachersDayErrandCount).toBe(0);
    expect(applyPaperMastery(restored)).toBe(restored);
    const next = applyPaperMastery({ ...restored, externalPublications: [...restored.externalPublications, paper("next")] });
    expect(getPaperMasteryBonuses(next)).toEqual({ idea: 1, experiment: 1, writing: 0 });
    const record = { growth: captureRewinderGrowth(past), relationships: captureRewinderRelationships(past) };
    const { paperMasteryCount: _newCounter, ...oldCounters } = record.growth.growth;
    const archive = normalizeRewinderArchive({ years: { 1: { ...record, growth: { ...record.growth, growth: { ...oldCounters, teachersDayErrandCount: 5 } } } } });
    expect(archive.years[1]?.growth.growth.paperMasteryCount).toBe(0);
    expect(archive.years[1]?.growth.growth).not.toHaveProperty("teachersDayErrandCount");
  });

  it("shows the actual cumulative bonuses and next award in the growth tab", () => {
    const state = applyPaperMastery({ ...createStartedGameState("normal"), month: 2, totalMonths: 2,
      externalPublications: [paper("one"), paper("two"), paper("three"), paper("four")] });
    const html = renderApp(state, undefined, { activePlayTab: "talent", activeTalentTab: "growth" });
    const card = html.match(/<article\b[^>]*data-talent-item-id="paper-mastery"[\s\S]*?<\/article>/)?.[0] ?? "";
    expect(card).toContain("论文熟手");
    expect(card).toContain("+2分");
    expect(card).toContain("下一篇一作：永久做实验 +1分");
    expect(html).not.toMatch(/跑腿熟手|errand-growth/);
  });

  it.each(["idea", "experiment", "writing"] as const)("adds the permanent %s bonus to future operations without editing existing papers", action => {
    const draft = { ...createDraftPaper(2, 0, () => 0), idea: 1, experiment: 1, writing: 1 };
    const base = { ...createStartedGameState("normal"), month: 2, totalMonths: 2,
      player: { san: 20, research: 10, social: 1, favor: 1, money: 50 }, papers: [draft],
      externalPublications: [paper("one"), paper("two"), paper("three"), paper("four")] };
    const rewarded = applyPaperMastery(base);
    expect(rewarded.papers).toEqual(base.papers);
    const ordinary = applyResearchOperation(base, draft.id, action, () => 0.5);
    const boosted = applyResearchOperation(rewarded, draft.id, action, () => 0.5);
    expect(boosted.papers[0]![action] - ordinary.papers[0]![action]).toBe(action === "idea" ? 2 : 1);
    expect(getPaperMasteryBonuses(boosted)).toEqual(getPaperMasteryBonuses(rewarded));
  });

  it("settles a granted first author only at final confirmation and cannot award it twice", () => {
    const initial = { ...createStartedGameState("normal"), month: 2, totalMonths: 2 };
    const result: PendingEvent = { id: "grant-result", chainId: "grant", stage: "result", title: "赠稿结果",
      source: "system", description: "", blocking: true, deadlineMonths: 0,
      choices: [{ id: "confirm", label: "确认", outcome: "", effects: {} }] };
    const event: PendingEvent = { ...result, id: "grant", stage: "act2", choices: [{ id: "grant", label: "一作赠稿", outcome: "", effects: {
      grantedPublication: { target: "C", acceptedScore: 30, nonFirstAuthor: false }, enqueueEvents: [result],
    } }] };
    const queued = { ...initial, eventQueue: [createEventQueueItem(event, initial.totalMonths)] };
    const preview = dispatchAction(queued, "resolve-event", { eventId: event.id, eventChoiceId: "grant" });
    expect(preview.paperMasteryState).toBeUndefined();
    expect(preview.externalPublications).toEqual(initial.externalPublications);
    expect(preview.buffs).toEqual(initial.buffs);
    expect(preview.log).toEqual(initial.log);
    expect(preview.eventHistory).toEqual(initial.eventHistory);
    const granted = dispatchAction(preview, "resolve-event", { eventId: result.id, eventChoiceId: "confirm" });
    expect(granted.paperMasteryState?.count).toBe(1);
    expect(getPaperMasteryBonuses(granted)).toEqual({ idea: 1, experiment: 0, writing: 0 });
    expect(granted.eventHistory.filter(entry => entry.chainId.startsWith("talent:paper-mastery:"))).toHaveLength(1);
    const repeated = dispatchAction(granted, "resolve-event", { eventId: result.id, eventChoiceId: "confirm" });
    expect(repeated.paperMasteryState).toEqual(granted.paperMasteryState);
    expect(repeated.eventHistory).toEqual(granted.eventHistory);
  });

  it("settles multiple PhD-transfer first authors through the real event pipeline", () => withGameplayRuleset("20261022-r27", () => {
    const base = createStartedGameState("teacher-child", { "near-the-source": 1, "family-patronage": 2 });
    let state: GameState = { ...base, year: 2, month: 9, totalMonths: 21, totalResearchScore: 2,
      selectedAdvisorName: "测试导师", player: { ...base.player, favor: 12, money: 30 }, eventQueue: [] };
    state.eventQueue = [createEventQueueItem(createPhdDecisionEvent(state), state.totalMonths)];
    for (let turn = 0; turn < 5 && state.degree !== "phd"; turn++) {
      const event = state.eventQueue.find(entry => entry.chainId === "phd-decision")!;
      const choice = event.choices.find(entry => entry.id === "transfer-phd") ?? event.choices[0]!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
    }
    expect(state.degree).toBe("phd");
    expect(state.externalPublications).toHaveLength(4);
    expect(getPaperMasteryCount(state)).toBe(4);
    expect(getPaperMasteryBonuses(state)).toEqual({ idea: 2, experiment: 1, writing: 1 });
  }));

  it("verifies a mixed old/new replay when a journal publishes under the new rules", () => {
    const initial = createInitialState();
    initial.randomState = { seed: 1700000000, cursor: 0 };
    const start: ReplayCommand = { kind: "action", actionId: "start-game", payload: { roleId: "normal" }, ruleset: "20261017-r6" };
    const started = executeReplayCommand(initial, start);
    const review = { ...createDraftPaper(2, 0, () => 0), status: "journal-reviewing" as const, journalTarget: "pami" as const,
      idea: 50, experiment: 50, writing: 50 };
    const checkpoint: GameState = { ...started, month: 2, totalMonths: 2, eventQueue: [], papers: [review] };
    const command: ReplayCommand = { kind: "action", actionId: "submit-journal-paper", payload: { paperId: review.id, journalTarget: "pami" }, ruleset: "20261018-r7" };
    const replay = createRunReplay(initial, started, start.payload);
    replay.ruleset = "20261017-r6";
    replay.commands = [start, command];
    replay.checkpoints = [{ index: 1, totalMonths: 2, digest: replayStateDigest(checkpoint) }];
    const next = executeReplayCommand(checkpoint, command);
    expect(getPaperMasteryCount(next)).toBe(1);
    expect(verifyRunReplay(replay, { state: checkpoint, index: 1 }, next)).not.toBeNull();
    expect(executeReplayCommand(checkpoint, { ...command, ruleset: "20261017-r6" }).paperMasteryState).toBeUndefined();
  });
});
