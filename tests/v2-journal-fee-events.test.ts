import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createJournalFeeEvent, refreshJournalFeeEvent } from "../src/core/v2-journal-fee-events";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { JOURNAL_PUBLICATION_FEES } from "../src/core/v2-publication-fees";
import type { GameState, JournalTarget, Paper, PendingEvent } from "../src/core/v2-types";

function makeState(journalTarget: JournalTarget = "pami"): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 5, totalMonths: 5, eventQueue: [],
    player: { ...base.player, money: 30, favor: 12.5 },
    advisorProgressState: { ...base.advisorProgressState, funding: 30 },
    externalPublications: [{ ...createDraftPaper(1, 0, () => 0), id: "journal-paper", title: "测试论文",
      journalTarget, status: "published", submittedIdea: 30, submittedExperiment: 30, submittedWriting: 30,
      idea: 40, experiment: 40, writing: 45 }],
  };
}

function follow(event: PendingEvent, choiceId: string): PendingEvent {
  const choice = event.choices.find((entry) => entry.id === choiceId)!;
  expect(choice).toBeDefined();
  expect(choice.effects.enqueueEvents).toHaveLength(1);
  return choice.effects.enqueueEvents![0]!;
}

function confirmation(state: GameState, mode: "self" | "advisor"): PendingEvent {
  return follow(follow(createJournalFeeEvent(state, state.externalPublications[0]!)!, "continue"), mode);
}

afterEach(() => vi.restoreAllMocks());

describe("player journal fee events", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("offers the %s fee %s through three stages without early payment", (journal, fee) => {
    const state = makeState(journal);
    const snapshot = structuredClone(state);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Journal event rerolled"); });
    expect(JOURNAL_PUBLICATION_FEES[journal]).toBe(fee);
    const root = createJournalFeeEvent(state, state.externalPublications[0]!)!;
    expect(root).toMatchObject({ stage: "act1", blocking: true, deadlineMonths: 0,
      journalFeePreview: { paperId: "journal-paper", stage: "act1" } });
    expect(root.description.split("\n\n")).toHaveLength(2);
    const decision = follow(root, "continue");
    expect(decision).toMatchObject({ stage: "act2", chainId: root.chainId });
    expect(decision.choices.map((choice) => choice.id)).toEqual(["self", "advisor"]);
    for (const mode of ["self", "advisor"] as const) {
      const result = follow(decision, mode);
      const text = `${mode === "self" ? "金币" : "科研经费"} -${fee}`;
      expect(result).toMatchObject({ stage: "act3", chainId: root.chainId, completionLog: text,
        journalFeePreview: { paperId: "journal-paper", stage: "act3", paymentMode: mode } });
      expect(result.choices[0]!.outcome).toBe(text);
      expect(result.description.split("机制结算\n")[1]).toBe(`结果：${text}`);
      expect(result.choices[0]!.effects).toEqual({ recordJournalFeePayment: "journal-paper",
        ...(mode === "self" ? { money: -fee } : { advisorProgressStateDeltas: { funding: -fee } }) });
      expect(result.choices[0]!.disabledReason).toBeUndefined();
      expect(result.choices.some((choice) => choice.id === "change-payment-method")).toBe(true);
      expect(decision.choices.find((choice) => choice.id === mode)!.effects).toEqual({ enqueueEvents: [result] });
    }
    expect(root.choices[0]!.effects).toEqual({ enqueueEvents: [decision] });
    expect(state).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
    expect(() => JSON.stringify(root)).not.toThrow();
  });

  it.each(["self", "advisor"] as const)("deducts only on %s confirmation and records payment once", (mode) => {
    const state = makeState();
    const event = confirmation(state, mode);
    const paid = applyChoiceEffectsToState(state, event.choices[0]!, "期刊中稿", event).nextState;
    expect(paid.player.money).toBe(mode === "self" ? 25 : 30);
    expect(paid.advisorProgressState.funding).toBe(mode === "advisor" ? 25 : 30);
    expect(paid.player.favor).toBe(12.5);
    expect(paid.advisorProgressState.paidJournalPaperIds).toContain("journal-paper");
    const finished = refreshJournalFeeEvent(paid, event);
    const repeated = applyChoiceEffectsToState(paid, finished.choices[0]!, "期刊中稿", finished).nextState;
    expect(repeated.player.money).toBe(paid.player.money);
    expect(repeated.advisorProgressState.funding).toBe(paid.advisorProgressState.funding);
    expect(finished.choices).toHaveLength(1);
    expect(finished.choices[0]!.effects).toEqual({});
    expect(finished.choices[0]!.disabledReason).toBeUndefined();
    expect(createJournalFeeEvent(paid, paid.externalPublications[0]!)).toBeNull();
  });

  it.each(["self", "advisor"] as const)("defers %s payment until the dispatcher confirms act3", (mode) => {
    const initial = applyPublicationTalentRewards(makeState());
    const root = createJournalFeeEvent(initial, initial.externalPublications[0]!)!;
    let state = { ...initial, eventQueue: [createEventQueueItem(root, initial.totalMonths)] };
    const choose = (choiceId: string): void => {
      const event = state.eventQueue.find((entry) => entry.journalFeePreview?.paperId === "journal-paper")!;
      state = dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId });
    };
    choose("continue");
    expect(state.eventQueue[0]!.journalFeePreview?.stage).toBe("act2");
    expect(state.player.money).toBe(30);
    expect(state.advisorProgressState.funding).toBe(30);
    choose(mode);
    expect(state.eventQueue[0]!.journalFeePreview?.stage).toBe("act3");
    expect(state.player.money).toBe(30);
    expect(state.advisorProgressState.funding).toBe(30);
    expect(state.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    choose("confirm");
    expect(state.player.money).toBe(mode === "self" ? 25 : 30);
    expect(state.advisorProgressState.funding).toBe(mode === "advisor" ? 25 : 30);
    expect(state.player.favor).toBe(initial.player.favor);
    expect(state.advisorProgressState.paidJournalPaperIds).toEqual(["journal-paper"]);
    expect(state.eventQueue.some((event) => event.journalFeePreview?.paperId === "journal-paper")).toBe(false);
    state = { ...state, eventQueue: [createEventQueueItem(root, state.totalMonths)] };
    choose("close");
    expect(state.player.money).toBe(mode === "self" ? 25 : 30);
    expect(state.advisorProgressState.funding).toBe(mode === "advisor" ? 25 : 30);
    expect(state.eventQueue).toEqual([]);
  });

  it.each(["self", "advisor"] as const)("refreshes %s balance at decision and confirmation without rerolling", (mode) => {
    const state = makeState();
    const root = createJournalFeeEvent(state, state.externalPublications[0]!)!;
    const decision = follow(root, "continue");
    const result = follow(decision, mode);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Refresh rerolled"); });
    for (const balance of [4.99, 5, 0, 5.25]) {
      if (mode === "self") state.player.money = balance;
      else state.advisorProgressState.funding = balance;
      const choice = refreshJournalFeeEvent(state, decision).choices.find((entry) => entry.id === mode)!;
      const refreshed = refreshJournalFeeEvent(state, result);
      expect(Boolean(choice.disabledReason)).toBe(balance < 5);
      expect(Boolean(refreshed.choices[0]!.disabledReason)).toBe(balance < 5);
      expect(refreshed.choices.find((entry) => entry.id === "change-payment-method")!.disabledReason).toBeUndefined();
      expect(mode === "self" ? state.player.money : state.advisorProgressState.funding).toBe(balance);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("returns from an unaffordable confirmation to the other method after save/load", () => {
    const state = makeState();
    let event = confirmation(state, "self");
    state.player.money = 0;
    event = refreshJournalFeeEvent(state, JSON.parse(JSON.stringify(event)));
    expect(event.choices[0]!.disabledReason).toBeDefined();
    const decision = refreshJournalFeeEvent(state, follow(event, "change-payment-method"));
    event = refreshJournalFeeEvent(state, follow(decision, "advisor"));
    expect(event.journalFeePreview?.paymentMode).toBe("advisor");
    expect(event.choices[0]!.disabledReason).toBeUndefined();
    expect(event.choices[0]!.effects.money).toBeUndefined();
    expect(event.choices[0]!.effects.advisorProgressStateDeltas).toEqual({ funding: -5 });
    expect(event.choices.some((choice) => choice.id === "change-payment-method")).toBe(true);
    expect(state.player.money).toBe(0);
    expect(state.advisorProgressState.funding).toBe(30);
  });

  it("preserves queued identity and history while refreshing nested balances", () => {
    const state = makeState();
    const queued = { ...createJournalFeeEvent(state, state.externalPublications[0]!)!,
      id: "queued-copy", queueOrder: 8, continuationSourceId: "source-event", history: [] };
    state.advisorProgressState.funding = 0;
    const next = refreshJournalFeeEvent(state, queued);
    expect(next).toMatchObject({ id: "queued-copy", queueOrder: 8, continuationSourceId: "source-event", history: [] });
    expect(follow(next, "continue").choices.find((choice) => choice.id === "advisor")!.disabledReason).toBeDefined();
    expect(refreshJournalFeeEvent(state, next)).toEqual(next);
  });

  it("uses actual submission snapshots for revision prose without scores or invented rounds", () => {
    const state = makeState();
    const paper = state.externalPublications[0]!;
    const revised = createJournalFeeEvent(state, paper)!;
    expect(revised.description).toContain("补做的实验");
    expect(revised.description).toContain("回复审稿意见");
    expect(revised.description).not.toMatch(/三项合计|\d+\s*分|大修|小修|第\d+轮/);
    const writingOnly = createJournalFeeEvent(state, { ...paper, submittedIdea: 40, submittedExperiment: 40 })!;
    expect(writingOnly.description).toContain("改过的段落");
    expect(writingOnly.description).not.toContain("补做的实验");
    const immediate = createJournalFeeEvent(state, { ...paper, submittedIdea: 40, submittedExperiment: 40, submittedWriting: 45 })!;
    expect(immediate.description).toContain("投稿前整理实验记录");
    expect(immediate.description).not.toMatch(/投稿后的修改|回复审稿意见|第\d+轮/);
    const archived = createJournalFeeEvent(state, { ...paper, journalTarget: null,
      submittedIdea: null, submittedExperiment: null, submittedWriting: null,
      publication: { journalTarget: "nature", citations: 0, effectiveScore: 500, citationDebuffMultiplier: 1 } })!;
    expect(archived.description).toContain("Nature");
    expect(archived.description).toContain("投稿前整理实验记录");
    expect(archived.description).not.toMatch(/三项合计|\d+\s*分|回复审稿意见/);
    expect(follow(follow(archived, "continue"), "self").choices[0]!.outcome).toBe("金币 -20");
  });

  it.each([
    { status: "draft" }, { status: "journal-reviewing" }, { journalTarget: null },
    { leadAuthorId: "fellow-departed" }, { leadAuthorId: "lover:1" }, { nonFirstAuthor: true },
    { leadAuthorId: "player", nonFirstAuthor: true },
  ] satisfies Partial<Paper>[])("does not create a player payment for %j", (patch) => {
    const state = makeState();
    expect(createJournalFeeEvent(state, { ...state.externalPublications[0]!, ...patch })).toBeNull();
  });

  it("accepts explicit player authorship and disables advisor payment without an advisor", () => {
    const state = makeState();
    state.selectedAdvisorName = null;
    const event = createJournalFeeEvent(state, { ...state.externalPublications[0]!, leadAuthorId: "player" })!;
    const decision = follow(event, "continue");
    expect(decision.choices.find((choice) => choice.id === "self")!.disabledReason).toBeUndefined();
    expect(decision.choices.find((choice) => choice.id === "advisor")!.disabledReason).toBe("尚未选择导师");
  });

  it.each(["missing", "non-first", "paid", "finished"] as const)("removes stale payment effects for %s confirmation", (condition) => {
    const state = makeState();
    const event = confirmation(state, "advisor");
    if (condition === "missing") state.externalPublications = [];
    if (condition === "non-first") state.externalPublications[0]!.nonFirstAuthor = true;
    if (condition === "paid") state.advisorProgressState.paidJournalPaperIds = ["journal-paper"];
    if (condition === "finished") state.phase = "finished";
    const refreshed = refreshJournalFeeEvent(state, event);
    expect(refreshed.choices).toHaveLength(1);
    expect(refreshed.choices[0]!.effects).toEqual({});
    expect(refreshed.choices[0]!.disabledReason).toBeUndefined();
    expect(state.advisorProgressState.funding).toBe(30);
  });

  it("leaves unrelated events untouched", () => {
    const state = makeState();
    const event: PendingEvent = { id: "other", chainId: "other", title: "", description: "", source: "system",
      stage: "act1", blocking: true, deadlineMonths: 0, choices: [] };
    expect(refreshJournalFeeEvent(state, event)).toBe(event);
  });
});
