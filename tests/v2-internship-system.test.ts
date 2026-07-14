import { describe, expect, it } from "vitest";

import {
  activateInternship,
  applyInternshipMonthlyEffect,
  createInternshipState,
  getInternshipExperimentMultiplier,
  getInternshipMonthlyIncome,
  increaseInternshipExperimentMultiplier,
  shouldEnqueueInternshipInvite,
} from "../src/core/v2-internship-system";

describe("v2 internship system", () => {
  it("activates internship with the audited base multiplier", () => {
    const state = activateInternship(12);

    expect(state).toEqual({
      active: true,
      remainingMonths: 6,
      startTotalMonths: 12,
      experimentMultiplier: 1.25,
    });
    expect(getInternshipExperimentMultiplier(state, "experiment")).toBe(1.25);
    expect(getInternshipExperimentMultiplier(state, "idea")).toBe(1);
  });

  it("grows active internship multiplier by 0.05 per enterprise follow-up", () => {
    const nextState = increaseInternshipExperimentMultiplier(activateInternship(8));

    expect(nextState.experimentMultiplier).toBe(1.3);
  });

  it("enqueues invite only when the audited threshold is met and no chain is pending", () => {
    expect(shouldEnqueueInternshipInvite({
      conferenceCareerState: { enterpriseCount: 3, rejectedInternshipCount: 0, permanentlyBlockedInternship: false },
      internshipState: createInternshipState(),
      eventQueue: [],
    })).toBe(true);

    expect(shouldEnqueueInternshipInvite({
      conferenceCareerState: { enterpriseCount: 3, rejectedInternshipCount: 0, permanentlyBlockedInternship: false },
      internshipState: activateInternship(6),
      eventQueue: [],
    })).toBe(false);

    expect(shouldEnqueueInternshipInvite({
      conferenceCareerState: { enterpriseCount: 3, rejectedInternshipCount: 1, permanentlyBlockedInternship: false },
      internshipState: createInternshipState(),
      eventQueue: [{
        id: "internship-invite-act1-6",
        title: "实习邀请",
        description: "",
        preview: "",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "internship-invite",
        stage: "act1",
        choices: [],
        queueOrder: 1,
      }],
    })).toBe(false);
  });

  it("uses the audited real monthly formula and finishes before the last month pays out", () => {
    expect(getInternshipMonthlyIncome(2, 1200)).toBe(3);

    const activeMonth = applyInternshipMonthlyEffect(activateInternship(10), 3, 0);
    expect(activeMonth.moneyDelta).toBe(3);
    expect(activeMonth.sanDelta).toBe(-2);
    expect(activeMonth.internshipState.remainingMonths).toBe(5);

    const finalMonth = applyInternshipMonthlyEffect({
      active: true,
      remainingMonths: 1,
      startTotalMonths: 10,
      experimentMultiplier: 1.35,
    }, 4, 2);
    expect(finalMonth.moneyDelta).toBe(0);
    expect(finalMonth.sanDelta).toBe(0);
    expect(finalMonth.internshipCountDelta).toBe(1);
    expect(finalMonth.internshipState).toEqual(createInternshipState());
    expect(finalMonth.logs).toEqual(["实习结束，累计完成 3 次实习。"]);
  });
});
