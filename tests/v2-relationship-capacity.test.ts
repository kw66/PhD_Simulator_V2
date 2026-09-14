import { describe, expect, it } from "vitest";

import { createInitialState } from "../src/core/v2-engine";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { endRelationship } from "../src/core/v2-relationship-actions";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { canAddRelationship, tryAddRelationship } from "../src/core/v2-relationship-rules";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function createFullFellowState(): GameState {
  const state = createInitialState();
  return {
    ...state,
    phase: "playing",
    player: {
      ...state.player,
      social: 6,
    },
    relationshipState: {
      ...state.relationshipState,
      unlockedSlots: 5,
      occupiedSlots: 4,
    },
  };
}

function getDecisionEvent(event: PendingEvent | null | undefined): PendingEvent {
  const decision = event?.choices[0]?.effects.enqueueEvents?.[0];
  expect(decision?.stage).toBe("act2");
  return decision as PendingEvent;
}

describe("v2 relationship capacity", () => {
  it("keeps advisor and lover independent from the four fellow slots", () => {
    const state = createInitialState();
    const withFourFellows = {
      ...state.relationshipState,
      advisorCount: 1,
      occupiedSlots: 4,
      unlockedSlots: 5,
    };

    expect(canAddRelationship(withFourFellows, "senior")).toBe(false);
    expect(canAddRelationship(withFourFellows, "lover")).toBe(true);
    expect(tryAddRelationship(withFourFellows, "lover").nextState).toMatchObject({
      occupiedSlots: 4,
      loverCount: 1,
    });
  });

  it.each([10, 11, 14])("warns in act2 before a full relationship event can add someone (random-%s)", (eventId) => {
    const event = createRandomEventById(eventId, createFullFellowState(), () => 0.5).event;
    const decision = getDecisionEvent(event);

    expect(decision.description).toContain("普通关系栏已满");
    expect(decision.description).toContain("选择退出");
  });

  it("warns before accepting a full mentor assignment", () => {
    const decision = getDecisionEvent(createMentorAssignEvent(createFullFellowState()));

    expect(decision.description).toContain("普通关系栏已满");
    expect(decision.description).toContain("选择拒绝");
  });

  it("ends fellow cooperation while preserving unrelated state and releasing one slot", () => {
    const initial = createFullFellowState();
    const profile = createCustomFellowProgressProfile({
      type: "junior",
      gender: "male",
      startTotalMonths: 1,
      research: 4,
      affinity: 3,
      name: "测试同学",
    });
    const state: GameState = {
      ...initial,
      fellowProgressState: [profile],
      relationshipState: {
        ...initial.relationshipState,
        juniorCount: 1,
        occupiedSlots: 4,
      },
      buffs: [{
        id: "fellow-buff",
        relationshipId: profile.id,
        name: "长期带教",
        source: "指导师弟师妹",
        timing: "monthly",
        remainingMonths: null,
      }],
    };

    const next = endRelationship(state, profile.id);

    expect(next.fellowProgressState).toHaveLength(0);
    expect(next.relationshipState).toMatchObject({ juniorCount: 0, occupiedSlots: 3 });
    expect(next.buffs).toHaveLength(0);
    expect(next.log[0]?.text).toContain("停止合作");
  });

  it("ends a relationship independently from ordinary fellow capacity", () => {
    const state = createFullFellowState();
    const withLover: GameState = {
      ...state,
      relationshipState: { ...state.relationshipState, loverCount: 1 },
      loverState: activateLover("smart", 2, "male"),
      loverProgressState: { ...createLoverProgressState(), active: true },
      buffs: [{
        id: "lover-buff",
        relationshipId: "lover",
        name: "恋人效果",
        source: "发展关系",
        timing: "permanent",
        remainingMonths: null,
      }],
    };

    const next = endRelationship(withLover, "lover");

    expect(next.relationshipState).toMatchObject({ loverCount: 0, occupiedSlots: 4 });
    expect(next.loverState.active).toBe(false);
    expect(next.loverProgressState.active).toBe(false);
    expect(next.buffs).toHaveLength(0);
    expect(next.log[0]?.text).toContain("分手");
  });
});
