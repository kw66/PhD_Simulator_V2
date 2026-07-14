import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildJointTrainingContext, createJointTrainingAct1 } from "../src/core/v2-joint-training-events";

describe("v2 joint training events", () => {
  it("accept path marks cooperation and grants the audited permanent paper-action bonuses", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      totalCitations: 1200,
      eventQueue: [createEventQueueItem(createJointTrainingAct1(buildJointTrainingContext({ ...state, totalCitations: 1200 })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "accept" });

    expect(state.conferenceEncounterState.bigBullCooperation).toBe(true);
    expect(state.jointTrainingState).toEqual({ citationBonusApplied: 4 });
    expect(state.researchCapacityState).toEqual({
      baseCap: 20,
      jointTrainingCitationCapBonus: 4,
      otherCapBonus: 0,
    });
    expect(state.advisorProgressState.researchResource).toBe(2);
    expect(state.actionBonuses.idea).toBe(5);
    expect(state.actionBonuses.experiment).toBe(5);
    expect(state.eventQueue[0]?.stage).toBe("result");
  });

  it("second decline permanently blocks the joint-training line", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        rejectedBigBullCoopCount: 1,
      },
      eventQueue: [createEventQueueItem(createJointTrainingAct1(buildJointTrainingContext({
        ...state,
        conferenceEncounterState: {
          ...state.conferenceEncounterState,
          rejectedBigBullCoopCount: 1,
        },
      })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "decline" });

    expect(state.conferenceEncounterState.rejectedBigBullCoopCount).toBe(2);
    expect(state.conferenceEncounterState.permanentlyBlockedBigBullCoop).toBe(true);
  });
});
