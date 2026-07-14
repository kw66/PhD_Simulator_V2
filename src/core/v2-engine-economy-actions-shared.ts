import { hasBlockingQueueEvent } from "./v2-event-queue";
import { pushLog } from "./v2-engine-helpers";
import { isPreEnrollmentState } from "./v2-progression";
import type { GameState } from "./v2-types";

export function getEconomyActionBlockedState(state: GameState): GameState | null {
  if (state.phase !== "playing") {
    return state;
  }

  if (isPreEnrollmentState(state)) {
    return pushLog(state, "入学后开放。");
  }

  if (hasBlockingQueueEvent(state) || state.pendingDecision) {
    return pushLog(state, "当前必须先处理待办事件或关键抉择。");
  }

  return null;
}
