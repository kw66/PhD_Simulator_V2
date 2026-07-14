import { describe, expect, it } from "vitest";

import { createConferenceActivityAct1, selectConferenceActivityOptions } from "../src/core/v2-conference-activity";
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
    const act1 = createConferenceActivityAct1(baseContext, createBuildState(), () => rolls.shift() ?? 0);
    const act2 = act1.choices[0]?.effects.enqueueEvents?.[0];
    expect(act2?.choices.map((choice) => choice.id)).toEqual([
      "famous-scholar",
      "peer-collaboration",
      "idea-networking",
    ]);

    const famousScholarChoice = act2?.choices[0];
    expect(famousScholarChoice?.effects.temporaryActionEffectUpdates).toEqual({
      idea: { multiplier: 1.25 },
    });
    expect(famousScholarChoice?.effects.conferenceEncounterUpdates).toEqual({
      metBigBull: true,
    });
    expect(famousScholarChoice?.effects.enqueueEvents?.[0]?.chainId).toBe("conference-activity");
  });

  it("tracks enterprise networking as a low-coupling conference career counter", () => {
    const rolls = [0.99, 0.99, 0.99];
    const act1 = createConferenceActivityAct1(baseContext, createBuildState(), () => rolls.shift() ?? 0.99);
    const act2 = act1.choices[0]?.effects.enqueueEvents?.[0];
    const enterpriseChoice = act2?.choices.find((choice) => choice.id === "enterprise-networking");

    expect(enterpriseChoice?.effects.temporaryActionEffectUpdates).toEqual({
      experiment: { multiplier: 1.25 },
    });
    expect(enterpriseChoice?.effects.conferenceCareerUpdates).toEqual({
      enterpriseCount: 1,
    });
    expect(enterpriseChoice?.effects.triggerInternshipInvite).toBe(true);
  });

  it("grows active internship multiplier when enterprise networking happens during internship", () => {
    const options = selectConferenceActivityOptions(
      { ...baseContext, grade: "B" },
      createBuildState({ social: 6, internshipState: activateInternship(12) }),
      () => 0.99,
    );
    const enterpriseChoice = options.find((option) => option.id === "enterprise-networking");

    expect(enterpriseChoice?.effects.internshipStateUpdates).toEqual({
      active: true,
      remainingMonths: 6,
      startTotalMonths: 12,
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
