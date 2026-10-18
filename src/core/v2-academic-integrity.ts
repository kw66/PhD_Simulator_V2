import { addOrReplaceBuffs, getActiveBuffs } from "./v2-buffs";
import type { Buff, EventChoice, GameState } from "./v2-types";

export function createImageMisuseBuff(): Buff {
  return {
    id: "image-misuse",
    name: "举报风险",
    source: "数据丢失",
    timing: "permanent",
    remainingMonths: null,
    scholarshipDisqualified: true,
    description: "国奖入选后会被举报取消，无法领取奖金。",
  };
}

export function hasScholarshipDisqualification(state: Pick<GameState, "buffs">): boolean {
  return getActiveBuffs(state.buffs).some((buff) => buff.scholarshipDisqualified === true);
}

/** Preview and settlement must agree on whether a pending award still pays. */
export function resolveScholarshipAwardChoice(state: GameState, choice: EventChoice): EventChoice {
  const award = choice.effects.scholarshipAward;
  if (!award) return choice;
  const disqualified = hasScholarshipDisqualification(state);
  if (!disqualified && (state.scholarshipState.lastAwardYear ?? 0) < award.year) return choice;
  const { money: _money, scholarshipAward: _award, ...effects } = choice.effects;
  return { ...choice, effects,
    outcome: disqualified ? "国奖资格取消，金币 +0。" : "本年度奖学金已领取。" };
}

export function settlePublishedImageMisuse(state: GameState): GameState {
  if (hasScholarshipDisqualification(state)) return state;
  const published = [...state.papers, ...state.externalPublications]
    .some((paper) => paper.status === "published" && paper.imageMisusePending === true);
  if (!published) return state;
  return { ...state, buffs: addOrReplaceBuffs(state.buffs, [createImageMisuseBuff()]) };
}
