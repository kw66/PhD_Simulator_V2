import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCustomFellowProgressProfile,
  createGeneratedFellowProfileAddition,
  getFellowName,
  getFellowResearchTopic,
  getFellowTaskSanCost,
  getStableGeneratedFellowName,
} from "../src/core/v2-fellow-progression";
import { pickStableRandomName } from "../src/core/v2-random-name";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import type { FellowProfileAddition, PendingEvent } from "../src/core/v2-types";

function getGeneratedFellows(event: PendingEvent): FellowProfileAddition[] {
  return event.choices.flatMap((choice) => [
    ...(choice.effects.fellowAdditions ?? []),
    ...(choice.effects.enqueueEvents ?? []).flatMap(getGeneratedFellows),
  ]);
}

afterEach(() => vi.restoreAllMocks());

const RESEARCH_BY_YEAR = [
  [0, 1, 2, 3],
  [2, 3, 4, 5],
  [4, 5, 6, 6.8],
  [6, 6.8, 7.6, 8.4],
  [7.6, 8.4, 9.2, 10],
  [9.2, 10, 10.8, 11.6],
  [10.8, 11.6, 12.4, 13],
] as const;

describe("v2 fellow progression", () => {
  it.each([
    ["senior", 2], ["peer", 1], ["junior", 0],
  ] as const)("uses the unified default academic year for %s", (type, academicYear) => {
    for (const offset of [0, 1, 2, 3]) {
      const random = vi.fn(() => 0.99);
      for (let draw = 0; draw < 4; draw += 1) random.mockReturnValueOnce(0);
      random.mockReturnValueOnce((offset + 0.5) / 4);
      const profile = createGeneratedFellowProfileAddition(type, 0, "male", [], random);
      expect(profile).toMatchObject({ research: RESEARCH_BY_YEAR[academicYear]![offset], academicYear, affinity: 1, degree: "master" });
    }
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("generates research from academic year %s rather than the preceding year", (academicYear) => {
    for (const offset of [0, 1, 2, 3]) {
      const random = vi.fn(() => 0.99);
      for (let draw = 0; draw < 4; draw += 1) random.mockReturnValueOnce(0);
      random.mockReturnValueOnce((offset + 0.5) / 4);
      const profile = createGeneratedFellowProfileAddition("peer", 0, "male", [], random, { year: 6, fixedYear: academicYear });
      expect(profile).toMatchObject({ research: RESEARCH_BY_YEAR[academicYear]![offset], academicYear, affinity: 1,
        degree: academicYear >= 4 ? "phd" : "master", initialResearchScore: [0, 0, 0, 1, 2, 3, 7][academicYear] });
    }
  });

  it("resists initial research pointwise from zero and rereads tiers after each gain", () => {
    const random = vi.fn(() => 0.3);
    for (let draw = 0; draw < 4; draw += 1) random.mockReturnValueOnce(0);
    random.mockReturnValueOnce(0.99);
    const profile = createGeneratedFellowProfileAddition("peer", 0, "male", [], random, { year: 6 });
    expect(profile.research).toBe(6 + 8 * 0.8 + 0.6);
    expect(random).toHaveBeenCalledTimes(5);
  });

  it("keeps research stable without a supplied stream even when name collisions change", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Unexpected global randomness"); });
    for (const seed of [0, 1, 7, 23, 100, -4.2]) {
      const profile = createGeneratedFellowProfileAddition("senior", seed, "female", [], undefined, { year: 3 });
      expect(createGeneratedFellowProfileAddition("senior", seed, "female", [], undefined, { year: 3 })).toEqual(profile);
      const renamed = createGeneratedFellowProfileAddition("senior", seed, "female", [profile.name!], undefined, { year: 3 });
      expect(renamed.name).not.toBe(profile.name);
      expect(renamed.research).toBe(profile.research);
      expect(renamed.academicYear).toBe(profile.academicYear);
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("does not tie the individual difference to the seed's academic-year remainder", () => {
    const offsetsByYear = Array.from({ length: 4 }, () => new Set<number>());
    for (let seed = 0; seed < 512; seed += 1) {
      const profile = createGeneratedFellowProfileAddition("junior", seed, "male", [], undefined, { year: 6 });
      const offset = createGeneratedFellowProfileAddition("junior", seed, "male", [], undefined, { year: 6, fixedYear: 0 }).research;
      offsetsByYear[profile.academicYear!]!.add(offset);
    }
    for (const offsets of offsetsByYear) expect([...offsets].sort()).toEqual([0, 1, 2, 3]);
  });

  it.each([10, 11, 14])("replays generated fellows for random event %s without rerolling research", (eventId) => {
    const base = createStartedGameState("normal");
    const state = { ...base, year: 4, month: 8, totalMonths: 44, eventQueue: [], fellowProgressState: [] };
    const rolls: number[] = [];
    const root = createRandomEventById(eventId, state, () => {
      const roll = ((rolls.length * 37 + 11) % 100) / 100;
      rolls.push(roll);
      return roll;
    }).event!;
    const queued = createEventQueueItem({ ...root, randomReplay: { eventId, serial: state.totalRandomEventCount, rolls } }, 0);
    const fellows = getGeneratedFellows(queued);
    expect(fellows.length).toBeGreaterThan(0);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Unexpected preview randomness"); });
    const refreshed = getResolvableQueuedEvent({ ...state, player: { ...state.player, san: 0 } }, JSON.parse(JSON.stringify(queued)));
    expect(getGeneratedFellows(refreshed)).toEqual(fellows);
    expect(getGeneratedFellows(getResolvableQueuedEvent(state, refreshed))).toEqual(fellows);
    expect(random).not.toHaveBeenCalled();
  });

  it("replays all four mentor assignment candidates from recorded generation rolls", () => {
    const base = createStartedGameState("normal");
    const state = { ...base, year: 4, month: 7, totalMonths: 43, fellowProgressState: [] };
    let rollIndex = 0;
    const root = createMentorAssignEvent(state, () => ((rollIndex++ * 37 + 11) % 100) / 100);
    const queued = createEventQueueItem(root, 0);
    const fellows = getGeneratedFellows(queued);
    expect(new Set(fellows.map((fellow) => fellow.name)).size).toBe(4);
    expect(fellows.every((fellow) => fellow.academicYear === 1 && fellow.research >= 2 && fellow.research <= 5)).toBe(true);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Unexpected preview randomness"); });
    const refreshed = getResolvableQueuedEvent(state, JSON.parse(JSON.stringify(queued)));
    expect(getGeneratedFellows(refreshed)).toEqual(fellows);
    expect(getGeneratedFellows(getResolvableQueuedEvent(state, refreshed))).toEqual(fellows);
    expect(random).not.toHaveBeenCalled();
  });
  it("assigns a stable research direction per random person id without rerolling on reads", () => {
    const profiles = Array.from({ length: 30 }, (_, index) => ({ id: `fellow-${index}`, startTotalMonths: 1 }));
    const topics = profiles.map(getFellowResearchTopic);
    expect(new Set(topics.map((topic) => topic.topicId)).size).toBeGreaterThan(1);
    profiles.forEach((profile, index) => {
      expect(getFellowResearchTopic(profile)).toEqual(topics[index]);
      expect(getFellowResearchTopic({ ...profile, researchTopic: topics[index], startTotalMonths: 60 })).toEqual(topics[index]);
    });
  });
  it("creates custom preview profiles with stable task defaults", () => {
    const senior = createCustomFellowProgressProfile({ type: "senior", gender: "male", startTotalMonths: 12, research: 4, affinity: 2 });
    const peer = createCustomFellowProgressProfile({ type: "peer", gender: "female", startTotalMonths: 12, research: 3, affinity: 3 });
    const junior = createCustomFellowProgressProfile({ type: "junior", gender: "female", startTotalMonths: 12, research: 0, affinity: 2 });

    expect(senior).toMatchObject({
      type: "senior",
      gender: "male",
      research: 4,
      affinity: 2,
      taskType: "writing",
      taskMax: 100,
      startTotalMonths: 12,
    });
    expect(peer).toMatchObject({
      type: "peer",
      gender: "female",
      research: 3,
      affinity: 3,
      taskType: "experiment",
      taskMax: 100,
      startTotalMonths: 12,
    });
    expect(junior).toMatchObject({
      type: "junior",
      gender: "female",
      research: 0,
      affinity: 2,
      taskType: "idea",
      taskMax: 100,
      startTotalMonths: 12,
    });
    expect(["idea", "experiment", "writing"].map((type) => getFellowTaskSanCost(type as "idea" | "experiment" | "writing"))).toEqual([2, 3, 4]);
  });

  it.each(["male", "female"] as const)("generates %s fellows with the shared seeded full-name rules", (gender) => {
    const random = vi.spyOn(Math, "random");
    for (const seed of [0, 1, 7, 23, 100, -4.2]) {
      const expectedName = pickStableRandomName(`fellow:${Math.abs(Math.floor(seed))}:${gender}`);
      for (const type of ["senior", "junior", "peer"] as const) {
        const profile = createGeneratedFellowProfileAddition(type, seed, gender);
        expect(profile).toMatchObject({ type, gender, name: expectedName });
        expect(profile.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
        expect(profile.name).not.toMatch(/^小/);
        expect(getStableGeneratedFellowName(seed, gender)).toBe(expectedName);
      }
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("uses the supplied random stream for gameplay fellow names", () => {
    const first = createGeneratedFellowProfileAddition("junior", 0, "male", [], () => 0);
    const second = createGeneratedFellowProfileAddition("junior", 0, "male", [], () => 0.999999);

    expect(first.name).not.toBe(second.name);
    expect(first.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
    expect(second.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
  });

  it("keeps generated fellow names unique against existing relationships", () => {
    const existing = createGeneratedFellowProfileAddition("peer", 23, "female");
    const generated = createGeneratedFellowProfileAddition("junior", 23, "female", [existing.name!]);

    expect(generated.name).not.toBe(existing.name);
    expect(generated.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
  });

  it.each([undefined, "", " \t\n "])("stores a generated name for a custom profile with blank input %j", (name) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const profile = createCustomFellowProgressProfile({
      type: "junior", gender: "female", startTotalMonths: 12, research: 4, affinity: 2, name,
    });

    expect(profile.name).toBe(pickStableRandomName(`fellow:${profile.id}`));
    expect(getFellowName(profile)).toBe(profile.name);
    expect(profile.name).toMatch(/^[\p{Script=Han}]{2,3}$/u);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("preserves explicitly supplied names after trimming", () => {
    const profile = createCustomFellowProgressProfile({
      type: "senior", gender: "male", startTotalMonths: 12, research: 4, affinity: 2, name: "  小明  ",
    });

    expect(profile.name).toBe("小明");
    expect(getFellowName(profile)).toBe("小明");
    expect(getFellowName({ id: "custom-id", name: "  林知远  " })).toBe("林知远");
  });

  it("keeps missing-name fallbacks stable by profile id without changing profiles or global randomness", () => {
    const random = vi.spyOn(Math, "random");
    const profiles = [{ id: "junior-12-a" }, { id: "senior-12-b", name: "   " }];
    const before = structuredClone(profiles);
    const names = profiles.map(getFellowName);

    expect(names).toEqual(profiles.map((profile) => pickStableRandomName(`fellow:${profile.id}`)));
    expect(profiles.map(getFellowName)).toEqual(names);
    expect(profiles).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  });
});
