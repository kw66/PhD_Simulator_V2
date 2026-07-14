import { describe, expect, it } from "vitest";

import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "../src/core/v2-internship-events";

describe("v2 internship events", () => {
  it("accept path activates internship immediately and keeps the result page separate", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      eventQueue: [createEventQueueItem(createInternshipInviteAct1(buildInternshipInviteContext(state)), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "accept" });

    expect(state.internshipState).toEqual({
      active: true,
      remainingMonths: 6,
      startTotalMonths: 0,
      experimentMultiplier: 1.25,
    });
    expect(state.eventQueue[0]?.chainId).toBe("internship-invite");
    expect(state.eventQueue[0]?.stage).toBe("result");

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "close" });
    expect(state.eventQueue).toHaveLength(0);
  });

  it("second decline permanently closes the internship line", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      conferenceCareerState: {
        ...state.conferenceCareerState,
        rejectedInternshipCount: 1,
      },
      eventQueue: [createEventQueueItem(createInternshipInviteAct1(buildInternshipInviteContext({
        ...state,
        conferenceCareerState: {
          ...state.conferenceCareerState,
          rejectedInternshipCount: 1,
        },
      })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "decline" });

    expect(state.conferenceCareerState.rejectedInternshipCount).toBe(2);
    expect(state.conferenceCareerState.permanentlyBlockedInternship).toBe(true);
    expect(state.eventQueue[0]?.stage).toBe("result");
  });
});
