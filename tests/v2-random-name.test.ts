import { describe, expect, it } from "vitest";

import {
  pickRandomAdvisorName,
  RANDOM_ADVISOR_GIVEN_CHARS,
  RANDOM_ADVISOR_NAMES,
  RANDOM_ADVISOR_SURNAMES,
} from "../src/core/v2-random-name";

function useRolls(...rolls: number[]): () => number {
  let index = 0;
  return () => rolls[index++] ?? 0;
}

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
});
