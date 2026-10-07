import { describe, expect, it } from "vitest";

import { getJointTrainingCitationCapBonus } from "../src/core/v2-joint-training-system";
import { createJointTrainingAct1 } from "../src/core/v2-joint-training-events";

describe("v2 joint training system", () => {
  it.each([0, 1])("preserves the rejection limit with a short result after %s prior refusals", (rejectedBigBullCoopCount) => {
    const event = createJointTrainingAct1({ rejectedBigBullCoopCount, pendingCitationCapBonus: 3 });
    const decline = event.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id === "decline")!;
    expect(decline.effects.conferenceEncounterUpdates).toEqual({
      rejectedBigBullCoopCount: rejectedBigBullCoopCount + 1,
      permanentlyBlockedBigBullCoop: rejectedBigBullCoopCount === 1,
    });
    expect(decline.effects.enqueueEvents![0]!.description.split("机制结算")[1]?.trim()).toBe(
      rejectedBigBullCoopCount === 1 ? "结果：联培机会永久关闭" : "结果：联培机会剩余1次",
    );
  });

  it.each([
    [-1, 1], [0, 1], [299, 1], [300, 2], [599, 2], [600, 3], [899, 3], [900, 4], [1199, 4], [1200, 5], [1600, 5],
  ])("awards the capped research bonus for %s citations", (citations, bonus) => {
    expect(getJointTrainingCitationCapBonus(citations)).toBe(bonus);
  });
});
