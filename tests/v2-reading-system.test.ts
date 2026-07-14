import { describe, expect, it } from "vitest";

import { createShopState } from "../src/core/v2-shop-items";
import {
  applyDualMonitorMonthlyRead,
  applyReadAction,
  consumeReadingIdeaBonus,
  createReadingState,
} from "../src/core/v2-reading-system";
import { createTemporaryActionEffects } from "../src/core/v2-temporary-action-rules";

describe("v2 reading system", () => {
  it("only grants research on 11/21/31... manual read milestones", () => {
    const normalRead = applyReadAction(createReadingState(), createShopState(), createTemporaryActionEffects());
    expect(normalRead.researchDelta).toBe(0);
    expect(normalRead.ideaBonus).toBe(1);

    const milestoneRead = applyReadAction(
      { ...createReadingState(), readCount: 10 },
      createShopState(),
      createTemporaryActionEffects(),
    );
    expect(milestoneRead.researchDelta).toBe(1);
    expect(milestoneRead.ideaBonus).toBe(2);
  });

  it("tracks smart monitor reads separately from the global read count", () => {
    const smartMonitorShopState = {
      ...createShopState(),
      monitorOwned: true,
      monitorUpgrade: "smart" as const,
    };

    const smartRead = applyReadAction(
      { ...createReadingState(), readCount: 9, smartMonitorReadCount: 9 },
      smartMonitorShopState,
      createTemporaryActionEffects(),
    );

    expect(smartRead.sanCost).toBe(2);
    expect(smartRead.ideaBonus).toBe(2);
    expect(smartRead.researchDelta).toBe(0);
    expect(smartRead.readingState.smartMonitorReadCount).toBe(10);
  });

  it("replaces dual auto-read bonus each month and keeps it single-use", () => {
    const dualMonitorShopState = {
      ...createShopState(),
      monitorOwned: true,
      monitorUpgrade: "dual" as const,
    };

    const monthlyRead = applyDualMonitorMonthlyRead(
      { ...createReadingState(), readCount: 19, dualMonitorIdeaBonus: 99 },
      dualMonitorShopState,
      createTemporaryActionEffects(),
    );

    expect(monthlyRead.sanDelta).toBe(-2);
    expect(monthlyRead.researchDelta).toBe(0);
    expect(monthlyRead.readingState.readCount).toBe(20);
    expect(monthlyRead.readingState.dualMonitorIdeaBonus).toBe(2);

    const consumed = consumeReadingIdeaBonus(monthlyRead.readingState);
    expect(consumed.dualMonitorIdeaBonus).toBe(0);
  });

  it("grants research on dual auto-read milestones too", () => {
    const dualMonitorShopState = {
      ...createShopState(),
      monitorOwned: true,
      monitorUpgrade: "dual" as const,
    };

    const monthlyRead = applyDualMonitorMonthlyRead(
      { ...createReadingState(), readCount: 10 },
      dualMonitorShopState,
      createTemporaryActionEffects(),
    );

    expect(monthlyRead.readingState.readCount).toBe(11);
    expect(monthlyRead.readingState.dualMonitorIdeaBonus).toBe(2);
    expect(monthlyRead.researchDelta).toBe(1);
  });
});