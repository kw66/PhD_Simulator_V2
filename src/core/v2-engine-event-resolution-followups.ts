import { enqueueEventQueueItem } from "./v2-event-queue";
import type {
  DeferredEventStatePatch,
  EventChoice,
  GameState,
  PendingEvent,
  ResolvedEventStage,
} from "./v2-types";

export function assignAvailableContinuationId(event: PendingEvent, eventQueue: GameState["eventQueue"]): PendingEvent {
  let available = event;
  let suffix = 1;
  while (eventQueue.some((queued) => queued.id === available.id
    || (available.stage === "act1" && !available.history?.length
      && queued.replayContext?.rootEvent.id === available.id))) {
    available = {
      ...available,
      id: `${event.id}~followup-${suffix++}`,
      continuationSourceId: event.continuationSourceId ?? event.id,
    };
  }
  return available;
}

export function enqueueResolvedEventFollowUps(
  state: GameState,
  choice: EventChoice,
  resolvedEnqueueEvents: PendingEvent[],
  resolvedChainId: string,
  resolvedHistory: ResolvedEventStage[],
  deferredStatePatch?: DeferredEventStatePatch,
  debugRootEventId?: string,
  replayContext?: PendingEvent["replayContext"],
  randomReplay?: PendingEvent["randomReplay"],
): { nextState: GameState; hasSameChainFollowUp: boolean } {
  let nextState = state;
  let hasSameChainFollowUp = false;
  let attachedDeferredPatch = false;

  for (const event of [...resolvedEnqueueEvents, ...(choice.effects.enqueueEvents ?? [])]) {
    const shouldAttachDeferredPatch = !attachedDeferredPatch
      && deferredStatePatch !== undefined
      && event.chainId === resolvedChainId;
    let eventWithHistory = event.chainId === resolvedChainId
      ? {
          ...event,
          history: resolvedHistory,
          ...(replayContext ? { replayContext } : {}),
          ...(randomReplay ? { randomReplay } : {}),
          ...(debugRootEventId ? {
            debugReplayable: true,
            debugRootEventId,
          } : {}),
          ...(shouldAttachDeferredPatch ? { deferredStatePatch } : {}),
        }
      : event;
    const stateBeforeEnqueue = nextState;
    if (event.chainId === resolvedChainId) {
      eventWithHistory = assignAvailableContinuationId(eventWithHistory, nextState.eventQueue);
    }
    nextState = enqueueEventQueueItem(nextState, eventWithHistory);
    if (
      event.chainId === resolvedChainId
      && nextState.eventQueue.length > stateBeforeEnqueue.eventQueue.length
    ) {
      hasSameChainFollowUp = true;
      if (shouldAttachDeferredPatch) attachedDeferredPatch = true;
    }
  }

  return { nextState, hasSameChainFollowUp };
}
