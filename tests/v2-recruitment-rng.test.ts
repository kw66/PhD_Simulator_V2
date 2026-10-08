import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile, createGeneratedFellowProfileAddition } from "../src/core/v2-fellow-progression";
import { getFellowAcademicYear } from "../src/core/v2-fellow-academic";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import type { EventQueueItem, FellowProfileAddition, FellowProgressProfile, GameState, PendingEvent } from "../src/core/v2-types";

function makeState(year = 4, month = 6): GameState {
  return {
    ...createStartedGameState("normal"), year, month, totalMonths: (year - 1) * 12 + month,
    degree: "phd", maxMonths: 70, totalRandomEventCount: 3,
    eventQueue: [], availableRandomEvents: [], debugEventReplayEnabled: true,
    player: { san: 20, research: 10, social: 5, favor: 5, money: 20 },
  };
}

function queueRecruitment(state: GameState, eventId: number, rolls = [0.2, 0.1, 0.2, 0.3, 0.95, 0.99]): GameState {
  const recorded: number[] = [];
  const root = createRandomEventById(eventId, state, () => {
    const roll = rolls[recorded.length] ?? 0.99;
    recorded.push(roll);
    return roll;
  }).event!;
  return { ...state, eventQueue: [createEventQueueItem({
    ...root, randomReplay: { eventId, serial: state.totalRandomEventCount, rolls: recorded },
  }, 1)] };
}

function choose(state: GameState, match?: string): GameState {
  const event = state.eventQueue[0]!;
  const choice = match ? event.choices.find((entry) => entry.id.includes(match)) : event.choices[0];
  expect(choice).toBeDefined();
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice!.id });
}

function additions(event: PendingEvent): FellowProfileAddition[] {
  return event.choices.flatMap((choice) => [
    ...(choice.effects.fellowAdditions ?? []),
    ...(choice.effects.enqueueEvents ?? []).flatMap(additions),
  ]);
}

function previewFellow(event: EventQueueItem): FellowProgressProfile {
  const change = event.deferredStatePatch?.find((entry) => entry.path.join(".") === "fellowProgressState");
  expect(change).toBeDefined();
  const profiles = change!.value as FellowProgressProfile[];
  expect(profiles.length).toBeGreaterThan(0);
  return profiles.at(-1)!;
}

afterEach(() => vi.restoreAllMocks());

describe("recruitment random stream isolation", () => {
  it.each([1, 10, 11, 14])("keeps event %s candidates stable when unrelated stats cross resistance tiers", (eventId) => {
    const queued = choose(queueRecruitment(makeState(), eventId));
    const original = additions(queued.eventQueue[0]!);
    expect(original.length).toBeGreaterThan(0);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Preview consumed global randomness"); });
    for (const stats of [
      { social: 6, favor: 5, research: 10 },
      { social: 12, favor: 6, research: 12 },
      { social: 18, favor: 18, research: 18 },
      { social: 6.75, favor: 12.5, research: 18.25 },
    ]) {
      const changed = { ...queued, player: { ...queued.player, ...stats } };
      const refreshed = getResolvableQueuedEvent(changed, JSON.parse(JSON.stringify(queued.eventQueue[0])));
      expect(additions(refreshed)).toEqual(original);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("preserves the candidate when a real unrelated event raises social from five to six", () => {
    const queued = choose(queueRecruitment(makeState(), 14));
    const original = additions(queued.eventQueue[0]!);
    const gain = createEventQueueItem({
      id: "social-gain", title: "社交提升", description: "", source: "system", blocking: true,
      deadlineMonths: 0, chainId: "social-gain", stage: "result",
      choices: [{ id: "confirm", label: "确认", outcome: "社交 +1", effects: { social: 1 } }],
    }, 2);
    const changed = dispatchAction({ ...queued, eventQueue: [...queued.eventQueue, gain] },
      "resolve-event", { eventId: gain.id, eventChoiceId: "confirm" });
    expect(changed.player.social).toBe(6);
    expect(additions(changed.eventQueue[0]!)).toEqual(original);
    const selected = choose(changed, "-idea-");
    const accepted = choose(selected);
    expect(accepted.fellowProgressState[0]).toMatchObject(original[0]!);
  });

  it("keeps research draws independent of name collision retries", () => {
    const seed = "collision-test";
    const original = createGeneratedFellowProfileAddition("peer", 3, undefined, [], undefined, { year: 6 }, seed);
    const renamed = createGeneratedFellowProfileAddition("peer", 3, undefined, [original.name!], undefined, { year: 6 }, seed);
    expect(renamed.name).not.toBe(original.name);
    expect(renamed).toMatchObject({ research: original.research, academicYear: original.academicYear, gender: original.gender });
  });

  it("keeps all mentor candidates' research and gender stable when one name collides", () => {
    const state = makeState();
    const root = createMentorAssignEvent(state, () => 0.4);
    const candidates = additions(root);
    expect(candidates).toHaveLength(4);
    const existing = createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: candidates[0]!.name,
      research: 3, affinity: 1, startTotalMonths: 1,
    });
    const refreshed = getResolvableQueuedEvent({ ...state, fellowProgressState: [existing] }, createEventQueueItem(root, 1));
    const changed = additions(refreshed);
    expect(changed[0]!.name).not.toBe(candidates[0]!.name);
    for (const [index, candidate] of candidates.entries()) {
      expect(changed[index]).toMatchObject({
        gender: candidate.gender, research: candidate.research, academicYear: 1,
        academicStartTotalMonths: 37, initialResearchScore: candidate.initialResearchScore,
      });
      if (index > 0) expect(changed[index]!.name).toBe(candidate.name);
    }
  });

  it("preserves the original cohort and research when a queued peer joins after September", () => {
    const initial = makeState(2, 12);
    const queued = queueRecruitment(initial, 10, [0.99, 0.99]);
    const original = additions(queued.eventQueue[0]!)[0]!;
    const september = dispatchAction(queued, "next-month");
    expect(september).toMatchObject({ phase: "playing", year: 3, month: 1, totalMonths: 25 });
    const event = september.eventQueue.find((entry) => entry.chainId === "random-10")!;
    const refreshed = getResolvableQueuedEvent(september, event);
    expect(original).toMatchObject({ academicYear: 2, academicStartTotalMonths: 13, degree: "master", initialResearchScore: 0 });
    expect(additions(refreshed)[0]).toEqual(original);
    expect(event.randomReplay?.rolls).toHaveLength(2);
    const serialized = JSON.parse(JSON.stringify({ ...september, eventQueue: [refreshed] })) as GameState;
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Preview consumed global randomness"); });
    expect(additions(getResolvableQueuedEvent(serialized, serialized.eventQueue[0]!))[0]).toEqual(original);
    expect(random).not.toHaveBeenCalled();
    random.mockReturnValue(0.99);
    const accepted = choose(choose(choose(serialized), "-short-term-"));
    expect(accepted.fellowProgressState[0]).toMatchObject({ ...original, startTotalMonths: 25 });
    expect(getFellowAcademicYear(accepted, accepted.fellowProgressState[0]!)).toBe(3);
  });

  it("keeps the candidate snapshot when a saved offer is inspected in later years", () => {
    const initial = makeState(1);
    const queued = queueRecruitment(initial, 10, [0.7, 0.83]);
    for (const year of [2, 3]) {
      const totalMonths = (year - 1) * 12 + 6;
      const current = { ...queued, ...getCalendarForTotalMonths(totalMonths, "phd"), totalMonths };
      const refreshed = getResolvableQueuedEvent(current, queued.eventQueue[0]!);
      expect(additions(refreshed)).toEqual(additions(queued.eventQueue[0]!));
    }
  });
});

describe("recruitment identity during result previews", () => {
  it.each([
    ["mentor-assign", 0, "select-1"],
    ["undergraduate", 1, "-self-"],
    ["peer", 10, "-short-term-"],
    ["senior", 11, "-deep-"],
    ["junior", 14, "-idea-"],
  ] as const)("freezes %s identity and topic through refresh, serialization and confirmation", (_label, eventId, choice) => {
    const state = makeState();
    const queued = eventId === 0
      ? { ...state, eventQueue: [createEventQueueItem(createMentorAssignEvent(state, () => 0.99), 1)] }
      : queueRecruitment(state, eventId);
    const pending = choose(choose(queued), choice);
    const original = structuredClone(previewFellow(pending.eventQueue[0]!));
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Preview consumed global randomness"); });
    const saved = JSON.parse(JSON.stringify(pending)) as GameState;
    const first = getResolvableQueuedEvent(saved, saved.eventQueue[0]!);
    const second = getResolvableQueuedEvent(saved, first);
    expect(previewFellow(first)).toEqual(original);
    expect(previewFellow(second)).toEqual(original);
    const refreshed = refreshPendingEventDecisions(saved);
    expect(previewFellow(refreshed.eventQueue[0]!)).toEqual(original);
    expect(random).not.toHaveBeenCalled();
    random.mockReturnValue(0.01);
    const finished = choose(refreshed);
    expect(finished.fellowProgressState[0]).toMatchObject({
      id: original.id, name: original.name, gender: original.gender,
      research: original.research, researchTopic: original.researchTopic,
    });
    expect(finished.fellowProgressState).toHaveLength(1);
  });

  it("still rerolls recruits on explicit debug rewind, then freezes the new preview", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const pending = choose(choose(queueRecruitment(makeState(), 10)), "-short-term-");
    const original = previewFellow(pending.eventQueue[0]!);
    random.mockReturnValue(0.9);
    const rewound = dispatchAction(pending, "debug-replay-event", {
      eventId: pending.eventQueue[0]!.id, eventHistoryIndex: 1,
      eventChoiceId: pending.eventQueue[0]!.history![1]!.selectedChoiceId,
    });
    const replacement = previewFellow(rewound.eventQueue[0]!);
    expect(replacement.gender).not.toBe(original.gender);
    expect(replacement.name).not.toBe(original.name);
    expect(rewound.fellowProgressState).toHaveLength(0);
    random.mockImplementation(() => { throw new Error("Preview consumed global randomness"); });
    expect(previewFellow(getResolvableQueuedEvent(rewound, rewound.eventQueue[0]!))).toEqual(replacement);
  });
});
