import { describe, expect, it } from "vitest";
import {
  createCustomFellowProgressProfile,
  getFellowTaskSanCost,
} from "../src/core/v2-fellow-progression";

describe("v2 fellow progression", () => {
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
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
    expect(peer).toMatchObject({
      type: "peer",
      gender: "female",
      research: 3,
      affinity: 3,
      taskType: "experiment",
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
    expect(junior).toMatchObject({
      type: "junior",
      gender: "female",
      research: 0,
      affinity: 2,
      taskType: "idea",
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
    expect(["idea", "experiment", "writing"].map((type) => getFellowTaskSanCost(type as "idea" | "experiment" | "writing"))).toEqual([2, 3, 4]);
  });
});
