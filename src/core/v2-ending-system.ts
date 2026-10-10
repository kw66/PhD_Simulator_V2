import { isTransientUiHintLog, pushLog, pushMilestoneLog } from "./v2-engine-helpers";
import { getShopEmergencySan } from "./v2-shop-items-effects";
import { formatMoney, normalizeGameMoney } from "./v2-money";
import type { EndingId, GameState } from "./v2-types";

function finishWithCause(state: GameState, ending: EndingId, message: string): GameState {
  if (state.phase !== "playing") return state;
  const cause = state.log.find((entry) => entry.text.trim() && !isTransientUiHintLog(entry.text)
    && !entry.id.startsWith("chair-emergency-"));
  return pushLog({
    ...state,
    phase: "finished",
    ending,
    endingCause: cause ? { text: cause.text, totalMonths: cause.month } : undefined,
  }, message);
}

export function evaluateCoreEndings(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  state = normalizeGameMoney(state);
  if (state.selectedAdvisorName && state.totalMonths > 0 && state.advisorProgressState.funding < 0) {
    return finishWithCause(state, "lab-bankrupt", "实验室科研经费已跌破0，无法付清必要支出，本轮提前结束。");
  }
  const protectedSan = getShopEmergencySan(state.shopState, state.player.san);
  const protectedState = protectedSan === state.player.san
    ? state
    : pushMilestoneLog({
        ...state,
        player: { ...state.player, san: protectedSan },
        shopState: {
          ...state.shopState,
          chairSanRecovered: Math.max(0, state.shopState.chairSanRecovered ?? 0) + protectedSan - state.player.san,
        },
      }, `锥刺股椅触发：SAN +${formatMoney(protectedSan - state.player.san)}（${formatMoney(state.player.san)}→${formatMoney(protectedSan)}）`, "chair-emergency");
  if (protectedState.player.san < 0) return finishWithCause(protectedState, "burnout", "SAN 已跌破 0，本轮提前结束。");
  if (protectedState.player.money < 0) return finishWithCause(protectedState, "poor", "金币已跌破 0，本轮提前结束。");
  if (protectedState.player.favor < 0) return finishWithCause(protectedState, "expelled", "导师好感已跌破 0，本轮提前结束。");
  if (protectedState.player.social < 0) return finishWithCause(protectedState, "isolated", "社交能力已跌破 0，本轮提前结束。");
  if (protectedState.player.research < 0) return finishWithCause(protectedState, "overthinking", "科研能力已跌破 0，本轮提前结束。");
  return protectedState;
}

export function finishTrainingIfReady(state: GameState): GameState {
  if (state.phase !== "playing" || state.totalMonths < state.maxMonths
    || state.eventQueue.some((event) => event.deadlineMonths <= 0)) return state;
  const target = state.graduationScoreTarget;
  const thesisPassed = state.thesis.degree === state.degree && state.thesis.reviewResolved
    && state.thesis.review?.passed === true;
  const graduated = target !== null && state.totalResearchScore >= target && thesisPassed;
  const ending = graduated ? state.degree : "delay";
  const label = graduated ? state.degree === "phd" ? "博士毕业" : "硕士毕业" : "延期毕业";
  const scoreSummary = target === null
    ? `科研分 ${state.totalResearchScore}，毕业要求尚未确定`
    : `科研分 ${state.totalResearchScore}/${target}`;
  const thesisSummary = thesisPassed ? "盲审通过"
    : state.thesis.review?.submitted ? "盲审未通过" : "未完成盲审送审";
  const excellent = graduated && state.thesis.review?.excellent
    ? `，优秀${state.degree === "phd" ? "博士" : "硕士"}论文` : "";
  return pushLog({ ...state, phase: "finished", ending }, `${label}：${scoreSummary}，${thesisSummary}${excellent}。`);
}

export function quitGame(state: GameState): GameState {
  return finishWithCause(state, "quit", "你选择了退学，本轮结束。");
}
