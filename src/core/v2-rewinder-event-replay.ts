import { getActiveGameRandomState, withGameRandomPreview } from "./v2-game-random";
import { getCurrentEvent } from "./v2-event-queue";
import { assignAvailableContinuationId } from "./v2-engine-event-resolution-followups";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { DispatchPayload, EventQueueItem, GameState, PendingEvent } from "./v2-types";

/** Only event metadata is retained: gameplay rewards remain deferred until confirmation. */
export interface RewinderEventReplayContext {
  rootEventId: string;
  totalMonths: number;
  seed: number;
  path: string[];
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function enabled(state: GameState): boolean {
  return state.phase === "playing" && state.selectedRoleId === "rewinder"
    && !state.debugEventReplayEnabled && usesGameplayRulesFrom("20261018-r8");
}

export function prepareRewinderEventReplay(state: GameState, event: EventQueueItem): EventQueueItem {
  if (!enabled(state) || event.debugReplayable || event.rewinderReplay) return event;
  const random = getActiveGameRandomState() ?? state.randomState ?? { seed: 0, cursor: 0 };
  const rootEventId = event.replayContext?.rootEvent.id ?? event.id;
  return { ...event, rewinderReplay: {
    rootEventId, totalMonths: state.totalMonths,
    seed: hash(JSON.stringify([random.seed, random.cursor, rootEventId, state.totalMonths])),
    path: (event.history ?? []).map(stage => stage.selectedChoiceId),
  } };
}

/** Branch-local randomness leaves the run stream intact and survives save/reload.
 * Deferred choices carry the same path, so their final settlement uses the same rolls. */
export function withRewinderChoiceRandom<T>(state: GameState, event: PendingEvent | undefined, choiceId: string, action: () => T): T {
  const context = event?.rewinderReplay;
  if (!context || !enabled(state) || event?.debugReplayable) return action();
  return withGameRandomPreview({ randomState: { seed: hash(JSON.stringify([context.seed, ...context.path, choiceId])), cursor: 0 } }, action);
}

export function canRewindPendingEvent(state: GameState, event: EventQueueItem, targetIndex: number): boolean {
  if (!enabled(state) || event.debugReplayable || !Number.isInteger(targetIndex) || targetIndex < 0
    || !state.eventQueue.some(item => item.id === event.id)) return false;
  const context = event.rewinderReplay;
  const scene = event.history?.[targetIndex]?.replayEvent;
  return !!context && context.totalMonths === state.totalMonths && !!scene
    && scene.chainId === event.chainId && scene.source === event.source
    && scene.rewinderReplay?.rootEventId === context.rootEventId
    && scene.rewinderReplay.totalMonths === context.totalMonths;
}

export function replayRewinderEvent(
  state: GameState,
  payload: DispatchPayload,
  resolve: (state: GameState, eventId: string | undefined, choiceId: string | undefined) => GameState,
): GameState {
  const current = getCurrentEvent(state.eventQueue, payload.eventId);
  const index = payload.eventHistoryIndex;
  if (!current || index === undefined || !canRewindPendingEvent(state, current, index)) return state;
  const scene = current.history![index]!.replayEvent!;
  if (payload.eventChoiceId && !scene.choices.some(choice => choice.id === payload.eventChoiceId && !choice.disabledReason)) return state;
  const target = assignAvailableContinuationId(scene, state.eventQueue.filter(event => event.id !== current.id));
  const replayed: GameState = { ...state, eventQueue: state.eventQueue.map(event => event.id !== current.id ? event : {
    ...target, history: current.history!.slice(0, index), replayContext: current.replayContext, queueOrder: current.queueOrder,
  }) };
  return payload.eventChoiceId ? resolve(replayed, target.id, payload.eventChoiceId) : replayed;
}
