import { createAdvancedConferenceActivityOptions } from "../src/core/v2-conference-activity-advanced-options";
import { createConferenceMentorContact, createConferenceScholarContact, getConferenceMentorContact, getConferenceScholarContact, replaceConferenceMentorContact, replaceConferenceScholarContact } from "../src/core/v2-conference-contacts";
import { applyTierResist } from "../src/core/v2-sanity-rules";
import { describe, expect, it } from "vitest";

import { createConferenceActivityDecisionEvent } from "../src/core/v2-conference-activity-events";
import { createBaseConferenceActivityOptions } from "../src/core/v2-conference-activity-base-options";
import { scheduleConferenceAttendance, settleDueConferenceAttendance } from "../src/core/v2-conference-attendance";
import { buildConferenceDecisionEventsForAcceptedPapers } from "../src/core/v2-conference-events";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { selectConferenceActivityOptions } from "../src/core/v2-conference-activity-options";
import { createConferenceCareerState, createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { activateInternship, activateRemoteInternship, createInternshipState } from "../src/core/v2-internship-system";
import { createLoverState } from "../src/core/v2-lover-system";
import { createRelationshipState } from "../src/core/v2-relationship-rules";

describe("v2 conference activity", () => {
  const baseContext = {
    id: "conf-activity-1",
    conferenceName: "CVPR",
    conferenceYear: 2031,
    city: "测试城",
    country: "测试国",
    paperCount: 1,
    grade: "C" as const,
  };

  const createBuildState = (overrides: Partial<Parameters<typeof selectConferenceActivityOptions>[1]> = {}) => ({
    research: 0,
    social: 0,
    relationshipState: createRelationshipState(),
    conferenceEncounterState: createConferenceEncounterState(),
    conferenceCareerState: createConferenceCareerState(),
    internshipState: createInternshipState(),
    loverState: createLoverState(),
    ...overrides,
  });

  it("keeps old C-grade rule: only 3 base options are shown", () => {
    const options = selectConferenceActivityOptions(baseContext, createBuildState(), () => 0);
    expect(options.map((option) => option.id)).toEqual([
      "tour-local",
      "tea-break",
      "experiment-discussion",
    ]);
  });

  it("keeps short activity names and applies tea friendship without SAN recovery", () => {
    const options = createBaseConferenceActivityOptions(baseContext, createBuildState({ social: 12 }), () => 0);
    const tea = options.find((option) => option.id === "tea-break")!;
    expect(tea.label).toBe("茶歇交友");
    expect(tea.outcome).toBe("社交 +0.6（抵抗0.4）。");
    expect(tea.effects).toEqual({ social: 0.6 });
    for (const [id, label, action, effect] of [
      ["idea-networking", "广泛交流idea", "idea", { extraActions: 3 }],
      ["experiment-discussion", "同行交流实验", "experiment", { extraActions: 3 }],
      ["famous-scholar", "与著名学者交流", "idea", { multiplier: 1.25 }],
    ] as const) {
      const option = options.find((entry) => entry.id === id)!;
      expect(option.label).toBe(label);
      expect(option.effects.temporaryActionEffectUpdates).toEqual({ [action]: effect });
      expect(option.outcome).not.toContain("多");
    }
    expect(options.find((option) => option.id === "tour-local")?.label).toBe("顺便旅游");
  });

  it("keeps local travel in the story and only SAN in the settlement", () => {
    const activity = createConferenceActivityDecisionEvent(
      baseContext,
      createBuildState(),
      "自费参会，金币 -2",
      () => 0,
    );
    const travelChoice = activity.choices.find((choice) => choice.id === "tour-local");
    const result = travelChoice?.effects.enqueueEvents?.at(-1);

    expect(travelChoice?.outcome).toBe("SAN +5。");
    expect(result?.description).toContain("测试城");
    expect(result?.description).toContain("街道");
    expect(result?.description).toContain("机制结算");
    expect(result?.description).toContain("SAN +5");
    expect(result?.completionLog).not.toContain("金币");
  });

  it.each([["domestic", 4], ["asia", 5], ["west", 6]] as const)(
    "uses regional travel recovery for %s conferences",
    (region, recovery) => {
      const activity = createConferenceActivityDecisionEvent(
        { ...baseContext, region }, createBuildState(), "", () => 0,
      );
      const choice = activity.choices.find((entry) => entry.id === "tour-local")!;
      expect(choice.outcome).toBe(`SAN +${recovery}。`);
      expect(choice.effects.enqueueEvents?.[0]?.choices[0]?.effects.san).toBe(recovery);
    },
  );

  it("shows long titles once with short result references and preserves real citation multipliers", () => {
    const state = { ...createStartedGameState("normal"), totalMonths: 5, eventQueue: [] };
    const titles = ["A very long paper title repeated for a detailed scientific presentation", "另一篇很长很长的论文标题用于检查多论文结算的信息对应关系"];
    const root = buildConferenceDecisionEventsForAcceptedPapers(titles.map((title, index) => ({
      id: `paper-${index}`, title, target: "A", submittedMonth: 3, submittedYear: 1,
      acceptType: index === 0 ? "Oral" : "Poster",
      availableAtTotalMonths: 8,
    })), { ...state, research: 0, social: 0, favor: 0 }, () => 0)[0]!;
    expect(root.description).toContain(`论文1：《${titles[0]}》`);
    expect(root.description).toContain(`论文2：《${titles[1]}》`);
    expect(root.description).not.toContain("倍率");
    const name = root.conferencePreview!.context.conferenceName;
    expect(root.title).toBe(`${name}参会`);
    expect(root.choices[0]!.label).toBe("继续");
    const selection = root.choices[0]!.effects.enqueueEvents![0]!;
    expect(selection.description).not.toContain("注册费");
    expect(selection.description).toContain("同一场会议只收一次");
    const result = selection.choices.find((choice) => choice.id === "self")!.effects.enqueueEvents![0]!;
    expect(selection.title).toBe(`${name}参会 ➜ 参会方式`);
    expect(result.title).toBe(`${name}参会 ➜ 参会方式 ➜ 参会确认`);
    expect(result.choices[0]!.label).toBe("确定");
    expect(result.description).toContain("亲自参会");
    expect(result.description).not.toMatch(/展示完成|引用倍率/u);
    expect(result.completionLog).not.toMatch(/展示完成|展示已完成|引用倍率/u);
    for (const title of titles) expect(result.description).not.toContain(title);
    expect(result.choices[0]!.effects.enqueueEvents).toBeUndefined();
    const scheduled = scheduleConferenceAttendance(state, result.choices[0]!.effects.scheduleConferenceAttendance!);
    expect(settleDueConferenceAttendance(scheduled)).toBe(scheduled);
    expect(scheduled.eventQueue).toHaveLength(0);
    const attended = settleDueConferenceAttendance({ ...scheduled, totalMonths: 8 });
    const activityRoot = attended.eventQueue[0]!;
    const activityDecision = activityRoot.choices[0]!.effects.enqueueEvents![0]!;
    expect(activityRoot.title).toBe(`${name}活动`);
    expect(activityRoot.choices[0]!.label).toBe("继续");
    expect(activityDecision.title).toBe(`${name}活动 ➜ 选择安排`);
    for (const choice of activityDecision.choices) {
      const final = choice.effects.enqueueEvents![0]!;
      expect(final.title).toBe(`${name}活动 ➜ 选择安排 ➜ 活动结果`);
      expect(final.choices[0]!.label).toBe("确定");
      expect(final.description).toContain("论文1：Oral 展示完成，会后引用倍率 ×1.50");
      expect(final.description).toContain("论文2：Poster 展示完成");
      expect(final.description).not.toContain("×1.00");
      for (const title of titles) expect(final.description).not.toContain(title);
    }
    for (const event of [activityRoot, activityDecision, ...activityDecision.choices.map((choice) => choice.effects.enqueueEvents![0]!)]) {
      expect(event.description).not.toMatch(/金币|科研经费/);
      expect(event.completionLog ?? "").not.toMatch(/金币|科研经费|引用倍率/);
    }
    const tour = activityDecision.choices.find((choice) => choice.id === "tour-local")!.effects.enqueueEvents![0]!;
    const travelSan = activityRoot.conferenceActivityPreview?.context.region === "domestic" ? 4
      : activityRoot.conferenceActivityPreview?.context.region === "west" ? 6 : 5;
    expect(tour.description).toContain(`结果：SAN +${travelSan}`);
    expect(tour.choices[0]!.effects.san).toBe(travelSan);
    expect(tour.completionLog).toBe(`SAN +${travelSan}`);
    expect(settleDueConferenceAttendance(attended)).toBe(attended);
  });

  it("draws five mixed A options with no advanced guarantee", () => {
    for (const social of [0, 6, 12]) {
      const options = selectConferenceActivityOptions({ ...baseContext, grade: "A" }, createBuildState({ social }), () => 0);
      expect(options.map((option) => option.id)).toEqual([
        "tour-local", "tea-break", "experiment-discussion", "idea-networking", "famous-scholar",
      ]);
    }
  });

  it("offers exactly three advanced options and excludes enterprise from C meetings", () => {
    const state = createBuildState({ social: 6 });
    expect(selectConferenceActivityOptions({ ...baseContext, grade: "B" }, state, () => 0.99).map((option) => option.id))
      .toEqual(["enterprise-networking", "opposite-scholar", "big-bull-coop", "famous-scholar"]);
    expect(createAdvancedConferenceActivityOptions(state, () => 0.99)).toHaveLength(3);
    expect(selectConferenceActivityOptions(baseContext, state, () => 0.99).map((option) => option.id))
      .toEqual(["famous-scholar", "idea-networking", "experiment-discussion"]);
    expect(createAdvancedConferenceActivityOptions(createBuildState({ social: 5.9 }), () => 0.99)).toEqual([]);
  });

  it("invites experienced enterprise contacts only from the second exchange", () => {
    const state = createBuildState({ social: 6, internshipCount: 1 });
    const enterprise = (current: typeof state) => createAdvancedConferenceActivityOptions(current, () => 0.99)
      .find((option) => option.id === "enterprise-networking")!;
    expect(enterprise(state).effects.triggerInternshipInvite).toBe(false);
    const second = { ...state, conferenceCareerState: { ...state.conferenceCareerState, enterpriseCount: 1 } };
    expect(enterprise(second).effects.triggerInternshipInvite).toBe(true);
    expect(enterprise({ ...second, internshipCount: 0 }).effects.triggerInternshipInvite).toBe(false);
    for (const internshipState of [activateInternship(), activateRemoteInternship(11)]) {
      const choice = enterprise({ ...second, internshipState, totalMonths: 11 });
      expect(choice.effects.triggerInternshipInvite).toBe(false);
      expect(choice.effects.internshipStateUpdates).toBeUndefined();
      expect(choice.effects.temporaryActionEffectUpdates).toEqual({ experiment: { multiplier: 1.25 } });
    }
  });

  it("tracks mentor cooperation per contact with no repeat permanent cap reward", () => {
    const mentor = createConferenceMentorContact({ id: baseContext.id, levelRoll: 0.99 });
    const state = createBuildState({ social: 6, research: 12 });
    for (const cooperationCount of [0, 1, 2, 4]) {
      const encounter = { ...state.conferenceEncounterState, bigBull: { ...mentor, cooperationCount } };
      const option = createAdvancedConferenceActivityOptions({ ...state, conferenceEncounterState: encounter }, () => 0.99)[0]!;
      expect(option.label).toBe("大牛合作");
      expect(option.effects.conferenceEncounterUpdates?.bigBull).toEqual({ ...mentor, cooperationCount: cooperationCount + 1 });
      expect(option.effects.social).toBe(cooperationCount >= 1 ? 0.8 : undefined);
      expect(option.effects.triggerJointTrainingInvite).toBe(cooperationCount >= 2);
      expect(option.effects.temporaryActionEffectUpdates).toEqual({ writing: { bonus: 8 } });
      expect(option.effects.researchCapacityStateDeltas).toBeUndefined();
      const completed = createAdvancedConferenceActivityOptions({ ...state, conferenceEncounterState: {
        ...encounter, bigBullCooperation: true,
      } }, () => 0.99)[0]!;
      expect(completed.effects.triggerJointTrainingInvite).toBe(false);
      expect(completed.effects.researchCapacityStateDeltas).toBeUndefined();
    }
  });

  it.each([0, 0.499999, 0.5, 0.999999])("uses the 50 percent scholar split every encounter at roll %s", (roll) => {
    const beautiful = { ...createConferenceScholarContact("beautiful", { id: "beautiful" }), encounterCount: 2 };
    const smart = { ...createConferenceScholarContact("smart", { id: "smart" }), encounterCount: 4 };
    const state = createBuildState({ social: 12, conferenceEncounterState: {
      ...createConferenceEncounterState(), scholars: { beautiful, smart },
    } });
    const option = createAdvancedConferenceActivityOptions(state, () => roll)[1]!;
    expect(option.id).toBe("opposite-scholar");
    const type = roll < 0.5 ? "beautiful" : "smart";
    expect(option.effects.triggerLoverDevelopment).toBe(type);
    expect(option.effects.conferenceEncounterUpdates?.scholars?.[type]).toEqual({
      ...(type === "beautiful" ? beautiful : smart), encounterCount: type === "beautiful" ? 3 : 5,
    });
    expect(option.effects.social).toBe(0.6);
    expect(option.effects.san).toBe(type === "beautiful" ? 5 : undefined);
    expect(option.effects.temporaryActionEffectUpdates).toEqual(type === "smart" ? { idea: { bonus: 2, extraActions: 2 } } : undefined);
    expect(option.effects.sanCapDelta).toBeUndefined();
    expect(option.effects.research).toBeUndefined();
  });

  it("allows first-encounter romance at social 12 but penalizes an existing lover without clamping", () => {
    const state = createBuildState({ social: 12 });
    const first = createAdvancedConferenceActivityOptions(state, () => 0)[1]!;
    expect(first.effects.triggerLoverDevelopment).toBe("beautiful");
    expect(first.effects.social).toBeUndefined();
    const game = createStartedGameState("normal");
    for (const intimacy of [2, 12]) {
      const option = createAdvancedConferenceActivityOptions({ ...state,
        loverState: { ...state.loverState, active: true },
        loverProgressState: { ...game.loverProgressState, intimacy },
      }, () => 0)[1]!;
      expect(option.effects.loverIntimacyDelta).toBe(applyTierResist(-6, intimacy).effectiveChange);
      expect(option.effects.triggerLoverDevelopment).toBeUndefined();
      if (intimacy === 2) expect(intimacy + option.effects.loverIntimacyDelta!).toBeLessThan(0);
    }
  });

  it("keeps contact helpers pure, stable and replacement-specific", () => {
    const seed = { id: "conference", roll: 0.3, levelRoll: 0.8, playerGender: "female" as const };
    const encounter = createConferenceEncounterState();
    const before = structuredClone(encounter);
    const mentor = getConferenceMentorContact(encounter, seed);
    const scholar = getConferenceScholarContact(encounter, "smart", seed);
    expect(mentor).toEqual(getConferenceMentorContact(encounter, seed));
    expect(mentor.level).toBe(2);
    expect(scholar.gender).toBe("male");
    expect(encounter).toEqual(before);
    expect(getConferenceMentorContact({ ...encounter, bigBull: mentor }, { id: "different" })).toBe(mentor);
    expect(getConferenceScholarContact({ ...encounter, scholars: { smart: scholar } }, "smart")).toBe(scholar);
    const nextMentor = replaceConferenceMentorContact({ ...mentor, cooperationCount: 9 }, seed);
    const nextScholar = replaceConferenceScholarContact({ ...scholar, encounterCount: 9 }, "smart", seed);
    expect(nextMentor.id).not.toBe(mentor.id);
    expect(nextMentor.name).not.toBe(mentor.name);
    expect(nextMentor.cooperationCount).toBe(0);
    expect(nextScholar.id).not.toBe(scholar.id);
    expect(nextScholar.name).not.toBe(scholar.name);
    expect(nextScholar.encounterCount).toBe(0);
    expect(nextScholar.gender).toBe(scholar.gender);
  });

  it("bounds identity size through one hundred deterministic replacements", () => {
    let mentor = createConferenceMentorContact();
    let scholar = createConferenceScholarContact("smart");
    const mentorIds = new Set([mentor.id]);
    const scholarIds = new Set([scholar.id]);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const nextMentor = replaceConferenceMentorContact(mentor, { id: `${mentor.id}:replacement` });
      const nextScholar = replaceConferenceScholarContact(scholar, "smart", { id: `${scholar.id}:replacement` });
      expect(nextMentor.id.length).toBeLessThan(64);
      expect(nextScholar.id.length).toBeLessThan(64);
      expect(mentorIds.has(nextMentor.id)).toBe(false);
      expect(scholarIds.has(nextScholar.id)).toBe(false);
      expect(nextMentor.name).not.toBe(mentor.name);
      expect(nextScholar.name).not.toBe(scholar.name);
      expect(nextMentor).toEqual(replaceConferenceMentorContact(mentor, { id: `${mentor.id}:replacement` }));
      mentorIds.add(nextMentor.id);
      scholarIds.add(nextScholar.id);
      mentor = nextMentor;
      scholar = nextScholar;
    }
  });
});
