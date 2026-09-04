import { describe, expect, it } from "vitest";
import {
  createLoverProgressState,
  LOVER_DATE_MONEY_COST,
  LOVER_TASK_MAX,
} from "../src/core/v2-lover-progression";

describe("v2 lover progression", () => {
  it("creates the inert relationship preview state", () => {
    expect(createLoverProgressState()).toEqual({
      active: false,
      research: 0,
      intimacy: 0,
      taskProgress: 0,
      taskMax: LOVER_TASK_MAX,
      relationProgress: 0,
      relationMax: 40,
      canInteract: false,
      taskUsedThisMonth: false,
      completedTaskCount: 0,
    });
    expect(LOVER_TASK_MAX).toBe(100);
    expect(LOVER_DATE_MONEY_COST).toBe(2);
  });
});
