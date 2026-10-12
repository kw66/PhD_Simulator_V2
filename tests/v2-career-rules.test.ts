import { describe, expect, it } from "vitest";
import { CAREER_DEFINITIONS, getCareerEventTargetYear } from "../src/core/v2-career-rules";

describe("career calendar", () => {
  it("opens each track in its own September-to-June window", () => {
    expect(CAREER_DEFINITIONS.internet.activeMonths).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CAREER_DEFINITIONS.stateOwned.activeMonths).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(CAREER_DEFINITIONS.civilService.activeMonths).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(CAREER_DEFINITIONS.academic.activeMonths).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(getCareerEventTargetYear("master")).toBe(3);
    expect(getCareerEventTargetYear("phd")).toBe(6);
  });
});
