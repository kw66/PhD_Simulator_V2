import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, attendFellowConferences, ensureFellowPapers, getFellowCurrentPaper } from "../src/core/v2-fellow-research";
import { createDraftPaper, prepareConferenceSubmission, resolvePaperReview } from "../src/core/v2-paper-rules";
import { getFellowPublishedPapers, getFellowResearchScore } from "../src/core/v2-fellow-academic";
import { syncAdvisorResearchAccumulation } from "../src/core/v2-advisor-progress";
import { settleConferenceRegistrationFees } from "../src/core/v2-lab-publication-costs";
import { settlePublishedPaperCitations } from "../src/core/v2-publication-system";
import { getPaperMasteryBonuses } from "../src/core/v2-paper-mastery";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { observeResearchAchievements } from "../src/core/v2-achievement-research";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { settleAppropriatedFellowPaper } from "../src/core/v2-teacher-child-talents";
import type { GameState, Paper } from "../src/core/v2-types";

function fixture(levels: Record<string, number>): GameState {
  const base = createStartedGameState("teacher-child");
  const fellow = { ...createCustomFellowProgressProfile({ type: "peer", gender: "female",
    research: 5, affinity: 2, startTotalMonths: 1, name: "林青" }), id: "fellow-one", taskMax: 1000 };
  const playerPaper = createDraftPaper(1, 0, () => 0.5);
  return ensureFellowPapers({ ...base, year: 1, month: 1, totalMonths: 1,
    selectedAdvisorName: "导师", playerName: "玩家", roleTalents: { levels },
    eventQueue: [], buffs: [], papers: [playerPaper], selectedPaperId: playerPaper.id,
    fellowProgressState: [fellow], fellowFinanceAccounts: { [fellow.id]: { name: "林青", money: 100 } },
    advisorProgressState: { ...base.advisorProgressState, funding: 1000, horizontalProgress: 0, verticalProgress: 0 },
  }, () => 0.5);
}

function tick(state: GameState, random: () => number = () => 0.5): GameState {
  const totalMonths = state.totalMonths + 1;
  return advanceFellowResearch({ ...state, totalMonths, year: Math.floor((totalMonths - 1) / 12) + 1,
    month: (totalMonths - 1) % 12 + 1 }, random);
}

function reviewing(state: GameState, fellowId = "fellow-one", coauthored = false, score = 100): GameState {
  const current = getFellowCurrentPaper(state, fellowId)!;
  const paper = { ...prepareConferenceSubmission({ ...current, idea: score, experiment: score, writing: score,
    prepublicationDecayRate: 0, collaborators: coauthored ? [{ id: "player", name: "玩家" }] : [],
  }, "A", 1, 1), reviewMonthsLeft: 1 };
  return { ...state, fellowPapers: state.fellowPapers?.map(entry => entry.id === paper.id ? paper : entry) };
}

describe("teacher-child project apprenticeship", () => {
  it("spends the first six elapsed months on projects while cooperation advances and no AI is bought", () => {
    let state = fixture({ "project-apprenticeship": 1 });
    expect(advanceFellowResearch(state, () => 0).fellowPapers![0]).toMatchObject({ idea: 0, experiment: 0, writing: 0 });
    for (let elapsed = 1; elapsed <= 6; elapsed++) {
      state = tick(state, () => 0);
      expect(getFellowCurrentPaper(state, "fellow-one")).toMatchObject({ idea: 0, experiment: 0, writing: 0 });
      expect(state.advisorProgressState.verticalProgress).toBe(5 * elapsed);
      expect(state.fellowProgressState[0]!.taskProgress).toBe(2 * elapsed);
      expect(state.fellowFinanceAccounts?.["fellow-one"]).toMatchObject({ money: 100 });
      expect(state.fellowFinanceAccounts?.["fellow-one"]?.aiSubscribedTotalMonths).toBeUndefined();
    }
    state = tick(state, () => 0);
    expect(getFellowCurrentPaper(state, "fellow-one")!.idea).toBeGreaterThan(0);
    expect(state.advisorProgressState.verticalProgress).toBe(30);
    expect(state.fellowProgressState[0]!.taskProgress).toBe(14);
  });

  it("uses elapsed months, not action count, and keeps existing horizontal funding rules", () => {
    let state = fixture({ "project-apprenticeship": 1 });
    state = { ...state, totalMonths: 6, month: 6,
      advisorProgressState: { ...state.advisorProgressState, funding: 10 } };
    state = tick(state, () => 0);
    expect(state.advisorProgressState.horizontalProgress).toBe(5);
    expect(getFellowCurrentPaper(state, "fellow-one")!.idea).toBe(0);
    state = tick(state, () => 0);
    expect(getFellowCurrentPaper(state, "fellow-one")!.idea).toBeGreaterThan(0);
  });

  it("does not change r37 recordings or unallocated roles", () => {
    const before = fixture({ "project-apprenticeship": 1 });
    const legacy = withGameplayRuleset("20261023-r37", () => tick(before, () => 0));
    const unallocated = tick({ ...before, roleTalents: { levels: {} } }, () => 0);
    for (const state of [legacy, unallocated]) {
      expect(getFellowCurrentPaper(state, "fellow-one")!.idea).toBeGreaterThan(0);
      expect(state.advisorProgressState.verticalProgress).toBe(0);
    }
  });
});

describe("teacher-child second successful publication appropriation", () => {
  it.each([false, true])("transfers only the second success, through normal first-author rewards (coauthored %s)", coauthored => {
    let state = fixture({ "publication-appropriation": 1 });
    state = tick(reviewing(state));
    const fellow = state.fellowProgressState[0]!;
    expect(fellow.successfulPublicationCount).toBe(1);
    expect(getFellowPublishedPapers(state, fellow)).toHaveLength(1);
    expect(state.externalPublications).toHaveLength(0);
    expect(state.totalResearchScore).toBe(0);

    state = reviewing(state, fellow.id, coauthored);
    const source = getFellowCurrentPaper(state, fellow.id)!;
    const before = { ...state, buffs: [...state.buffs, { id: "next-publication", name: "宣传", source: "test",
      timing: "next-action" as const, remainingMonths: null, publicationEffects: { nextPromotionMultiplier: 2 } }] };
    state = tick(before);
    const owned = state.externalPublications.find(paper => paper.id === source.id)!;
    expect(owned).toMatchObject({ status: "published", nonFirstAuthor: false, target: "A",
      topicId: source.topicId, title: source.title, idea: source.idea, experiment: source.experiment, writing: source.writing,
      submittedMonth: source.submittedMonth, submittedYear: source.submittedYear, conferenceHandled: false,
      conferenceAvailableAtTotalMonths: state.totalMonths + 3, publication: { citations: 0, promotionMultiplier: 2 } });
    expect(owned.leadAuthorId).toBeUndefined();
    expect(owned.collaborators?.some(person => person.id === "player")).toBe(false);
    expect(state.externalPublications.filter(paper => paper.id === source.id)).toHaveLength(1);
    expect(state.fellowPapers?.some(paper => paper.id === source.id)).toBe(false);
    expect(state.selectedPaperId).toBe(before.selectedPaperId);
    expect(state.totalResearchScore).toBe(4);
    expect(state.paperMasteryState?.count).toBe(1);
    expect(getPaperMasteryBonuses(state)).toEqual({ idea: 1, experiment: 0, writing: 0 });
    expect(state.publicationTalentState?.claimedIds).toEqual(expect.arrayContaining(["first-paper", "first-a-or-journal"]));
    expect(state.publicationTalentState?.claimedIds).not.toContain("first-coauthor-paper");
    expect(state.buffs.some(buff => buff.id === "next-publication")).toBe(false);
    expect(before.advisorProgressState.funding - state.advisorProgressState.funding).toBe(1);
    expect(state.advisorProgressState.paidConferenceRegistrationPaperIds?.filter(id => id === source.id)).toHaveLength(1);
    expect(getFellowResearchScore(state, fellow)).toBe(4);
    const achievementRun = createAchievementRunProgress();
    observeResearchAchievements(before, state, achievementRun);
    expect(achievementRun.sets["research:master-a"]).toContain(source.id);

    const accumulated = syncAdvisorResearchAccumulation(state);
    expect(accumulated.advisorProgressState.researchAccumulation - state.advisorProgressState.researchAccumulation).toBe(8);
    expect(syncAdvisorResearchAccumulation(accumulated)).toBe(accumulated);
    expect(settleConferenceRegistrationFees(accumulated).advisorProgressState.funding).toBe(accumulated.advisorProgressState.funding);
    const conferenceTime = attendFellowConferences({ ...state, totalMonths: state.totalMonths + 3 });
    expect(conferenceTime.externalPublications.find(paper => paper.id === source.id)?.conferenceHandled).toBe(false);
    const exposed = { ...state, totalMonths: state.totalMonths + 4,
      externalPublications: state.externalPublications.map(paper => ({ ...paper, conferenceHandled: true })) };
    const citations = settlePublishedPaperCitations(exposed);
    expect(citations.state.totalCitations).toBeGreaterThan(0);
    expect(citations.state.externalPublications[0]!.publication!.citations).toBe(citations.state.totalCitations);
    expect(citations.state.fellowPapers?.some(paper => paper.id === source.id)).toBe(false);

    state = JSON.parse(JSON.stringify(state)) as GameState;
    expect(advanceFellowResearch(state, () => 0.5)).toBe(state);
    state = tick(reviewing(state));
    expect(state.fellowProgressState[0]!.successfulPublicationCount).toBe(3);
    expect(state.externalPublications).toHaveLength(1);
    expect(getFellowPublishedPapers(state, state.fellowProgressState[0]!)).toHaveLength(2);
    expect(state.totalResearchScore).toBe(4);
    expect(state.paperMasteryState?.count).toBe(1);
  });

  it("does not count rejected submissions, even when the same manuscript later succeeds", () => {
    let state = tick(reviewing(fixture({ "publication-appropriation": 1 })));
    state = reviewing(state, "fellow-one", false, 0.1);
    const rejectedId = getFellowCurrentPaper(state, "fellow-one")!.id;
    expect(resolvePaperReview(getFellowCurrentPaper(state, "fellow-one")!, () => 0.99).nextPaper.status).toBe("draft");
    state = tick(state, () => 0.99);
    expect(state.fellowProgressState[0]!.successfulPublicationCount).toBe(1);
    expect(state.externalPublications).toHaveLength(0);
    expect(getFellowCurrentPaper(state, "fellow-one")?.rejectionCount).toBe(1);
    state = tick(reviewing(state));
    expect(state.externalPublications[0]).toMatchObject({ id: rejectedId, rejectionCount: 1, nonFirstAuthor: false });
    expect(state.fellowProgressState[0]!.successfulPublicationCount).toBe(2);
  });

  it("tracks each fellow independently when both have their second success in one month", () => {
    let state = fixture({ "publication-appropriation": 1 });
    state = ensureFellowPapers({ ...state, fellowProgressState: [
      { ...state.fellowProgressState[0]!, successfulPublicationCount: 1 },
      { ...state.fellowProgressState[0]!, id: "fellow-two", name: "王明", successfulPublicationCount: 1 },
    ] }, () => 0.5);
    state = tick(reviewing(reviewing(state), "fellow-two"));
    expect(state.externalPublications).toHaveLength(2);
    expect(new Set(state.externalPublications.map(paper => paper.id)).size).toBe(2);
    expect(state.fellowProgressState.map(fellow => fellow.successfulPublicationCount)).toEqual([2, 2]);
    expect(state.totalResearchScore).toBe(8);
    expect(state.paperMasteryState?.count).toBe(2);
    expect(state.externalPublications.map(paper => paper.acceptedOrder)).toEqual([1, 2]);
  });

  it("preserves legacy r37 acceptance ownership even if a newer allocation is supplied", () => {
    const before = reviewing({ ...fixture({ "publication-appropriation": 1 }),
      fellowProgressState: [{ ...fixture({}).fellowProgressState[0]!, successfulPublicationCount: 1 }] });
    const next = withGameplayRuleset("20261023-r37", () => tick(before));
    expect(next.externalPublications).toHaveLength(0);
    expect(next.totalResearchScore).toBe(0);
    expect(getFellowPublishedPapers(next, next.fellowProgressState[0]!)).toHaveLength(1);
    expect(next.fellowProgressState[0]!.successfulPublicationCount).toBe(1);
  });

  it("the transfer helper preserves third-party collaborators and the current paper selection", () => {
    const state = reviewing(fixture({ "publication-appropriation": 1 }), "fellow-one", true);
    const original = getFellowCurrentPaper(state, "fellow-one")!;
    const paper: Paper = { ...original, collaborators: [...original.collaborators!, { id: "other-fellow", name: "同门" }] };
    const next = settleAppropriatedFellowPaper({ ...state, fellowPapers: [paper] }, state.fellowProgressState[0]!, paper,
      resolvePaperReview(paper, () => 0.5));
    expect(next.selectedPaperId).toBe(state.selectedPaperId);
    expect(next.externalPublications[0]!.collaborators).toEqual([{ id: "other-fellow", name: "同门" }]);
    expect(next.papers).toEqual(state.papers);
  });
});
