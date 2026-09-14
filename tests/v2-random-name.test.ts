import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pickRandomAdvisorName,
  pickStableRandomName,
  RANDOM_ADVISOR_GIVEN_CHARS,
  RANDOM_ADVISOR_NAMES,
  RANDOM_ADVISOR_SURNAMES,
} from "../src/core/v2-random-name";

function useRolls(...rolls: number[]): () => number {
  let index = 0;
  return () => rolls[index++] ?? 0;
}

afterEach(() => vi.restoreAllMocks());

describe("v2 advisor names", () => {
  it("uses the curated lecturer name pool", () => {
    expect(RANDOM_ADVISOR_NAMES).toEqual([
      "李旭霖", "阳沁宏", "李佳择", "庄婉仪", "赵志伟", "陆岩", "刘斌", "储琪",
      "张雅琪", "俞能海", "余涵蕾", "徐寅虎", "罗子祥", "郑啟嘉", "马泽坤", "马梦欣",
      "张可心", "刘嫣嫣", "梁哲铭", "明聪", "马临风", "方婷婷", "陆长雷", "王卓丰",
      "魏叶林", "谭杰森", "姚骏", "王晨阳", "王禹博", "谢天", "王江",
    ]);
    expect(RANDOM_ADVISOR_SURNAMES).toHaveLength(31);
    expect(RANDOM_ADVISOR_GIVEN_CHARS).toHaveLength(55);
  });

  it("draws surnames and every given-name character independently before recombining them", () => {
    expect(pickRandomAdvisorName(useRolls(0, 0, 0.04, 0.02))).toBe("李沁霖");
    expect(pickRandomAdvisorName(useRolls(0, 0, 0.02, 0))).toBe("李霖旭");
    expect(pickRandomAdvisorName(useRolls(0.999999, 0.95, 0.999999))).toBe("王江");
  });

  it("keeps the agreed ninety-percent three-character and ten-percent two-character boundary", () => {
    expect(pickRandomAdvisorName(useRolls(0, 0.899999, 0, 0))).toHaveLength(3);
    expect(pickRandomAdvisorName(useRolls(0, 0.9, 0))).toHaveLength(2);
  });

  it("reuses both curated character pools for diverse deterministic names", () => {
    const names = Array.from({ length: 1000 }, (_, seed) => pickStableRandomName(`relationship:${seed}`));

    for (const name of names) {
      expect(name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
      expect(RANDOM_ADVISOR_SURNAMES).toContain(name[0]);
      for (const character of name.slice(1)) {
        expect(RANDOM_ADVISOR_GIVEN_CHARS).toContain(character);
      }
    }
    expect(names.some((name) => name.length === 2)).toBe(true);
    expect(names.filter((name) => name.length === 3).length).toBeGreaterThan(800);
    expect(new Set(names).size).toBeGreaterThan(500);
  });

  it("keeps string and numeric seeds stable without consuming gameplay randomness", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.123);
    const seeds = [0, 1, -7, 12.5, "", "fellow:junior-12", "lover:smart:12:female"];
    const firstNames = seeds.map(pickStableRandomName);
    random.mockReturnValue(0.987);

    expect(seeds.map(pickStableRandomName)).toEqual(firstNames);
    expect(pickStableRandomName(12)).toBe(pickStableRandomName("12"));
    expect(random).not.toHaveBeenCalled();
  });
});
