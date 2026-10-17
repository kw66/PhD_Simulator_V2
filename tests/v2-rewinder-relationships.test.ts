import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile, createGeneratedFellowProfileAddition } from "../src/core/v2-fellow-progression";
import { getFellowAcademicYear, getFellowResearchScore } from "../src/core/v2-fellow-academic";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { settleLabResearchGrowth } from "../src/core/v2-lab-talent";
import { settleFellowAcademicYear } from "../src/core/v2-fellow-lifecycle";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createLoverProgressState, advanceLoverMonth } from "../src/core/v2-lover-progression";
import { getAdvisorRankLabel } from "../src/core/v2-advisor-progress";
import { applyRewinderAdvisor, captureRewinderRelationships, isRewinderRelationshipsSnapshot, mergeRewinderRelationships, restoreRewinderRelationship } from "../src/core/v2-rewinder-relationships";
import type { GameState } from "../src/core/v2-types";

function stateAt(totalMonths = 12): GameState {
  const state = createStartedGameState("normal");
  return { ...state, phase: "playing", totalMonths, year: Math.floor((totalMonths - 1) / 12) + 1,
    month: (totalMonths - 1) % 12 + 1, selectedAdvisorName: "本世导师" };
}
function withFellow(state = stateAt()): GameState {
  const profile = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 13.6,
    affinity: 12.8, startTotalMonths: 2, name: "陈清", taskType: "writing", academicYear: 1 });
  return { ...state, fellowProgressState: [{ ...profile, taskProgress: 85, helpedPlayerCount: 4,
    pendingHelpToPlayer: 9, lastAnnualGrowthTotalMonths: 10,
    activityHistory: [{ totalMonths: 11, text: "协作推进" }] }],
    relationshipState: { ...state.relationshipState, occupiedSlots: 1, peerCount: 1 },
    fellowFinanceAccounts: { [profile.id]: { name: "陈清", money: 99, aiSlot: "gpt" } } };
}
function withLover(state = stateAt()): GameState {
  return { ...state, relationshipState: { ...state.relationshipState, loverCount: 1 },
    loverState: { ...state.loverState, active: true, type: "smart", gender: "female", name: "林宁", startTotalMonths: 3 },
    loverProgressState: { ...createLoverProgressState("smart", () => 0), research: 14, intimacy: 13,
      giftCoupons: 3, pendingPaperHelp: { amount: 14, collaboratorId: "old-lover", name: "林宁" },
      sanDiscountMonths: [13], routes: { play: { progress: 90, completed: 4 }, study: { progress: 70, completed: 8 }, shopping: { progress: 45, completed: 3 } },
      lastAnnualGrowthTotalMonths: 10, activityHistory: [{ totalMonths: 12, text: "共同学习" }] } };
}

describe("rewinder relationship cards", () => {
  it("validates persisted data and rejects unknown live-state fields, invalid numbers and oversized records", () => {
    const archive = captureRewinderRelationships(withLover(withFellow()));
    expect(isRewinderRelationshipsSnapshot(archive)).toBe(true);
    expect(isRewinderRelationshipsSnapshot(JSON.parse(JSON.stringify(archive)))).toBe(true);
    expect(isRewinderRelationshipsSnapshot({ ...archive, fellows: [{ ...archive.fellows[0],
      profile: { ...archive.fellows[0]!.profile, research: Infinity } }] })).toBe(false);
    expect(isRewinderRelationshipsSnapshot({ ...archive, fellows: [{ ...archive.fellows[0],
      profile: { ...archive.fellows[0]!.profile, money: 1000 } }] })).toBe(false);
    expect(isRewinderRelationshipsSnapshot({ ...archive, lovers: [{ ...archive.lovers[0],
      progress: { ...archive.lovers[0]!.progress, routes: { play: null } } }] })).toBe(false);
    expect(isRewinderRelationshipsSnapshot({ ...archive, fellows: Array.from({ length: 501 }, () => archive.fellows[0]) })).toBe(false);
  });

  it("captures cards without cash, subscription, temporary buffs or pending old rewards", () => {
    const state = withLover(withFellow());
    const archive = captureRewinderRelationships(state);
    expect(archive.fellows[0]!.profile).toMatchObject({ research: 13.6, affinity: 12.8, taskProgress: 85,
      helpedPlayerCount: 4, pendingHelpToPlayer: null });
    expect(archive.lovers[0]!.progress).toMatchObject({ giftCoupons: 0, pendingPaperHelp: null, sanDiscountMonths: [],
      routes: { study: { progress: 70, completed: 8 } } });
    expect(JSON.stringify(archive)).not.toContain("aiSlot");
    expect(archive).not.toHaveProperty("buffs");
    archive.fellows[0]!.profile.research = 1;
    expect(state.fellowProgressState[0]!.research).toBe(13.6);
  });

  it("merges identities while keeping complete cards and old absent contacts", () => {
    const old = captureRewinderRelationships(withLover(withFellow()));
    const newer = withFellow(stateAt(24));
    newer.fellowProgressState[0]!.research = 16;
    newer.fellowProgressState[0]!.taskProgress = 12;
    newer.fellowProgressState[0]!.helpedPlayerCount = 7;
    const merged = mergeRewinderRelationships(old, captureRewinderRelationships(newer));
    expect(merged.fellows).toHaveLength(1);
    expect(merged.fellows[0]).toMatchObject({ capturedTotalMonths: 24, profile: { research: 16, taskProgress: 12, helpedPlayerCount: 7 } });
    expect(merged.lovers[0]!.capturedTotalMonths).toBe(12);
  });

  it("restores to an empty slot, rebases academic/activity clocks and does not copy money or papers", () => {
    const archive = captureRewinderRelationships(withFellow());
    const current = stateAt(24);
    const result = restoreRewinderRelationship(current, archive, archive.fellows[0]!.key);
    expect(result.restored).toBe(true);
    const profile = result.state.fellowProgressState[0]!;
    expect(profile).toMatchObject({ name: "陈清", research: 13.6, affinity: 12.8, taskProgress: 85,
      helpedPlayerCount: 4, startTotalMonths: 14, academicStartTotalMonths: 24,
      lastAdvancedTotalMonths: 24, lastAnnualGrowthTotalMonths: 22,
      activityHistory: [{ totalMonths: 23, text: "协作推进" }], pendingHelpToPlayer: null });
    expect(getFellowAcademicYear(result.state, profile)).toBe(1);
    expect(getFellowAcademicYear({ year: 3 }, profile)).toBe(2);
    expect(result.state.fellowFinanceAccounts![profile.id]).toEqual({ name: "陈清", money: 0 });
    expect(result.state.papers).toEqual(current.papers);
    expect(result.state.buffs).toEqual(current.buffs);
    expect(result.state.relationshipState).toMatchObject({ occupiedSlots: 1, peerCount: 1 });
    expect(restoreRewinderRelationship(result.state, archive, archive.fellows[0]!.key).restored).toBe(false);
  });

  it("retains a fellow's earned academic score without restoring publications or crediting player achievements", () => {
    const previous = withFellow();
    const person = previous.fellowProgressState[0]!;
    person.academicYear = 2;
    person.initialResearchScore = 1;
    const published = { ...createDraftPaper(1, 0, () => 0), id: "historical-publication", leadAuthorId: person.id,
      status: "published" as const, target: "A" as const };
    previous.fellowPapers = [published];
    previous.externalPublications = [{ ...published, nonFirstAuthor: true }];
    const originalScore = getFellowResearchScore(previous, person);
    expect(originalScore).toBe(5);
    const archive = captureRewinderRelationships(previous);
    const current = stateAt(24);
    const restored = restoreRewinderRelationship(current, archive, archive.fellows[0]!.key).state;
    expect(getFellowResearchScore(restored, restored.fellowProgressState[0]!)).toBe(originalScore);
    expect(restored.papers).toEqual(current.papers);
    expect(restored.externalPublications).toEqual(current.externalPublications);
    expect(restored.fellowPapers).toEqual(current.fellowPapers);
    expect(restored.totalResearchScore).toBe(current.totalResearchScore);
    expect(restored.achievementProgress).toEqual(current.achievementProgress);
    expect(captureRewinderRelationships(restored).fellows[0]!.profile.initialResearchScore).toBe(originalScore);
    const june = { ...restored, totalMonths: 34, year: 3, month: 10 };
    expect(settleFellowAcademicYear(june).fellowProgressState[0]!.degree).toBe("phd");
  });

  it("round-trips generated cohorts and both lover types after real monthly and annual progression", () => {
    for (const type of ["senior", "peer", "junior"] as const) {
      for (const gender of ["male", "female"] as const) {
        for (let academicYear = 0; academicYear <= 6; academicYear += 1) {
          const generated = createGeneratedFellowProfileAddition(type, academicYear, gender, [], () => 0.4,
            { year: 1, fixedYear: academicYear });
          const profile = createCustomFellowProgressProfile({ ...generated, startTotalMonths: 1 });
          let current = stateAt(2);
          current.fellowProgressState = [profile];
          current.relationshipState = { ...current.relationshipState, occupiedSlots: 1,
            seniorCount: Number(type === "senior"), peerCount: Number(type === "peer"), juniorCount: Number(type === "junior") };
          current = advanceFellowResearch(current, () => 0.4);
          current = settleLabResearchGrowth({ ...current, totalMonths: 12, month: 12 }, () => 0.4);
          const saved: unknown = JSON.parse(JSON.stringify(captureRewinderRelationships(current)));
          expect(isRewinderRelationshipsSnapshot(saved)).toBe(true);
          if (!isRewinderRelationshipsSnapshot(saved)) throw new Error("Invalid generated archive");
          const restored = restoreRewinderRelationship(stateAt(24), saved, saved.fellows[0]!.key).state;
          expect(restored.fellowProgressState[0]!.research).toBe(current.fellowProgressState[0]!.research);
          const next = advanceFellowResearch({ ...restored, totalMonths: 25, year: 3, month: 1 }, () => 0.4);
          expect(next.fellowProgressState[0]!.lastAdvancedTotalMonths).toBe(25);
          expect(next.fellowProgressState[0]!.taskUsedThisMonth).toBe(false);
          expect(next.fellowProgressState[0]!.taskProgress).toBeGreaterThan(restored.fellowProgressState[0]!.taskProgress);
          expect(isRewinderRelationshipsSnapshot(captureRewinderRelationships(next))).toBe(true);
        }
      }
    }
    for (const type of ["beautiful", "smart"] as const) {
      let current = withLover(stateAt(11));
      current.loverState.type = type;
      current.loverProgressState = { ...createLoverProgressState(type, () => 0.4), routes: current.loverProgressState.routes };
      current = advanceLoverMonth(current);
      current = settleLabResearchGrowth({ ...current, totalMonths: 12, month: 12 }, () => 0.4);
      expect(isRewinderRelationshipsSnapshot(JSON.parse(JSON.stringify(captureRewinderRelationships(current))))).toBe(true);
    }
  });

  it("does not overwrite a full fellow roster or an active lover", () => {
    const archive = captureRewinderRelationships(withLover(withFellow()));
    const full = withLover(withFellow());
    full.fellowProgressState[0]!.name = "另一位同学";
    expect(restoreRewinderRelationship(full, archive, archive.fellows[0]!.key)).toMatchObject({ restored: false, state: full });
    expect(restoreRewinderRelationship(full, archive, archive.lovers[0]!.key).restored).toBe(false);
    expect(restoreRewinderRelationship({ ...stateAt(), phase: "finished" }, archive, archive.lovers[0]!.key).restored).toBe(false);
  });

  it("keeps lover identity, acquaintance duration and reward cycle, and resumes monthly growth", () => {
    const archive = captureRewinderRelationships(withLover());
    const result = restoreRewinderRelationship(stateAt(24), archive, archive.lovers[0]!.key);
    expect(result.restored).toBe(true);
    expect(result.state.loverState).toMatchObject({ name: "林宁", type: "smart", startTotalMonths: 15 });
    expect(result.state.loverProgressState).toMatchObject({ research: 14, intimacy: 13, giftCoupons: 0,
      pendingPaperHelp: null, lastAdvancedTotalMonths: 24, routes: { study: { progress: 70, completed: 8 } } });
    expect(advanceLoverMonth(result.state)).toBe(result.state);
    const nextMonth = { ...result.state, totalMonths: 25, year: 3, month: 1 };
    expect(advanceLoverMonth(nextMonth).loverProgressState.routes!.study.progress).toBeGreaterThan(70);
  });

  it("merges advisor hats and maxima while preserving identity, project deadlines and tracking new funds once", () => {
    const old = stateAt();
    old.advisorProgressState = { ...old.advisorProgressState, funding: 100, researchAccumulation: 180,
      awards: [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 },
        { id: "excellent", awardedYear: 2024, startYear: 2025, endYear: 2027 }] };
    const current = stateAt(24);
    current.advisorProgressState = { ...current.advisorProgressState, funding: 40, cumulativeFunding: 200,
      horizontalProgress: 70, verticalProgress: 80, countedPaperIds: ["current-paper"],
      awards: [{ id: "youth", awardedYear: 2022, startYear: 2023, endYear: 2025 }],
      pendingApplication: { id: "general", calendarYear: 2025, researchSnapshot: 70, resultRoll: 0.3 } };
    const archive = captureRewinderRelationships(old);
    const result = applyRewinderAdvisor(current, archive);
    expect(result.selectedAdvisorName).toBe("本世导师");
    expect(result.advisorProgressState).toMatchObject({ funding: 100, cumulativeFunding: 260, researchAccumulation: 180,
      horizontalProgress: 70, verticalProgress: 80, countedPaperIds: ["current-paper"], pendingApplication: current.advisorProgressState.pendingApplication });
    expect(result.advisorProgressState.awards).toEqual([{ id: "youth", awardedYear: 2022, startYear: 2023, endYear: 2025 },
      { id: "excellent", awardedYear: 2025, startYear: 2026, endYear: 2028 }]);
    expect(getAdvisorRankLabel(result.advisorProgressState)).toBe("三级教授");
    expect(result.labFinanceLedger).toEqual({ totalMonths: 24, amounts: { other: 60 } });
    expect(applyRewinderAdvisor(result, archive).advisorProgressState.cumulativeFunding).toBe(260);
  });
});
