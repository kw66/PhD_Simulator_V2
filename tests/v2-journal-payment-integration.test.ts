import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, JournalTarget } from "../src/core/v2-types";

function readyState(target: JournalTarget = "pami", month = 8): GameState {
  const base = createStartedGameState("normal");
  const paper = { ...createDraftPaper(1, 0, () => 0), id: `test-${target}`, idea: 200, experiment: 200, writing: 200 };
  return { ...base, ...getCalendarForTotalMonths(month), totalMonths: month, selectedAdvisorName: "导师",
    graduationScoreTarget: 1, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    player: { san: 20, research: 5, favor: 5, social: 5, money: 100 },
    advisorProgressState: { ...base.advisorProgressState, funding: 100 }, papers: [paper] };
}

function submit(state: GameState, target: JournalTarget = "pami"): GameState {
  return dispatchAction(state, "submit-journal-paper", { paperId: `test-${target}`, journalTarget: target });
}

function paymentEvent(state: GameState) {
  const event = state.eventQueue.find((entry) => entry.journalFeePreview);
  expect(event).toBeDefined();
  return event!;
}

function choosePayment(state: GameState, choiceId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId: paymentEvent(state).id, eventChoiceId: choiceId });
}

function withBalance(state: GameState, mode: "self" | "advisor", balance: number): GameState {
  return mode === "self" ? { ...state, player: { ...state.player, money: balance } }
    : { ...state, advisorProgressState: { ...state.advisorProgressState, funding: balance } };
}

afterEach(() => vi.restoreAllMocks());

describe("journal payment through the engine", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("charges %s fee %s only on final confirmation through either source", (target, fee) => {
    for (const mode of ["self", "advisor"] as const) {
      const initial = readyState(target);
      const snapshot = structuredClone(initial);
      const published = submit(initial, target);
      expect(published).toMatchObject({ phase: "playing", ending: null, advisorProgressState: { funding: 100 } });
      expect(published.externalPublications).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: `test-${target}`, status: "published", journalTarget: target }),
      ]));
      expect(published.papers.some((paper) => paper.id === `test-${target}`)).toBe(false);
      expect(paymentEvent(published)).toMatchObject({ blocking: true, stage: "act1" });
      const decision = choosePayment(published, "continue");
      const confirmation = choosePayment(decision, mode);
      for (const pending of [published, decision, confirmation]) {
        expect(pending.player.money).toBe(100);
        expect(pending.player.favor).toBe(published.player.favor);
        expect(pending.advisorProgressState.funding).toBe(100);
        expect(pending.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
        expect(pending.eventQueue.filter((event) => event.journalFeePreview)).toHaveLength(1);
      }
      const confirmId = paymentEvent(confirmation).id;
      const paid = choosePayment(confirmation, "confirm");
      expect(paid.player.money).toBe(mode === "self" ? 100 - fee : 100);
      expect(paid.player.favor).toBe(published.player.favor);
      expect(paid.advisorProgressState.funding).toBe(mode === "advisor" ? 100 - fee : 100);
      expect(paid.advisorProgressState.paidJournalPaperIds).toEqual([`test-${target}`]);
      expect(paid.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
      const replayed = dispatchAction(JSON.parse(JSON.stringify(paid)) as GameState, "resolve-event", {
        eventId: confirmId, eventChoiceId: "confirm",
      });
      expect(replayed.player).toEqual(paid.player);
      expect(replayed.advisorProgressState).toEqual(paid.advisorProgressState);
      expect(submit(replayed, target).eventQueue.some((event) => event.journalFeePreview)).toBe(false);
      expect(initial).toEqual(snapshot);
    }
  });

  it.each(["self", "advisor"] as const)("keeps %s stages moving forward without return choices or growing history on invalid actions", (mode) => {
    const published = submit(readyState());
    const decision = choosePayment(published, "continue");
    let confirmation = choosePayment(decision, mode);
    expect(paymentEvent(published).history ?? []).toHaveLength(0);
    expect(paymentEvent(decision).history).toHaveLength(1);
    expect(paymentEvent(confirmation).history).toHaveLength(2);
    const preview = paymentEvent(confirmation).journalFeePreview;
    const history = paymentEvent(confirmation).history;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      confirmation = choosePayment(JSON.parse(JSON.stringify(confirmation)) as GameState, "change-payment-method");
      expect(paymentEvent(confirmation).journalFeePreview).toEqual(preview);
      expect(paymentEvent(confirmation).choices.map((choice) => choice.id)).toEqual(["confirm"]);
      expect(paymentEvent(confirmation).history).toEqual(history);
      expect(confirmation.eventQueue.filter((event) => event.journalFeePreview)).toHaveLength(1);
      expect(confirmation.player.money).toBe(100);
      expect(confirmation.advisorProgressState.funding).toBe(100);
    }
    const paid = choosePayment(confirmation, "confirm");
    expect(paid.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
  });

  it.each(["self", "advisor"] as const)("allows insufficient %s balance until one final payment triggers the corresponding ending", (mode) => {
    for (const balance of [0, 4.99, 5]) {
      const published = withBalance(submit(readyState()), mode, balance);
      const decision = choosePayment(published, "continue");
      expect(paymentEvent(decision).choices.find((choice) => choice.id === mode)!.disabledReason).toBeUndefined();
      const confirmation = choosePayment(decision, mode);
      expect(paymentEvent(confirmation).choices[0]!.disabledReason).toBeUndefined();
      for (const pending of [decision, confirmation]) {
        expect(pending).toMatchObject({ phase: "playing", ending: null });
        expect(mode === "self" ? pending.player.money : pending.advisorProgressState.funding).toBe(balance);
        expect(pending.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
      }
      const confirmedEventId = paymentEvent(confirmation).id;
      const paid = choosePayment(JSON.parse(JSON.stringify(confirmation)) as GameState, "confirm");
      expect(mode === "self" ? paid.player.money : paid.advisorProgressState.funding).toBeCloseTo(balance - 5);
      expect(mode === "self" ? paid.advisorProgressState.funding : paid.player.money).toBe(100);
      expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
      expect(paid.phase).toBe(balance < 5 ? "finished" : "playing");
      expect(paid.ending).toBe(balance < 5 ? mode === "self" ? "poor" : "lab-bankrupt" : null);
      expect(paid.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
      const repeated = dispatchAction(paid, "resolve-event", { eventId: confirmedEventId, eventChoiceId: "confirm" });
      expect(repeated.player).toEqual(paid.player);
      expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
    }
  });

  it.each(["self", "advisor"] as const)("charges the current %s balance even when it falls after choosing the source", (mode) => {
    const confirmation = choosePayment(choosePayment(submit(readyState()), "continue"), mode);
    const paid = choosePayment(withBalance(confirmation, mode, 4), "confirm");
    expect(mode === "self" ? paid.player.money : paid.advisorProgressState.funding).toBe(-1);
    expect(paid.ending).toBe(mode === "self" ? "poor" : "lab-bankrupt");
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
  });

  it.each(["act1", "act2", "act3"] as const)("closes a stale paid %s queue entry without recharging or requeuing", (stage) => {
    const published = submit(readyState());
    const decision = choosePayment(published, "continue");
    const confirmation = choosePayment(decision, "advisor");
    const stale = paymentEvent(stage === "act1" ? published : stage === "act2" ? decision : confirmation);
    const paid = choosePayment(confirmation, "confirm");
    const reloaded = JSON.parse(JSON.stringify({ ...paid, eventQueue: [createEventQueueItem(stale, 0)] })) as GameState;
    const closed = choosePayment(reloaded, "close");
    expect(closed.player).toEqual(paid.player);
    expect(closed.advisorProgressState).toEqual(paid.advisorProgressState);
    expect(closed.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
    const checked = submit(closed);
    expect(checked.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
    expect(checked.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
  });

  it("blocks advisor payment structurally when no advisor is selected", () => {
    const published = { ...submit(readyState()), selectedAdvisorName: null };
    const decision = choosePayment(published, "continue");
    const blocked = choosePayment(decision, "advisor");
    expect(paymentEvent(blocked).stage).toBe("act2");
    expect(paymentEvent(blocked).choices.find((choice) => choice.id === "advisor")!.disabledReason).toBe("尚未选择导师");
    expect(blocked.advisorProgressState.funding).toBe(100);
    const paid = choosePayment(choosePayment(blocked, "self"), "confirm");
    expect(paid.player.money).toBe(95);
    expect(paid.advisorProgressState.funding).toBe(100);
  });

  it("preserves the payment stage and requires final payment before graduation through next-month", () => {
    let pending = submit(readyState("pami", 34));
    for (const choice of ["continue", "advisor", "confirm"]) {
      const preview = paymentEvent(pending).journalFeePreview;
      const blocked = dispatchAction(pending, "next-month");
      expect(blocked).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
      expect(paymentEvent(blocked).journalFeePreview).toEqual(preview);
      expect(blocked.advisorProgressState.funding).toBe(100);
      expect(blocked.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
      pending = choosePayment(blocked, choice);
    }
    expect(pending.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    const graduated = dispatchAction(pending, "next-month");
    expect(graduated).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
    expect(graduated.advisorProgressState.funding).toBe(95);
  });

  it.each(["act1", "act2", "act3"] as const)("rebuilds discarded %s payment responsibility on force-next-month and still blocks graduation", (stage) => {
    let pending = submit(readyState("pami", 34));
    if (stage !== "act1") pending = choosePayment(pending, "continue");
    if (stage === "act3") pending = choosePayment(pending, "advisor");
    const blocked = dispatchAction(pending, "force-next-month");
    expect(blocked).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
    expect(blocked.player).toEqual(pending.player);
    expect(blocked.advisorProgressState.funding).toBe(100);
    expect(blocked.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    expect(blocked.eventQueue.filter((event) => event.journalFeePreview)).toHaveLength(1);
    expect(paymentEvent(blocked).journalFeePreview).toEqual({ paperId: "test-pami", stage: "act1" });
    const repeated = dispatchAction(blocked, "force-next-month");
    expect(repeated).toMatchObject({ phase: "playing", ending: null, totalMonths: 34 });
    expect(repeated.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    const confirmation = choosePayment(choosePayment(repeated, "continue"), "advisor");
    expect(confirmation.advisorProgressState.funding).toBe(100);
    expect(confirmation.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    const paid = choosePayment(confirmation, "confirm");
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(paid.advisorProgressState.funding).toBe(95);
    const graduated = dispatchAction(paid, "force-next-month");
    expect(graduated).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
    expect(graduated.advisorProgressState.funding).toBe(95);
    expect(graduated.player.money).toBe(pending.player.money);
  });

  it.each(["next-month", "force-next-month"] as const)("queues archived unpaid journals before graduation through %s", (action) => {
    const initial = readyState("pami", 34);
    initial.papers = [];
    initial.totalResearchScore = 10;
    initial.externalPublications = [{ ...createDraftPaper(1, 0, () => 0), id: "archived", status: "published", journalTarget: "pami" }];
    initial.advisorProgressState.funding = 4;
    const pending = dispatchAction(initial, action);
    expect(pending).toMatchObject({ phase: "playing", ending: null, totalMonths: 34, advisorProgressState: { funding: 4 } });
    const paid = choosePayment(choosePayment(choosePayment(pending, "continue"), "self"), "confirm");
    expect(paid.player.money).toBe(95);
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["archived"]);
    expect(dispatchAction(paid, action)).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
  });

  it.each([4, 5])("queues payment only when later revision reaches acceptance with funding %s", (funding) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = readyState();
    initial.advisorProgressState.funding = funding;
    initial.papers[0] = { ...initial.papers[0]!, idea: 41, experiment: 41, writing: 42 };
    const reviewing = submit(initial);
    expect(reviewing.papers[0]!.status).toBe("journal-reviewing");
    expect(reviewing.advisorProgressState.funding).toBe(funding);
    expect(reviewing.eventQueue).toEqual([]);
    const published = dispatchAction(reviewing, "research-paper", { paperId: "test-pami", paperActionType: "writing" });
    expect(published.externalPublications[0]).toMatchObject({ id: "test-pami", status: "published" });
    expect(published.advisorProgressState.funding).toBe(funding);
    expect(published.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    expect(paymentEvent(published).stage).toBe("act1");
    expect(published).toMatchObject({ phase: "playing", ending: null });
  });

  it("preserves pending payment across save/load and does not charge again after payment", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const pending = choosePayment(choosePayment(submit(readyState()), "continue"), "advisor");
    const blocked = dispatchAction(JSON.parse(JSON.stringify(pending)) as GameState, "next-month");
    expect(blocked.totalMonths).toBe(8);
    const paid = choosePayment(blocked, "confirm");
    const next = dispatchAction(JSON.parse(JSON.stringify(paid)) as GameState, "next-month");
    expect(next.totalMonths).toBe(9);
    expect(next.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(next.advisorProgressState.funding).toBe(93.5);
    expect(next.eventQueue.some((event) => event.journalFeePreview)).toBe(false);
  });
});
