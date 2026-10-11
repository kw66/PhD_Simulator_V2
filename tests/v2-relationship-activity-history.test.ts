import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getRelationshipActivityDetails, recordRelationshipActivityMonth } from "../src/core/v2-relationship-activity-history";

function enrolledGame() {
  let state = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  for (const eventChoiceId of ["before-grad-school-open-advisor-info", "before-grad-school-confirm", "before-grad-school-finish"]) {
    state = dispatchAction(state, "resolve-event", { eventChoiceId });
  }
  return dispatchAction(state, "next-month");
}

describe("relationship monthly activity history", () => {
  it("keeps each person's month and details separate without carrying stale activity forward", () => {
    const base = enrolledGame();
    const fellow = createCustomFellowProgressProfile({
      type: "peer", gender: "female", startTotalMonths: base.totalMonths,
      research: 3, affinity: 4, name: "同学",
    });
    const state = {
      ...base,
      advisorProgressState: { ...base.advisorProgressState, monthlyActivity: "纵向进度 +10" },
      fellowProgressState: [{ ...fellow, monthlyActivity: "协作进度 +2", monthlySupportActivity: "帮助修改论文",
        lastSupportTotalMonths: base.totalMonths,
        annualResearchActivity: "去年成长：科研 +2", lastAnnualGrowthTotalMonths: 0,
        monthlyPublicationCosts: { totalMonths: base.totalMonths, registration: 1, journal: 2, sharedTravel: 0 } }],
    };
    const recorded = recordRelationshipActivityMonth(state);
    expect(recorded.advisorProgressState.activityHistory).toEqual([{ totalMonths: 1, text: "纵向进度 +10" }]);
    expect(recorded.fellowProgressState[0]?.activityHistory?.[0]?.text).toContain("帮助修改论文");
    expect(recorded.fellowProgressState[0]?.activityHistory?.[0]?.text).toContain("OA经费-2");
    expect(recorded.fellowProgressState[0]?.activityHistory?.[0]?.text).not.toContain("最近年度成长");
    expect(getRelationshipActivityDetails(state, "fellow", state.fellowProgressState[0])).toContain("最近年度成长");
    expect(recorded.fellowProgressState[0]?.monthlyActivity).toBeUndefined();
    expect(getRelationshipActivityDetails({ ...recorded, totalMonths: 2 }, "fellow", recorded.fellowProgressState[0]))
      .toMatch(/^暂无活动\n最近年度成长：/u);
    const secondMonth = recordRelationshipActivityMonth({ ...recorded, totalMonths: 2 });
    expect(secondMonth.fellowProgressState[0]?.activityHistory?.[0]).toEqual({ totalMonths: 2, text: "暂无活动" });
    expect(secondMonth.fellowProgressState[0]?.activityHistory?.[1]).toEqual(recorded.fellowProgressState[0]?.activityHistory?.[0]);
  });

  it("archives the departing month before month-start activity replaces it", () => {
    const state = enrolledGame();
    const oldActivity = state.advisorProgressState.monthlyActivity;
    const next = dispatchAction({ ...state, eventQueue: [], availableRandomEvents: [] }, "next-month");
    expect(next.totalMonths).toBe(2);
    expect(next.advisorProgressState.activityHistory?.[0]).toEqual({ totalMonths: 1, text: oldActivity });
  });
});
