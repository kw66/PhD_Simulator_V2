import { describe, expect, it } from "vitest";

import { getJointTrainingCitationCapBonus } from "../src/core/v2-joint-training-system";
import { createJointTrainingAct1 } from "../src/core/v2-joint-training-events";

describe("v2 joint training system", () => {
  it.each([0, 1, 5])("keeps invitations open after %s prior refusals", (rejectedBigBullCoopCount) => {
    const event = createJointTrainingAct1({ rejectedBigBullCoopCount, pendingCitationCapBonus: 3 });
    const decline = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!;
    expect(decline.effects.conferenceEncounterUpdates).toBeUndefined();
    expect(decline.effects.enqueueEvents![0]!.choices[0]!.effects.conferenceEncounterUpdates).toMatchObject({
      rejectedBigBullCoopCount: 0,
      permanentlyBlockedBigBullCoop: false,
      bigBullCoopCount: 0,
    });
    expect(decline.effects.enqueueEvents![0]!.description.split("机制结算")[1]?.trim()).toBe(
      "结果：未接受联培",
    );
  });

  it.each([
    [-1, 1], [0, 1], [199, 1], [200, 2], [399, 2], [400, 3], [799, 4], [800, 5], [999, 5], [1000, 6], [1600, 6],
  ])("awards the capped research bonus for %s citations", (citations, bonus) => {
    expect(getJointTrainingCitationCapBonus(citations)).toBe(bonus);
  });

  it.each([0, 1, 2] as const)("includes mentor level %s in the capped bonus", (level) => {
    expect(getJointTrainingCitationCapBonus(0, level)).toBe(level);
    expect(getJointTrainingCitationCapBonus(399, level)).toBe(level + 1);
    expect(getJointTrainingCitationCapBonus(1200, level)).toBe(6);
  });
});
