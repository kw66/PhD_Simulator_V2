import { isTransientUiHintLog, pushLog } from "./v2-engine-helpers";
import { getShopEmergencySan } from "./v2-shop-items-effects";
import type { EndingId, GameState } from "./v2-types";

function finishWithCause(state: GameState, ending: EndingId, message: string): GameState {
  if (state.phase !== "playing") return state;
  const cause = state.log.find((entry) => entry.text.trim() && !isTransientUiHintLog(entry.text));
  return pushLog({
    ...state,
    phase: "finished",
    ending,
    endingCause: cause ? { text: cause.text, totalMonths: cause.month } : undefined,
  }, message);
}

export function evaluateCoreEndings(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const protectedSan = getShopEmergencySan(state.shopState, state.player.san);
  const protectedState = protectedSan === state.player.san
    ? state
    : {
        ...state,
        player: { ...state.player, san: protectedSan },
        shopState: {
          ...state.shopState,
          chairSanRecovered: Math.max(0, state.shopState.chairSanRecovered ?? 0) + protectedSan - state.player.san,
        },
      };
  if (protectedState.player.san < 0) return finishWithCause(protectedState, "burnout", "SAN 已跌破 0，本轮提前结束。");
  if (protectedState.player.money < 0) return finishWithCause(protectedState, "poor", "金币已跌破 0，本轮提前结束。");
  if (protectedState.player.favor < 0) return finishWithCause(protectedState, "expelled", "导师好感已跌破 0，本轮提前结束。");
  if (protectedState.player.social < 0) return finishWithCause(protectedState, "isolated", "社交能力已跌破 0，本轮提前结束。");
  return protectedState;
}

export function finishTrainingIfReady(state: GameState): GameState {
  if (state.phase !== "playing" || state.totalMonths < state.maxMonths
    || state.eventQueue.some((event) => event.deadlineMonths <= 0)) return state;
  const target = state.graduationScoreTarget;
  const graduated = target !== null && state.totalResearchScore >= target;
  const ending = graduated ? state.degree : "delay";
  const label = graduated ? state.degree === "phd" ? "博士毕业" : "硕士毕业" : "延期毕业";
  const scoreSummary = target === null
    ? `科研分 ${state.totalResearchScore}，毕业要求尚未确定`
    : `科研分 ${state.totalResearchScore}/${target}`;
  return pushLog({ ...state, phase: "finished", ending }, `${label}：${scoreSummary}。`);
}

export function quitGame(state: GameState): GameState {
  return finishWithCause(state, "quit", "你选择了退学，本轮结束。");
}
