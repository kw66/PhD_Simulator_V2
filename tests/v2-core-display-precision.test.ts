import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { applyShopAction } from "../src/core/v2-shop-transactions";
import { recordTalentTransitions } from "../src/core/v2-talent-transitions";
import { getLoverNextReward } from "../src/core/v2-lover-progression";

function createState() {
  const state = createStartedGameState("normal");
  return { ...state, year: 1, month: 4, totalMonths: 4, eventQueue: [], availableRandomEvents: [],
    player: { ...state.player, san: 19.875, money: 20 } };
}

describe("core display precision", () => {
  it("formats capped intimacy rewards in route previews without changing intimacy", () => {
    const state = createState();
    state.loverProgressState.intimacy = 19.875;
    for (const route of ["play", "study", "shopping"] as const) {
      expect(getLoverNextReward(state, route)).toContain("亲密 +0.13");
    }
    expect(state.loverProgressState.intimacy).toBe(19.875);
  });

  it("formats the reading milestone snapshot while retaining fractional research", () => {
    const before = createState();
    before.readingState.readCount = 9;
    before.player.research = 8.4;
    const after = { ...before, player: { ...before.player, research: 8.4 + 0.8 },
      readingState: { ...before.readingState, readCount: 10 } };
    const next = recordTalentTransitions(before, after);
    expect(next.log[0]!.text).toContain("当前9.2/20");
    expect(next.player).toBe(after.player);
    expect(next.player.research).toBe(9.200000000000001);
    expect(next.eventHistory[0]!.stages[0]!.talentTrigger!.effects[0]).toContain("当前9.2/20");
  });

  it("formats bike SAN totals, cap gains and current caps only in history text", () => {
    const before = createState();
    before.shopState.bikeSanCapGains = 0.1;
    const after = { ...before, sanCap: 20.125,
      shopState: { ...before.shopState, bikeSanCapGains: 0.1 + 0.2, bikeSanSpent: 6.125 } };
    const next = recordTalentTransitions(before, after);
    const trigger = next.eventHistory[0]!.stages[0]!.talentTrigger!;
    expect(trigger.reason).toBe("累计骑行消耗SAN 6.13");
    expect(trigger.effects).toEqual(["SAN上限 +0.2（当前20.13）"]);
    expect(next.shopState).toBe(after.shopState);
    expect(next.sanCap).toBe(20.125);
  });

  it("formats capped rest recovery without rounding the applied SAN", () => {
    const state = createState();
    const next = dispatchAction(state, "rest");
    expect(next.log.some((entry) => entry.text.includes("休息了一会儿，SAN +0.13。"))).toBe(true);
    expect(next.player.san - state.player.san).toBe(0.125);
  });

  it("formats capped coffee recovery without rounding the applied SAN", () => {
    const state = createState();
    const next = applyShopAction(state, "buy-coffee", {});
    expect(next.log[0]!.text).toContain("SAN +0.13。");
    expect(next.player.san - state.player.san).toBe(0.125);
  });

  it("formats emergency chair SAN deltas and snapshots without rounding its recovery counter", () => {
    const state = createState();
    state.player.san = -0.125;
    state.shopState.chairUpgrade = "spike";
    const next = evaluateCoreEndings(state);
    expect(next.log[0]!.text).toBe("锥刺股椅触发：SAN +3.13（-0.13→3）");
    expect(next.shopState.chairSanRecovered).toBe(3.125);
    expect(next.player.san).toBe(3);
  });

  it.each([false, true])("formats monthly cooperation with long-term mentoring %s without rounding progress", (longTermMentoring) => {
    const base = createState();
    const fellow = { ...createCustomFellowProgressProfile({
      type: "peer", gender: "female", research: 10, affinity: 0.1 + 0.2, startTotalMonths: 1,
    }), longTermMentoring };
    const state = ensureFellowPapers({ ...base, fellowProgressState: [fellow] }, () => 0);
    const next = advanceFellowResearch(state, () => 0);
    expect(next.fellowProgressState[0]!.monthlyActivity).toContain(`协作进度 +${longTermMentoring ? "0.6（长期合作，推进2次）" : "0.3"}`);
    expect(next.fellowProgressState[0]!.monthlyActivity).not.toMatch(/\d+\.\d{3,}/);
    expect(next.fellowProgressState[0]!.taskProgress).toBe((0.1 + 0.2) * (longTermMentoring ? 2 : 1));
  });
});
