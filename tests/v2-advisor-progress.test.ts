import { describe, expect, it } from "vitest";
import { createAdvisorProgressState } from "../src/core/v2-advisor-progress";

describe("v2 advisor progress", () => {
  it("uses the former associate-professor ranges for every lecturer", () => {
    expect(createAdvisorProgressState(true, () => 0)).toMatchObject({
      researchResource: 3,
      affinity: 3,
      taskMax: 38,
    });
    expect(createAdvisorProgressState(true, () => 0.999999)).toMatchObject({
      researchResource: 6,
      affinity: 5,
      taskMax: 80,
    });
  });

});
