import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

function startGame(): GameState {
  return dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
}

function createEffectEvent(id: string, effects: EventChoice["effects"]): PendingEvent {
  return {
    id,
    title: "边界测试",
    description: "验证核心状态写入。",
    source: "system",
    blocking: true,
    deadlineMonths: 0,
    chainId: id,
    stage: "act1",
    choices: [{ id: `${id}-apply`, label: "确认", outcome: "结算完成。", effects }],
  };
}

function resolveEffect(state: GameState, id: string, effects: EventChoice["effects"]): GameState {
  const event = createEffectEvent(id, effects);
  const queuedState = { ...state, eventQueue: [createEventQueueItem(event, 1)] };
  return dispatchAction(queuedState, "resolve-event", {
    eventId: event.id,
    eventChoiceId: event.choices[0]?.id,
  });
}

describe("v2 core regression boundaries", () => {
  it("lets each failure attribute cross zero and trigger its ending", () => {
    const cases = [
      { stat: "san", ending: "burnout" },
      { stat: "money", ending: "poor" },
      { stat: "favor", ending: "expelled" },
      { stat: "social", ending: "isolated" },
    ] as const;

    for (const { stat, ending } of cases) {
      const base = startGame();
      const state = {
        ...base,
        player: { ...base.player, [stat]: 0 },
      };
      const resolved = resolveEffect(state, `ending-${stat}`, { [stat]: -1 });

      expect(resolved.player[stat], stat).toBe(-1);
      expect(resolved.phase, stat).toBe("finished");
      expect(resolved.ending, stat).toBe(ending);
    }
  });

  it("caps event research gains at the current research capacity", () => {
    const base = startGame();
    const state = {
      ...base,
      player: { ...base.player, research: 19 },
    };
    const resolved = resolveEffect(state, "research-cap", { research: 5 });

    expect(resolved.player.research).toBe(20);
  });

  it("synchronizes relationship slots after social changes", () => {
    const base = startGame();
    expect(base.relationshipState.unlockedSlots).toBe(2);

    const resolved = resolveEffect(base, "social-slots", { social: 6 });
    expect(resolved.player.social).toBe(7);
    expect(resolved.relationshipState.unlockedSlots).toBe(3);
  });

  it("lets the player accept or reject a mentor-assigned junior without candidate selection", () => {
    const base = {
      ...startGame(),
      year: 4,
      month: 3,
      totalMonths: 27,
      eventQueue: [],
    };
    let state = {
      ...base,
      eventQueue: [createEventQueueItem(createMentorAssignEvent(base), 1)],
    };

    const intro = state.eventQueue[0];
    expect(intro?.description).not.toContain("候选人");
    state = dispatchAction(state, "resolve-event", {
      eventId: intro?.id,
      eventChoiceId: intro?.choices[0]?.id,
    });
    const decision = state.eventQueue[0];
    expect(decision?.choices.map((choice) => choice.label)).toEqual(["接受安排", "拒绝安排"]);
    state = dispatchAction(state, "resolve-event", {
      eventId: decision?.id,
      eventChoiceId: decision?.choices[0]?.id,
    });
    const result = state.eventQueue[0];
    expect(result?.title).toContain("接受安排");
    state = dispatchAction(state, "resolve-event", {
      eventId: result?.id,
      eventChoiceId: result?.choices[0]?.id,
    });
    expect(state.relationshipState.juniorCount).toBe(1);
    expect(state.fellowProgressState).toHaveLength(1);
    expect(state.eventQueue).toHaveLength(0);

    let rejected = {
      ...base,
      eventQueue: [createEventQueueItem(createMentorAssignEvent(base), 1)],
    };
    const rejectedIntro = rejected.eventQueue[0];
    rejected = dispatchAction(rejected, "resolve-event", {
      eventId: rejectedIntro?.id,
      eventChoiceId: rejectedIntro?.choices[0]?.id,
    });
    const rejectedDecision = rejected.eventQueue[0];
    rejected = dispatchAction(rejected, "resolve-event", {
      eventId: rejectedDecision?.id,
      eventChoiceId: rejectedDecision?.choices[1]?.id,
    });
    expect(rejected.relationshipState.juniorCount).toBe(0);
    expect(rejected.fellowProgressState).toHaveLength(0);
  });

  it("never advances beyond the training limit", () => {
    const base = {
      ...startGame(),
      selectedAdvisorName: "测试导师",
      graduationScoreTarget: 1,
      totalResearchScore: 1,
      year: 3,
      month: 10,
      totalMonths: 34,
      maxMonths: 34,
      eventQueue: [],
    };

    const finished = dispatchAction(base, "next-month");
    const repeated = dispatchAction(finished, "next-month");
    expect(finished.phase).toBe("finished");
    expect(finished.totalMonths).toBe(34);
    expect(repeated.totalMonths).toBe(34);
  });

  it("ignores setup-only actions after the run has started", () => {
    const playing = startGame();

    expect(dispatchAction(playing, "select-role", { roleId: "genius" })).toBe(playing);
    expect(dispatchAction(playing, "start-game", { roleId: "normal" })).toBe(playing);
  });
});
