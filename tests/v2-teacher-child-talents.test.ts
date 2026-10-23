import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { observeResearchAchievements } from "../src/core/v2-achievement-research";
import { getAcademicCalendarYear } from "../src/core/v2-calendar";
import { getPaperMasteryBonuses } from "../src/core/v2-paper-mastery";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { generatePaperTopic } from "../src/core/v2-paper-topics";
import { getPreferredPaperTopicId } from "../src/core/v2-player-paper-topic";
import { settlePaperCitationMonth } from "../src/core/v2-publication-system";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { settleTeacherChildFavorMilestones } from "../src/core/v2-teacher-child-talents";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function run(favor: number, levels: Record<string, number> = {
  "family-patronage": 1, "family-patronage-beta": 1, "family-patronage-gamma": 1,
}): GameState {
  const state = createStartedGameState("teacher-child");
  return { ...state, month: 3, totalMonths: 3, player: { ...state.player, favor }, roleTalents: { levels } };
}

describe("teacher-child favor milestone papers", () => {
  it("grants the paper through normal event settlement only after confirming the result", () => {
    const before = run(11.8, { "family-patronage": 1 });
    const result: PendingEvent = {
      id: "patronage-confirm", title: "Meeting", description: "Meeting", source: "random", blocking: true,
      deadlineMonths: 0, chainId: "patronage-confirm", stage: "result",
      choices: [{ id: "confirm", label: "Confirm", outcome: "Favor gained", effects: { favor: 1 } }],
    };
    const queued = { ...before, eventQueue: [createEventQueueItem(result, 3)] };
    expect(queued.externalPublications).toHaveLength(0);
    const settled = dispatchAction(queued, "resolve-event", { eventId: result.id, eventChoiceId: "confirm" });
    expect(settled.externalPublications).toHaveLength(1);
    expect(settled.externalPublications[0]?.target).toBe("C");
    expect(settled.roleTalents?.familyPatronageGrantedIds).toEqual(["family-patronage"]);
    expect(dispatchAction(settled, "resolve-event", { eventId: result.id, eventChoiceId: "confirm" }).externalPublications).toEqual(settled.externalPublications);
  });

  it("does not grant before the threshold or for an unallocated milestone", () => {
    const before = run(11.9);
    expect(settleTeacherChildFavorMilestones(before)).toBe(before);
    const unallocated = run(20, {});
    expect(settleTeacherChildFavorMilestones(unallocated)).toBe(unallocated);
  });

  it.each([[12, "family-patronage", "C", 20, 1], [15, "family-patronage-beta", "B", 40, 2],
    [18, "family-patronage-gamma", "A", 70, 4]] as const)("grants the %s-favor milestone once", (favor, id, target, score, researchScore) => {
    const before = run(favor, { [id]: 1 });
    const next = settleTeacherChildFavorMilestones(before, () => 0.4);
    expect(next.externalPublications).toHaveLength(1);
    expect(next.externalPublications[0]).toMatchObject({ status: "published", target, nonFirstAuthor: false,
      conferenceHandled: true, publication: { effectiveScore: score, citations: 0 } });
    expect(next.totalResearchScore - before.totalResearchScore).toBe(researchScore);
    expect(next.papers).toBe(before.papers);
    expect(next.paperSlotsUnlocked).toBe(before.paperSlotsUnlocked);
    expect(next.roleTalents?.familyPatronageGrantedIds).toEqual([id]);
    expect(next.paperMasteryState?.count).toBe(1);
    expect(settleTeacherChildFavorMilestones(next)).toBe(next);
    expect(before.externalPublications).toHaveLength(0);
  });

  it("claims all crossed milestones in order and preserves paper acceptance order", () => {
    const next = settleTeacherChildFavorMilestones(run(18), () => 0.2);
    expect(next.externalPublications.map(paper => paper.target)).toEqual(["C", "B", "A"]);
    expect(new Set(next.externalPublications.map(paper => paper.id)).size).toBe(3);
    expect(next.externalPublications.map(paper => paper.acceptedOrder)).toEqual([1, 2, 3]);
    expect(next.totalResearchScore).toBe(7);
    expect(next.paperMasteryState?.count).toBe(3);
    expect(getPaperMasteryBonuses(next)).toEqual({ idea: 1, experiment: 1, writing: 1 });
    expect(next.publicationTalentState?.claimedIds).toEqual(expect.arrayContaining(["first-paper", "first-a-or-journal"]));
  });

  it("does not grant again after favor falls, rises or a snapshot is serialized and restored", () => {
    const claimed = settleTeacherChildFavorMilestones(run(12), () => 0.2);
    const restored: GameState = JSON.parse(JSON.stringify(claimed));
    restored.player.favor = 5;
    const fallen = settleTeacherChildFavorMilestones(restored);
    const risen = settleTeacherChildFavorMilestones({ ...fallen, player: { ...fallen.player, favor: 12 } });
    expect(risen.externalPublications).toEqual(claimed.externalPublications);
    expect(risen.totalResearchScore).toBe(claimed.totalResearchScore);
    expect(risen.paperMasteryState).toEqual(claimed.paperMasteryState);
    expect(risen.eventHistory).toEqual(claimed.eventHistory);
  });

  it("settles a further milestone reached by ordinary publication rewards in the same operation", () => {
    const next = settleTeacherChildFavorMilestones(run(14.8), () => 0.2);
    expect(next.externalPublications.map(paper => paper.target)).toEqual(["C", "B"]);
    expect(next.roleTalents?.familyPatronageGrantedIds).toEqual(["family-patronage", "family-patronage-beta"]);
  });

  it("participates in normal publication achievements and can receive citations without a pending conference", () => {
    const before = run(18);
    const next = settleTeacherChildFavorMilestones(before, () => 0.2);
    const progress = createAchievementRunProgress();
    observeResearchAchievements(before, next, progress);
    expect(progress.sets["research:master-a"]).toEqual([next.externalPublications[2]!.id]);
    let paper = next.externalPublications[2]!;
    for (let month = 0; month < 12; month++) paper = settlePaperCitationMonth(next, paper).paper;
    expect(paper.publication!.citations).toBeGreaterThan(0);
    expect(next.eventQueue).toEqual(before.eventQueue);
  });

  it("uses the normal preferred direction, generated title and current year's direction heat", () => {
    const before = run(12, { "family-patronage": 1 });
    before.year = 3;
    before.month = 8;
    before.totalMonths = 32;
    before.papers = [createDraftPaper(1, 0, () => 0.1)];
    const topicId = getPreferredPaperTopicId(before)!;
    const expected = generatePaperTopic(getAcademicCalendarYear(before.year, before.month), () => 0.7, { topicId });
    const next = settleTeacherChildFavorMilestones(before, () => 0.7);
    expect(next.externalPublications[0]).toMatchObject(expected);
    expect(next.externalPublications[0]?.publication?.highlyCitedThreshold).toBe(Math.ceil(expected.heatMultiplier * 200));
  });

  it("lets a first granted paper establish the direction for later milestone papers", () => {
    const next = settleTeacherChildFavorMilestones(run(18), () => 0.3);
    expect(new Set(next.externalPublications.map(paper => paper.topicId)).size).toBe(1);
    expect(next.externalPublications.every(paper => paper.topicId !== "collaboration")).toBe(true);
  });

  it("retains old replay behavior and ignores other roles and finished runs", () => {
    const state = run(18);
    expect(withGameplayRuleset("20261022-r27", () => settleTeacherChildFavorMilestones(state))).toBe(state);
    const other = { ...state, selectedRoleId: "genius" as const };
    expect(settleTeacherChildFavorMilestones(other)).toBe(other);
    const finished = { ...state, phase: "finished" as const };
    expect(settleTeacherChildFavorMilestones(finished)).toBe(finished);
  });
});
