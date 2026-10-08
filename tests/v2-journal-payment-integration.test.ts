import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
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

  it.each(["self", "advisor"] as const)("refreshes %s affordability and allows repeated payment-source switching without charging", (mode) => {
    const published = submit(readyState());
    const confirmation = choosePayment(choosePayment(published, "continue"), mode);
    const depleted = withBalance(confirmation, mode, 4.99);
    const blocked = choosePayment(depleted, "confirm");
    expect(blocked.player).toEqual(depleted.player);
    expect(blocked.advisorProgressState).toEqual(depleted.advisorProgressState);
    expect(paymentEvent(blocked).choices.find((choice) => choice.id === "confirm")!.disabledReason).toBeTruthy();
    const decision = choosePayment(blocked, "change-payment-method");
    expect(paymentEvent(decision).stage).toBe("act2");
    expect(paymentEvent(decision).choices.find((choice) => choice.id === mode)!.disabledReason).toBeTruthy();
    const switched = choosePayment(decision, mode === "self" ? "advisor" : "self");
    const returned = choosePayment(switched, "change-payment-method");
    const restoredConfirmation = choosePayment(withBalance(returned, mode, 5), mode);
    expect(paymentEvent(restoredConfirmation).journalFeePreview?.paymentMode).toBe(mode);
    const paid = choosePayment(restoredConfirmation, "confirm");
    expect(mode === "self" ? paid.player.money : paid.advisorProgressState.funding).toBe(0);
    expect(mode === "self" ? paid.advisorProgressState.funding : paid.player.money).toBe(100);
    expect(paid.player.favor).toBe(published.player.favor);
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(paid.phase).toBe("playing");
  });

  it.each(["self", "advisor"] as const)("refreshes an unaffordable %s confirmation when balance is restored", (mode) => {
    const confirmation = choosePayment(choosePayment(submit(readyState()), "continue"), mode);
    const blocked = choosePayment(withBalance(confirmation, mode, 0), "confirm");
    const paid = choosePayment(withBalance(blocked, mode, 5), "confirm");
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(mode === "self" ? paid.player.money : paid.advisorProgressState.funding).toBe(0);
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
