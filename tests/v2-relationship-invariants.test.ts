import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import type { GameState } from "../src/core/v2-types";

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function relationshipIds(state: GameState): string[] {
  return [
    ...state.fellowProgressState.map((profile) => profile.id),
    ...(state.loverState.active ? ["lover"] : []),
    ...(state.selectedAdvisorName ? [`advisor:${state.selectedAdvisorName}`] : []),
  ];
}

/** Keep the run alive so that later months and their events are reached. */
function sustain(state: GameState): GameState {
  return {
    ...state,
    advisorProgressState: { ...state.advisorProgressState, funding: Math.max(100, state.advisorProgressState.funding) },
    player: {
      ...state.player,
      san: state.sanCap,
      money: Math.max(state.player.money, 60),
      favor: Math.max(state.player.favor, 6),
      social: Math.max(state.player.social, 18),
      research: Math.max(state.player.research, 0),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("relationship invariants", () => {
  it.each([1, 2, 3, 4, 5, 6])("never drops an existing fellow, lover or advisor while resolving events (seed %i)", (seed) => {
    const random = seededRandom(seed);
    vi.spyOn(Math, "random").mockImplementation(random);
    let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
    let resolvedEvents = 0;

    for (let step = 0; step < 900 && state.phase === "playing" && state.totalMonths < state.maxMonths; step += 1) {
      const due = state.eventQueue.find((event) => event.deadlineMonths <= 0);
      if (!due) {
        if (state.totalMonths === 2) {
          for (const type of ["senior", "junior", "peer", "lover"] as const) {
            state = dispatchAction(state, "debug-add-relationship", { debugRelationshipType: type });
          }
        }
        state = dispatchAction(sustain(state), "next-month");
        continue;
      }
      const event = getResolvableQueuedEvent(state, due);
      const choices = event.choices.filter((choice) => !choice.disabledReason && !choice.effects.stayOnEvent);
      const choice = choices[Math.floor(random() * choices.length)] ?? event.choices[0]!;
      const before = relationshipIds(state);
      const next = dispatchAction(sustain(state), "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
      expect(relationshipIds(next), `${event.id} → ${choice.id}`).toEqual(expect.arrayContaining(before));
      if (next === state) break;
      state = next;
      resolvedEvents += 1;
    }

    expect(resolvedEvents).toBeGreaterThan(20);
  });
});
