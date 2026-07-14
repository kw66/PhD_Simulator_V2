import { enqueueEventQueueItem } from "./v2-event-queue";
import type { GameState, PendingEvent } from "./v2-types";

export function enqueuePendingEvents(state: GameState, events: PendingEvent[]): { nextState: GameState; queuedEvents: PendingEvent[] } {
  let nextState = state;
  const queuedEvents: PendingEvent[] = [];

  for (const event of events) {
    const nextEventQueue = enqueueEventQueueItem(nextState.eventQueue, event);
    if (nextEventQueue.length === nextState.eventQueue.length) {
      continue;
    }

    nextState = {
      ...nextState,
      eventQueue: nextEventQueue,
    };
    queuedEvents.push(event);
  }

  return { nextState, queuedEvents };
}
