import {
  pushLog,
  pushNoOpLog,
} from "./v2-engine-helpers";
import { removeBuffs } from "./v2-buffs";
import {
  removeEventQueueItem,
} from "./v2-event-queue";
import { enqueueResolvedEventFollowUps } from "./v2-engine-event-resolution-followups";
import { applyChoiceEffectsToState } from "./v2-engine-event-resolution-state";
import { clampResearchToCap } from "./v2-research-cap-system";
import { createRandomEventById } from "./v2-random-event-router";
import { refreshPaperCompetitionEvent } from "./v2-paper-competition-preview";
import { refreshPaperReviewEvent } from "./v2-publication-system";
import type {
  DeferredEventStatePatch,
  EventChoice,
  EventQueueItem,
  GameState,
  PendingEvent,
  ResolvedEventStage,
} from "./v2-types";

interface EventResolutionCallbacks {
  evaluateImmediateEndings: (state: GameState) => GameState;
  runPostQueuePipeline: (state: GameState) => GameState;
}

function buildCompletedEventLog(
  queuedEvent: EventQueueItem,
  history: ResolvedEventStage[],
  resolvedOutcome: string,
): string {
  const firstTitle = history[0]?.title ?? "事件";
  const eventTitle = firstTitle.split("➜", 1)[0]?.trim() || firstTitle.trim();
  const summary = queuedEvent.completionLog?.trim() || resolvedOutcome.trim() || "事件结束。";
  return `${eventTitle}：${summary}`;
}

const DEFERRED_STATE_EXCLUDED_KEYS: ReadonlySet<keyof GameState> = new Set([
  "phase",
  "ending",
  "log",
  "eventQueue",
  "eventHistory",
  "debugEventReplayEnabled",
]);

function stateValuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainStateRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDeferredStatePatch(previous: GameState, current: GameState): DeferredEventStatePatch | undefined {
  const patch: DeferredEventStatePatch = [];
  const collectChanges = (path: string[], previousValue: unknown, currentValue: unknown): void => {
    if (stateValuesMatch(previousValue, currentValue)) return;

    if (isPlainStateRecord(previousValue) && isPlainStateRecord(currentValue)) {
      const keys = new Set([...Object.keys(previousValue), ...Object.keys(currentValue)]);
      for (const key of keys) {
        collectChanges([...path, key], previousValue[key], currentValue[key]);
      }
      return;
    }

    patch.push({
      path,
      previousValue: structuredClone(previousValue),
      value: structuredClone(currentValue),
    });
  };

  for (const key of Object.keys(current) as Array<keyof GameState>) {
    if (DEFERRED_STATE_EXCLUDED_KEYS.has(key)) continue;
    collectChanges([key], previous[key], current[key]);
  }

  return patch.length > 0 ? patch : undefined;
}

function getDeferredArrayItemKey(value: unknown): string | null {
  if (isPlainStateRecord(value) && typeof value.id === "string") return `id:${value.id}`;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `value:${JSON.stringify(value)}`;
  }
  return null;
}

function mergeDeferredArray(previous: unknown[], intended: unknown[], current: unknown[]): unknown[] {
  const previousKeys = previous.map(getDeferredArrayItemKey);
  const intendedKeys = intended.map(getDeferredArrayItemKey);
  const currentKeys = current.map(getDeferredArrayItemKey);
  if ([...previousKeys, ...intendedKeys, ...currentKeys].some((key) => key === null)) {
    return stateValuesMatch(current, previous) ? structuredClone(intended) : current;
  }

  const previousByKey = new Map(previousKeys.map((key, index) => [key!, previous[index]]));
  const intendedByKey = new Map(intendedKeys.map((key, index) => [key!, intended[index]]));
  const next = current.filter((_, index) => {
    const key = currentKeys[index]!;
    return !previousByKey.has(key) || intendedByKey.has(key);
  });

  for (const [key, intendedItem] of intendedByKey) {
    const previousItem = previousByKey.get(key);
    const index = next.findIndex((item) => getDeferredArrayItemKey(item) === key);
    if (previousItem === undefined) {
      if (index < 0) next.push(structuredClone(intendedItem));
      continue;
    }
    if (!stateValuesMatch(previousItem, intendedItem) && index >= 0) {
      next[index] = rebaseDeferredValue(next[index], previousItem, intendedItem);
    }
  }

  return next;
}

function rebaseDeferredValue(currentValue: unknown, previousValue: unknown, intendedValue: unknown): unknown {
  if (stateValuesMatch(previousValue, intendedValue)) return currentValue;
  if (
    typeof currentValue === "number"
    && typeof previousValue === "number"
    && typeof intendedValue === "number"
  ) {
    return currentValue + (intendedValue - previousValue);
  }
  if (Array.isArray(currentValue) && Array.isArray(previousValue) && Array.isArray(intendedValue)) {
    return mergeDeferredArray(previousValue, intendedValue, currentValue);
  }
  if (isPlainStateRecord(currentValue) && isPlainStateRecord(previousValue) && isPlainStateRecord(intendedValue)) {
    const merged = structuredClone(currentValue);
    const keys = new Set([...Object.keys(previousValue), ...Object.keys(intendedValue)]);
    for (const key of keys) {
      merged[key] = rebaseDeferredValue(currentValue[key], previousValue[key], intendedValue[key]);
    }
    return merged;
  }
  return stateValuesMatch(currentValue, previousValue) ? structuredClone(intendedValue) : currentValue;
}

const RELATIONSHIP_COUNT_KEYS = ["seniorCount", "juniorCount", "peerCount"] as const;

function enforceDeferredRelationshipCapacity(
  nextState: GameState,
  patch: DeferredEventStatePatch,
): void {
  const overflow = nextState.relationshipState.occupiedSlots - Math.max(0, nextState.relationshipState.unlockedSlots - 1);
  if (overflow <= 0) return;

  let remaining = overflow;
  for (const key of RELATIONSHIP_COUNT_KEYS) {
    if (remaining <= 0) break;
    const change = patch.find((item) => item.path.join(".") === `relationshipState.${key}`);
    if (!change || typeof change.previousValue !== "number" || typeof change.value !== "number") continue;
    const requested = Math.max(0, change.value - change.previousValue);
    const removed = Math.min(requested, remaining);
    if (removed === 0) continue;
    nextState.relationshipState = {
      ...nextState.relationshipState,
      [key]: Math.max(0, nextState.relationshipState[key] - removed),
      occupiedSlots: nextState.relationshipState.occupiedSlots - removed,
    };
    remaining -= removed;
  }

  if (remaining > 0) {
    nextState.relationshipState = {
      ...nextState.relationshipState,
      occupiedSlots: Math.max(0, nextState.relationshipState.unlockedSlots - 1),
    };
  }

  const fellowPatch = patch.find((item) => item.path.join(".") === "fellowProgressState");
  if (!fellowPatch || !Array.isArray(fellowPatch.previousValue) || !Array.isArray(fellowPatch.value)) return;
  const existingIds = new Set(
    fellowPatch.previousValue
      .filter(isPlainStateRecord)
      .map((profile) => profile.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const addedIds = fellowPatch.value
    .filter(isPlainStateRecord)
    .map((profile) => profile.id)
    .filter((id): id is string => typeof id === "string" && !existingIds.has(id));
  if (addedIds.length === 0) return;
  const retainedCount = Math.max(0, addedIds.length - overflow);
  const retainedIds = new Set(addedIds.slice(0, retainedCount));
  nextState.fellowProgressState = nextState.fellowProgressState.filter((profile) => (
    existingIds.has(profile.id) || !addedIds.includes(profile.id) || retainedIds.has(profile.id)
  ));
}

function applyDeferredStatePatch(state: GameState, patch: DeferredEventStatePatch | undefined): GameState {
  if (!patch) return state;
  const nextState = structuredClone(state);
  for (const change of patch) {
    if (change.path.length === 0) continue;
    let target = nextState as unknown as Record<string, unknown>;
    for (const segment of change.path.slice(0, -1)) {
      const child = target[segment];
      if (!isPlainStateRecord(child)) break;
      target = child;
    }
    const finalSegment = change.path.at(-1);
    if (finalSegment !== undefined) {
      target[finalSegment] = rebaseDeferredValue(target[finalSegment], change.previousValue, change.value);
    }
  }
  nextState.player = {
    ...nextState.player,
    san: Math.min(nextState.sanCap, nextState.player.san),
    research: clampResearchToCap(nextState.player.research, nextState.researchCapacityState),
    social: Math.min(20, nextState.player.social),
    favor: Math.min(20, nextState.player.favor),
  };
  enforceDeferredRelationshipCapacity(nextState, patch);
  nextState.phase = state.phase;
  nextState.ending = state.ending;
  nextState.log = state.log;
  nextState.eventQueue = state.eventQueue;
  nextState.eventHistory = state.eventHistory;
  return nextState;
}

export function rebaseGeneratedEventIds<T>(value: T, generatedEventId: string, queuedEventId: string): T {
  if (generatedEventId === queuedEventId) return value;
  if (typeof value === "string") {
    return value.replaceAll(generatedEventId, queuedEventId) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rebaseGeneratedEventIds(item, generatedEventId, queuedEventId)) as T;
  }
  if (!isPlainStateRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      rebaseGeneratedEventIds(item, generatedEventId, queuedEventId),
    ]),
  ) as T;
}

function rebuildRandomEventFromCurrentState(
  state: GameState,
  queuedEvent: EventQueueItem,
): EventQueueItem {
  const replay = queuedEvent.randomReplay;
  if (!replay || queuedEvent.source !== "random" || (queuedEvent.stage !== "act1" && queuedEvent.stage !== "act2")) {
    return queuedEvent;
  }

  let rollIndex = 0;
  const getReplayRoll = (): number => {
    const roll = replay.rolls[rollIndex] ?? 0;
    rollIndex += 1;
    return roll;
  };
  const rebuilt = createRandomEventById(
    replay.eventId,
    {
      ...state,
      totalRandomEventCount: replay.serial,
      ...(queuedEvent.paperCompetitionTargetId ? {
        papers: state.papers.filter((paper) => paper.id === queuedEvent.paperCompetitionTargetId),
      } : {}),
    },
    getReplayRoll,
  ).event;
  if (!rebuilt) {
    return queuedEvent;
  }

  const rootEventId = queuedEvent.replayContext?.rootEvent.id
    ?? queuedEvent.debugRootEventId
    ?? /^(.*?)(?:-choice|-result-.*)$/u.exec(queuedEvent.id)?.[1]
    ?? queuedEvent.id;
  const rebuiltRoot = rebaseGeneratedEventIds(rebuilt, rebuilt.id, rootEventId);
  let rebuiltCurrent: PendingEvent = rebuiltRoot;
  for (const stage of queuedEvent.history ?? []) {
    const selectedChoice = rebuiltCurrent.choices.find((choice) => choice.id === stage.selectedChoiceId);
    const nextEvent = selectedChoice?.effects.enqueueEvents?.find((event) => event.chainId === queuedEvent.chainId)
      ?? selectedChoice?.effects.enqueueEvents?.[0];
    if (!nextEvent) return queuedEvent;
    rebuiltCurrent = nextEvent;
  }
  const rebuiltWithStableIds = rebaseGeneratedEventIds(rebuiltCurrent, rebuiltCurrent.id, queuedEvent.id);

  return {
    ...rebuiltWithStableIds,
    id: queuedEvent.id,
    queueOrder: queuedEvent.queueOrder,
    history: queuedEvent.history,
    randomReplay: replay,
    replayContext: queuedEvent.replayContext,
    deferredStatePatch: queuedEvent.deferredStatePatch,
    debugRootEventId: queuedEvent.debugRootEventId,
    ...(queuedEvent.debugReplayable ? {
      debugReplayable: true,
      debugRootEventId: queuedEvent.debugRootEventId ?? queuedEvent.id,
    } : {}),
  };
}

export function getResolvableQueuedEvent(state: GameState, queuedEvent: EventQueueItem): EventQueueItem {
  return refreshOccupiedLoverEvent(state, refreshPaperReviewEvent(state, refreshPaperCompetitionEvent(state,
    refreshRandomResultPreview(state, rebuildRandomEventFromCurrentState(state, queuedEvent)))));
}

function refreshOccupiedLoverEvent(state: GameState, event: EventQueueItem): EventQueueItem {
  if (event.chainId !== "lover-development" || !(state.loverState.active || state.relationshipState.loverCount > 0)) return event;
  if (event.stage === "act2") {
    return { ...event, choices: event.choices.map((choice) => choice.id === "accept"
      ? { ...choice, disabledReason: "已有恋人，无法开始新的恋爱关系。" } : choice) };
  }
  if (event.stage !== "result" || event.history?.at(-1)?.selectedChoiceId !== "accept") return event;
  return {
    ...event,
    description: "你已经有了恋人，决定放下这段尚未确认的关系。\n\n机制结算\n已有恋人，本次不新增关系。",
    deferredStatePatch: undefined,
    completionLog: "已有恋人，本次不新增关系。",
  };
}

function refreshRandomResultPreview(state: GameState, event: EventQueueItem): EventQueueItem {
  const previousScene = event.history?.at(-1);
  const source = previousScene?.replayEvent;
  if (event.stage !== "result" || !event.randomReplay || !source || source.stage !== "act2") return event;
  const decision: EventQueueItem = {
    ...source,
    queueOrder: event.queueOrder,
    history: event.history?.slice(0, -1),
    replayContext: event.replayContext,
    randomReplay: event.randomReplay,
  };
  // Recalculate the pending preview from today's relationships/modifiers.
  // applyQueuedEventEffects defers every same-chain effect, so this never
  // settles the event. Only its replacement result is kept.
  const preview = applyQueuedEventEffects({
    ...state,
    eventQueue: state.eventQueue.filter((item) => item.id !== event.id),
  }, decision, previousScene.selectedChoiceId, {
    evaluateImmediateEndings: (nextState) => nextState,
    runPostQueuePipeline: (nextState) => nextState,
  });
  const result = preview.eventQueue.find((item) => item.id === event.id);
  return result ? { ...result, queueOrder: event.queueOrder } : event;
}

export function refreshPendingEventDecisions(state: GameState): GameState {
  const eventQueue = state.eventQueue.map((event) => (event.stage === "act2" || event.stage === "result")
    && (event.randomReplay || event.chainId === "lover-development")
    ? getResolvableQueuedEvent(state, event) : event);
  return eventQueue.every((event, index) => event === state.eventQueue[index]) ? state : { ...state, eventQueue };
}

export function applyQueuedEventEffects(
  state: GameState,
  queuedEvent: EventQueueItem,
  choiceId: string | undefined,
  callbacks: EventResolutionCallbacks,
): GameState {
  const resolvedEvent = getResolvableQueuedEvent(state, queuedEvent);
  let choice = resolvedEvent.choices.find((item) => item.id === choiceId);
  if (!choice) {
    return pushNoOpLog(state, "当前事件选择无效。");
  }
  if (choice.disabledReason) {
    return state;
  }

  choice = deferPaperChoiceEffects(resolvedEvent, choice);

  const stateWithDeferredResolution = applyDeferredStatePatch(state, resolvedEvent.deferredStatePatch);
  const {
    nextState: resolvedState,
    resolvedOutcome,
    resolvedEnqueueEvents,
  } = applyChoiceEffectsToState(
    stateWithDeferredResolution,
    choice,
    resolvedEvent.history?.[0]?.title ?? resolvedEvent.title.split(" ➜ ")[0] ?? "事件",
  );

  if (choice.effects.stayOnEvent === true) {
    const pendingPatch = createDeferredStatePatch(state, resolvedState);
    return {
      ...state,
      eventQueue: resolvedState.eventQueue.map((event) => event.id !== resolvedEvent.id ? event : {
        ...event,
        deferredStatePatch: pendingPatch,
        replayContext: event.replayContext ?? resolvedEvent.replayContext,
      }),
    };
  }

  const followUpEvents = [...resolvedEnqueueEvents, ...(choice.effects.enqueueEvents ?? [])];
  // Every intermediate scene is a preview. Carry its cumulative effects
  // forward, and commit only when the final confirmation closes this chain.
  const hasSameChainFollowUp = followUpEvents.some((event) => event.chainId === resolvedEvent.chainId);
  const deferredStatePatch = hasSameChainFollowUp
    ? createDeferredStatePatch(state, resolvedState)
    : undefined;
  const committedState = hasSameChainFollowUp ? state : resolvedState;
  const { history: _history, replayContext: _context, ...sceneSource } = resolvedEvent;
  let nextState: GameState = {
    ...committedState,
    eventQueue: removeEventQueueItem(committedState.eventQueue, resolvedEvent.id),
  };
  const resolvedHistory: ResolvedEventStage[] = [
    ...(resolvedEvent.history ?? []),
    {
      title: resolvedEvent.title,
      description: resolvedEvent.description,
      paperReviewPresentation: resolvedEvent.paperReviewPresentation,
      choices: resolvedEvent.choices.map(({ id, label, outcome, disabledReason, fellowCandidate }) => ({ id, label, outcome, disabledReason, fellowCandidate })),
      selectedChoiceId: choice.id,
      replayEvent: sceneSource,
    },
  ];
  const followUpResult = enqueueResolvedEventFollowUps(
    nextState,
    choice,
    resolvedEnqueueEvents,
    resolvedEvent.chainId,
    resolvedHistory,
    deferredStatePatch,
    resolvedEvent.debugReplayable || state.debugEventReplayEnabled
      ? resolvedEvent.replayContext?.rootEvent.id ?? resolvedEvent.debugRootEventId ?? resolvedEvent.id : undefined,
    resolvedEvent.replayContext ?? (resolvedEvent.stage === "act1" ? { rootEvent: resolvedEvent } : undefined),
    resolvedEvent.randomReplay,
  );
  nextState = followUpResult.nextState;
  if (!followUpResult.hasSameChainFollowUp) {
    const eventHistoryId = `${resolvedEvent.id}@${state.totalMonths}@${nextState.eventHistory.length}`;
    nextState = {
      ...nextState,
      buffs: removeBuffs(nextState.buffs, resolvedEvent.removeBuffIdsOnCompletion ?? []),
      eventHistory: [
        ...nextState.eventHistory,
        {
          id: eventHistoryId,
          chainId: resolvedEvent.chainId,
          source: resolvedEvent.source,
          completedAtTotalMonths: state.totalMonths,
          completedAtYear: state.year,
          completedAtMonth: state.month,
          stages: resolvedHistory.map(({ replayEvent: _source, ...stage }) => stage),
          ...(resolvedEvent.debugReplayable ? {
            debugReplayable: true,
            debugRootEventId: resolvedEvent.debugRootEventId ?? resolvedEvent.id,
          } : {}),
        },
      ],
    };
    nextState = pushLog(nextState, buildCompletedEventLog(
      resolvedEvent,
      resolvedHistory,
      resolvedOutcome,
    ), { eventHistoryId });
  }
  nextState = callbacks.evaluateImmediateEndings(nextState);
  if (nextState.phase !== "playing") return nextState;
  return callbacks.runPostQueuePipeline(nextState);
}

function deferPaperChoiceEffects(event: EventQueueItem, choice: EventChoice): EventChoice {
  if (event.stage === "result") return choice;
  const { clearDraftProgress, paperCollaborations, paperUpdates, ...otherEffects } = choice.effects;
  if (!clearDraftProgress && !paperCollaborations?.length && !paperUpdates?.length) return choice;
  const followUps = choice.effects.enqueueEvents ?? [];
  const resultIndex = followUps.findIndex((followUp) => followUp.chainId === event.chainId
    && (followUp.stage === "result" || followUp.description.includes("机制结算")));
  if (resultIndex < 0) return choice;
  return {
    ...choice,
    effects: {
      ...otherEffects,
      enqueueEvents: followUps.map((followUp, index) => index !== resultIndex ? followUp : {
        ...followUp,
        choices: followUp.choices.map((resultChoice) => ({
          ...resultChoice,
          effects: {
            ...resultChoice.effects,
            clearDraftProgress: clearDraftProgress || resultChoice.effects.clearDraftProgress,
            paperUpdates: [...(paperUpdates ?? []), ...(resultChoice.effects.paperUpdates ?? [])],
            paperCollaborations: [...(paperCollaborations ?? []), ...(resultChoice.effects.paperCollaborations ?? [])],
          },
        })),
      }),
    },
  };
}
