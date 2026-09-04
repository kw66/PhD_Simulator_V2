import { removeBuffs } from "./v2-buffs";
import type { EventQueueItem, GameState, PendingEvent } from "./v2-types";

function clampDeadlineMonths(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function createEventQueueItem(event: PendingEvent, queueOrder: number): EventQueueItem {
  return {
    ...event,
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

export function removeBlockingEventQueueItems(eventQueue: EventQueueItem[]): EventQueueItem[] {
  return eventQueue.filter((event) => !event.blocking || event.deadlineMonths > 0);
}

export function discardBlockingQueueEvents(state: GameState): GameState {
  const discardedEvents = state.eventQueue.filter((event) => event.blocking && event.deadlineMonths <= 0);
  if (discardedEvents.length === 0) return state;

  const removedBuffIds = discardedEvents.flatMap((event) => event.removeBuffIdsOnCompletion ?? []);
  const paperUpdates = new Map(
    discardedEvents.flatMap((event) => event.discardPaperUpdates ?? []).map((update) => [update.id, update]),
  );
  const applyPaperUpdates = (papers: GameState["papers"]): GameState["papers"] => papers.map((paper) => {
    const update = paperUpdates.get(paper.id);
    return update ? { ...paper, ...update } : paper;
  });

  return {
    ...state,
    eventQueue: removeBlockingEventQueueItems(state.eventQueue),
    buffs: removeBuffs(state.buffs, removedBuffIds),
    papers: applyPaperUpdates(state.papers),
    externalPublications: applyPaperUpdates(state.externalPublications),
  };
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

export function getCurrentQueueEvent(state: Pick<GameState, "eventQueue">): EventQueueItem | null {
  return getCurrentEvent(state.eventQueue);
}

export function hasBlockingQueueEvent(state: Pick<GameState, "eventQueue">): boolean {
  return hasBlockingEventQueueItems(state.eventQueue);
}
