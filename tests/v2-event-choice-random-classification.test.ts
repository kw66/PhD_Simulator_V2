import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { createCareerRecruitmentEvent } from "../src/core/v2-monthly-career-events";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "../src/core/v2-internship-events";
import { buildJointTrainingContext, createJointTrainingAct1 } from "../src/core/v2-joint-training-events";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";
import { createConferenceActivityDecisionEvent } from "../src/core/v2-conference-activity-events";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function ready(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, year: 2, month: 3, totalMonths: 15, selectedAdvisorName: "测试导师",
    eventQueue: [], player: { ...state.player, san: 30, social: 12, research: 12, favor: 18 },
    papers: [{ ...createDraftPaper(6, 0, () => 0), idea: 40, experiment: 40, writing: 20 }] };
}

function decision(root: PendingEvent): PendingEvent {
  const next = root.choices[0]?.effects.enqueueEvents?.[0];
  if (!next) throw new Error(`Missing decision for ${root.id}`);
  return next;
}

function randomDecision(id: number, state = ready(), roll = 0): PendingEvent {
  const root = createRandomEventById(id, state, () => roll).event;
  if (!root) throw new Error(`Missing random event ${id}`);
  expect(root.choices[0]?.outcomeRandom).toBeUndefined();
  return decision(root);
}

describe("event choice probability classification", () => {
  it("keeps probability mechanisms marked when talents or favor guarantee success", () => {
    const state: GameState = { ...ready(), selectedRoleId: "chosen", roleTalents: {
      levels: { "rare-color-fate": 1, "effortless-reinstall": 1 },
    } };
    for (const [id, label] of [[13, "自己重装"], [15, "玩洛克王国世界"], [8, "买显卡"]] as const) {
      const choice = randomDecision(id, state, 0.999).choices.find((entry) => entry.label === label)!;
      expect(choice.outcome).toContain("100%");
      expect(choice.outcomeRandom).toBe(true);
    }
  });

  it.each([0, 0.999])("does not confuse random event origins or percentage effects with probability choices (roll %s)", (roll) => {
    const badminton = randomDecision(7, ready(), roll).choices.find((entry) => entry.label === "打羽毛球")!;
    expect(badminton.outcome).toContain("生病概率 -10%");
    expect(badminton.outcomeRandom).toBeUndefined();
    for (const id of [5, 9, 17, 18]) {
      expect(randomDecision(id, ready(), roll).choices.length).toBeGreaterThan(1);
      expect(randomDecision(id, ready(), roll).choices.every((entry) => entry.outcomeRandom === undefined)).toBe(true);
    }
  });

  it("treats KTV's random achievement song as a gameplay outcome", () => {
    const songs = [0, 0.5, 0.999].map((roll) => {
      const choice = randomDecision(7, ready(), roll).choices.find((entry) => entry.label === "KTV 唱歌")!;
      expect(choice.outcomeRandom).toBe(true);
      return choice.effects.achievementFacts?.[0];
    });
    expect(new Set(songs).size).toBe(3);
  });

  it("marks all career applications but leaves choosing a direction and resting deterministic", () => {
    const state: GameState = { ...ready(), degree: "phd", year: 6, month: 4, totalMonths: 64 };
    const root = createCareerRecruitmentEvent(state, () => 0.5, true);
    expect(root.choices.every((entry) => entry.outcomeRandom === undefined)).toBe(true);
    const branches = root.choices.flatMap((choice) => choice.effects.enqueueEvents ?? []).flatMap((event) => event.choices);
    const applications = branches.filter((choice) => choice.id.startsWith("apply-"));
    expect(applications.length).toBeGreaterThanOrEqual(4);
    expect(applications.every((choice) => choice.outcomeRandom === true)).toBe(true);
    expect(branches.find((choice) => choice.id === "rest")?.outcomeRandom).toBeUndefined();
  });

  it.each([1, 2, 3, 4, 5, 6])("classifies scholarship year %s by its threshold mechanism", (year) => {
    const root = createScholarshipEvent({ ...ready(), year, totalResearchScore: 999 }, () => 0);
    const choices = decision(root).choices;
    const apply = choices.find((choice) => choice.effects.fixedEventResolution?.kind === "scholarship-apply");
    expect(apply).toBeDefined();
    expect(apply!.outcomeRandom).toBe(year >= 3 ? true : undefined);
    expect(choices.filter((choice) => choice !== apply).every((choice) => !choice.outcomeRandom)).toBe(true);
  });

  it("marks accepting unrevealed internship, training, and lover rewards, but not declining", () => {
    const state = ready();
    const roots = [
      createInternshipInviteAct1(buildInternshipInviteContext(state)),
      createJointTrainingAct1(buildJointTrainingContext(state, undefined, () => 0.5)),
      createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: state.conferenceEncounterState, totalMonths: state.totalMonths,
        type: "smart", playerGender: "male", state,
      }, () => 0.5)),
    ];
    for (const root of roots) {
      const choices = decision(root).choices;
      expect(choices.find((choice) => choice.id === "accept")?.outcomeRandom).toBe(true);
      expect(choices.find((choice) => choice.id === "decline")?.outcomeRandom).toBeUndefined();
    }
    const unavailable = createInternshipInviteAct1({ ...buildInternshipInviteContext(state), unavailable: true });
    expect(decision(unavailable).choices.every((choice) => !choice.outcomeRandom)).toBe(true);
  });

  it("marks the conference scholar outcome while keeping other randomly selected menu entries deterministic", () => {
    const state = ready();
    const event = createConferenceActivityDecisionEvent({ id: "classification", conferenceName: "CVPR",
      conferenceYear: 2026, city: "测试城", country: "测试国", paperCount: 1, grade: "A" },
    { ...state, research: 12, social: 12, playerAttributeState: state, playerGender: "male" }, "已参会", () => 0.999);
    expect(event.choices.find((choice) => choice.id === "opposite-scholar")?.outcomeRandom).toBe(true);
    expect(event.choices.filter((choice) => choice.id !== "opposite-scholar").every((choice) => !choice.outcomeRandom)).toBe(true);
  });

  it("omits metadata entirely from legacy r20 event trees", () => withGameplayRuleset("20261022-r20", () => {
    const root = createCareerRecruitmentEvent({ ...ready(), year: 6, degree: "phd" }, () => 0.5, true);
    const trees = [root, createRandomEventById(7, ready(), () => 0.5).event,
      createScholarshipEvent({ ...ready(), year: 4 }, () => 0.5),
      createInternshipInviteAct1(buildInternshipInviteContext(ready()))];
    expect(JSON.stringify(trees)).not.toContain('"outcomeRandom"');
  }));
});
