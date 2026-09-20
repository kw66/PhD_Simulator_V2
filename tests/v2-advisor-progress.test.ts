import { describe, expect, it } from "vitest";
import {
  advanceAdvisorHorizontal,
  createAdvisorProgressState,
  getActiveAdvisorGrants,
  getAdvisorGrantLimit,
  getAdvisorMonthlyResearchGrowth,
  getAdvisorRankLabel,
  getEligibleAdvisorGrant,
  settleAdvisorMonth,
  syncAdvisorResearchAccumulation,
} from "../src/core/v2-advisor-progress";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { AdvisorGrantAward, AdvisorProgressState, GameState, Paper } from "../src/core/v2-types";

function makeState(advisor: Partial<AdvisorProgressState> = {}): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    selectedAdvisorName: "Test advisor",
    year: 1, month: 2, totalMonths: 2,
    player: { ...base.player, san: 30 },
    advisorProgressState: { ...createAdvisorProgressState(), ...advisor },
  };
}

function atMonth(state: GameState, totalMonths: number): GameState {
  return { ...state, totalMonths, year: Math.floor((totalMonths - 1) / 12) + 1, month: ((totalMonths - 1) % 12) + 1 };
}

function publishedPaper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "A", ...patch };
}

function junior() {
  return createCustomFellowProgressProfile({
    type: "junior", gender: "female", research: 10, affinity: 2, startTotalMonths: 1, name: "Test junior",
  });
}

const youthAward: AdvisorGrantAward = { id: "youth", awardedYear: 2024, startYear: 2025, endYear: 2027 };
const generalAward: AdvisorGrantAward = { id: "general", awardedYear: 2025, startYear: 2026, endYear: 2029 };
const distinguishedAward: AdvisorGrantAward = { id: "distinguished", awardedYear: 2024, startYear: 2025, endYear: 2029 };
const academicianAward: AdvisorGrantAward = { id: "academician", awardedYear: 2025, startYear: null, endYear: null };

describe("advisor funding and monthly research", () => {
  it("starts each advisor independently at 20 research, zero funding and lecturer rank", () => {
    const first = createAdvisorProgressState();
    expect(first).toMatchObject({ researchAccumulation: 20, funding: 0, awards: [], pendingApplication: null, countedPaperIds: [] });
    expect(getAdvisorRankLabel(first)).toBe("讲师");
    expect(getAdvisorGrantLimit(first)).toBe(1);
    first.awards.push(youthAward);
    first.countedPaperIds.push("old-paper");
    expect(createAdvisorProgressState()).toMatchObject({ awards: [], countedPaperIds: [] });
  });

  it("allows only one horizontal payment per month even with exhausted AP", () => {
    const initial = makeState();
    let state = { ...initial, actionState: { ...initial.actionState, used: initial.actionState.limit } };
    state.buffs = [{ id: "illness", name: "Illness", source: "test", timing: "monthly", remainingMonths: 1, activeOperationSanMultiplier: 2 }];
    for (let payment = 0; payment < 5; payment += 1) state = advanceAdvisorHorizontal(state);
    expect(state.advisorProgressState).toMatchObject({ funding: 1, researchAccumulation: 20, lastHorizontalTotalMonths: 2 });
    expect(state.player).toEqual({ ...initial.player, san: 25 });
    expect(state.actionState).toEqual({ ...initial.actionState, used: initial.actionState.limit });
    expect(state.totalMonths).toBe(2);
    const next = advanceAdvisorHorizontal(atMonth(state, 3));
    expect(next.advisorProgressState).toMatchObject({ funding: 2, lastHorizontalTotalMonths: 3 });
    expect(next.player.san).toBe(20);
  });

  it("accepts exactly five SAN, rejects insufficient SAN, and stops charging at funding 20", () => {
    const initial = makeState({ funding: 19 });
    const funded = advanceAdvisorHorizontal({ ...initial, player: { ...initial.player, san: 5 } });
    expect(funded.player.san).toBe(0);
    expect(funded.advisorProgressState.funding).toBe(20);
    const capped = advanceAdvisorHorizontal(atMonth({ ...funded, player: initial.player }, 3));
    expect(capped.player).toEqual(initial.player);
    expect(capped.advisorProgressState).toEqual(funded.advisorProgressState);
    const insufficient = { ...initial, player: { ...initial.player, san: 4 } };
    expect(advanceAdvisorHorizontal(insufficient).player).toEqual(insufficient.player);
    expect(advanceAdvisorHorizontal(insufficient).advisorProgressState).toEqual(insufficient.advisorProgressState);
    expect(advanceAdvisorHorizontal({ ...advanceAdvisorHorizontal(insufficient), player: initial.player }).advisorProgressState.funding).toBe(20);
  });

  it("does not spend or grow in enrollment September, but does in the next September", () => {
    const initial = makeState({ funding: 2 });
    expect(settleAdvisorMonth(atMonth(initial, 1)).advisorProgressState).toEqual(initial.advisorProgressState);
    expect(settleAdvisorMonth(atMonth(initial, 13)).advisorProgressState).toMatchObject({ funding: 1, researchAccumulation: 21 });
  });

  it("cannot grow without funding, even with a high research score", () => {
    expect(settleAdvisorMonth(makeState({ researchAccumulation: 999 })).advisorProgressState)
      .toMatchObject({ funding: 0, researchAccumulation: 999 });
  });

  it.each([[19, 19], [20, 21], [39, 40], [40, 42], [59, 61], [99, 103]])(
    "spends one funding and floors five percent growth: %i becomes %i",
    (researchAccumulation, expected) => {
      const next = settleAdvisorMonth(makeState({ researchAccumulation, funding: 1 }));
      expect(next.advisorProgressState).toMatchObject({ funding: 0, researchAccumulation: expected });
      expect(getAdvisorMonthlyResearchGrowth(next)).toMatchObject({ funding: expected - researchAccumulation, papers: 0 });
      expect(settleAdvisorMonth(atMonth(next, 3)).advisorProgressState.researchAccumulation).toBe(expected);
    },
  );

  it("settles once and rejects rewound or relabeled calendars at the same total month", () => {
    const initial = atMonth(makeState({ funding: 3 }), 7);
    const settled = settleAdvisorMonth(initial);
    expect(settled.advisorProgressState).toMatchObject({ funding: 2, researchAccumulation: 21 });
    for (const frozen of [settled, atMonth(settled, 6), { ...settled, month: 12 }]) {
      expect(settleAdvisorMonth(frozen).advisorProgressState).toEqual(settled.advisorProgressState);
    }
    expect(settleAdvisorMonth(atMonth(settled, 8)).advisorProgressState).toMatchObject({ funding: 1, researchAccumulation: 22 });
  });

  it("leaves mentor actions and settlement inactive before selection or outside play", () => {
    const initial = makeState({ funding: 3 });
    for (const state of [{ ...initial, selectedAdvisorName: null }, { ...initial, phase: "setup" as const }]) {
      expect(advanceAdvisorHorizontal(state).advisorProgressState).toEqual(initial.advisorProgressState);
      expect(advanceAdvisorHorizontal(state).player).toEqual(initial.player);
      expect(settleAdvisorMonth(state).advisorProgressState).toEqual(initial.advisorProgressState);
    }
  });
});

describe("advisor publication credit", () => {
  it("records actual monthly growth sources, accumulating papers once and resetting next month", () => {
    const initial = {
      ...makeState({ funding: 1 }),
      papers: [publishedPaper("first-a"), publishedPaper("first-b", { target: "B" })],
    };
    const settled = settleAdvisorMonth(initial);
    expect(getAdvisorMonthlyResearchGrowth(settled)).toEqual({ totalMonths: 2, funding: 1, papers: 6 });
    expect(settled.advisorProgressState.funding).toBe(0);
    const later = syncAdvisorResearchAccumulation({ ...settled, papers: [...settled.papers, publishedPaper("later-c", { target: "C" })] });
    expect(getAdvisorMonthlyResearchGrowth(later)).toEqual({ totalMonths: 2, funding: 1, papers: 7 });
    expect(getAdvisorMonthlyResearchGrowth(syncAdvisorResearchAccumulation(later))).toEqual(getAdvisorMonthlyResearchGrowth(later));
    expect(getAdvisorMonthlyResearchGrowth(settleAdvisorMonth(later))).toEqual(getAdvisorMonthlyResearchGrowth(later));
    const next = settleAdvisorMonth(atMonth(later, 3));
    expect(getAdvisorMonthlyResearchGrowth(next)).toEqual({ totalMonths: 3, funding: null, papers: 0 });
    const funded = advanceAdvisorHorizontal(next);
    expect(funded.advisorProgressState.funding).toBe(1);
    expect(getAdvisorMonthlyResearchGrowth(funded)).toEqual(getAdvisorMonthlyResearchGrowth(next));
  });

  it.each([["A", 4], ["B", 2], ["C", 1]] as const)("credits conference %s as %i research", (target, score) => {
    const state = { ...makeState(), papers: [publishedPaper("conference", { target })] };
    expect(syncAdvisorResearchAccumulation(state).advisorProgressState.researchAccumulation).toBe(20 + score);
  });

  it.each([["nature", 20], ["nmi", 10], ["pami", 5]] as const)("credits journal %s as %i research from either metadata location", (journalTarget, score) => {
    for (const patch of [
      { journalTarget },
      { publication: { journalTarget, citations: 1000, effectiveScore: 999, citationDebuffMultiplier: 1 } },
    ]) {
      const state = { ...makeState(), externalPublications: [publishedPaper("journal", patch)] };
      expect(syncAdvisorResearchAccumulation(state).advisorProgressState.researchAccumulation).toBe(20 + score);
    }
  });

  it("counts active junior papers without player coauthorship and deduplicates across all archives", () => {
    const profile = junior();
    const paper = publishedPaper("junior-only", { leadAuthorId: profile.id, collaborators: [] });
    const initial = { ...makeState(), fellowProgressState: [profile], fellowPapers: [paper] };
    const credited = syncAdvisorResearchAccumulation(initial);
    expect(credited.advisorProgressState).toMatchObject({ researchAccumulation: 24, countedPaperIds: [paper.id] });
    const duplicated = { ...initial, papers: [paper, paper], externalPublications: [paper] };
    expect(syncAdvisorResearchAccumulation(duplicated).advisorProgressState.researchAccumulation).toBe(24);
    const moved = { ...credited, fellowPapers: [], externalPublications: [paper] };
    expect(syncAdvisorResearchAccumulation(moved).advisorProgressState).toEqual(credited.advisorProgressState);
    expect(syncAdvisorResearchAccumulation(credited).advisorProgressState).toEqual(credited.advisorProgressState);
  });

  it("ignores unpublished work and lover-led papers in every archive", () => {
    const profile = junior();
    const excluded = [
      publishedPaper("draft", { status: "draft" }),
      publishedPaper("review", { status: "reviewing" }),
      publishedPaper("journal-review", { status: "journal-reviewing", journalTarget: "nature" }),
      publishedPaper("lover", { leadAuthorId: "lover" }),
      publishedPaper("lover-named", { leadAuthorId: "lover-123", journalTarget: "nature" }),
    ];
    for (const archive of ["papers", "externalPublications", "fellowPapers"] as const) {
      const state = { ...makeState(), fellowProgressState: [profile], [archive]: excluded };
      expect(syncAdvisorResearchAccumulation(state).advisorProgressState).toEqual(state.advisorProgressState);
    }
    const state = { ...makeState(), papers: [publishedPaper("draft", { status: "draft" })] };
    const waiting = syncAdvisorResearchAccumulation(state);
    expect(syncAdvisorResearchAccumulation({ ...waiting, papers: [publishedPaper("draft")] }).advisorProgressState.researchAccumulation).toBe(24);
  });

  it("keeps earned credit after departure but ignores new unaffiliated fellow papers", () => {
    const profile = junior();
    const earned = publishedPaper("earned", { leadAuthorId: profile.id });
    const late = publishedPaper("late", { leadAuthorId: profile.id });
    const credited = syncAdvisorResearchAccumulation({ ...makeState(), fellowProgressState: [profile], fellowPapers: [earned] });
    const departed = syncAdvisorResearchAccumulation({ ...credited, fellowProgressState: [], fellowPapers: [earned, late] });
    expect(departed.advisorProgressState).toEqual(credited.advisorProgressState);
    const removed = syncAdvisorResearchAccumulation({ ...departed, fellowPapers: [] });
    expect(removed.advisorProgressState.researchAccumulation).toBe(24);
    const coauthored = { ...late, nonFirstAuthor: true, collaborators: [{ id: "player", name: "Player" }] };
    const archived = syncAdvisorResearchAccumulation({ ...departed, externalPublications: [coauthored] });
    expect(archived.advisorProgressState.researchAccumulation).toBe(28);
    expect(archived.advisorProgressState.countedPaperIds).toEqual(["earned", "late"]);
  });

  it("counts non-player coauthors in player and external archives without an active relationship", () => {
    const paper = publishedPaper("archived", { leadAuthorId: "former-fellow", collaborators: [{ id: "other-npc", name: "Other" }] });
    for (const archive of ["papers", "externalPublications"] as const) {
      expect(syncAdvisorResearchAccumulation({ ...makeState(), [archive]: [paper] }).advisorProgressState.researchAccumulation).toBe(24);
    }
  });
});

describe("advisor annual applications and awards", () => {
  it.each([
    [24, null], [25, "youth"], [49, "youth"], [50, "general"], [149, "general"],
    [150, "excellent"], [399, "excellent"], [400, "distinguished"], [1000, "distinguished"],
  ] as const)("selects the highest eligible first grant at research %i", (researchAccumulation, expected) => {
    const advisor = { ...createAdvisorProgressState(), researchAccumulation };
    expect(getEligibleAdvisorGrant(advisor, 2024)?.id ?? null).toBe(expected);
  });

  it("uses five horizontal payments to reach exactly youth eligibility at the first March", () => {
    let state = atMonth(makeState(), 1);
    for (let payment = 0; payment < 5; payment += 1) {
      state = advanceAdvisorHorizontal(state);
      state = settleAdvisorMonth(atMonth(state, payment + 2));
    }
    expect(state.player.san).toBe(5);
    expect(state.advisorProgressState).toMatchObject({ researchAccumulation: 25, funding: 0, pendingApplication: null });
    const march = settleAdvisorMonth(atMonth(state, 7));
    expect(march.advisorProgressState.pendingApplication).toEqual({ id: "youth", calendarYear: 2024, researchSnapshot: 25 });
    expect(march.advisorProgressState.awards).toEqual([]);
  });

  it("includes March publication credit and funded growth before freezing the application", () => {
    const state = atMonth({ ...makeState({ researchAccumulation: 44, funding: 1 }), papers: [publishedPaper("march-paper")] }, 7);
    const march = settleAdvisorMonth(state);
    expect(march.advisorProgressState).toMatchObject({
      researchAccumulation: 50, funding: 0,
      pendingApplication: { id: "general", calendarYear: 2024, researchSnapshot: 50 },
    });
  });

  it("keeps the March decision through July and August despite later qualification for a higher grant", () => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 25 }), 7));
    const latePapers = Array.from({ length: 7 }, (_, index) => publishedPaper(`late-${index}`, { journalTarget: "nature" }));
    const april = settleAdvisorMonth(atMonth({ ...march, papers: latePapers }, 8));
    expect(april.advisorProgressState.researchAccumulation).toBe(165);
    expect(april.advisorProgressState.pendingApplication).toEqual({ id: "youth", calendarYear: 2024, researchSnapshot: 25 });
    const july = settleAdvisorMonth(atMonth(april, 11));
    expect(july.advisorProgressState.awards).toEqual([]);
    const august = settleAdvisorMonth(atMonth(july, 12));
    expect(august.advisorProgressState).toMatchObject({ funding: 4, researchAccumulation: 173, awards: [youthAward], pendingApplication: null });
  });

  it("does not open a late application after missing March, but retries next March", () => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 24 }), 7));
    const april = settleAdvisorMonth(atMonth({ ...march, papers: [publishedPaper("late-c", { target: "C" })] }, 8));
    const august = settleAdvisorMonth(atMonth(april, 12));
    expect(august.advisorProgressState).toMatchObject({ researchAccumulation: 25, funding: 0, pendingApplication: null, awards: [] });
    expect(settleAdvisorMonth(atMonth(august, 19)).advisorProgressState.pendingApplication)
      .toEqual({ id: "youth", calendarYear: 2025, researchSnapshot: 25 });
  });

  it.each([
    ["youth", 25, 4, 26, 2027, "副教授"],
    ["general", 50, 9, 52, 2028, "教授·四级"],
    ["excellent", 150, 14, 157, 2027, "教授·三级"],
    ["distinguished", 400, 19, 420, 2029, "教授·二级"],
  ] as const)("awards %s once in August, with income before growth and no player benefits", (id, score, funding, research, endYear, rank) => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: score }), 7));
    const august = settleAdvisorMonth(atMonth(march, 12));
    expect(august.advisorProgressState).toMatchObject({
      funding, researchAccumulation: research, pendingApplication: null,
      awards: [{ id, awardedYear: 2024, startYear: 2025, endYear }],
    });
    expect(getAdvisorRankLabel(august.advisorProgressState)).toBe(rank);
    expect(getAdvisorGrantLimit(august.advisorProgressState)).toBe(2);
    expect(august.player).toEqual(march.player);
    expect(august.actionState).toEqual(march.actionState);
    expect(august.buffs).toEqual(march.buffs);
    expect(settleAdvisorMonth(august).advisorProgressState).toEqual(august.advisorProgressState);
    expect(settleAdvisorMonth(atMonth(august, 24)).advisorProgressState.awards).toEqual(august.advisorProgressState.awards);
  });

  it("caps grant funding at 20 before the funded research expense", () => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 50 }), 7));
    const august = settleAdvisorMonth(atMonth({ ...march, advisorProgressState: { ...march.advisorProgressState, funding: 18 } }, 12));
    expect(august.advisorProgressState).toMatchObject({ funding: 19, researchAccumulation: 52 });
  });

  it("does not award a pending application in a different calendar year", () => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 25 }), 7));
    expect(settleAdvisorMonth(atMonth(march, 24)).advisorProgressState).toMatchObject({ awards: [], funding: 0 });
  });

  it("releases the project limit in the ending calendar year while retaining earned rank", () => {
    const advisor = { ...createAdvisorProgressState(), researchAccumulation: 150, awards: [youthAward, generalAward] };
    expect(getAdvisorGrantLimit(advisor)).toBe(2);
    expect(getActiveAdvisorGrants(advisor, 2026)).toEqual([youthAward, generalAward]);
    expect(getEligibleAdvisorGrant(advisor, 2026)).toBeNull();
    expect(getActiveAdvisorGrants(advisor, 2027)).toEqual([generalAward]);
    expect(getEligibleAdvisorGrant(advisor, 2027)?.id).toBe("excellent");
    expect(getAdvisorRankLabel(advisor)).toBe("教授·四级");
    expect(getAdvisorGrantLimit({ ...advisor, awards: [generalAward] })).toBe(2);
  });

  it.each(["general", "excellent", "distinguished", "academician"] as const)("never repeats or falls below the earned %s award, even after expiry", (id) => {
    const award: AdvisorGrantAward = { id, awardedYear: 2024, startYear: 2025, endYear: 2029 };
    const advisor = { ...createAdvisorProgressState(), researchAccumulation: 50, awards: [award] };
    expect(getEligibleAdvisorGrant(advisor, 2035)).toBeNull();
  });

  it("requires 1000 and an already awarded distinguished grant for academy, ignoring project limits", () => {
    const advisor = { ...createAdvisorProgressState(), researchAccumulation: 999, awards: [generalAward, distinguishedAward] };
    expect(getEligibleAdvisorGrant(advisor, 2026)).toBeNull();
    expect(getEligibleAdvisorGrant({ ...advisor, researchAccumulation: 1000 }, 2026)?.id).toBe("academician");
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 1000 }), 7));
    expect(march.advisorProgressState.pendingApplication?.id).toBe("distinguished");
    const august = settleAdvisorMonth(atMonth(march, 12));
    expect(august.advisorProgressState.awards.map((award) => award.id)).toEqual(["distinguished"]);
    expect(august.advisorProgressState.pendingApplication).toBeNull();
    const nextMarch = settleAdvisorMonth(atMonth(august, 19));
    expect(nextMarch.advisorProgressState.pendingApplication?.id).toBe("academician");
    const nextAugust = settleAdvisorMonth(atMonth(nextMarch, 24));
    expect(nextAugust.advisorProgressState.awards).toContainEqual(academicianAward);
    expect(getAdvisorRankLabel(nextAugust.advisorProgressState)).toBe("教授·一级");
  });

  it.each([0, 19, 20])("adds academician income before spending, preserving a starting fund of %i", (funding) => {
    const state = makeState({ funding, researchAccumulation: 1000, awards: [distinguishedAward, academicianAward] });
    const next = settleAdvisorMonth(state);
    expect(next.advisorProgressState).toMatchObject({ funding, researchAccumulation: 1050 });
    expect(next.player).toEqual(state.player);
    expect(next.actionState).toEqual(state.actionState);
  });

  it("starts academician monthly income in the award August with no project duration", () => {
    const state = atMonth(makeState({
      researchAccumulation: 1000, awards: [distinguishedAward],
      pendingApplication: { id: "academician", calendarYear: 2025, researchSnapshot: 1000 },
    }), 24);
    const next = settleAdvisorMonth(state);
    expect(next.advisorProgressState).toMatchObject({ funding: 0, researchAccumulation: 1050, pendingApplication: null });
    expect(next.advisorProgressState.awards).toEqual([distinguishedAward, academicianAward]);
    expect(getActiveAdvisorGrants(next.advisorProgressState, 2025)).toEqual([distinguishedAward]);
    expect(next.player).toEqual(state.player);
    expect(next.actionState).toEqual(state.actionState);
  });
});
