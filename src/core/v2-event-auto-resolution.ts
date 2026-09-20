import { getResolvableQueuedEvent } from "./v2-engine-event-resolution";
import { getSortedEventQueue } from "./v2-event-queue";
import type { EventChoice, EventQueueItem, GameState, PendingEvent } from "./v2-types";

function getLinearChoice(event: PendingEvent): EventChoice | null {
  const branches = event.choices.filter((choice) => choice.cosmetic !== true);
  const choice = branches[0];
  return branches.length === 1 && choice && !choice.disabledReason && !choice.effects.stayOnEvent ? choice : null;
}

export function isLinearEvent(state: GameState, event: EventQueueItem): boolean {
  const visiting = new Set<PendingEvent>();
  const visit = (current: PendingEvent): boolean => {
    if (visiting.has(current)) return false;
    const choice = getLinearChoice(current);
    if (!choice) return false;
    const resolution = choice.effects.fixedEventResolution?.kind;
    if (resolution === "year-summary-open" || resolution === "ccig-open"
      || resolution === "ccig-advisor" || resolution === "ccig-self") return false;
    visiting.add(current);
    const linear = (choice.effects.enqueueEvents ?? [])
      .filter((next) => next.chainId === current.chainId)
      .every(visit);
    visiting.delete(current);
    return linear;
  };
  return visit(getResolvableQueuedEvent(state, event));
}

export function canAutoResolveLinearEvent(state: GameState, event: EventQueueItem): boolean {
  return state.blockLinearEvents === false && state.phase === "playing" && event.deadlineMonths <= 0
    && isLinearEvent(state, event);
}

export function isEventBlocking(state: GameState, event: EventQueueItem): boolean {
  return event.blocking && event.deadlineMonths <= 0 && !canAutoResolveLinearEvent(state, event);
}

export function hasManualBlockingEvents(state: GameState): boolean {
  return state.eventQueue.some((event) => isEventBlocking(state, event));
}

export function getNextLinearEvent(state: GameState, chainId?: string): EventQueueItem | null {
  if (state.blockLinearEvents !== false || state.phase !== "playing") return null;
  const due = getSortedEventQueue(state.eventQueue).filter((event) => event.deadlineMonths <= 0);
  const continuation = due.find((event) => event.chainId === chainId);
  const ordered = continuation ? [continuation, ...due.filter((event) => event !== continuation)] : due;
  for (const queued of ordered) {
    const event = getResolvableQueuedEvent(state, queued);
    if (canAutoResolveLinearEvent(state, event)) return event;
    if (isEventBlocking(state, event)) return null;
  }
  return null;
}

export function settleLinearEvents(
  state: GameState,
  resolve: (state: GameState, eventId: string, choiceId: string) => GameState,
): GameState {
  if (state.blockLinearEvents !== false) return state;
  let nextState = state;
  let chainId: string | undefined;
  const handled = new Set<string>();
  while (nextState.phase === "playing") {
    const event = getNextLinearEvent(nextState, chainId);
    if (!event || handled.has(event.id)) break;
    const choice = getLinearChoice(event)!;
    handled.add(event.id);
    chainId = event.chainId;
    const resolved = resolve(nextState, event.id, choice.id);
    if (resolved === nextState) break;
    nextState = resolved;
  }
  return nextState;
}
