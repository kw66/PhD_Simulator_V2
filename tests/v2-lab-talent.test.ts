import { describe, expect, it } from "vitest";

import {

  applyLabTalentGrowth,

  getLabTalentActionBonus,

  getLabTalentTeamSize,

  isLabTalentActive,

} from "../src/core/v2-lab-talent";



describe("v2 lab talent", () => {

  it("activates only when advisor, senior and junior are all present", () => {

    const inactiveState = {

      unlockedSlots: 4,

      occupiedSlots: 3,

      advisorCount: 1,

      seniorCount: 1,

      juniorCount: 0,

      peerCount: 1,

      loverCount: 0,

      mentorshipStacks: 0,

    };

    const activeState = {

      ...inactiveState,

      juniorCount: 1,

    };



    expect(isLabTalentActive(inactiveState)).toBe(false);

    expect(isLabTalentActive(activeState)).toBe(true);

    expect(getLabTalentTeamSize(activeState)).toBe(3);

    expect(getLabTalentActionBonus(activeState)).toBe(3);

  });



  it("applies 12-month growth to due non-advisor relationships only", () => {

    const result = applyLabTalentGrowth({

      totalMonths: 13,

      playerResearch: 8,

      relationshipState: {

        unlockedSlots: 5,

        occupiedSlots: 5,

        advisorCount: 1,

        seniorCount: 1,

        juniorCount: 1,

        peerCount: 1,

        loverCount: 1,

        mentorshipStacks: 0,

      },

      advisorProgressState: {

        researchResource: 7,

        affinity: 3,

        taskProgress: 0,

        taskMax: 60,

        taskMultiplier: 6,

        relationProgress: 0,

        relationMax: 40,

        canInteract: false,

        taskUsedThisMonth: false,

        completedProjectCount: 0,

        interactCount: 0,

      },

      fellowProgressState: [

        {

          id: "senior-1",

          type: "senior",

          research: 2,

          affinity: 2,

          taskType: "writing",

          taskProgress: 0,

          taskMax: 60,

          relationProgress: 0,

          relationMax: 40,

          canInteract: false,

          taskUsedThisMonth: false,

          completedTaskCount: 0,

          interactCount: 0,

          startTotalMonths: 1,

        },

        {

          id: "peer-1",

          type: "peer",

          research: 4,

          affinity: 3,

          taskType: "experiment",

          taskProgress: 0,

          taskMax: 60,

          relationProgress: 0,

          relationMax: 40,

          canInteract: false,

          taskUsedThisMonth: false,

          completedTaskCount: 0,

          interactCount: 0,

          startTotalMonths: 1,

        },

        {

          id: "junior-1",

          type: "junior",

          research: 5,

          affinity: 3,

          taskType: "idea",

          taskProgress: 0,

          taskMax: 60,

          relationProgress: 0,

          relationMax: 40,

          canInteract: false,

          taskUsedThisMonth: false,

          completedTaskCount: 0,

          interactCount: 0,

          startTotalMonths: 2,

        },

      ],

      loverProgressState: {

        active: true,

        research: 3,

        intimacy: 12,

        taskProgress: 0,

        taskMax: 100,

        relationProgress: 0,

        relationMax: 40,

        canInteract: false,

        taskUsedThisMonth: false,

        completedTaskCount: 0,

        interactCount: 0,

      },

      loverState: {

        active: true,

        type: "smart",

        startTotalMonths: 1,

        beautifulExtraRecoveryRate: 0,

      },

    });



    expect(result.fellowProgressState[0]?.research).toBe(4);

    expect(result.fellowProgressState[1]?.research).toBe(5);

    expect(result.fellowProgressState[2]?.research).toBe(5);

    expect(result.loverProgressState.research).toBe(5);

    expect(result.logs).toEqual([

      "实验室互帮互助：师兄师姐 1 科研 +2（组内 5 人高于 TA）。",

      "实验室互帮互助：同级 1 科研 +1（组内 3 人高于 TA）。",

      "实验室互帮互助：恋人科研 +2（组内 4 人高于 TA）。",

    ]);

  });

});
