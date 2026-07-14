import { describe, expect, it } from "vitest";

import {
  activateLover,
  applyLoverMonthlyEffect,
  createLoverState,
  shouldEnqueueLoverDevelopment,
} from "../src/core/v2-lover-system";

describe("v2 lover system", () => {
  it("enqueues lover-development only at the audited second-threshold and when no chain is pending", () => {
    expect(shouldEnqueueLoverDevelopment({
      type: "beautiful",
      encounterCount: 2,
      permanentlyBlocked: false,
      loverState: createLoverState(),
      eventQueue: [],
    })).toBe(true);

    expect(shouldEnqueueLoverDevelopment({
      type: "beautiful",
      encounterCount: 1,
      permanentlyBlocked: false,
      loverState: createLoverState(),
      eventQueue: [],
    })).toBe(false);

    expect(shouldEnqueueLoverDevelopment({
      type: "smart",
      encounterCount: 2,
      permanentlyBlocked: false,
      loverState: activateLover("smart", 12),
      eventQueue: [],
    })).toBe(false);
  });

  it("applies the audited beautiful monthly recovery and generic dating cost", () => {
    const result = applyLoverMonthlyEffect(activateLover("beautiful", 10), 11, 20);

    expect(result.sanDelta).toBe(1);
    expect(result.moneyDelta).toBe(-2);
    expect(result.logs).toEqual(["恋人陪伴：SAN +1，约会开销 -2。"]);
  });

  it("applies only the dating cost for smart lover monthly effect", () => {
    const result = applyLoverMonthlyEffect(activateLover("smart", 10), 11, 20);

    expect(result.sanDelta).toBe(0);
    expect(result.moneyDelta).toBe(-2);
    expect(result.logs).toEqual(["恋爱日常：约会开销 -2。"]);
  });
});
