import { describe, expect, it } from "vitest";
import {
  createFellowProgressProfile,
  resolveFellowTaskAdvance,
  tickFellowProgressForMonth,
} from "../src/core/v2-fellow-progression";

describe("v2 fellow progression", () => {
  it("creates audited initial stats for senior, peer and junior", () => {
    const senior = createFellowProgressProfile("senior", 12, () => 0);
    const peer = createFellowProgressProfile("peer", 12, () => 0);
    const junior = createFellowProgressProfile("junior", 12, () => 0);

    expect(senior).toMatchObject({
      type: "senior",
      research: 4,
      affinity: 2,
      taskType: "writing",
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
    expect(peer).toMatchObject({
      type: "peer",
      research: 3,
      affinity: 3,
      taskType: "experiment",
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
    expect(junior).toMatchObject({
      type: "junior",
      research: 0,
      affinity: 2,
      taskType: "idea",
      taskMax: 60,
      relationMax: 40,
      startTotalMonths: 12,
    });
  });

  it("unlocks interaction with overflow during monthly relation growth", () => {
    const [next] = tickFellowProgressForMonth([
      {
        id: "peer-1",
        type: "peer",
        research: 4,
        affinity: 3,
        taskType: "experiment",
        taskProgress: 0,
        taskMax: 60,
        relationProgress: 35,
        relationMax: 40,
        canInteract: false,
        taskUsedThisMonth: true,
        completedTaskCount: 0,
        interactCount: 0,
        startTotalMonths: 1,
      },
    ], 5);

    expect(next).toMatchObject({
      relationProgress: 3,
      canInteract: true,
      taskUsedThisMonth: false,
    });
  });

  it("free interaction adds +5 growth and consumes the interaction flag", () => {
    const result = resolveFellowTaskAdvance(
      {
        id: "junior-1",
        type: "junior",
        research: 6,
        affinity: 4,
        taskType: "idea",
        taskProgress: 50,
        taskMax: 60,
        relationProgress: 0,
        relationMax: 40,
        canInteract: true,
        taskUsedThisMonth: false,
        completedTaskCount: 0,
        interactCount: 2,
        startTotalMonths: 1,
      },
      10,
      {
        isFree: true,
        consumeInteraction: true,
        getRoll: () => 0,
      },
    );

    expect(result.growth).toBe(10);
    expect(result.sanCost).toBe(0);
    expect(result.completed).toBe(true);
    expect(result.paperBonus).toBe(6);
    expect(result.fellowProgressProfile).toMatchObject({
      affinity: 5,
      taskProgress: 0,
      canInteract: false,
      taskUsedThisMonth: false,
      completedTaskCount: 1,
      interactCount: 3,
    });
  });
});
