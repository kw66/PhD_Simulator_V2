import type { EventQueueItem, GameState, PendingEvent } from "./v2-types";

function clampDeadlineMonths(value: number): number {
  return Math.max(0, Math.floor(value));
}

function normalizePreview(event: PendingEvent): string {
  const preview = event.preview.trim();
  if (preview.length > 0) {
    return preview;
  }

  const compactDescription = event.description.replace(/\s+/g, " ").trim();
  return compactDescription.length > 0 ? compactDescription : "点击查看详情";
}

export function createEventQueueItem(event: PendingEvent, queueOrder: number): EventQueueItem {
  return {
    ...event,
    preview: normalizePreview(event),
    blocking: event.blocking === true,
    deadlineMonths: clampDeadlineMonths(event.deadlineMonths),
    queueOrder,
  };
}

export function compareEventQueueItems(left: EventQueueItem, right: EventQueueItem): number {
  const deadlineDifference = left.deadlineMonths - right.deadlineMonths;
  if (deadlineDifference !== 0) {
    return deadlineDifference;
  }

  return left.queueOrder - right.queueOrder;
}

export function getSortedEventQueue(eventQueue: EventQueueItem[]): EventQueueItem[] {
  return [...eventQueue].sort(compareEventQueueItems);
}

export function getCurrentEvent(eventQueue: EventQueueItem[], eventId?: string): EventQueueItem | null {
  if (eventId) {
    return eventQueue.find((event) => event.id === eventId) ?? null;
  }

  const sortedEventQueue = getSortedEventQueue(eventQueue);
  const blockingEvent = sortedEventQueue.find((event) => event.blocking && event.deadlineMonths <= 0);
  return blockingEvent ?? sortedEventQueue[0] ?? null;
}

export function hasBlockingEventQueueItems(eventQueue: EventQueueItem[]): boolean {
  return eventQueue.some((event) => event.blocking && event.deadlineMonths <= 0);
}

export function enqueueEventQueueItem(eventQueue: EventQueueItem[], event: PendingEvent): EventQueueItem[];
export function enqueueEventQueueItem(state: GameState, event: PendingEvent): GameState;
export function enqueueEventQueueItem(input: EventQueueItem[] | GameState, event: PendingEvent): EventQueueItem[] | GameState {
  const eventQueue = Array.isArray(input) ? input : input.eventQueue;
  if (eventQueue.some((item) => item.id === event.id)) {
    return input;
  }

  const nextQueueOrder = eventQueue.reduce((maxOrder, item) => Math.max(maxOrder, item.queueOrder), 0) + 1;
  const nextEventQueue = [...eventQueue, createEventQueueItem(event, nextQueueOrder)];

  if (Array.isArray(input)) {
    return nextEventQueue;
  }

  return {
    ...input,
    eventQueue: nextEventQueue,
  };
}

export function removeEventQueueItem(eventQueue: EventQueueItem[], eventId: string): EventQueueItem[] {
  return eventQueue.filter((event) => event.id !== eventId);
}

export function decrementEventQueueDeadlines(eventQueue: EventQueueItem[]): EventQueueItem[] {
  return eventQueue.map((event) =>
    event.deadlineMonths > 0
      ? {
          ...event,
          deadlineMonths: event.deadlineMonths - 1,
        }
      : event,
  );
}

export function dequeueCurrentQueueEvent(state: GameState): GameState {
  const currentEvent = getCurrentEvent(state.eventQueue);
  if (!currentEvent) {
    return state;
  }

  return {
    ...state,
    eventQueue: removeEventQueueItem(state.eventQueue, currentEvent.id),
  };
}

export function getCurrentQueueEvent(state: Pick<GameState, "eventQueue">): EventQueueItem | null {
  return getCurrentEvent(state.eventQueue);
}

export function hasBlockingQueueEvent(state: Pick<GameState, "eventQueue">): boolean {
  return hasBlockingEventQueueItems(state.eventQueue);
}
