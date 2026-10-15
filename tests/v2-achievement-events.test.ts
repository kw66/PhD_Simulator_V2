import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { observeEventAchievements, evaluateEventAchievements } from "../src/core/v2-achievement-events";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { recordLabFinance } from "../src/core/v2-lab-finance-ledger";
import { applyRoleTalentRest } from "../src/core/v2-role-talent-rest";
import { createSocialCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { createEntertainmentCampusRandomEvent } from "../src/core/v2-random-events-campus-entertainment";
import { createImageMisuseBuff } from "../src/core/v2-academic-integrity";
import { createScholarshipEvent } from "../src/core/v2-fixed-events-scholarship";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import type { GameState, PendingEvent, ResolvedEventRecord } from "../src/core/v2-types";

function state(): GameState {
  const initial = createInitialState();
  return { ...initial, phase: "playing", degree: "master", year: 1, month: 9, totalMonths: 1,
    selectedAdvisorName: "导师", playerName: "学生", eventQueue: [],
    player: { ...initial.player, san: 20, money: 100 }, sanCap: 100,
    achievementProgress: createAchievementRunProgress() };
}

function record(chainId: string, choice: string, n = 1): ResolvedEventRecord {
  return { id: `${chainId}:${choice}:${n}`, chainId, source: "random", completedAtYear: n,
    completedAtMonth: 9, completedAtTotalMonths: n * 12,
    stages: [{ title: "事件", description: "", choices: [], selectedChoiceId: choice }] };
}

function finish(previous: GameState, item: ResolvedEventRecord, run = createAchievementRunProgress()) {
  const next = { ...previous, eventHistory: [...previous.eventHistory, item] };
  observeEventAchievements(previous, next, run);
  return { next, run };
}

function choose(input: GameState, choiceId?: string): GameState {
  const event = input.eventQueue[0]!;
  return dispatchAction(input, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

function queued(input: GameState, event: PendingEvent): GameState {
  return { ...input, eventQueue: [createEventQueueItem(event, 0)] };
}

describe("event achievement committed evidence", () => {
  it("requires all three distinct refusal types and ignores scene previews/re-observation", () => {
    let current = state();
    const run = createAchievementRunProgress();
    observeEventAchievements(current, current, run);
    expect(run.counters).toEqual({});
    for (const [id, choice] of [["random-4", "random-4-reject-1"], ["random-2", "random-2-refuse-1"], ["random-1", "random-1-refuse-1"]]) {
      const { next } = finish(current, record(id!, choice!), run);
      observeEventAchievements(current, next, run);
      current = next;
    }
    expect(run.counters["refuse-project"]).toBe(1);
    expect(run.counters["refuse-review"]).toBe(1);
    expect(run.counters["refuse-undergrad"]).toBe(1);
    expect(run.satisfied).toContain("global:learn-to-refuse");
  });

  it.each([
    ["conference-1-9-A-city-activity", "tea-break", "global:tea-break"],
    ["conference-1-9-A-city-activity", "tour-local", "global:funded-travel"],
    ["ccig-y1-m6-activity", "ccig-activity-travel", "global:funded-travel"],
    ["illness-stomach", "illness-stomach-hospital-1", "global:cherish-life"],
    ["random-15", "random-15-terraria-1", "global:terraria"],
    ["random-15", "random-15-magic-tower-1", "global:magic-tower"],
  ])("counts three committed %s / %s", (chain, choice, achievement) => {
    let current = state();
    const run = createAchievementRunProgress();
    for (let i = 1; i <= 3; i++) {
      current = finish(current, record(chain, choice, i), run).next;
      expect(run.satisfied.includes(achievement)).toBe(i >= 3);
    }
  });

  it("does not count medicine as hospital or failed invitations as joint training", () => {
    const before = state();
    const run = createAchievementRunProgress();
    const after = { ...before, eventHistory: [record("illness-fever", "illness-fever-medicine-1"), record("joint-training", "decline")] };
    observeEventAchievements(before, after, run);
    expect(run.counters["hospital"]).toBeUndefined();
    expect(run.satisfied).not.toContain("global:joint-training");
  });

  it("counts VALSE poster and completed rather than accepted internships", () => {
    const before = state();
    const run = createAchievementRunProgress();
    let after = { ...before, internshipCount: 2, internshipState: { ...before.internshipState, active: true },
      eventHistory: [record("ccig-y1-m6-activity", "ccig-activity-poster-y1-m6")] };
    observeEventAchievements(before, after, run);
    expect(run.satisfied).toContain("global:valse-poster");
    expect(run.satisfied).not.toContain("global:three-internships");
    const previous = after;
    after = { ...after, internshipCount: 3 };
    observeEventAchievements(previous, after, run);
    expect(run.satisfied).toContain("global:three-internships");
  });

  it("requires three consecutive years of stamps and keeps completed streaks", () => {
    let current = state();
    const run = createAchievementRunProgress();
    for (const year of [1, 3, 4]) current = finish(current, record("teachers-day", `teachers-day-stamp-y${year}`, year), run).next;
    expect(run.satisfied).not.toContain("global:beloved-mentor");
    current = finish(current, record("teachers-day", "teachers-day-stamp-y5", 5), run).next;
    expect(run.satisfied).toContain("global:beloved-mentor");
    finish(current, record("teachers-day", "teachers-day-message-y6", 6), run);
    expect(run.satisfied).toContain("global:beloved-mentor");
  });

  it("tracks consecutive scholarship years, resetting after a gap", () => {
    let current = state();
    const run = createAchievementRunProgress();
    for (const year of [1, 3, 4, 5]) {
      const next = { ...current, scholarshipState: { ...current.scholarshipState, lastAwardYear: year } };
      observeEventAchievements(current, next, run);
      observeEventAchievements(current, next, run);
      expect(run.satisfied.includes("global:model-student")).toBe(year === 5);
      current = next;
    }
  });

  it("records scholarship disqualification only after result confirmation", () => {
    const initial = state();
    const original = { ...initial, buffs: [createImageMisuseBuff()], totalResearchScore: 6,
      externalPublications: [createGrantedPublishedPaper(1, 0, { target: "A", acceptedScore: 4 })] };
    let current = queued(original, createScholarshipEvent(original, () => 0));
    current = choose(current);
    current = choose(current);
    expect(current.eventQueue[0]?.choices[0]?.effects.achievementFacts).toContain("reported-scholarship");
    expect(current.achievementProgress?.counters["reported-scholarship"]).toBeUndefined();
    current = choose(current);
    expect(current.achievementProgress?.counters["reported-scholarship"]).toBe(1);
    expect(current.scholarshipState.awardCount ?? 0).toBe(0);
  });

  it("records simultaneous distinct event chains, not repeated scenes", () => {
    const before = state();
    const event = createSocialCampusRandomEvent(before, () => 0);
    const run = createAchievementRunProgress();
    const repeated = { ...before, eventQueue: Array.from({ length: 6 }, (_, i) => createEventQueueItem({ ...event, id: `copy-${i}` }, i)) };
    observeEventAchievements(before, repeated, run);
    expect(run.satisfied).not.toContain("global:event-burst");
    const many = { ...before, eventQueue: [17, 18, 1, 2, 3, 4].map((id, i) => createEventQueueItem({ ...event, id: `id-${id}`, chainId: `random-${id}` }, i)) };
    observeEventAchievements(before, many, run);
    expect(run.satisfied).toEqual(expect.arrayContaining(["global:event-burst", "global:double-trouble"]));
  });

  it("counts automatic confirmations once across nested monthly dispatches", () => {
    const base = state();
    const pending: PendingEvent = { id: "tea-result", chainId: "conference-1-activity", title: "会场活动",
      description: "", source: "fixed", blocking: true, stage: "result", deadlineMonths: 0,
      choices: [{ id: "tea-break", label: "确定", outcome: "", effects: {} }] };
    const original: GameState = { ...base, blockLinearEvents: false,
      player: { ...base.player, favor: 10, social: 10 },
      eventQueue: [1, 2, 3].map(index => createEventQueueItem({ ...pending,
        id: `tea-result-${index}`, chainId: `conference-${index}-activity` }, index)),
      availableRandomEvents: [], pendingRandomEvents: [],
    };
    const next = dispatchAction(original, "next-month");
    expect(next.achievementProgress?.counters["tea-break"]).toBe(3);
    expect(next.achievementProgress?.satisfied).toContain("global:tea-break");
    expect(original.achievementProgress?.counters["tea-break"]).toBeUndefined();
  });

  it("keeps KTV facts out of act-two/act-three previews then credits one confirmed song", () => {
    const original = state();
    let current = queued(original, createSocialCampusRandomEvent(original, () => 0));
    current = choose(current);
    const songChoice = current.eventQueue[0]!.choices.find((choice) => choice.id.includes("-ktv-"))!;
    current = choose(current, songChoice.id);
    expect(current.achievementProgress?.counters["karaoke:0"]).toBeUndefined();
    current = choose(current);
    expect(current.achievementProgress?.counters["karaoke:0"]).toBe(1);
    expect(original.achievementProgress?.counters).toEqual({});
  });

  it("identifies shiny catches from structured facts, never coin deltas", () => {
    const original = state();
    let current = queued(original, createEntertainmentCampusRandomEvent(original, () => 0));
    current = choose(current);
    const roco = current.eventQueue[0]!.choices.find((choice) => choice.id.includes("-kings-"))!;
    current = choose(current, roco.id);
    expect(current.achievementProgress?.counters["roco-shiny"]).toBeUndefined();
    current = choose(current);
    expect(current.achievementProgress?.counters["roco-shiny"]).toBe(1);
  });

  it.each([[false, 0, true], [true, 0, false], [false, 1, false]] as const)(
    "first badminton victory requires no racket and no earlier attempt (%s, %s)", (racket, played, expected) => {
      let original = state();
      original = { ...original, player: { ...original.player, san: 40 },
        eventSupport: { ...original.eventSupport, hasBadmintonRacket: racket },
        eventCounters: { ...original.eventCounters, badmintonCount: played } };
      let current = queued(original, createSocialCampusRandomEvent(original, () => 0));
      current = choose(current);
      current = choose(current, current.eventQueue[0]!.choices.find((choice) => choice.id.includes("-badminton-"))!.id);
      expect(current.achievementProgress?.counters["first-badminton-win"]).toBeUndefined();
      current = choose(current);
      expect((current.achievementProgress?.counters["first-badminton-win"] ?? 0) > 0).toBe(expected);
    },
  );

  it("counts only actual active-rest SAN recovery, excluding capped healing and year-summary", () => {
    let current = state();
    current = { ...current, player: { ...current.player, san: 98 } };
    current = applyRoleTalentRest(current);
    expect(current.achievementProgress?.counters["rest-san"]).toBe(2);
    current = applyRoleTalentRest(current);
    expect(current.achievementProgress?.counters["rest-san"]).toBe(2);
    current = applyRoleTalentRest(current, { yearSummary: true });
    expect(current.achievementProgress?.counters["rest-san"]).toBe(2);
    const passive = { ...current, player: { ...current.player, san: 20 } };
    observeEventAchievements(current, passive, current.achievementProgress!);
    expect(current.achievementProgress?.counters["rest-san"]).toBe(2);
  });

  it("includes own masters expenses and excludes fellow expenses, income, and doctoral spending", () => {
    let current = state();
    for (const [category, amount, own] of [
      ["player-experiment", -40, false], ["student-reimbursement", -20, false],
      ["conference-travel", -10, false], ["conference-registration", -10, true], ["journal-fee", -20, true],
      ["conference-registration", -40, false], ["journal-fee", -40, false], ["student-experiment", -40, false], ["grant-income", 50, false],
    ] as const) current = recordLabFinance(current, category, amount, own);
    expect(current.achievementProgress?.counters["master-advisor-funding"]).toBe(100);
    current = recordLabFinance({ ...current, degree: "phd" }, "player-experiment", -50);
    expect(current.achievementProgress?.counters["master-advisor-funding"]).toBe(100);
    observeEventAchievements(state(), current, current.achievementProgress!);
    expect(evaluateEventAchievements(current, current.achievementProgress!)).toContain("global:advisor-funding-user");
  });
});
