import { enqueueEventQueueItem } from "./v2-event-queue";
import { buildNormalizedHydratedState } from "./v2-persistence-hydrate-derived";
import { hasGameStateBaseShape, isValidPendingDecision, isValidPendingEvent } from "./v2-persistence-validate";
import type { GameState } from "./v2-types";

export function normalizeLoadedState(value: unknown): GameState | null {
  if (!hasGameStateBaseShape(value)) return null;

  const manualSaveSummaries = Array.isArray(value.manualSaveSummaries) ? value.manualSaveSummaries : [];
  const pendingDecision = isValidPendingDecision(value.pendingDecision) ? value.pendingDecision : null;
  const normalizedHydratedState = buildNormalizedHydratedState(value);

  if (Array.isArray(value.eventQueue)) {
    return {
      ...(value as unknown as GameState),
      ...normalizedHydratedState,
      manualSaveSummaries,
      pendingDecision,
    };
  }

  let migratedState: GameState = {
    ...(value as unknown as Omit<GameState, "eventQueue" | "pendingDecision" | "manualSaveSummaries">),
    eventQueue: [],
    ...normalizedHydratedState,
    pendingDecision,
    manualSaveSummaries,
  };

  if (isValidPendingEvent(value.pendingEvent)) {
    migratedState = enqueueEventQueueItem(migratedState, value.pendingEvent);
  }

  return migratedState;
}
