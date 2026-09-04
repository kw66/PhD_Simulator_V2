import { describe, expect, it } from "vitest";

import {
  activateLover,
  getBeautifulMonthlyRecovery,
  getOppositeGender,
} from "../src/core/v2-lover-system";

describe("v2 lover system", () => {
  it("derives the beautiful-lover recovery preview", () => {
    const beautifulLover = activateLover("beautiful", 10, "male");
    const smartLover = activateLover("smart", 10, "female");

    expect(beautifulLover.gender).toBe("female");
    expect(smartLover.gender).toBe("male");
    expect(getBeautifulMonthlyRecovery(beautifulLover, 11, 20)).toBe(1);
    expect(getBeautifulMonthlyRecovery(smartLover, 11, 20)).toBe(0);
  });

  it("always derives the lover as the selected role's opposite gender", () => {
    expect(getOppositeGender("male")).toBe("female");
    expect(getOppositeGender("female")).toBe("male");
    expect(activateLover("smart", 8, "male").gender).toBe("female");
    expect(activateLover("beautiful", 8, "female").gender).toBe("male");
  });
});
