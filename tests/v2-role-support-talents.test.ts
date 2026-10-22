import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, resolvePaperReview } from "../src/core/v2-paper-rules";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { queueAdvisorGuidance, settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { settlePendingFellowHelp } from "../src/core/v2-fellow-cooperation";
import { settleFellowCoauthoredPapers } from "../src/core/v2-lab-talent";
import { getReviewerWeights } from "../src/core/v2-review-config";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import { canUseAiTalentFunding } from "../src/core/v2-ai-shop";
import { applyShopAction, getShopActionPrice } from "../src/core/v2-shop-transactions";
import type { GameState } from "../src/core/v2-types";

function base(role: GameState["selectedRoleId"]): GameState {
  const state = createStartedGameState(role);
  return { ...state, month: 2, totalMonths: 2, selectedAdvisorName: "导师", eventQueue: [],
    papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 10, experiment: 10, writing: 0 }] };
}

describe("upright relationship role talents", () => {
  it("amplifies the advisor's help to the player only, exactly once", () => {
    const state = base("teacher-child");
    state.roleTalents = { levels: { "mentor-insight": 2 } };
    const junior = createCustomFellowProgressProfile({ type: "junior", gender: "female", research: 3, affinity: 1, startTotalMonths: 1 });
    state.fellowProgressState = [junior];
    state.fellowPapers = [{ ...state.papers[0]!, id: "junior", leadAuthorId: junior.id }];
    const next = settleAdvisorGuidance(queueAdvisorGuidance(state), () => 0);
    expect(next.papers[0]?.writing).toBe(20);
    expect(next.papers[0]?.collaborationScores?.writing).toBe(20);
    expect(next.fellowPapers?.[0]?.writing).toBe(10);
    expect(settleAdvisorGuidance(next, () => 0)).toBe(next);
  });

  it("amplifies fellow-to-player help before final rounding, not the player's return help", () => {
    const state = base("social");
    state.roleTalents = { levels: { "collective-wisdom": 1 } };
    const fellow = createCustomFellowProgressProfile({ type: "senior", gender: "female", research: 3, affinity: 1, startTotalMonths: 1 });
    state.fellowProgressState = [{ ...fellow, pendingHelpToPlayer: 3.8, pendingHelpToFellow: 3.8 }];
    state.fellowPapers = [{ ...state.papers[0]!, id: "fellow", leadAuthorId: fellow.id }];
    const next = settlePendingFellowHelp(state, () => 0);
    expect(next.papers[0]?.idea).toBe(15);
    expect(next.fellowPapers?.[0]?.writing).toBe(3);
    expect(settlePendingFellowHelp(next, () => 0)).toBe(next);
  });

  it("grants extra publication affinity independently of unrelated juniors and never twice", () => {
    const state = base("social");
    state.roleTalents = { levels: { "paper-camaraderie": 2 } };
    const peer = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 3, affinity: 6, startTotalMonths: 1 });
    const junior = { ...peer, id: "junior", type: "junior" as const };
    state.fellowProgressState = [peer, junior];
    state.papers = [{ ...state.papers[0]!, status: "published", collaborators: [{ id: peer.id, name: "同学" }] }];
    const next = settleFellowCoauthoredPapers(state);
    expect(next.fellowProgressState[0]?.affinity).toBe(8.4);
    expect(next.fellowProgressState[1]?.affinity).toBe(6);
    expect(settleFellowCoauthoredPapers(next)).toBe(next);
    const withoutJunior = settleFellowCoauthoredPapers({ ...state, fellowProgressState: [peer] });
    expect(withoutJunior.fellowProgressState[0]?.affinity).toBe(8.4);
  });

  it.each([1, 4, 12])("rescales other reviewer types proportionally in year %s", (year) => {
    const ordinary = new Map(getReviewerWeights(year));
    const changed = new Map(getReviewerWeights(year, 0.2));
    expect(changed.get("kind")).toBeCloseTo(ordinary.get("kind")! + 0.2, 10);
    expect([...changed.values()].reduce((a, b) => a + b)).toBeCloseTo(1, 10);
    expect(changed.get("novelty")! / changed.get("gpt")!).toBeCloseTo(ordinary.get("novelty")! / ordinary.get("gpt")!, 10);
    expect(getReviewerWeights(year, 1).filter(([type]) => type !== "kind").every(([, weight]) => weight === 0)).toBe(true);
  });

  it("uses current PhD social in new reviews without changing already drawn reports", () => {
    const state = base("social");
    state.degree = "phd";
    state.roleTalents = { levels: { "kindly-reviewed": 5 } };
    state.player.social = 20;
    state.papers = [{ ...state.papers[0]!, target: "C", status: "reviewing", reviewMonthsLeft: 0, submittedYear: 3 }];
    const next = resolveDuePaperReviews(state, () => 0.1).state;
    const serialized = JSON.stringify(next.eventQueue);
    expect(serialized).toContain('"reviewerType":"kind"');
    expect(serialized).not.toContain('"reviewerType":"normal"');
    const withoutBonus = resolveDuePaperReviews({ ...state, player: { ...state.player, social: 0 } }, () => 0.1).state;
    expect(JSON.stringify(withoutBonus.eventQueue)).not.toBe(serialized);
    const masters = resolveDuePaperReviews({ ...state, degree: "master" }, () => 0.1).state;
    expect(JSON.stringify(masters.eventQueue)).toBe(JSON.stringify(withoutBonus.eventQueue));
    const drawn = { ...next, player: { ...next.player, social: 0 } };
    expect(resolveDuePaperReviews(drawn, () => 0.1).state.eventQueue).toEqual(next.eventQueue);
    expect(resolvePaperReview(state.papers[0]!, () => 0.1).nextPaper.lastReview?.reports.every((report) => report.reviewerType === "kind")).toBe(false);
  });

  it("uses AI funding at the threshold, then falls back to personal money for the next purchase", () => {
    const state = base("teacher-child");
    state.roleTalents = { levels: { "funding-shield": 1 } };
    state.advisorProgressState.funding = 60;
    state.player.money = 5;
    expect(getShopActionPrice(state, "buy-ai-month", { aiSlotId: "gpt" })).toBe(0);
    const next = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(next.player.money).toBe(5);
    expect(next.advisorProgressState.funding).toBe(58);
    expect(next.labFinanceLedger?.amounts["student-reimbursement"]).toBe(-2);
    const second = applyShopAction(next, "buy-ai-month", { aiSlotId: "claude" });
    expect(second.advisorProgressState.funding).toBe(58);
    expect(second.player.money).toBe(3);
    expect(canUseAiTalentFunding(state, 61)).toBe(false);
  });

  it("preserves free-gift and reimbursement priority over the funding talent", () => {
    const state = base("teacher-child");
    state.roleTalents = { levels: { "funding-shield": 1 } };
    state.advisorProgressState.funding = 60;
    state.loverProgressState.giftCoupons = 1;
    const gifted = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(gifted.loverProgressState.giftCoupons).toBe(0);
    expect(gifted.advisorProgressState.funding).toBe(60);
    state.eventSupport.aiCostsCoveredUntilTotalMonths = state.totalMonths;
    const covered = applyShopAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(covered.loverProgressState.giftCoupons).toBe(1);
    expect(covered.advisorProgressState.funding).toBe(58);
  });
});
