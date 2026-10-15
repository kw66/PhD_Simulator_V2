import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { gameRandom, withGameRandom, withGameRandomPreview } from "../src/core/v2-game-random";
import { renderApp } from "../src/app/v2-render";
import { getEventChoiceRiskDetails } from "../src/core/v2-event-choice-risk";
import type { GameState } from "../src/core/v2-types";
import { createInternshipInviteAct1, buildInternshipInviteContext } from "../src/core/v2-internship-events";
import { createEventQueueItem } from "../src/core/v2-event-queue";

afterEach(() => vi.restoreAllMocks());

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function enroll(source: GameState): GameState {
  let state = source;
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    state = dispatchAction(state, "resolve-event", { eventId: state.eventQueue.find(event => event.chainId === "before-grad-school")!.id, eventChoiceId });
  }
  return dispatchAction(state, "next-month");
}

describe("saved gameplay random stream", () => {
  it("a stored start seed reproduces conference locations, student identity and advisor identity", () => {
    const source = { ...createInitialState(), randomState: { seed: 1092, cursor: 0 } };
    const first = dispatchAction(source, "start-game", { roleId: "normal" });
    expect(dispatchAction(clone(source), "start-game", { roleId: "normal" })).toEqual(first);
  });
  it("serializes the cursor and resumes the same future rolls without changing global Math.random", () => {
    const globalRandom = Math.random;
    const first = withGameRandom({ randomState: { seed: 42, cursor: 0 }, rolls: [] as number[] }, () => ({
      randomState: { seed: 42, cursor: 0 }, rolls: [gameRandom(), gameRandom()],
    }));
    expect(first.randomState.cursor).toBe(2);
    const next = (state: typeof first) => withGameRandom(state, () => ({ ...state, rolls: [...state.rolls, gameRandom()] }));
    expect(next(clone(first))).toEqual(next(first));
    expect(next(first).rolls[2]).not.toBe(first.rolls[0]);
    expect(Math.random).toBe(globalRandom);
  });

  it("opening, deferred confirmation and a month replay identically after JSON load, independent of the clock and ambient randomness", () => {
    const opening = dispatchAction({ ...createInitialState(), randomState: { seed: 7301, cursor: 0 } }, "start-game", { roleId: "normal" });
    const saved = clone(opening);
    const first = enroll(opening);
    vi.spyOn(Date, "now").mockReturnValue(9999999999999);
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("A loaded game must use its saved random stream"); });
    expect(enroll(saved)).toEqual(first);
    expect(saved).toEqual(opening);
    expect(first.randomState!.cursor).toBeGreaterThan(opening.randomState!.cursor);
  });

  it("replays random monthly actions and event generation for several saved months", () => {
    let state = enroll(dispatchAction({ ...createInitialState(), randomState: { seed: 99, cursor: 0 } }, "start-game", { roleId: "normal" }));
    for (let month = 0; month < 8; month++) {
      state = { ...state, eventQueue: [], player: { ...state.player, san: 20, money: 50, favor: 10, social: 10 }, advisorProgressState: { ...state.advisorProgressState, funding: 100 } };
      const loaded = clone(state);
      const first = dispatchAction(state, "next-month");
      expect(dispatchAction(loaded, "next-month")).toEqual(first);
      state = first;
    }
  });

  it("rendering and hover previews do not advance or alter the saved stream", () => {
    const state = dispatchAction({ ...createInitialState(), randomState: { seed: 91, cursor: 0 } }, "start-game", { roleId: "normal" });
    const saved = clone(state);
    const baseline = enroll(saved);
    for (let index = 0; index < 3; index++) {
      renderApp(state);
      for (const event of state.eventQueue) for (const choice of event.choices) getEventChoiceRiskDetails(state, event, choice);
    }
    expect(state).toEqual(saved);
    expect(enroll(state)).toEqual(baseline);
  });

  it("saves the exact internship company before the reveal and the exact offer before confirmation", () => {
    let state = enroll(dispatchAction({ ...createInitialState(), randomState: { seed: 123, cursor: 0 } }, "start-game", { roleId: "normal" }));
    state = { ...state, eventQueue: [createEventQueueItem(createInternshipInviteAct1(buildInternshipInviteContext(state)), 1)] };
    const choose = (source: GameState) => {
      const event = source.eventQueue[0]!;
      return dispatchAction(source, "resolve-event", { eventId: event.id, eventChoiceId: event.choices.find(choice => choice.id === "accept")?.id ?? event.choices[0]!.id });
    };
    for (let stage = 0; stage < 3; stage++) {
      const loaded = clone(state);
      const advanced = choose(state);
      expect(choose(loaded)).toEqual(advanced);
      expect(loaded).toEqual(state);
      state = advanced;
    }
    expect(state.internshipState.active).toBe(true);
  });

  it("nested actions consume once and preview forks restore the surrounding cursor even on errors", () => {
    const source = { randomState: { seed: 19, cursor: 0 }, rolls: [] as number[] };
    const result = withGameRandom(source, () => {
      const a = gameRandom();
      expect(() => withGameRandomPreview(source, () => { gameRandom(); throw new Error("preview"); })).toThrow("preview");
      const nested = withGameRandom(source, () => ({ ...source, rolls: [a, gameRandom()] }));
      return { ...nested, rolls: [...nested.rolls, gameRandom()] };
    });
    const straight = withGameRandom(source, () => ({ ...source, rolls: [gameRandom(), gameRandom(), gameRandom()] }));
    expect(result).toEqual(straight);
    expect(result.randomState.cursor).toBe(3);
  });

  it("fresh runs have independent saved seeds", () => {
    const first = createStartedGameState("normal");
    const second = createStartedGameState("normal");
    expect(first.randomState?.seed).not.toBe(second.randomState?.seed);
    const restarted = dispatchAction(first, "restart-game");
    expect(restarted.randomState?.seed).not.toBe(first.randomState?.seed);
  });
});
