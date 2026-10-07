import { applyTierResist } from "./v2-sanity-rules";

export function generateRelationshipResearch(
  academicYear: number,
  random: () => number = Math.random,
  bonus = 0,
): number {
  const individualBonus = Math.floor(random() * 4);
  const rawResearch = Math.max(0, Math.floor(academicYear)) * 2 + individualBonus + bonus;
  return applyTierResist(rawResearch, 0, random, 20).effectiveChange;
}
