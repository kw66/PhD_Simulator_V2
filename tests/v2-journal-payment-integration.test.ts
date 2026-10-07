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

afterEach(() => vi.restoreAllMocks());

describe("automatic journal payment through the engine", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("automatically pays %s fee %s on publication without a payment event", (target, fee) => {
    const initial = readyState(target);
    const snapshot = structuredClone(initial);
    const paid = submit(initial, target);
    expect(paid).toMatchObject({ phase: "playing", ending: null,
      advisorProgressState: { funding: 100 - fee, paidJournalPaperIds: [`test-${target}`] } });
    expect(paid.externalPublications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `test-${target}`, status: "published", journalTarget: target }),
    ]));
    expect(paid.papers.some((paper) => paper.id === `test-${target}`)).toBe(false);
    expect(paid.player.money).toBe(initial.player.money);
    expect(paid.eventQueue).toEqual([]);
    expect(initial).toEqual(snapshot);
    const repeated = submit(JSON.parse(JSON.stringify(paid)) as GameState, target);
    expect(repeated.advisorProgressState).toEqual(paid.advisorProgressState);
    expect(repeated.player.money).toBe(paid.player.money);
    expect(repeated.eventQueue).toEqual([]);
  });

  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("ends immediately for a negative %s balance but survives exact payment", (target, fee) => {
    for (const funding of [0, fee - 0.01, fee]) {
      const initial = readyState(target);
      initial.advisorProgressState.funding = funding;
      const paid = submit(initial, target);
      expect(paid.advisorProgressState.funding).toBe(Math.round((funding - fee) * 100) / 100);
      expect(paid.advisorProgressState.paidJournalPaperIds).toEqual([`test-${target}`]);
      expect(paid.player.money).toBe(100);
      expect(paid.eventQueue).toEqual([]);
      expect(paid).toMatchObject(funding < fee
        ? { phase: "finished", ending: "lab-bankrupt" } : { phase: "playing", ending: null });
    }
  });

  it.each(["next-month", "force-next-month"] as const)("does not block graduation on an obsolete journal payment via %s", (action) => {
    const paid = submit(readyState("pami", 34));
    expect(paid.advisorProgressState.funding).toBe(95);
    expect(paid.eventQueue).toEqual([]);
    const graduated = dispatchAction(paid, action);
    expect(graduated).toMatchObject({ phase: "finished", ending: "master", totalMonths: 34 });
    expect(graduated.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(graduated.advisorProgressState.funding).toBe(95);
  });

  it.each(["next-month", "force-next-month"] as const)("settles archived unpaid journals before graduation through %s", (action) => {
    const initial = readyState("pami", 34);
    initial.papers = [];
    initial.totalResearchScore = 10;
    initial.externalPublications = [{ ...createDraftPaper(1, 0, () => 0), id: "archived",
      status: "published", journalTarget: "pami" }];
    initial.advisorProgressState.funding = 4;
    const ended = dispatchAction(initial, action);
    expect(ended).toMatchObject({ phase: "finished", ending: "lab-bankrupt", totalMonths: 34,
      advisorProgressState: { funding: -1, paidJournalPaperIds: ["archived"] } });
    expect(ended.player.money).toBe(initial.player.money);
    expect(ended.eventQueue).toEqual([]);
  });

  it.each([4, 5])("charges only when a later revision reaches acceptance with funding %s", (funding) => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const initial = readyState();
    initial.advisorProgressState.funding = funding;
    initial.papers[0] = { ...initial.papers[0]!, idea: 41, experiment: 41, writing: 42 };
    const reviewing = submit(initial);
    expect(reviewing.papers[0]!.status).toBe("journal-reviewing");
    expect(reviewing.advisorProgressState.funding).toBe(funding);
    expect(reviewing.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    expect(reviewing.eventQueue).toEqual([]);
    const published = dispatchAction(reviewing, "research-paper", { paperId: "test-pami", paperActionType: "writing" });
    expect(published.externalPublications[0]).toMatchObject({ id: "test-pami", status: "published" });
    expect(published.advisorProgressState).toMatchObject({ funding: funding - 5, paidJournalPaperIds: ["test-pami"] });
    expect(published.player.money).toBe(initial.player.money);
    expect(published.eventQueue).toEqual([]);
    expect(published).toMatchObject(funding < 5
      ? { phase: "finished", ending: "lab-bankrupt" } : { phase: "playing", ending: null });
  });

  it("advances normally after save/load without charging the publication again", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const paid = submit(readyState());
    const restored = JSON.parse(JSON.stringify(paid)) as GameState;
    const next = dispatchAction(restored, "next-month");
    expect(next.totalMonths).toBe(9);
    expect(next.advisorProgressState.paidJournalPaperIds).toEqual(["test-pami"]);
    expect(next.log.filter((entry) => entry.id.startsWith("journal-fee-"))).toHaveLength(1);
  });
});
