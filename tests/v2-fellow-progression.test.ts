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

afterEach(() => vi.restoreAllMocks());

describe("v2 fellow progression", () => {
  it.each([
    ["senior", 6], ["peer", 3], ["junior", 0],
  ] as const)("generates %s research across four values with initial rapport one", (type, minimum) => {
    const values = Array.from({ length: 12 }, (_, seed) => createGeneratedFellowProfileAddition(type, seed));
    expect([...new Set(values.map((profile) => profile.research))]).toEqual([minimum, minimum + 1, minimum + 2, minimum + 3]);
    expect(values.every((profile) => profile.affinity === 1)).toBe(true);
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
