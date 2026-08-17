export const RANDOM_ADVISOR_NAMES = [
  "李旭霖", "阳沁宏", "李佳择", "庄婉仪", "赵志伟", "陆岩", "刘斌", "储琪",
  "张雅琪", "俞能海", "余涵蕾", "徐寅虎", "罗子祥", "郑啟嘉", "马泽坤", "马梦欣",
  "张可心", "刘嫣嫣", "梁哲铭", "明聪", "马临风", "方婷婷", "陆长雷", "王卓丰",
  "魏叶林", "谭杰森", "姚骏", "王晨阳", "王禹博", "谢天", "王江",
] as const;

export const RANDOM_ADVISOR_SURNAMES = RANDOM_ADVISOR_NAMES.map((name) => name.slice(0, 1));
export const RANDOM_ADVISOR_GIVEN_CHARS = RANDOM_ADVISOR_NAMES.flatMap((name) => [...name.slice(1)]);

function normalizeRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999, Math.max(0, value));
}

function pickRandom(values: readonly string[], getRoll: () => number): string {
  return values[Math.floor(normalizeRoll(getRoll()) * values.length)] ?? values[0] ?? "";
}

export function pickRandomAdvisorName(getRoll: () => number = Math.random): string {
  const surname = pickRandom(RANDOM_ADVISOR_SURNAMES, getRoll);
  if (normalizeRoll(getRoll()) >= 0.9) {
    return surname + pickRandom(RANDOM_ADVISOR_GIVEN_CHARS, getRoll);
  }

  const first = pickRandom(RANDOM_ADVISOR_GIVEN_CHARS, getRoll);
  const second = pickRandom(RANDOM_ADVISOR_GIVEN_CHARS, getRoll);
  return surname + first + second;
}
