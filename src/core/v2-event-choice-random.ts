import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { EventChoice } from "./v2-types";

/** Mark a probability mechanism before its outcome is revealed, including
 * probabilities currently at 0/100%. Omit metadata from older recordings. */
export function randomOutcome(condition = true): { outcomeRandom?: true } {
  return condition && usesGameplayRulesFrom("20261022-r21") ? { outcomeRandom: true } : {};
}

/** Guidance targets and deliberate advisor redraws do not lock rewind.
 * Classify saved pending choices too, while keeping recorded runs on their original rules. */
export function hasRandomOutcome(choice: Pick<EventChoice, "id" | "outcomeRandom"> | undefined): boolean {
  return choice?.outcomeRandom === true
    && !(choice.id.startsWith("random-4-vertical-") && usesGameplayRulesFrom("20261024-r47"))
    && !(choice.id === "before-grad-school-reroll" && usesGameplayRulesFrom("20261024-r48"));
}

export const RANDOM_OUTCOME_HINT = "🔒 此选项包含概率结果，选择后不可回退。仍可回看剧情。";
