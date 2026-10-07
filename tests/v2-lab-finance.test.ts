import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { settleFellowConferenceFees, settleJournalPublicationFees, getPendingFellowConferenceFees } from "../src/core/v2-lab-publication-costs";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getConferenceLocation } from "../src/core/v2-conference-catalog";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import type { GameState, JournalTarget } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 4, totalMonths: 4, eventQueue: [],
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [0, 1, 4].map((academicYear) => createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: 1, academicYear,
      degree: academicYear === 4 ? "phd" : "master", research: 6, affinity: 1,
    })),
  };
}

describe("lab finances", () => {
  it("pays students only, exempts pre-enrollment, and accumulates each student's fractional wages", () => {
    const state = makeState();
    state.advisorProgressState.awards = [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }];
    expect(getLabPayroll(state)).toMatchObject({ player: { payment: 1, remainder: 0.25 }, total: 5 });
    let next = settleLabPayroll(state);
    expect(next.advisorProgressState.funding).toBe(95);
    expect(next.fellowProgressState.map((profile) => profile.salaryRemainder)).toEqual([0, 0.25, 0.5]);
    next = settleLabPayroll({ ...next, totalMonths: 5, month: 5 });
    expect(next.advisorProgressState.funding).toBe(89);
    expect(next.fellowProgressState.map((profile) => profile.salaryRemainder)).toEqual([0, 0.5, 0]);
  });

  it("retains outgoing fellows' fees, charging registration per paper and travel once per author and venue", () => {
    const state = makeState();
    const fellow = state.fellowProgressState[1]!;
    const papers = [0, 1].map((index) => ({ ...createDraftPaper(1, index, () => 0),
      leadAuthorId: fellow.id, leadAuthorName: "同学", target: "C" as const, status: "published" as const,
      submittedMonth: 1, submittedYear: 1, conferenceHandled: false, conferenceAvailableAtTotalMonths: 5,
    }));
    state.fellowPapers = papers;
    state.externalPublications = [{ ...papers[0]!, nonFirstAuthor: true }];
    const departed = endRelationship(state, fellow.id);
    expect(settleFellowConferenceFees(departed)).toBe(departed);
    const region = getConferenceLocation(1, "C", 1, state.conferenceLocationSeed).region;
    const total = 2 + ({ domestic: 1, asia: 3, west: 5 })[region];
    expect(getPendingFellowConferenceFees(departed)).toBe(total);
    const next = settleFellowConferenceFees({ ...departed, totalMonths: 5 });
    expect(next.advisorProgressState.funding).toBe(100 - total);
    expect(next.fellowPapers!.every((paper) => paper.conferenceHandled)).toBe(true);
    expect(next.externalPublications[0]!.conferenceHandled).toBe(true);
    expect(getPendingFellowConferenceFees(next)).toBe(0);
    expect(settleFellowConferenceFees(next)).toBe(next);
  });

  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("queues player %s publication fee %s without automatic lab payment", (journalTarget: JournalTarget, fee) => {
    const state = makeState();
    const paper = { ...createDraftPaper(1, 0, () => 0), journalTarget, status: "published" as const };
    state.papers = [paper];
    state.externalPublications = [paper];
    const next = settleJournalPublicationFees(state);
    expect(next.advisorProgressState.funding).toBe(100);
    expect(next.eventQueue).toHaveLength(1);
    expect(next.eventQueue[0]).toMatchObject({ title: "期刊版面费", blocking: true, deadlineMonths: 0 });
    expect(next.eventQueue[0]!.description).toContain(`${fee} 金币`);
    expect(next.advisorProgressState.paidJournalPaperIds).toBeUndefined();
    expect(settleJournalPublicationFees(next)).toBe(next);
  });

  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("pays departed fellow %s publication fee %s exactly once", (journalTarget: JournalTarget, fee) => {
    const state = makeState();
    const fellow = state.fellowProgressState[1]!;
    const paper = { ...createDraftPaper(1, 0, () => 0), journalTarget, status: "published" as const,
      leadAuthorId: fellow.id, leadAuthorName: "同学", nonFirstAuthor: true };
    state.fellowPapers = [paper];
    state.externalPublications = [paper];
    const next = settleJournalPublicationFees(endRelationship(state, fellow.id));
    expect(next.advisorProgressState.funding).toBe(100 - fee);
    expect(next.eventQueue).toHaveLength(0);
    expect(next.advisorProgressState.paidJournalPaperIds).toEqual([paper.id]);
    expect(settleJournalPublicationFees(next)).toBe(next);
  });

  it("ends the run at zero funds without inventing unpaid salaries or charging the player's wallet", () => {
    const state = makeState();
    state.advisorProgressState.funding = 5;
    const next = evaluateCoreEndings(settleLabPayroll(state));
    expect(next).toMatchObject({ phase: "finished", ending: "lab-bankrupt", advisorProgressState: { funding: 0 } });
    expect(next.player.money).toBe(state.player.money);
    expect(evaluateCoreEndings({ ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0.25 } }).phase).toBe("playing");
  });

  it("does not let a later project rescue a balance already exhausted by an earlier experiment", () => {
    const state = makeState();
    state.advisorProgressState.funding = 3;
    state.advisorProgressState.horizontalProgress = 99;
    state.fellowProgressState = state.fellowProgressState.slice(1);
    state.fellowProgressState[0]!.nextMonthlyAction = "research";
    state.fellowProgressState[1]!.nextMonthlyAction = "project";
    state.fellowPapers = state.fellowProgressState.map((profile, index) => ({ ...createDraftPaper(1, index, () => 0),
      leadAuthorId: profile.id, createdTotalMonths: 1, idea: 5 }));
    const next = evaluateCoreEndings(advanceFellowResearch(state, () => 0.5));
    expect(next).toMatchObject({ phase: "finished", ending: "lab-bankrupt", advisorProgressState: { funding: 0, horizontalProgress: 99 } });
  });
});
