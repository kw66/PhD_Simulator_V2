import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    selectedAdvisorName: "Test advisor",
    totalMonths: 1, year: 1, month: 1,
    availableRandomEvents: [], usedRandomEvents: [], eventQueue: [], illnessProbability: 0,
    player: { ...base.player, san: 30, money: 100 },
  };
}

function nextMonth(state: GameState): GameState {
  return dispatchAction({ ...state, eventQueue: [] }, "next-month");
}

function publishedPaper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "A", conferenceHandled: true, ...patch };
}

function junior() {
  return createCustomFellowProgressProfile({
    type: "junior", gender: "female", research: 10, affinity: 2, startTotalMonths: 1, name: "Test junior",
  });
}

describe("advisor engine integration", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it("enters the first September without consuming mentor funding or applying growth", () => {
    const initial = makeState();
    const state = {
      ...initial, totalMonths: 0, month: 0,
      advisorProgressState: { ...initial.advisorProgressState, funding: 5 },
    };
    const enrolled = dispatchAction(state, "next-month");
    expect(enrolled).toMatchObject({ totalMonths: 1, month: 1, year: 1 });
    expect(enrolled.advisorProgressState).toMatchObject({ researchAccumulation: 20, funding: 5, pendingApplication: null });
    expect(nextMonth(enrolled).advisorProgressState).toMatchObject({ researchAccumulation: 21, funding: 4 });
  });

  it("turns five monthly horizontal dispatches into the first March youth application and August award", () => {
    const initial = makeState();
    let state = { ...initial, actionState: { ...initial.actionState, used: initial.actionState.limit } };
    state = dispatchAction(state, "advisor-horizontal");
    expect(state.player.san).toBe(25);
    expect(state.actionState.used).toBe(initial.actionState.limit);
    expect(state.advisorProgressState).toMatchObject({ researchAccumulation: 20, funding: 1 });
    const repeatedPayment = dispatchAction(state, "advisor-horizontal");
    expect(repeatedPayment.player).toEqual(state.player);
    expect(repeatedPayment.advisorProgressState).toEqual(state.advisorProgressState);
    for (let totalMonths = 2; totalMonths <= 7; totalMonths += 1) {
      state = nextMonth(state);
      expect(state.totalMonths).toBe(totalMonths);
      if (totalMonths <= 5) {
        const beforePayment = state;
        state = dispatchAction(state, "advisor-horizontal");
        expect(state.player.san).toBe(beforePayment.player.san - 5);
        expect(state.advisorProgressState.funding).toBe(beforePayment.advisorProgressState.funding + 1);
      }
    }
    expect(state.advisorProgressState).toMatchObject({
      researchAccumulation: 25, funding: 0, awards: [],
      pendingApplication: { id: "youth", calendarYear: 2024, researchSnapshot: 25 },
    });
    for (let totalMonths = 8; totalMonths <= 12; totalMonths += 1) {
      state = nextMonth(state);
      expect(state.totalMonths).toBe(totalMonths);
    }
    expect(state.advisorProgressState).toMatchObject({
      researchAccumulation: 26, funding: 4, pendingApplication: null,
      awards: [{ id: "youth", awardedYear: 2024, startYear: 2025, endYear: 2027 }],
    });
    const repeated = dispatchAction(state, "set-linear-event-blocking", { blockLinearEvents: true });
    expect(repeated.advisorProgressState).toEqual(state.advisorProgressState);
  });

  it("synchronizes publications after dispatch without settling the calendar or crediting duplicates", () => {
    const initial = makeState();
    let state = {
      ...initial,
      papers: [publishedPaper("player-a")],
      externalPublications: [publishedPaper("player-a"), publishedPaper("external-b", { target: "B", leadAuthorId: "former-peer", nonFirstAuthor: true })],
      advisorProgressState: { ...initial.advisorProgressState, funding: 2 },
    };
    for (let repeat = 0; repeat < 3; repeat += 1) state = dispatchAction(state, "set-linear-event-blocking", { blockLinearEvents: true });
    expect(state.advisorProgressState).toMatchObject({ researchAccumulation: 26, funding: 2, countedPaperIds: ["player-a", "external-b"] });
    expect(state.totalMonths).toBe(1);
    expect(state.player).toEqual(initial.player);
    expect(state.actionState).toEqual(initial.actionState);
  });

  it("starts promoted salary at the next monthly payment and records the support talent once", () => {
    const initial = makeState();
    initial.totalMonths = 11;
    initial.month = 11;
    initial.advisorProgressState.pendingApplication = { id: "youth", calendarYear: 2024, researchSnapshot: 25 };
    const august = nextMonth(initial);
    expect(august.player.money - initial.player.money).toBe(1);
    const trigger = august.eventHistory.find((event) => event.id === "talent:advisor-salary:youth:2024");
    expect(trigger?.stages[0]?.talentTrigger).toMatchObject({ name: "导师晋升", effects: ["每月补助+0.25（1→1.25金币）"] });
    const september = nextMonth(august);
    expect(september.player.money - august.player.money).toBe(1);
    expect(september.advisorProgressState.salaryRemainder).toBe(0.25);
    expect(september.eventHistory.filter((event) => event.id === trigger?.id)).toHaveLength(1);
  });

  it("counts a junior-only acceptance during next-month before March growth and selection", () => {
    const initial = makeState();
    const profile = junior();
    const draft = {
      ...createDraftPaper(1, 0, () => 0), id: "junior-acceptance", leadAuthorId: profile.id,
      leadAuthorName: profile.name, idea: 200, experiment: 200, writing: 200, collaborators: [],
    };
    const reviewing = { ...prepareConferenceSubmission(draft, "A", 3, 1), reviewMonthsLeft: 1 };
    const state = {
      ...initial, totalMonths: 6, month: 6,
      fellowProgressState: [profile], fellowPapers: [reviewing],
      advisorProgressState: { ...initial.advisorProgressState, researchAccumulation: 44, funding: 1 },
    };
    const march = dispatchAction(state, "next-month");
    expect(march).toMatchObject({ totalMonths: 7, month: 7, year: 1 });
    expect(march.fellowPapers?.find((paper) => paper.id === reviewing.id)?.status).toBe("published");
    expect(march.externalPublications.some((paper) => paper.id === reviewing.id)).toBe(false);
    expect(march.advisorProgressState).toMatchObject({
      researchAccumulation: 50, funding: 0, countedPaperIds: [reviewing.id],
      pendingApplication: { id: "general", calendarYear: 2024, researchSnapshot: 50 },
    });
    expect(dispatchAction(march, "select-paper", { paperId: "missing" }).advisorProgressState).toEqual(march.advisorProgressState);
  });

  it("preserves credited junior work after stopping cooperation and counts later player coauthored archives only", () => {
    const profile = junior();
    const initial = makeState();
    const earned = publishedPaper("earned", { leadAuthorId: profile.id });
    const state = {
      ...initial, fellowProgressState: [profile], fellowPapers: [earned],
      relationshipState: { ...initial.relationshipState, juniorCount: 1, occupiedSlots: 1 },
    };
    const credited = dispatchAction(state, "set-linear-event-blocking", { blockLinearEvents: true });
    expect(credited.advisorProgressState.researchAccumulation).toBe(24);
    const stopped = dispatchAction(credited, "end-relationship", { relationshipId: profile.id });
    expect(stopped.fellowProgressState).toEqual([]);
    expect(stopped.advisorProgressState).toEqual(credited.advisorProgressState);
    const late = publishedPaper("late-unassisted", { leadAuthorId: profile.id });
    const ignored = dispatchAction({ ...stopped, fellowPapers: [...(stopped.fellowPapers ?? []), late] }, "select-paper", { paperId: "missing" });
    expect(ignored.advisorProgressState).toEqual(credited.advisorProgressState);
    const coauthored = publishedPaper("late-coauthored", { leadAuthorId: profile.id, nonFirstAuthor: true, collaborators: [{ id: "player", name: "Player" }] });
    const archived = dispatchAction({ ...ignored, externalPublications: [coauthored] }, "select-paper", { paperId: "missing" });
    expect(archived.advisorProgressState.researchAccumulation).toBe(28);
    expect(archived.advisorProgressState.countedPaperIds).toEqual([earned.id, coauthored.id]);
  });

  it("does not settle or submit March applications while a blocking event freezes February", () => {
    const initial = makeState();
    const blocker = createEventQueueItem({
      id: "advisor-calendar-blocker", title: "Blocking decision", description: "Resolve before March",
      source: "system", blocking: true, deadlineMonths: 0, chainId: "advisor-calendar-blocker", stage: "act1",
      choices: [{ id: "confirm", label: "Confirm", outcome: "Done", effects: {} }],
    }, 1);
    const state = {
      ...initial, totalMonths: 6, month: 6, eventQueue: [blocker],
      advisorProgressState: { ...initial.advisorProgressState, researchAccumulation: 24, funding: 1 },
    };
    const blocked = dispatchAction(dispatchAction(state, "next-month"), "next-month");
    expect(blocked).toMatchObject({ totalMonths: 6, month: 6 });
    expect(blocked.advisorProgressState).toEqual(state.advisorProgressState);
    const resolved = dispatchAction(blocked, "resolve-event", { eventId: blocker.id, eventChoiceId: "confirm" });
    const march = dispatchAction(resolved, "next-month");
    expect(march.totalMonths).toBe(7);
    expect(march.advisorProgressState).toMatchObject({
      researchAccumulation: 25, funding: 0,
      pendingApplication: { id: "youth", calendarYear: 2024, researchSnapshot: 25 },
    });
  });

  it("resets funding, awards, application deadlines, paper credit and settlement guards for a new game", () => {
    const initial = makeState();
    const progressed: GameState = {
      ...initial, papers: [publishedPaper("old-paper")],
      advisorProgressState: {
        researchAccumulation: 500, funding: 20, countedPaperIds: ["old-paper"], lastSettledTotalMonths: 48, lastHorizontalTotalMonths: 1,
        awards: [{ id: "general", awardedYear: 2024, startYear: 2025, endYear: 2028 }],
        pendingApplication: { id: "distinguished", calendarYear: 2027, researchSnapshot: 500 },
      },
    };
    const reset = dispatchAction(progressed, "reset-game");
    expect(reset.phase).toBe("setup");
    expect(reset.advisorProgressState).toEqual(createInitialState().advisorProgressState);
    expect(reset.selectedAdvisorName).toBeNull();
    expect(reset.papers).toEqual([]);
    const restarted = dispatchAction(reset, "start-game", { roleId: "normal" });
    expect(restarted.advisorProgressState).toMatchObject({ researchAccumulation: 20, funding: 0, awards: [], pendingApplication: null, countedPaperIds: [] });
    const newRun = {
      ...restarted, selectedAdvisorName: "New advisor", totalMonths: 1, month: 1,
      availableRandomEvents: [], usedRandomEvents: [], eventQueue: [], illnessProbability: 0,
      papers: [publishedPaper("old-paper")],
    };
    const funded = dispatchAction(newRun, "advisor-horizontal");
    expect(funded.advisorProgressState).toMatchObject({ researchAccumulation: 24, funding: 1, countedPaperIds: ["old-paper"] });
    expect(nextMonth(funded).advisorProgressState).toMatchObject({ researchAccumulation: 25, funding: 0, awards: [] });
  });
});
