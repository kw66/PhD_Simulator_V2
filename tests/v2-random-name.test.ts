import { describe, expect, it } from "vitest";

import {
  generateRandomChineseName,
  RANDOM_NAME_GIVEN_CHARS,
  RANDOM_NAME_SURNAMES,
} from "../src/core/v2-random-name";

function useRolls(...rolls: number[]): () => number {
  let index = 0;
  return () => rolls[index++] ?? 0;
}

describe("v2 random Chinese names", () => {
  it("uses the complete name pools from the previous version", () => {
    expect(RANDOM_NAME_SURNAMES).toHaveLength(50);
    expect(RANDOM_NAME_GIVEN_CHARS).toHaveLength(110);
    expect(RANDOM_NAME_SURNAMES.at(0)).toBe("李");
    expect(RANDOM_NAME_SURNAMES.at(-1)).toBe("章");
    expect(RANDOM_NAME_GIVEN_CHARS.at(0)).toBe("旭");
    expect(RANDOM_NAME_GIVEN_CHARS.at(-1)).toBe("名");
  });

  it("creates two-character names on the ten-percent branch", () => {
    expect(generateRandomChineseName(useRolls(0, 0.95, 0))).toBe("李旭");
  });

  it("creates three-character names and rerolls repeated given-name characters", () => {
    expect(generateRandomChineseName(useRolls(0, 0, 0, 0, 0.5, 0.01))).toBe("李旭霖");
  });
});
