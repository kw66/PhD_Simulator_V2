import { enqueueEventQueueItem } from "./v2-event-queue";
import type {
  DeferredEventStatePatch,
  EventChoice,
  GameState,
  PendingEvent,
  ResolvedEventStage,
} from "./v2-types";

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
    const eventWithHistory = event.chainId === resolvedChainId
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
    if (shouldAttachDeferredPatch) {
      attachedDeferredPatch = true;
    }
    const stateBeforeEnqueue = nextState;
    nextState = enqueueEventQueueItem(nextState, eventWithHistory);
    if (
      event.chainId === resolvedChainId
      && nextState.eventQueue.length > stateBeforeEnqueue.eventQueue.length
    ) {
      hasSameChainFollowUp = true;
    }
  }

  return { nextState, hasSameChainFollowUp };
}
