import { CAREER_DEFINITIONS, calculateMonthlyCareerProgress, type CareerType } from "./v2-career-rules";
import { pushLog } from "./v2-engine-helpers";
import { isGraduationPreparationUnlocked } from "./v2-thesis-rules";
import type { GameState } from "./v2-types";

export const CAREER_PREPARATION_SAN_COST: Record<CareerType, number> = {
  internet: 4,
  stateOwned: 2,
  civilService: 3,
  academic: 2,
};

export function getCareerPreparationFailure(state: GameState, type?: CareerType): string | null {
  if (state.phase !== "playing" || state.ending !== null) return "当前无法准备应聘";
  if (!isGraduationPreparationUnlocked(state)) {
    return state.degree === "master" ? "硕士第三年9月开放" : "博士第六年9月开放";
  }
  if (type !== undefined && !Object.hasOwn(CAREER_DEFINITIONS, type)) return "未知应聘方向";
  if (type === "academic" && state.degree !== "phd") return "教职仅限博士应聘";
  if (type !== undefined && state.careerPreparedMonths[type] === state.totalMonths) return "本月已推进，次月可继续";
  if (state.eventQueue.some((event) => event.source === "career")) return "请先处理当前招聘事件";
  return null;
}

export function prepareCareer(state: GameState, type: CareerType, random: () => number = Math.random): GameState {
  if (getCareerPreparationFailure(state, type)) return state;
  const progressGain = calculateMonthlyCareerProgress(state, type, random);
  const sanCost = CAREER_PREPARATION_SAN_COST[type];
  return pushLog({
    ...state,
    player: { ...state.player, san: state.player.san - sanCost },
    careerProgress: { ...state.careerProgress, [type]: state.careerProgress[type] + progressGain },
    careerPreparedMonths: { ...state.careerPreparedMonths, [type]: state.totalMonths },
  }, `${CAREER_DEFINITIONS[type].name}方向推进：能力 +${progressGain}，SAN -${sanCost}`);
}
