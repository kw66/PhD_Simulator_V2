import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getLabPayroll, settleLabPayroll } from "../src/core/v2-lab-payroll";
import { settleConferenceRegistrationFees, settleFellowConferenceFees, settleJournalPublicationFees } from "../src/core/v2-lab-publication-costs";
import { CONFERENCE_REGISTRATION_FEE, CONFERENCE_TRAVEL_FEES } from "../src/core/v2-publication-fees";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import * as conferenceCatalog from "../src/core/v2-conference-catalog";
import { getPaperConferenceTripId } from "../src/core/v2-conference-identity";
import { applyPaperReviewSettlement } from "../src/core/v2-publication-system";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { creditFellowMoney, getFellowFinanceAccount, payFellowResearchCost } from "../src/core/v2-fellow-finance";
import { advanceSharedLabProject, getAdvisorHorizontalReward } from "../src/core/v2-lab-projects";
import { settleFellowAcademicYear } from "../src/core/v2-fellow-lifecycle";
import type { AdvisorGrantId, GameState, JournalTarget, Paper } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 4, totalMonths: 4, eventQueue: [], conferenceLocationSeed: 0,
    advisorProgressState: { ...base.advisorProgressState, funding: 100 },
    fellowProgressState: [0, 1, 4].map((academicYear) => createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: 1, academicYear,
      identitySeed: String(academicYear),
      degree: academicYear === 4 ? "phd" : "master", research: 6, affinity: 1,
    })),
  };
}

function conferencePaper(id: string, leadAuthorId = "fellow-departed", patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, leadAuthorId, leadAuthorName: leadAuthorId,
    target: "C", status: "published", submittedMonth: 1, submittedYear: 1,
    acceptedTotalMonths: 4, conferenceAvailableAtTotalMonths: 7, conferenceHandled: false, ...patch };
}

afterEach(() => vi.restoreAllMocks());

describe("lab finances", () => {
  it("settles fixed wages and living costs in separate student wallets and exempts pre-enrollment", () => {
    const state = makeState();
    state.advisorProgressState.awards = [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }];
    expect(getLabPayroll(state)).toMatchObject({ player: { payment: 1.5 }, total: 6.5 });
    let next = settleLabPayroll(state);
    expect(next.advisorProgressState.funding).toBe(93.5);
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 0.5, 2.5]);
    next = settleLabPayroll({ ...next, totalMonths: 5, month: 5 });
    expect(next.advisorProgressState.funding).toBe(87);
    expect(next.fellowProgressState.map((profile) => getFellowFinanceAccount(next, profile.id).money)).toEqual([0, 1, 5]);
  });

  it("retains outgoing fellows' registration fees without travel charges", () => {
    const state = makeState();
    const fellow = state.fellowProgressState[1]!;
    const papers = [0, 1].map((index) => ({ ...createDraftPaper(1, index, () => 0),
      leadAuthorId: fellow.id, leadAuthorName: "同学", target: "C" as const, status: "published" as const,
      submittedMonth: 1, submittedYear: 1, conferenceHandled: false, conferenceAvailableAtTotalMonths: 5,
    }));
    state.fellowPapers = papers;
    state.externalPublications = [{ ...papers[0]!, nonFirstAuthor: true }];
    const registered = settleConferenceRegistrationFees(state);
    expect(registered.advisorProgressState.funding).toBe(98);
    const departed = endRelationship(registered, fellow.id);
    expect(settleFellowConferenceFees(departed)).toBe(departed);
    const total = 2;
    const next = settleFellowConferenceFees({ ...departed, totalMonths: 5 });
    expect(next.advisorProgressState.funding).toBe(100 - total);
    expect(next.fellowPapers!.every((paper) => paper.conferenceHandled)).toBe(true);
    expect(next.externalPublications[0]!.conferenceHandled).toBe(true);
    expect(next.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(papers.map((paper) => paper.id));
    expect(next.advisorProgressState.paidFellowConferencePaperIds).toEqual(papers.map((paper) => paper.id));
    expect(next.advisorProgressState.paidFellowConferenceTrips).toHaveLength(1);
    expect(next.fellowFinanceAccounts).toEqual(departed.fellowFinanceAccounts);
    expect(next.player).toEqual(departed.player);
    expect(settleFellowConferenceFees(next)).toBe(next);
  });

  it.each(["pami", "nmi", "nature"] as const)("queues one payment event for player %s without charging either balance", (journalTarget: JournalTarget) => {
    const state = makeState();
    const paper = { ...createDraftPaper(1, 0, () => 0), journalTarget, status: "published" as const };
    state.papers = [paper];
    state.externalPublications = [paper];
    const next = settleJournalPublicationFees(state);
    expect(next.advisorProgressState.funding).toBe(100);
    expect(next.eventQueue).toHaveLength(1);
    expect(next.eventQueue[0]).toMatchObject({ blocking: true, journalFeePreview: { paperId: paper.id, stage: "act1" } });
    expect(next.advisorProgressState.paidJournalPaperIds ?? []).toEqual([]);
    expect(next.player).toEqual(state.player);
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

  it("ends the run only when necessary salary payments leave negative funds", () => {
    const state = makeState();
    state.advisorProgressState.funding = 3;
    const next = evaluateCoreEndings(settleLabPayroll(state));
    expect(next).toMatchObject({ phase: "finished", ending: "lab-bankrupt", advisorProgressState: { funding: -1.5 } });
    expect(next.player.money).toBe(state.player.money);
    expect(evaluateCoreEndings({ ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0.25 } }).phase).toBe("playing");
    expect(evaluateCoreEndings({ ...state, advisorProgressState: { ...state.advisorProgressState, funding: 0 } }).phase).toBe("playing");
  });

  it("allows horizontal work to refill funds after an experiment leaves zero", () => {
    const state = makeState();
    state.advisorProgressState.funding = 3;
    state.advisorProgressState.horizontalProgress = 99;
    state.fellowProgressState = state.fellowProgressState.slice(1);
    state.fellowProgressState[0]!.nextMonthlyAction = "research";
    state.fellowProgressState[1]!.nextMonthlyAction = "project";
    state.fellowPapers = state.fellowProgressState.map((profile, index) => ({ ...createDraftPaper(1, index, () => 0),
      leadAuthorId: profile.id, createdTotalMonths: 1, idea: 5 }));
    const next = evaluateCoreEndings(advanceFellowResearch(state, () => 0.5));
    expect(next.phase).toBe("playing");
    expect(next.advisorProgressState.funding).toBe(42.5);
  });

  it("uses lab funding then personal money and does not partially pay an unaffordable experiment", () => {
    let state = makeState();
    const fellow = state.fellowProgressState[1]!;
    state.advisorProgressState.funding = 1.25;
    state = creditFellowMoney(state, fellow.id, 3.5);
    const paid = payFellowResearchCost(state, fellow.id, 3);
    expect(paid).toMatchObject({ paid: true, labCost: 1.25, personalCost: 1.75 });
    expect(paid.state.advisorProgressState.funding).toBe(0);
    expect(getFellowFinanceAccount(paid.state, fellow.id).money).toBe(1.75);
    const unpaid = payFellowResearchCost(paid.state, fellow.id, 3);
    expect(unpaid).toMatchObject({ paid: false, state: paid.state });
    expect(unpaid.state).toBe(paid.state);
    expect(unpaid).toMatchObject({ labCost: 0, personalCost: 0 });
    expect(unpaid.state.advisorProgressState.funding).toBe(0);
    expect(getFellowFinanceAccount(unpaid.state, fellow.id).money).toBe(1.75);
    expect(evaluateCoreEndings(unpaid.state).phase).toBe("playing");
  });

  it("pays every current fellow at completion regardless of participation and excludes departed fellows", () => {
    const initial = makeState();
    const first = initial.fellowProgressState[1]!;
    const second = initial.fellowProgressState[2]!;
    let state = advanceSharedLabProject(initial, "horizontal", 40, () => 0).state;
    state = advanceSharedLabProject(state, "horizontal", 20, () => 0).state;
    state = endRelationship(state, first.id);
    state = advanceSharedLabProject(state, "horizontal", 50, () => 0).state;
    expect(state.advisorProgressState.funding).toBe(142.5);
    expect(getFellowFinanceAccount(state, first.id).money).toBe(0);
    expect(getFellowFinanceAccount(state, second.id).money).toBe(2.5);
    expect(getFellowFinanceAccount(state, initial.fellowProgressState[0]!.id).money).toBe(2.5);
    state = advanceSharedLabProject(state, "horizontal", 90, () => 0).state;
    expect(state.advisorProgressState.funding).toBe(185);
    expect(getFellowFinanceAccount(state, first.id).money).toBe(0);
    expect(getFellowFinanceAccount(state, second.id).money).toBe(5);
  });

  it.each([
    [null, 50], ["youth", 60], ["general", 70], ["excellent", 80], ["distinguished", 90], ["academician", 100],
  ] satisfies Array<[AdvisorGrantId | null, number]>)("uses rank %s reward %s and pays five percent to every current member", (award, reward) => {
    const state = makeState();
    state.advisorProgressState.awards = award ? [{ id: award, awardedYear: 2023, startYear: 2024, endYear: 2025 }] : [];
    const before = structuredClone(state);
    expect(getAdvisorHorizontalReward(state.advisorProgressState)).toBe(reward);
    const completed = advanceSharedLabProject(state, "horizontal", 205, () => 0);
    expect(completed.completed).toBe(2);
    expect(completed.state.advisorProgressState.horizontalProgress).toBe(5);
    expect(completed.state.advisorProgressState.funding).toBe(100 + reward * 1.6);
    expect(completed.state.player.money).toBe(state.player.money + reward * 0.1);
    expect(completed.state.fellowProgressState.map((profile) => getFellowFinanceAccount(completed.state, profile.id).money))
      .toEqual([reward * 0.1, reward * 0.1, reward * 0.1]);
    expect(state).toEqual(before);
  });

  it("keeps the highest awarded rank after grant expiration and uses rank at completion", () => {
    const state = advanceSharedLabProject(makeState(), "horizontal", 99, () => 0).state;
    state.advisorProgressState.awards = [
      { id: "general", awardedYear: 2020, startYear: 2021, endYear: 2022 },
      { id: "youth", awardedYear: 2020, startYear: 2021, endYear: 2022 },
    ];
    const next = advanceSharedLabProject(state, "horizontal", 1, () => 0).state;
    expect(next.advisorProgressState.funding).toBe(156);
    expect(next.player.money).toBe(state.player.money + 3.5);
  });

  it("preserves a living-cost reserve during optional research spending", () => {
    const state = makeState();
    const fellow = state.fellowProgressState[1]!;
    state.advisorProgressState.funding = 0;
    const wallet = creditFellowMoney(state, fellow.id, 3.99);
    expect(payFellowResearchCost(wallet, fellow.id, 3)).toMatchObject({ paid: false, state: wallet });
    const paid = payFellowResearchCost(creditFellowMoney(wallet, fellow.id, 0.01), fellow.id, 3);
    expect(paid).toMatchObject({ paid: true, labCost: 0, personalCost: 3 });
    expect(getFellowFinanceAccount(paid.state, fellow.id).money).toBe(1);
  });

  it("switches an unaffordable experiment to horizontal work without partially spending either balance", () => {
    let state = makeState();
    const fellow = state.fellowProgressState[1]!;
    state.fellowProgressState = [{ ...fellow, nextMonthlyAction: "research" }];
    state.advisorProgressState.funding = 1.25;
    state = creditFellowMoney(state, fellow.id, 1.5);
    const paper = { ...createDraftPaper(1, 0, () => 0), leadAuthorId: fellow.id, createdTotalMonths: 1,
      idea: 5, experiment: 0, writing: 0, prepublicationDecayRate: 0 };
    state.fellowPapers = [paper];
    const snapshot = structuredClone(state);
    const next = advanceFellowResearch(state, () => 0);
    expect(next.advisorProgressState.funding).toBe(1.25);
    expect(getFellowFinanceAccount(next, fellow.id).money).toBe(1.5);
    expect(next.advisorProgressState.horizontalProgress).toBe(fellow.research);
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain("经费不足，横向");
    expect(next.fellowPapers![0]!.experiment).toBe(0);
    expect(next.player).toEqual(state.player);
    expect(evaluateCoreEndings(next).phase).toBe("playing");
    expect(state).toEqual(snapshot);
  });

  it.each(["stop", "graduate"])("retains %s student savings and registration records with free later proxy", (departure) => {
    let state = makeState();
    const fellow = state.fellowProgressState[1]!;
    fellow.academicYear = 3;
    fellow.initialResearchScore = 1;
    state.month = 10;
    state.totalMonths = 10;
    state.advisorProgressState.funding = 100;
    state = creditFellowMoney(state, fellow.id, 10);
    state.fellowPapers = [{ ...createDraftPaper(1, 0, () => 0), leadAuthorId: fellow.id, target: "C", status: "published",
      submittedMonth: 1, submittedYear: 1, conferenceHandled: false, conferenceAvailableAtTotalMonths: 11 }];
    state = settleConferenceRegistrationFees(state);
    state = departure === "stop" ? endRelationship(state, fellow.id) : settleFellowAcademicYear(state);
    expect(state.fellowProgressState.some((entry) => entry.id === fellow.id)).toBe(false);
    const fee = 1;
    expect(settleFellowConferenceFees(state)).toBe(state);
    const paid = settleFellowConferenceFees({ ...state, totalMonths: 11, month: 11 });
    expect(paid.advisorProgressState.funding).toBe(100 - fee);
    expect(getFellowFinanceAccount(paid, fellow.id).money).toBe(10);
    expect(paid.player).toEqual(state.player);
    expect(settleFellowConferenceFees(paid)).toBe(paid);
  });
});

describe("automatic fellow conference registration", () => {
  it("records each fellow's registration without travel in their monthly card and preserves research activity", () => {
    const state = makeState();
    const first = state.fellowProgressState[1]!;
    const second = state.fellowProgressState[2]!;
    state.fellowPapers = [conferencePaper("one", first.id), conferencePaper("two", first.id), conferencePaper("three", second.id)];
    const paid = settleConferenceRegistrationFees(state);
    expect(paid.fellowProgressState.find((profile) => profile.id === first.id)!.monthlyPublicationCosts)
      .toEqual({ totalMonths: 4, registration: 2, journal: 0, sharedTravel: 0 });
    expect(paid.fellowProgressState.find((profile) => profile.id === second.id)!.monthlyPublicationCosts)
      .toEqual({ totalMonths: 4, registration: 1, journal: 0, sharedTravel: 0 });
    const acted = advanceFellowResearch(paid, () => 0.5);
    expect(acted.fellowProgressState[1]!.monthlyPublicationCosts).toEqual(paid.fellowProgressState[1]!.monthlyPublicationCosts);
    expect(acted.fellowProgressState[1]!.monthlyActivity).toBeTruthy();
    expect(settleFellowConferenceFees(acted)).toBe(acted);
  });

  it("pays player registration at acceptance and never repeats it at the conference due date", () => {
    const initial = makeState();
    initial.papers = [conferencePaper("accepted", "player", { status: "reviewing", conferenceAvailableAtTotalMonths: undefined })];
    const accepted = applyPaperReviewSettlement(initial, {
      paperId: "accepted", target: "C", accepted: true, acceptType: "Poster", submittedScore: 100,
      totalReviewScore: 3, borderlineChance: null, venueInfluence: 1, reviewStrictnessMultiplier: 1,
      scoreGain: 1, reviewerSanChange: 0, reports: [],
    });
    expect(accepted.externalPublications[0]!.conferenceAvailableAtTotalMonths).toBe(7);
    expect(CONFERENCE_REGISTRATION_FEE).toBe(1);
    for (const totalMonths of [4, 5, 6]) {
      const early = { ...accepted, month: totalMonths, totalMonths };
      expect(settleConferenceRegistrationFees(early)).toBe(early);
    }
    const due = { ...accepted, month: 7, totalMonths: 7,
      externalPublications: accepted.externalPublications.map((paper) => ({ ...paper, conferenceHandled: true })) };
    const snapshot = structuredClone(due);
    const paid = settleConferenceRegistrationFees(due);
    expect(paid).toBe(due);
    expect(paid.advisorProgressState.funding).toBe(99);
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["accepted"]);
    expect(paid.advisorProgressState.paidFellowConferencePaperIds ?? []).toEqual([]);
    expect(paid.advisorProgressState.paidFellowConferenceTrips ?? []).toEqual([]);
    expect(paid.player).toEqual(due.player);
    expect(paid.eventQueue).toEqual(due.eventQueue);
    expect(settleConferenceRegistrationFees(paid)).toBe(paid);
    expect(due).toEqual(snapshot);
  });

  it.each([["domestic", 2], ["asia", 4], ["west", 6]] as const)("charges only three registrations in %s despite regional travel cost %s", (region, travelFee) => {
    vi.spyOn(conferenceCatalog, "getConferenceLocation").mockReturnValue({ region, city: "测试城市", country: "测试国家" });
    const state = makeState();
    const activeId = state.fellowProgressState[1]!.id;
    state.totalMonths = 7;
    state.month = 7;
    state.fellowFinanceAccounts = { [activeId]: { name: "在校同学", money: 12 }, departed: { name: "离校同学", money: 20 } };
    const papers = [conferencePaper("active-1", activeId), conferencePaper("active-2", activeId),
      conferencePaper("departed", "departed", { nonFirstAuthor: true })];
    state.papers = papers.map((paper) => ({ ...paper }));
    state.fellowPapers = papers.map((paper) => ({ ...paper }));
    state.externalPublications = papers.map((paper) => ({ ...paper }));
    const snapshot = structuredClone(state);
    const registered = settleConferenceRegistrationFees(state);
    const paid = settleFellowConferenceFees(registered);
    expect(CONFERENCE_TRAVEL_FEES[region]).toBe(travelFee);
    expect(paid.advisorProgressState).toMatchObject({ funding: 97,
      paidConferenceRegistrationPaperIds: papers.map((paper) => paper.id),
      paidFellowConferencePaperIds: papers.map((paper) => paper.id),
      paidFellowConferenceTrips: [getPaperConferenceTripId(papers[0]!, state.conferenceLocationSeed)],
    });
    for (const collection of [paid.papers, paid.fellowPapers!, paid.externalPublications]) {
      expect(collection).toHaveLength(3);
      expect(collection.every((paper) => paper.conferenceHandled && paper.conferenceHandledAtTotalMonths === 7)).toBe(true);
    }
    expect(paid.player).toEqual(state.player);
    expect(paid.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
    expect(paid.eventQueue).toEqual([]);
    expect(settleFellowConferenceFees(paid)).toBe(paid);
    expect(settleConferenceRegistrationFees(paid)).toBe(paid);
    expect(state).toEqual(snapshot);
  });

  it("handles registered papers at no extra cost and charges later same-conference registrations once", () => {
    let state = makeState();
    state.totalMonths = 7;
    state.externalPublications = [conferencePaper("first")];
    const registered = settleConferenceRegistrationFees(state);
    expect(registered.advisorProgressState.funding).toBe(99);
    expect(registered.externalPublications[0]!.conferenceHandled).toBe(false);
    const traveled = settleFellowConferenceFees(registered);
    expect(traveled.advisorProgressState.funding).toBe(99);
    state = JSON.parse(JSON.stringify(traveled)) as GameState;
    state.totalMonths = 8;
    state.month = 8;
    state.externalPublications.push(conferencePaper("later", "other-departed", { acceptedTotalMonths: 5, conferenceAvailableAtTotalMonths: 8 }));
    const later = settleFellowConferenceFees(settleConferenceRegistrationFees(state));
    expect(later.advisorProgressState.funding).toBe(98);
    expect(later.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "later"]);
    expect(later.advisorProgressState.paidFellowConferencePaperIds).toEqual(["first", "later"]);
    expect(later.advisorProgressState.paidFellowConferenceTrips).toHaveLength(1);
    expect(later.externalPublications[1]).toMatchObject({ conferenceHandled: true, conferenceHandledAtTotalMonths: 8 });
    expect(settleFellowConferenceFees(later)).toBe(later);
  });

  it.each(["name", "year", "city"] as const)("records a separate conference when %s changes without adding travel cost", (changedField) => {
    const location = vi.spyOn(conferenceCatalog, "getConferenceLocation")
      .mockReturnValue({ region: "domestic", city: "北京", country: "中国" });
    const state = makeState();
    state.totalMonths = 19;
    state.externalPublications = [conferencePaper("first")];
    const paid = settleFellowConferenceFees(settleConferenceRegistrationFees(state));
    expect(paid.advisorProgressState.funding).toBe(99);
    const changed = conferencePaper("different", "another-fellow", {
      submittedMonth: changedField === "name" ? 2 : 1,
      submittedYear: changedField === "year" ? 2 : 1,
      conferenceAvailableAtTotalMonths: 20,
    });
    if (changedField === "city") location.mockReturnValue({ region: "domestic", city: "上海", country: "中国" });
    const later = settleFellowConferenceFees(settleConferenceRegistrationFees({ ...paid, totalMonths: 20,
      externalPublications: [...paid.externalPublications, changed] }));
    expect(later.advisorProgressState.funding).toBe(98);
    expect(new Set(later.advisorProgressState.paidFellowConferenceTrips).size).toBe(2);
    expect(later.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["first", "different"]);
    expect(later.advisorProgressState.paidFellowConferencePaperIds).toEqual(["first", "different"]);
  });

  it("does not retroactively charge registration in the free proxy handler", () => {
    const state = makeState();
    state.totalMonths = 7;
    const paper = conferencePaper("travel-paid", "fellow-departed", { conferenceHandled: true });
    state.externalPublications = [paper];
    state.advisorProgressState.paidFellowConferencePaperIds = [paper.id];
    state.advisorProgressState.paidFellowConferenceTrips = [getPaperConferenceTripId(paper, state.conferenceLocationSeed)!];
    const paid = settleFellowConferenceFees(state);
    expect(paid.advisorProgressState.funding).toBe(100);
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toBeUndefined();
    expect(paid.advisorProgressState.paidFellowConferenceTrips).toEqual(state.advisorProgressState.paidFellowConferenceTrips);
    expect(settleFellowConferenceFees(paid)).toBe(paid);
  });

  it("handles only fellow attendance after both registrations have been paid", () => {
    const state = makeState();
    state.totalMonths = 7;
    state.externalPublications = [conferencePaper("player-paper", "player"), conferencePaper("fellow-paper")];
    const registered = settleConferenceRegistrationFees(state);
    const paid = settleFellowConferenceFees(registered);
    expect(paid.advisorProgressState.funding).toBe(98);
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["player-paper", "fellow-paper"]);
    expect(paid.advisorProgressState.paidFellowConferencePaperIds).toEqual(["fellow-paper"]);
    expect(paid.externalPublications.map((paper) => paper.conferenceHandled)).toEqual([false, true]);
    expect(paid.player).toEqual(state.player);
  });

  it.each([0, 0.99, 1])("settles registration at funding %s and only negative balances cause bankruptcy", (funding) => {
    const state = makeState();
    state.totalMonths = 7;
    state.advisorProgressState.funding = funding;
    state.externalPublications = [conferencePaper("registered", "fellow-departed")];
    const paid = settleConferenceRegistrationFees(state);
    expect(paid.advisorProgressState.funding).toBe(Math.round((funding - 1) * 100) / 100);
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["registered"]);
    expect(paid.player).toEqual(state.player);
    expect(evaluateCoreEndings(paid)).toMatchObject(funding < 1
      ? { phase: "finished", ending: "lab-bankrupt" } : { phase: "playing", ending: null });
  });

  it.each([0, 0.99, 1, 2.99, 3])("settles only registration at funding %s without falling back to wallets", (funding) => {
    vi.spyOn(conferenceCatalog, "getConferenceLocation").mockReturnValue({ region: "domestic", city: "北京", country: "中国" });
    const state = makeState();
    state.totalMonths = 7;
    state.advisorProgressState.funding = funding;
    state.fellowFinanceAccounts = { "fellow-departed": { name: "离校同学", money: 100 } };
    state.externalPublications = [conferencePaper("fellow-paper")];
    const paid = settleFellowConferenceFees(settleConferenceRegistrationFees(state));
    expect(paid.advisorProgressState.paidConferenceRegistrationPaperIds).toEqual(["fellow-paper"]);
    expect(paid.advisorProgressState.funding).toBe(Math.round((funding - 1) * 100) / 100);
    expect(paid.advisorProgressState.paidFellowConferencePaperIds ?? []).toEqual(funding < 1 ? [] : ["fellow-paper"]);
    expect(paid.externalPublications[0]!.conferenceHandled).toBe(funding >= 1);
    expect(paid.player).toEqual(state.player);
    expect(paid.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
    expect(evaluateCoreEndings(paid)).toMatchObject(funding < 1
      ? { phase: "finished", ending: "lab-bankrupt" } : { phase: "playing", ending: null });
    expect(settleFellowConferenceFees(paid)).toBe(paid);
  });

  it.each([
    { status: "draft" }, { status: "reviewing" }, { journalTarget: "pami" },
    { publication: { journalTarget: "nature", citations: 0, effectiveScore: 200, citationDebuffMultiplier: 1 } },
    { leadAuthorId: "lover:1" }, { leadAuthorId: "player", nonFirstAuthor: true },
    { leadAuthorId: undefined, nonFirstAuthor: true }, { target: null }, { submittedMonth: null },
  ] satisfies Partial<Paper>[])("excludes ineligible conference publication %j", (patch) => {
    const state = makeState();
    state.totalMonths = 7;
    state.externalPublications = [conferencePaper("ineligible", "fellow-departed", patch)];
    expect(settleConferenceRegistrationFees(state)).toBe(state);
    expect(settleFellowConferenceFees(state)).toBe(state);
  });
});
