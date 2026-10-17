import { roundMoney } from "./v2-money";
import type { GameState } from "./v2-types";

/** Derive new challenges from existing complete records only at settlement.
 * Adding observer counters would change the replay digest of saved runs. */
export function evaluateEndingChallenges(state: GameState): string[] {
  if (state.phase !== "finished" || !state.ending) return [];
  const result: string[] = [];
  // cumulativeFunding includes the initial balance and every funding receipt;
  // its difference from the balance includes all lab spending, even overdrafts.
  const { cumulativeFunding, funding } = state.advisorProgressState;
  if (Number.isFinite(cumulativeFunding) && Number.isFinite(funding)
    && roundMoney(cumulativeFunding - funding) >= 1000) result.push("global:advisor-spending-thousand");

  const rejectedMonths = new Set<string>();
  for (const record of state.eventHistory) {
    if (record.source !== "career" || !record.chainId.startsWith("career-recruitment-")) continue;
    const last = record.stages.at(-1);
    // A failed application ends with confirm. Successful interviews instead end
    // with accept/replace/keep/decline-offer; rest never has an apply-* stage.
    if (last?.selectedChoiceId === "confirm"
      && record.stages.some(stage => stage.selectedChoiceId.startsWith("apply-"))) {
      rejectedMonths.add(record.chainId);
    }
  }
  if (rejectedMonths.size >= 6) result.push("global:career-rejections-six");
  return result;
}
