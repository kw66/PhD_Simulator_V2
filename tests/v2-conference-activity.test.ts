import { describe, expect, it } from "vitest";

import { createConferenceActivityDecisionEvent, selectConferenceActivityOptions } from "../src/core/v2-conference-activity";
import { createConferenceCareerState } from "../src/core/v2-conference-career";
import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { activateInternship, createInternshipState } from "../src/core/v2-internship-system";
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

  it("keeps local travel in the story and only SAN in the settlement", () => {
    const activity = createConferenceActivityDecisionEvent(
      baseContext,
      createBuildState(),
      "自费参会，金币 -2",
      () => 0,
    );
    const travelChoice = activity.choices.find((choice) => choice.id === "tour-local");
    const result = travelChoice?.effects.enqueueEvents?.at(-1);

    expect(travelChoice?.outcome).toBe("SAN +6。");
    expect(result?.description).toContain("测试城");
    expect(result?.description).toContain("街道");
    expect(result?.description).toContain("机制结算");
    expect(result?.description).toContain("SAN +6");
  });

  it("falls back to four base options for A-grade before follow-up lines are migrated", () => {
    const options = selectConferenceActivityOptions({ ...baseContext, grade: "A" }, createBuildState(), () => 0);
    expect(options.map((option) => option.id)).toEqual([
      "tour-local",
      "tea-break",
      "experiment-discussion",
      "idea-networking",
    ]);
  });

  it("offers audited advanced first-encounter options for B-grade meetings when social is high enough", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({ social: 6 }),
      () => 0.99,
    );

    expect(options.map((option) => option.id)).toEqual([
      "smart-scholar",
      "beautiful-scholar",
      "big-bull-coop",
      "enterprise-networking",
    ]);
  });

  it("builds famous scholar as pure idea multiplier and marks the encounter", () => {
    const rolls = [0.8, 0.7, 0.7];
    const activity = createConferenceActivityDecisionEvent(
      baseContext,
      createBuildState(),
      "自费参会，金币 -2",
      () => rolls.shift() ?? 0,
    );
    expect(activity.choices.map((choice) => choice.id)).toEqual([
      "famous-scholar",
      "peer-collaboration",
      "idea-networking",
    ]);

    const famousScholarChoice = activity.choices.find((choice) => choice.id === "famous-scholar");
    const famousResultChoice = famousScholarChoice?.effects.enqueueEvents?.[0]?.choices[0];
    expect(famousResultChoice?.effects.temporaryActionEffectUpdates).toEqual({
      idea: { multiplier: 1.25 },
    });
    expect(famousResultChoice?.effects.conferenceEncounterUpdates).toBeUndefined();
    expect(famousScholarChoice?.effects.enqueueEvents?.[0]?.chainId).toBe(`${baseContext.id}-activity`);
  });

  it("tracks enterprise networking as a low-coupling conference career counter", () => {
    const rolls = [0.99, 0.99, 0.99];
    const activity = createConferenceActivityDecisionEvent(
      baseContext,
      createBuildState(),
      "导师报销，导师好感 -1",
      () => rolls.shift() ?? 0.99,
    );
    const enterpriseChoice = activity.choices.find((choice) => choice.id === "enterprise-networking");

    const enterpriseResultChoice = enterpriseChoice?.effects.enqueueEvents?.[0]?.choices[0];
    expect(enterpriseResultChoice?.effects.temporaryActionEffectUpdates).toEqual({
      experiment: { multiplier: 1.25 },
    });
    expect(enterpriseResultChoice?.effects.conferenceCareerUpdates).toEqual({
      enterpriseCount: 1,
    });
    expect(enterpriseResultChoice?.effects.triggerInternshipInvite).toBe(true);
  });

  it("grows active internship multiplier when enterprise networking happens during internship", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({ social: 6, internshipState: activateInternship() }),
      () => 0.99,
    );
    const enterpriseChoice = options.find((option) => option.id === "enterprise-networking");

    expect(enterpriseChoice?.effects.internshipStateUpdates).toEqual({
      active: true,
      remainingMonths: 6,
      experimentMultiplier: 1.3,
    });
  });

  it("offers the audited deep joint-training option after big-bull cooperation has been opened", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({
        social: 6,
        research: 12,
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          metBigBullCoop: true,
          bigBullDeepCount: 1,
        },
      }),
      () => 0.99,
    );
    const jointTrainingChoice = options.find((option) => option.id === "big-bull-joint-training");

    expect(jointTrainingChoice?.effects.temporaryActionEffectUpdates).toEqual({
      writing: { bonus: 8 },
    });
    expect(jointTrainingChoice?.effects.conferenceEncounterUpdates).toEqual({
      bigBullDeepCount: 2,
    });
    expect(jointTrainingChoice?.effects.triggerJointTrainingInvite).toBe(true);
  });

  it("offers beautiful-lover follow-up after the audited second-threshold setup", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({
        social: 12,
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          metBeautiful: true,
          beautifulCount: 1,
        },
      }),
      () => 0.99,
    );
    const loverChoice = options.find((option) => option.id === "beautiful-lover-development");

    expect(loverChoice?.effects.san).toBe(8);
    expect(loverChoice?.effects.sanCapDelta).toBe(3);
    expect(loverChoice?.effects.conferenceEncounterUpdates).toEqual({
      beautifulCount: 2,
    });
    expect(loverChoice?.effects.triggerLoverDevelopment).toBe("beautiful");
  });

  it("offers smart-lover follow-up with the audited immediate SAN and research gain", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({
        social: 12,
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          metSmart: true,
          smartCount: 1,
        },
      }),
      () => 0.99,
    );
    const loverChoice = options.find((option) => option.id === "smart-lover-development");

    expect(loverChoice?.effects.san).toBe(1);
    expect(loverChoice?.effects.research).toBe(1);
    expect(loverChoice?.effects.conferenceEncounterUpdates).toEqual({
      smartCount: 2,
    });
    expect(loverChoice?.effects.triggerLoverDevelopment).toBe("smart");
  });

  it("offers post-joint-training big-bull cooperation with the audited cap gain", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({
        social: 6,
        conferenceEncounterState: {
          ...createConferenceEncounterState(),
          bigBullCooperation: true,
          bigBullCoopCount: 2,
          metBigBullCoop: true,
        },
      }),
      () => 0.99,
    );
    const cooperationChoice = options.find((option) => option.id === "big-bull-coop");

    expect(cooperationChoice?.effects.social).toBe(1);
    expect(cooperationChoice?.effects.temporaryActionEffectUpdates).toEqual({
      writing: { bonus: 8 },
    });
    expect(cooperationChoice?.effects.researchCapacityStateDeltas).toEqual({
      otherCapBonus: 1,
    });
    expect(cooperationChoice?.effects.conferenceEncounterUpdates).toEqual({
      bigBullCoopCount: 3,
    });
  });

});
