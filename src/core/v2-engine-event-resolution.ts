import {
  pushLog,
} from "./v2-engine-helpers";
import {
  removeEventQueueItem,
} from "./v2-event-queue";
import { enqueueResolvedEventFollowUps } from "./v2-engine-event-resolution-followups";
import { applyChoiceEffectsToState } from "./v2-engine-event-resolution-state";
import type { EventQueueItem, GameState } from "./v2-types";

interface EventResolutionCallbacks {
  applyChairEmergencyRecoveryToState: (state: GameState) => GameState;
  evaluateImmediateEndings: (state: GameState) => GameState;
  runPostQueuePipeline: (state: GameState) => GameState;
}

export function applyQueuedEventEffects(
  state: GameState,
  queuedEvent: EventQueueItem,
  choiceId: string | undefined,
  callbacks: EventResolutionCallbacks,
): GameState {
  const choice = queuedEvent.choices.find((item) => item.id === choiceId);
  if (!choice) {
    return pushLog(state, "当前事件选择无效。");
  }

  const {
    nextState: resolvedState,
    resolvedOutcome,
    resolvedEnqueueEvents,
  } = applyChoiceEffectsToState(state, choice);

  if (choice.effects.stayOnEvent === true) {
    return callbacks.evaluateImmediateEndings(
      callbacks.applyChairEmergencyRecoveryToState(
        pushLog(resolvedState, `${queuedEvent.title}?${resolvedOutcome}`),
      ),
    );
  }

  let nextState: GameState = {
    ...resolvedState,
    eventQueue: removeEventQueueItem(resolvedState.eventQueue, queuedEvent.id),
  };
  nextState = enqueueResolvedEventFollowUps(nextState, choice, resolvedEnqueueEvents);
  nextState = callbacks.evaluateImmediateEndings(
    callbacks.applyChairEmergencyRecoveryToState(
      pushLog(nextState, `${queuedEvent.title}：${resolvedOutcome}`),
    ),
  );
  if (nextState.phase !== "playing") return nextState;
  return callbacks.runPostQueuePipeline(nextState);
}
