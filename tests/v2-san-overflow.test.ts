import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyEventPlayerEffects } from "../src/core/v2-event-player-effects";
import { advanceLoverDate, createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyPaperReviewSettlement, projectPaperReviewSettlement } from "../src/core/v2-publication-system";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { getRecoveredSan } from "../src/core/v2-san-recovery";
import type { GameState, PaperReviewSettlement } from "../src/core/v2-types";

function overflowState(): GameState {
  const initial = createStartedGameState("chosen-reversed");
  return { ...initial, roleTalents: { levels: { "swap-breaks-cap": 1 } }, totalMonths: 6, month: 6,
    eventQueue: [], player: { ...initial.player, san: 50, research: 40, social: 40, favor: 40, money: 100 } };
}

function review(state: GameState, sanChange: number): { state: GameState; settlement: PaperReviewSettlement } {
  const paper = { ...createDraftPaper(6, 0, () => 0), status: "reviewing" as const, target: "C" as const };
  return { state: { ...state, papers: [paper] }, settlement: {
    paperId: paper.id, target: "C", accepted: false, acceptType: null, submittedScore: 10,
    totalReviewScore: -1, borderlineChance: null, venueInfluence: 1, reviewStrictnessMultiplier: 1,
    scoreGain: 0, reviewerSanChange: sanChange,
    reports: [{ reviewer: "Review", focus: "balanced", effectiveScore: 10, decision: "Reject", reviewScore: -1, baseSanChange: sanChange, sanChange }],
  } };
}

describe("SAN retained above its cap", () => {
  it("recovers only free capacity and never caps a genuine deduction", () => {
    expect(getRecoveredSan(19, 20, 4)).toBe(20);
    expect(getRecoveredSan(50, 20, 4)).toBe(50);
    expect(getRecoveredSan(50, 20, 0)).toBe(50);
    expect(getRecoveredSan(50, 20, -4)).toBe(46);
  });

  it.each(["rest", "buy-coffee"] as const)("keeps swapped overflow after %s", (action) => {
    const original = overflowState();
    const next = dispatchAction(original, action);
    expect(next.player.san).toBe(50);
    expect(next.player.research).toBe(40);
    expect(next.player.social).toBe(40);
    expect(next.player.favor).toBe(40);
    expect(next.log.at(-1)?.text ?? "").not.toContain("+-");
    if (action === "buy-coffee") expect(next.player.money).toBe(98);
  });

  it("keeps overflow when events grant SAN and only subtracts genuine costs", () => {
    const original = overflowState();
    expect(applyEventPlayerEffects(original, { san: 2 }).player.san).toBe(50);
    expect(applyEventPlayerEffects(original, { san: -2 }).player.san).toBe(48);
  });

  it("keeps overflow through lover play rewards and publication talent rewards", () => {
    const original = overflowState();
    const loverProgressState = createLoverProgressState("beautiful", () => 0);
    loverProgressState.routes!.play = { progress: 99, completed: 0 };
    const lover = advanceLoverDate({ ...original, loverState: activateLover("beautiful", 1, "male"), loverProgressState }, "play");
    expect(lover.loverProgressState.routes?.play.completed).toBe(1);
    expect(lover.player.san).toBe(50);
    const published = { ...createDraftPaper(6, 0, () => 0), status: "published" as const, target: "C" as const };
    expect(applyPublicationTalentRewards({ ...original, externalPublications: [published] }).player.san).toBe(50);
  });

  it.each([0, 2, -2])("keeps overflow through a review result with SAN delta %s", (delta) => {
    const { state, settlement } = review(overflowState(), delta);
    const result = applyPaperReviewSettlement(state, settlement);
    expect(result.player.san).toBe(delta < 0 ? 50 + delta : 50);
  });

  it("pays reviewer SAN with gold power alpha without mutating the preview input", () => {
    const base = overflowState();
    const { state, settlement } = review({ ...base, selectedRoleId: "rich", roleTalents: { levels: { "gold-power-alpha": 1 }, goldPowerEnabled: true },
      player: { ...base.player, san: 10 } }, -2);
    const snapshot = structuredClone(state);
    const projected = projectPaperReviewSettlement(state, settlement);
    expect(projected.player).toMatchObject({ san: 10, money: 98 });
    expect(state).toEqual(snapshot);
    expect(applyPaperReviewSettlement(state, settlement).player).toEqual(projected.player);
  });

  it("uses burning life beta only when confirming an unaffordable review cost", () => {
    const base = overflowState();
    const { state, settlement } = review({ ...base, selectedRoleId: "normal", degree: "phd",
      roleTalents: { levels: { "burning-life-beta": 1 } }, player: { ...base.player, san: 1 } }, -2);
    const projected = projectPaperReviewSettlement(state, settlement);
    expect(projected.player.san).toBe(1);
    expect(projected.sanCap).toBe(19);
    expect(state.roleTalents?.betaUsedMonth).toBeUndefined();
    const applied = applyPaperReviewSettlement(state, settlement);
    expect(applied.player.san).toBe(1);
    expect(applied.sanCap).toBe(19);
    expect(applied.roleTalents?.betaUsedMonth).toBe(state.totalMonths);
  });
});
