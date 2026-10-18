import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { captureAcademicYear, normalizeAcademicArchive } from "../src/core/v2-rewinder-academic-record";
import { getAvailableAcademicYears, initializeAcademicRun } from "../src/core/v2-rewinder-academic";
import { applyPublicationTalentRewards, getPublicationTalentChecklist } from "../src/core/v2-publication-talent";
import { getCalendarForTotalMonths, getGraduationScoreTarget, getMonthLimitByDegree } from "../src/core/v2-progression";
import { prepareThesisBlindReview, syncThesisState, THESIS_REVIEW_THRESHOLDS } from "../src/core/v2-thesis-rules";
import type { AcademicArchive } from "../src/core/v2-rewinder-academic-record";
import type { GameState } from "../src/core/v2-types";

function yearEnd(year: number, degree: "master" | "phd" = "phd"): GameState {
  const base = createStartedGameState("rewinder");
  return initializeAcademicRun({ ...base, year, month: 12, totalMonths: year * 12,
    playerName: "林知秋", selectedAdvisorName: "陈老师", degree, phdStartYear: degree === "phd" ? 3 : null,
    maxMonths: getMonthLimitByDegree(degree), graduationScoreTarget: getGraduationScoreTarget(degree, "陈老师"),
    availableRandomEvents: [], eventQueue: [], player: { san: 20, research: 8, social: 8, favor: 8, money: 100 },
  })!;
}

describe("academic chapter boundaries and inherited talents", () => {
  it("keeps a completed PhD transfer across August and opens the following September", () => {
    const transferred = yearEnd(2);
    const record = captureAcademicYear(transferred);
    const archive = normalizeAcademicArchive(JSON.parse(JSON.stringify({ version: 1, years: { 2: record } })));
    expect(archive.years[2]).toBeDefined();
    expect(getAvailableAcademicYears(archive)).toContain(3);
    const next = dispatchAction(createInitialState(), "start-game", { roleId: "rewinder", rewinderAcademicArchive: archive, rewinderStartYear: 3 });
    expect(next).toMatchObject({ year: 3, month: 1, totalMonths: 25, degree: "phd", phdStartYear: 3 });
    expect(next.eventQueue.some(event => event.chainId === "before-grad-school")).toBe(false);
  });

  it("archives the fifth August and opens the sixth September with no sixth archive", () => {
    const previous = captureAcademicYear(yearEnd(4));
    const archive: AcademicArchive = { version: 1, years: { 4: previous } };
    let state = initializeAcademicRun(yearEnd(5), archive, 5)!;
    state = { ...state, year: 5, month: 12, totalMonths: 60, eventQueue: [], availableRandomEvents: [] };
    const pending = dispatchAction(state, "next-month");
    expect(pending.rewinderState?.academic?.pending).toBeDefined();
    expect(pending.totalMonths).toBe(60);
    const completed = dispatchAction(pending, "confirm-rewinder-archive").rewinderState!.academic!.completed!;
    const sixth = dispatchAction(createInitialState(), "start-game", { roleId: "rewinder", rewinderStartYear: 6,
      rewinderAcademicArchive: { version: 1, years: { 5: completed } } });
    expect(sixth).toMatchObject({ year: 6, month: 1, totalMonths: 61, degree: "phd" });
    expect(sixth.rewinderState?.academic?.pending).toBeUndefined();
  });

  for (const degree of ["master", "phd"] as const) it(`finishes ${degree} in June without any archive dialog`, () => {
    const totalMonths = getMonthLimitByDegree(degree);
    let state = { ...yearEnd(degree === "master" ? 2 : 5, degree), ...getCalendarForTotalMonths(totalMonths), totalMonths };
    state.rewinderState!.academic!.startYear = state.year;
    state.totalResearchScore = state.graduationScoreTarget!;
    const reviewMonth = totalMonths - 2;
    const prepared = syncThesisState({ ...state, ...getCalendarForTotalMonths(reviewMonth), totalMonths: reviewMonth }, () => 0);
    prepared.thesis.researchPoints = prepared.thesis.researchPoints.map(point => ({ ...point, score: Math.ceil(THESIS_REVIEW_THRESHOLDS[degree].B / 3) }));
    const reviewed = prepareThesisBlindReview(prepared, () => 0);
    state = { ...state, thesis: { ...reviewed.thesis, reviewResolved: true } };
    const finished = dispatchAction(state, "next-month");
    expect(finished).toMatchObject({ phase: "finished", ending: degree, totalMonths });
    expect(finished.rewinderState?.academic?.pending).toBeUndefined();
    expect(finished.rewinderState?.academic?.completed).toBeUndefined();
  });

  it("keeps inherited publication talents visibly lit without awarding them again", () => {
    const state = yearEnd(1, "master");
    state.publicationTalentState = { claimedIds: ["first-nature"] };
    expect(getPublicationTalentChecklist(state).find(item => item.id === "first-nature")?.completed).toBe(true);
    const rewarded = applyPublicationTalentRewards(state);
    expect(rewarded.player).toEqual(state.player);
    expect(rewarded.researchCapacityState).toEqual(state.researchCapacityState);
  });
});
