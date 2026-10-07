import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createJournalFeeEvent, refreshJournalFeeEvent, settleJournalFeePayment } from "../src/core/v2-journal-fee-events";
import { settleJournalPublicationFees } from "../src/core/v2-lab-publication-costs";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import type { EventChoice, GameState, JournalTarget, Paper } from "../src/core/v2-types";

function makeState(journalTarget: JournalTarget = "pami"): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 5, totalMonths: 5, eventQueue: [],
    player: { ...base.player, money: 30, favor: 12 },
    advisorProgressState: { ...base.advisorProgressState, funding: 30 },
    externalPublications: [{ ...createDraftPaper(1, 0, () => 0), id: "journal-paper", journalTarget, status: "published" }],
  };
}

describe("journal fee payment choices", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("charges %s fee %s only to the chosen payer, once", (journal, fee) => {
    for (const payer of ["self", "lab"] as const) {
      const state = makeState(journal);
      const snapshot = structuredClone(state);
      const event = createJournalFeeEvent(state, "journal-paper")!;
      expect(event).toMatchObject({ title: "期刊版面费", journalFeePaperId: "journal-paper", stage: "act2", blocking: true, deadlineMonths: 0 });
      expect(event.choices).toHaveLength(2);
      const payment = event.choices.find((choice) => choice.id === payer)!.effects.journalFeePayment!;
      expect(event.choices.find((choice) => choice.id === payer)!.outcome).toContain(state.externalPublications[0]!.title);
      const paid = settleJournalFeePayment(state, payment);
      expect(paid.log).toEqual(state.log);
      expect(paid.player).toEqual({ ...state.player, money: 30 - (payer === "self" ? fee : 0) });
      expect(paid.advisorProgressState.funding).toBe(30 - (payer === "lab" ? fee : 0));
      expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["journal-paper"]);
      expect(paid.externalPublications).toEqual(state.externalPublications);
      expect(settleJournalFeePayment(paid, payment)).toBe(paid);
      expect(settleJournalFeePayment(paid, { ...payment, payer: payer === "self" ? "lab" : "self" })).toBe(paid);
      expect(createJournalFeeEvent(paid, "journal-paper")).toBeNull();
      const closed = refreshJournalFeeEvent(paid, createEventQueueItem(event, 7));
      expect(closed.choices).toEqual([{ id: "close", label: "关闭", outcome: "该论文版面费已支付，无需重复支付。", effects: {} }]);
      expect(closed.queueOrder).toBe(7);
      expect(state).toEqual(snapshot);
    }
  });

  it("refreshes balances and rejects unaffordable self payment while allowing lab bankruptcy", () => {
    const state = makeState();
    const event = createJournalFeeEvent(state, "journal-paper")!;
    const poor = { ...state, player: { ...state.player, money: 4 }, advisorProgressState: { ...state.advisorProgressState, funding: 4 } };
    const snapshot = structuredClone(poor);
    const refreshed = refreshJournalFeeEvent(poor, event);
    expect(refreshed.choices[0]!.disabledReason).toContain("不足");
    expect(refreshed.choices[1]!.disabledReason).toBeUndefined();
    expect(refreshed.choices[1]!.outcome).toContain("实验室破产");
    expect(settleJournalFeePayment(poor, { paperId: "journal-paper", payer: "self" })).toBe(poor);
    const lab = settleJournalFeePayment(poor, { paperId: "journal-paper", payer: "lab" });
    expect(lab.advisorProgressState.funding).toBe(0);
    expect(lab.player).toEqual(poor.player);
    expect(poor).toEqual(snapshot);
    expect(refreshJournalFeeEvent(state, refreshed).choices.every((choice) => choice.disabledReason === undefined)).toBe(true);
  });

  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("allows mandatory %s payment to end an otherwise blocked run", (journal, fee) => {
    for (const funding of [0, 1, fee - 1, fee]) {
      const state = makeState(journal);
      state.player.money = 0;
      state.advisorProgressState.funding = funding;
      state.actionState.used = state.actionState.limit;
      const event = createJournalFeeEvent(state, "journal-paper")!;
      expect(event.choices).toHaveLength(2);
      expect(event.choices[0]!.disabledReason).toBeTruthy();
      expect(event.choices[1]!.disabledReason).toBeUndefined();
      expect(event.description).toContain("实验室破产");
      const payment = event.choices[1]!.effects.journalFeePayment!;
      const paid = settleJournalFeePayment(state, payment);
      expect(paid.advisorProgressState).toMatchObject({ funding: 0, paidJournalPaperIds: ["journal-paper"] });
      expect(paid.player).toEqual(state.player);
      expect(paid.actionState).toEqual(state.actionState);
      expect(paid.log).toEqual(state.log);
      expect(settleJournalFeePayment(paid, payment)).toBe(paid);
      expect(evaluateCoreEndings(paid)).toMatchObject({ phase: "finished", ending: "lab-bankrupt" });
    }
  });

  it("allows self payment to preserve a lab balance below the fee", () => {
    const state = makeState();
    state.advisorProgressState.funding = 1;
    const paid = settleJournalFeePayment(state, { paperId: "journal-paper", payer: "self" });
    expect(paid.advisorProgressState.funding).toBe(1);
    expect(paid.player.money).toBe(25);
    expect(evaluateCoreEndings(paid).phase).toBe("playing");
  });

  it("allows exact self payment and warns that exact lab payment causes bankruptcy", () => {
    const state = makeState();
    state.player.money = 5;
    state.advisorProgressState.funding = 5;
    const event = createJournalFeeEvent(state, "journal-paper")!;
    expect(event.choices.every((choice) => choice.disabledReason === undefined)).toBe(true);
    expect(event.choices[1]!.outcome).toContain("实验室破产");
    const self = evaluateCoreEndings(settleJournalFeePayment(state, { paperId: "journal-paper", payer: "self" }));
    expect(self.player.money).toBe(0);
    expect(self.phase).toBe("playing");
    const lab = evaluateCoreEndings(settleJournalFeePayment(state, { paperId: "journal-paper", payer: "lab" }));
    expect(lab).toMatchObject({ phase: "finished", ending: "lab-bankrupt", advisorProgressState: { funding: 0 } });
  });

  it("queues and permits player self payment without an advisor", () => {
    const state = { ...makeState(), selectedAdvisorName: null };
    const queued = settleJournalPublicationFees(state);
    expect(queued.eventQueue).toHaveLength(1);
    expect(queued.eventQueue[0]!.choices[1]!.disabledReason).toContain("导师");
    expect(settleJournalFeePayment(state, { paperId: "journal-paper", payer: "lab" })).toBe(state);
    expect(settleJournalFeePayment(state, { paperId: "journal-paper", payer: "self" }).player.money).toBe(25);
  });

  it.each([
    { status: "draft" }, { status: "journal-reviewing" }, { journalTarget: null },
    { leadAuthorId: "fellow-departed" }, { leadAuthorId: "lover:1" }, { nonFirstAuthor: true },
    { leadAuthorId: "player", nonFirstAuthor: true },
  ] satisfies Partial<Paper>[])("rejects ineligible or changed papers %j", (patch) => {
    const state = makeState();
    const event = createJournalFeeEvent(state, "journal-paper")!;
    state.externalPublications = state.externalPublications.map((paper) => ({ ...paper, ...patch }));
    expect(createJournalFeeEvent(state, "journal-paper")).toBeNull();
    for (const payer of ["self", "lab"] as const) expect(settleJournalFeePayment(state, { paperId: "journal-paper", payer })).toBe(state);
    expect(refreshJournalFeeEvent(state, event).choices[0]).toMatchObject({ id: "close", effects: {} });
  });

  it("validates missing papers, invalid payers, current journal price and finished games", () => {
    const state = makeState();
    const payment = { paperId: "journal-paper", payer: "self" as const };
    expect(settleJournalFeePayment(state, { ...payment, paperId: "missing" })).toBe(state);
    expect(settleJournalFeePayment(state, { ...payment, payer: "other" } as unknown as NonNullable<EventChoice["effects"]["journalFeePayment"]>)).toBe(state);
    const missing = { ...state, externalPublications: [] };
    expect(settleJournalFeePayment(missing, payment)).toBe(missing);
    const finished = { ...state, phase: "finished" as const };
    expect(settleJournalFeePayment(finished, payment)).toBe(finished);
    state.externalPublications[0]!.journalTarget = "nature";
    expect(settleJournalFeePayment(state, payment).player.money).toBe(10);
  });

  it("supports explicit player authorship", () => {
    const state = makeState();
    const original = state.externalPublications[0]!;
    state.externalPublications = [{ ...original, leadAuthorId: "player" }];
    expect(settleJournalFeePayment(state, { paperId: original.id, payer: "self" }).player.money).toBe(25);
  });

  it("skips non-first-author and lover publications without queuing or lab debit", () => {
    const state = makeState();
    const original = state.externalPublications[0]!;
    state.externalPublications = [{ ...original, nonFirstAuthor: true }, { ...original, id: "lover-paper", leadAuthorId: "lover:1" }];
    expect(settleJournalPublicationFees(state)).toBe(state);
  });
});
