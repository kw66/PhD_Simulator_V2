import { usesGameplayRulesFrom } from "./v2-rule-context";

/** Mark a probability mechanism before its outcome is revealed, including
 * probabilities currently at 0/100%. Omit metadata from older recordings. */
export function randomOutcome(condition = true): { outcomeRandom?: true } {
  return condition && usesGameplayRulesFrom("20261022-r21") ? { outcomeRandom: true } : {};
}

export const RANDOM_OUTCOME_HINT = "🔒 此选项包含概率结果，选择后不可回退。仍可回看剧情。";
