import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";

describe("v2 lover events", () => {
  it("accepting beautiful lover restores SAN to cap, raises cap, and activates loverState", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      player: { ...state.player, san: 7 },
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: state.conferenceEncounterState,
        totalMonths: state.totalMonths,
        type: "beautiful",
      })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "accept" });

    expect(state.loverState).toEqual({
      active: true,
      type: "beautiful",
      startTotalMonths: 0,
      beautifulExtraRecoveryRate: 0,
    });
    expect(state.relationshipState.loverCount).toBe(1);
    expect(state.sanCap).toBe(24);
    expect(state.player.san).toBe(24);
    expect(state.eventQueue[0]?.stage).toBe("result");
  });

  it("accepting smart lover grants research and permanent extra actions", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: state.conferenceEncounterState,
        totalMonths: state.totalMonths,
        type: "smart",
      })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "accept" });

    expect(state.loverState.type).toBe("smart");
    expect(state.player.research).toBe(2);
    expect(state.persistentExtraActions).toEqual({ idea: 1, experiment: 1, writing: 1 });
  });

  it("second decline permanently closes the beautiful-lover line", () => {
    let state = createInitialState();
    state = {
      ...state,
      phase: "playing",
      conferenceEncounterState: {
        ...state.conferenceEncounterState,
        rejectedBeautifulLoverCount: 1,
      },
      eventQueue: [createEventQueueItem(createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: {
          ...state.conferenceEncounterState,
          rejectedBeautifulLoverCount: 1,
        },
        totalMonths: state.totalMonths,
        type: "beautiful",
      })), 1)],
    };

    state = dispatchAction(state, "resolve-event", { eventChoiceId: "continue" });
    state = dispatchAction(state, "resolve-event", { eventChoiceId: "decline" });

    expect(state.conferenceEncounterState.rejectedBeautifulLoverCount).toBe(2);
    expect(state.conferenceEncounterState.permanentlyBlockedBeautifulLover).toBe(true);
  });
});
