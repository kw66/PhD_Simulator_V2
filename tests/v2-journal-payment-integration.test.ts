import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import type { GameState, JournalTarget } from "../src/core/v2-types";

function readyState(target: JournalTarget = "pami", month = 8): GameState {
  const base = createStartedGameState("normal");
  const paper = { ...createDraftPaper(1, 0, () => 0), id: `test-${target}`, idea: 200, experiment: 200, writing: 200 };
  return { ...base, ...getCalendarForTotalMonths(month), totalMonths: month, selectedAdvisorName: "导师",
    graduationScoreTarget: 1, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    player: { san: 20, research: 5, favor: 5, social: 5, money: 100 },
    advisorProgressState: { ...base.advisorProgressState, funding: 4 }, papers: [paper] };
}

function submit(state: GameState, target: JournalTarget = "pami"): GameState {
  return dispatchAction(state, "submit-journal-paper", { paperId: state.papers[0]!.id, journalTarget: target });
}

function pay(state: GameState, payer: "self" | "lab"): GameState {
  const event = state.eventQueue.find((entry) => entry.journalFeePaperId)!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: payer });
}

afterEach(() => vi.restoreAllMocks());

describe("journal payment through the engine", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("can personally pay %s fee %s without bankrupting the lab", (target, fee) => {
    const initial = readyState(target);
    const queued = submit(initial, target);
    expect(queued.phase).toBe("playing");
    expect(queued.advisorProgressState.funding).toBe(4);
    const beforeMoney = queued.player.money;
    const paid = pay(queued, "self");
    expect(paid.player.money).toBe(beforeMoney - fee);
    expect(paid.advisorProgressState.funding).toBe(4);
    expect(paid.advisorProgressState.paidJournalPaperIds).toEqual([`test-${target}`]);
    const repeat = dispatchAction(paid, "resolve-event", { eventId: queued.eventQueue[0]!.id, eventChoiceId: "self" });
    expect(repeat.player).toEqual(paid.player);
    expect(repeat.advisorProgressState).toEqual(paid.advisorProgressState);
  });

  it("rechecks both balances when the payment screen remains open", () => {
    const queued = submit(readyState());
    const poor = { ...queued, player: { ...queued.player, money: 4 } };
    const preview = getResolvableQueuedEvent(poor, poor.eventQueue[0]!);
    expect(preview.choices.find((choice) => choice.id === "self")?.disabledReason).toBeTruthy();
    expect(preview.choices.find((choice) => choice.id === "lab")?.disabledReason).toBeUndefined();
    expect(preview.description).toContain("破产");
    expect(pay(poor, "self").player.money).toBe(4);
    expect(pay(poor, "lab")).toMatchObject({ phase: "finished", ending: "lab-bankrupt" });
    const funded = { ...poor, advisorProgressState: { ...poor.advisorProgressState, funding: 6 } };
    const paid = pay(funded, "lab");
    expect(paid.phase).toBe("playing");
    expect(paid.advisorProgressState.funding).toBe(1);
    expect(paid.player.money).toBe(4);
  });

  it("preserves the bankruptcy boundary when an explicit lab payment exhausts funding", () => {
    const queued = submit(readyState());
    const exact = { ...queued, advisorProgressState: { ...queued.advisorProgressState, funding: 5 } };
    expect(getResolvableQueuedEvent(exact, exact.eventQueue[0]!).description).toContain("破产");
    expect(pay(exact, "lab")).toMatchObject({ phase: "finished", ending: "lab-bankrupt" });
  });

  it.each(["next-month", "force-next-month"] as const)("does not bypass payment or graduate via %s", (action) => {
    const queued = submit(readyState("pami", 34));
    const blocked = dispatchAction(queued, action);
    expect(blocked).toMatchObject({ phase: "playing", totalMonths: 34 });
    expect(blocked.eventQueue.filter((event) => event.journalFeePaperId)).toHaveLength(1);
    const paid = pay(blocked, "self");
    expect(dispatchAction(paid, action)).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
  });

  it("retains the fee after save/load and can earn money while it is pending", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const queued = submit(readyState());
    const saved = JSON.parse(JSON.stringify({ ...queued, player: { ...queued.player, money: 4 } })) as GameState;
    const worked = dispatchAction(saved, "part-time-work");
    expect(worked.player.money).toBeGreaterThanOrEqual(5);
    expect(pay(worked, "self").eventQueue.some((event) => event.journalFeePaperId)).toBe(false);
  });
});
