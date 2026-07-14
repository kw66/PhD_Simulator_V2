import { describe, expect, it } from "vitest";

import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { createJointTrainingState, reconcileJointTrainingCitationBonus, shouldEnqueueJointTrainingInvite } from "../src/core/v2-joint-training-system";
import { createResearchCapacityState } from "../src/core/v2-research-cap-system";

describe("v2 joint training system", () => {
  it("enqueues only after the audited deep-talk threshold is met", () => {
    expect(shouldEnqueueJointTrainingInvite({
      conferenceEncounterState: {
        ...createConferenceEncounterState(),
        metBigBullCoop: true,
        bigBullDeepCount: 2,
      },
      eventQueue: [],
    })).toBe(true);

    expect(shouldEnqueueJointTrainingInvite({
      conferenceEncounterState: {
        ...createConferenceEncounterState(),
        metBigBullCoop: true,
        bigBullDeepCount: 1,
      },
      eventQueue: [],
    })).toBe(false);
  });

  it("reconciles the audited citation bonus only after publication citations actually grow", () => {
    const result = reconcileJointTrainingCitationBonus({
      active: true,
      totalCitations: 1600,
      hasPublicationCitationGain: true,
      jointTrainingState: { citationBonusApplied: 4 },
      researchCapacityState: {
        ...createResearchCapacityState(),
        jointTrainingCitationCapBonus: 4,
      },
    });

    expect(result.capDelta).toBe(2);
    expect(result.jointTrainingState).toEqual({ citationBonusApplied: 6 });
    expect(result.researchCapacityState).toEqual({
      baseCap: 20,
      jointTrainingCitationCapBonus: 6,
      otherCapBonus: 0,
    });
    expect(result.logs).toEqual(["联培加成：引用达到 1600，科研上限 +2（联培累计 +6）。"]);

    const noPublicationGain = reconcileJointTrainingCitationBonus({
      active: true,
      totalCitations: 1600,
      hasPublicationCitationGain: false,
      jointTrainingState: createJointTrainingState(),
      researchCapacityState: createResearchCapacityState(),
    });
    expect(noPublicationGain.capDelta).toBe(0);
    expect(noPublicationGain.jointTrainingState).toEqual({ citationBonusApplied: 0 });
    expect(noPublicationGain.researchCapacityState).toEqual(createResearchCapacityState());
  });
});
