import { addOrReplaceBuffs, getActiveBuffs } from "./v2-buffs";
import type { Buff, GameState } from "./v2-types";

export function createImageMisuseBuff(): Buff {
  return {
    id: "image-misuse",
    name: "图片误用",
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

export function settlePublishedImageMisuse(state: GameState): GameState {
  if (hasScholarshipDisqualification(state)) return state;
  const published = [...state.papers, ...state.externalPublications]
    .some((paper) => paper.status === "published" && paper.imageMisusePending === true);
  if (!published) return state;
  return { ...state, buffs: addOrReplaceBuffs(state.buffs, [createImageMisuseBuff()]) };
}
