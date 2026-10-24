import { describe, expect, it } from "vitest";
import { CAREER_JOBS, getCareerAbility } from "../src/core/v2-career-rules";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { collectFixedEventsForState } from "../src/core/v2-fixed-events";
import { getCareerPreparationFailure, prepareCareer } from "../src/core/v2-graduation-career";
import { createCareerRecruitmentEvent, shouldScheduleCareerRecruitment } from "../src/core/v2-monthly-career-events";
import type { GameState } from "../src/core/v2-types";

function readyState(degree: "master" | "phd" = "master", month = 1): GameState {
  const base = createStartedGameState("normal");
  const year = degree === "master" ? 3 : 6;
  return {
    ...base, degree, year, month, totalMonths: (year - 1) * 12 + month, sanCap: 50,
    selectedAdvisorName: "王老师", eventQueue: [],
    player: { ...base.player, research: 20, san: 40, money: 100 },
    advisorProgressState: { ...base.advisorProgressState, funding: 1000 },
  };
}

function advanceScene(state: GameState, choiceId: string): GameState {
  const event = state.eventQueue.find((item) => item.source === "career")!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId });
}

function startRecruitment(state: GameState, random: () => number): GameState {
  return enqueueEventQueueItem(state, createCareerRecruitmentEvent(state, random));
}

describe("career preparation", () => {
  it("adds only monthly practice, so a changed resume is counted once", () => {
    const state = readyState();
    const first = prepareCareer(state, "internet");
    expect(first.careerProgress.internet).toBe(10);
    expect(getCareerAbility(first, "internet")).toBe(30);
    expect(first.player.san).toBe(36);
    expect(prepareCareer(first, "internet")).toBe(first);
    const published = { ...first, totalResearchScore: 3, internshipCount: 1 };
    expect(getCareerAbility(published, "internet")).toBe(62);
    expect(published.careerProgress.internet).toBe(10);
    expect(prepareCareer({ ...published, month: 2, totalMonths: 26 }, "internet").careerProgress.internet).toBe(20);
  });

  it("keeps teacher hiring unavailable to master's students", () => {
    const master = readyState();
    expect(getCareerPreparationFailure(master, "academic")).toContain("博士");
    expect(prepareCareer(master, "academic")).toBe(master);
    expect(getCareerPreparationFailure(readyState("phd"), "academic")).toBeNull();
  });

  it.each([[0, 10], [0.99, 15]] as const)("uses current SAN before paying for civil-service preparation at roll %s", (roll, gain) => {
    const state = readyState();
    state.player.san = 20.9;
    state.sanCap = 50;
    const next = prepareCareer(state, "civilService", () => roll);
    expect(next.careerProgress.civilService).toBe(gain);
    expect(next.player.san).toBeCloseTo(17.9);
    expect(next.actionState.used).toBe(state.actionState.used);
    expect(prepareCareer(next, "civilService", () => roll)).toBe(next);
  });

  it.each([-5, 0])("does not subtract progress when current SAN is %s", (san) => {
    const state = readyState();
    state.player.san = san;
    expect(prepareCareer(state, "civilService", () => 0).careerProgress.civilService).toBe(0);
    expect(prepareCareer(state, "civilService", () => 0.99).careerProgress.civilService).toBe(5);
  });
});

describe("monthly recruitment", () => {
  it("keeps job buttons short and puts pay and difficulty into the second act", () => {
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      const state = readyState("phd", 4);
      const root = createCareerRecruitmentEvent(state, () => 0);
      const direction = root.choices.find((choice) => choice.id === `choose-${type}`)!.effects.enqueueEvents![0]!;
      const jobs = CAREER_JOBS[type];
      expect(root.title).toBe("找工作");
      expect(root.description.split("\n\n")).toHaveLength(2);
      expect(direction.title).toContain("找工作 ➜");
      expect(direction.description.split("\n\n")).toHaveLength(3);
      expect(direction.choices).toHaveLength(3);
      for (const choice of direction.choices) {
        const job = jobs.find((item) => choice.id === `apply-${item.id}`)!;
        expect(choice.label).toBe(job.name);
        expect(choice.label).not.toMatch(/%|万|年总包|年收入/);
        expect(direction.description).toContain(job.name);
        if (job.compensation) expect(direction.description).toContain(job.compensation);
        const result = choice.effects.enqueueEvents![0]!;
        expect(result.title).toContain("找工作 ➜");
        expect(result.description.split("\n\n机制结算")[0]!.split("\n\n")).toHaveLength(2);
        expect(result.description).not.toContain("成功率");
      }
    }
  });

  it("gives failed interviews their own story without inventing an offer", () => {
    const state = readyState();
    const root = createCareerRecruitmentEvent(state, () => 0.99);
    const direction = root.choices.find((choice) => choice.id === "choose-internet")!.effects.enqueueEvents![0]!;
    const result = direction.choices[0]!.effects.enqueueEvents![0]!;
    expect(result.description).toContain("没有下一轮");
    expect(result.description).not.toContain("录用通知");
  });

  it("schedules each final-year month within the four windows, even after offers", () => {
    for (const degree of ["master", "phd"] as const) {
      for (let month = 1; month <= 10; month += 1) {
        const state = readyState(degree, month);
        const expected = [
          ...(month <= 7 ? ["choose-internet"] : []),
          ...(month >= 2 && month <= 8 ? ["choose-stateOwned"] : []),
          ...(month >= 3 && month <= 9 ? ["choose-civilService"] : []),
          ...(degree === "phd" && month >= 4 ? ["choose-academic"] : []),
          "rest",
        ];
        const root = createCareerRecruitmentEvent(state, () => 0);
        expect(root.choices.map((choice) => choice.id), `${degree} month ${month}`).toEqual(expected);
        expect(collectFixedEventsForState(state, () => 0).filter((event) => event.source === "career"), `${degree} month ${month}`).toHaveLength(1);
        const offered = { ...state, careerOffers: {
          internet: { type: "internet" as const, jobId: "offer-internet", name: "已有大厂 offer", threshold: 45, score: 80 },
        } };
        expect(createCareerRecruitmentEvent(offered, () => 0).choices.map((choice) => choice.id)).toEqual(expected);
        expect(shouldScheduleCareerRecruitment(offered)).toBe(true);
      }
    }
    expect(createCareerRecruitmentEvent(readyState("phd", 4), () => 0).choices).toHaveLength(5);
    expect(createCareerRecruitmentEvent(readyState("master", 10), () => 0).description).toContain("招聘窗口都已结束");
    expect(shouldScheduleCareerRecruitment({ ...readyState("phd", 10), year: 5 })).toBe(false);
  });

  it("defers the interview until third-scene confirmation, then grants an offer and experience", () => {
    const initial = readyState();
    let current = startRecruitment(initial, () => 0);
    current = advanceScene(current, "choose-internet");
    expect(current.eventQueue.find((event) => event.source === "career")!.stage).toBe("act2");
    const jobChoice = current.eventQueue.find((event) => event.source === "career")!.choices[0]!;
    current = advanceScene(current, jobChoice.id);
    expect(current.eventQueue.find((event) => event.source === "career")!.stage).toBe("result");
    expect(current.player.san).toBe(40);
    expect(current.careerProgress.internet).toBe(0);
    expect(current.careerOffers.internet).toBeUndefined();
    current = advanceScene(current, "accept-offer");
    expect(current.player.san).toBe(34);
    expect(current.careerProgress.internet).toBe(5);
    expect(current.careerInterviewExperience.internet).toBe(5);
    expect(current.careerOffers.internet?.jobId).toBe(CAREER_JOBS.internet[0]!.id);
    expect(current.careerLastRecruitmentTotalMonths).toBe(initial.totalMonths);
    expect(shouldScheduleCareerRecruitment(current)).toBe(false);
  });

  it("records failed interviews and lets players keep or replace the only offer", () => {
    const initial = readyState();
    let failed = startRecruitment(initial, () => 0.99);
    failed = advanceScene(failed, "choose-internet");
    failed = advanceScene(failed, failed.eventQueue.find((event) => event.source === "career")!.choices[0]!.id);
    expect(failed.eventQueue.find((event) => event.source === "career")!.choices.map((choice) => choice.id)).toEqual(["confirm"]);
    failed = advanceScene(failed, "confirm");
    expect(failed.careerProgress.internet).toBe(10);
    expect(failed.careerInterviewExperience.internet).toBe(10);
    expect(failed.careerOffers.internet).toBeUndefined();

    const old = { type: "internet" as const, jobId: "old", name: "旧 offer", threshold: 1, score: 1 };
    for (const decision of ["keep-offer", "replace-offer"]) {
      let current = startRecruitment({ ...initial,
        careerProgress: { ...initial.careerProgress, internet: 100 },
        careerOffers: { internet: old } }, () => 0);
      current = advanceScene(current, "choose-internet");
      current = advanceScene(current, current.eventQueue.find((event) => event.source === "career")!.choices[1]!.id);
      expect(current.eventQueue.find((event) => event.source === "career")!.choices.map((choice) => choice.id))
        .toEqual(["replace-offer", "keep-offer"]);
      current = advanceScene(current, decision);
      expect(current.careerOffers.internet?.jobId === "old").toBe(decision === "keep-offer");
      expect(Object.keys(current.careerOffers)).toEqual(["internet"]);
    }

    for (const decision of ["keep-offer", "replace-offer"]) {
      let current = startRecruitment({ ...readyState("phd", 4), careerOffers: { internet: old } }, () => 0);
      current = advanceScene(current, "choose-stateOwned");
      current = advanceScene(current, current.eventQueue.find((event) => event.source === "career")!.choices[0]!.id);
      expect(current.eventQueue.find((event) => event.source === "career")!.choices.map((choice) => choice.id)).toEqual(["replace-offer", "keep-offer"]);
      current = advanceScene(current, decision);
      expect(Object.keys(current.careerOffers)).toEqual([decision === "keep-offer" ? "internet" : "stateOwned"]);
      expect(Object.values(current.careerOffers)).toHaveLength(1);
    }
  });

  it("never awards a zero-probability offer even when the random draw is zero", () => {
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      const initial = readyState("phd", 4);
      let current = startRecruitment(initial, () => 0);
      current = advanceScene(current, `choose-${type}`);
      const hardest = current.eventQueue.find((event) => event.source === "career")!.choices.at(-1)!;
      current = advanceScene(current, hardest.id);
      expect(current.eventQueue.find((event) => event.source === "career")!.choices.map((choice) => choice.id))
        .toEqual(["confirm"]);
      current = advanceScene(current, "confirm");
      expect(current.careerOffers).toEqual({});
      expect(current.careerInterviewExperience[type]).toBe(5);
      expect(shouldScheduleCareerRecruitment(current)).toBe(false);
    }
  });

  it.each([1, 10])("settles rest in one click without cost or lost offers in month %s", (month) => {
    const initial = readyState("master", month);
    initial.careerOffers.internet = { type: "internet", jobId: "old", name: "旧 offer", threshold: 1, score: 1 };
    let current = startRecruitment(initial, () => 0);
    current = advanceScene(current, "rest");
    expect(current.eventQueue.some(event => event.source === "career")).toBe(false);
    expect(current.player).toEqual(initial.player);
    expect(current.careerProgress).toEqual(initial.careerProgress);
    expect(current.careerInterviewExperience).toEqual(initial.careerInterviewExperience);
    expect(current.careerOffers).toEqual(initial.careerOffers);
    expect(current.careerLastRecruitmentTotalMonths).toBe(initial.totalMonths);
    expect(shouldScheduleCareerRecruitment(current)).toBe(false);
  });
});
