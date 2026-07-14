import { describe, expect, it } from "vitest";

import {
  addMentorshipStacks,
  createRelationshipState,
  getMonthlyRelationshipEffects,
  getUnlockedRelationshipSlotCount,
  syncRelationshipState,
  tryAddRelationship,
} from "../src/core/v2-relationship-rules";

describe("v2 relationship rules", () => {
  it("keeps relationship slot unlocks permanent by social thresholds", () => {
    const initial = createRelationshipState();
    const unlocked = syncRelationshipState(initial, 12);
    const dropped = syncRelationshipState(unlocked, 0);

    expect(getUnlockedRelationshipSlotCount(0)).toBe(2);
    expect(getUnlockedRelationshipSlotCount(6)).toBe(3);
    expect(getUnlockedRelationshipSlotCount(12)).toBe(4);
    expect(getUnlockedRelationshipSlotCount(18)).toBe(5);
    expect(unlocked.unlockedSlots).toBe(4);
    expect(dropped.unlockedSlots).toBe(4);
  });

  it("adds relationships only when slots are available", () => {
    let state = createRelationshipState();
    ({ nextState: state } = tryAddRelationship(state, "junior"));
    ({ nextState: state } = tryAddRelationship(state, "senior"));
    const blocked = tryAddRelationship(state, "peer");

    expect(state.occupiedSlots).toBe(2);
    expect(state.juniorCount).toBe(1);
    expect(state.seniorCount).toBe(1);
    expect(blocked.added).toBe(false);
    expect(blocked.nextState.occupiedSlots).toBe(2);
  });

  it("mentorship stacks convert into monthly SAN cost and citation gain", () => {
    let state = createRelationshipState();
    state = syncRelationshipState(state, 6);
    ({ nextState: state } = tryAddRelationship(state, "junior"));
    state = addMentorshipStacks(state, 2);

    expect(getMonthlyRelationshipEffects(state)).toEqual({ sanDelta: -2, citationDelta: 6 });
  });
});
