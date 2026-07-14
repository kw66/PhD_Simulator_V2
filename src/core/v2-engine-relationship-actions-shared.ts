import {
  enqueueEventQueueItem,
  hasBlockingQueueEvent,
} from "./v2-event-queue";
import { pushLog } from "./v2-engine-helpers";
import { isPreEnrollmentState } from "./v2-progression";
import type { GameState, PendingEvent } from "./v2-types";

export type ApplyStateProgression = (state: GameState) => GameState;

export function getRelationshipActionBlockedState(state: GameState): GameState | null {
  if (state.phase !== "playing") return state;
  if (isPreEnrollmentState(state)) return pushLog(state, "入学后开放。");
  if (hasBlockingQueueEvent(state) || state.pendingDecision) {
    return pushLog(state, "当前必须先处理待办事件或关键抉择。");
  }
  return null;
}

export function appendRelationshipRewardEvent(
  state: GameState,
  rewardEvent: PendingEvent | null,
  emptyRewardLog: string,
): GameState {
  if (!rewardEvent) {
    return pushLog(state, emptyRewardLog);
  }

  return pushLog(
    enqueueEventQueueItem(state, rewardEvent),
    `触发事件：${rewardEvent.title}`,
  );
}
