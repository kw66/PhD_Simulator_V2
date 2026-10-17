import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { getPlayerAttributeCap, previewPlayerAttributeChange } from "../src/core/v2-player-attributes";
import { applyReadingCountProgress, getReadingIdeaBonus } from "../src/core/v2-reading-system";
import { applyRewinderGrowth, captureRewinderGrowth, mergeRewinderGrowth } from "../src/core/v2-rewinder-growth";
import type { GameState } from "../src/core/v2-types";

function rewinder(): GameState {
  return { ...createInitialState(), selectedRoleId: "rewinder", phase: "playing", roleTalents: { levels: {} } };
}

describe("rewinder attribute and growth inheritance", () => {
  it("combines each independent maximum without mutating either snapshot", () => {
    const first = rewinder();
    first.player = { ...first.player, san: 35, research: 18, social: 3, favor: 6 };
    first.sanCap = 40;
    first.readingState.readCount = 49;
    first.eventCounters.pokerCount = 6;
    const second = rewinder();
    second.player = { ...second.player, san: 12, research: 9, social: 17, favor: 12 };
    second.partTimeWorkCount = 16;
    const a = captureRewinderGrowth(first);
    const b = captureRewinderGrowth(second);
    const before = structuredClone([a, b]);
    const merged = mergeRewinderGrowth(a, b);
    expect(merged.attributes).toMatchObject({ san: 35, sanCap: 40, research: 18, social: 17, favor: 12 });
    expect(merged.growth).toMatchObject({ readCount: 49, pokerCount: 6, partTimeWorkCount: 16 });
    expect([a, b]).toEqual(before);
    expect(mergeRewinderGrowth(b, a)).toEqual(merged);
  });

  it("restores exact attributes and real caps without resisting, replaying bonuses or copying cap sources", () => {
    const past = rewinder();
    past.player = { ...past.player, san: 48, research: 27.6, social: 25, favor: 24 };
    past.sanCap = 50;
    past.researchCapacityState = { baseCap: 20, jointTrainingCitationCapBonus: 5, otherCapBonus: 3 };
    past.roleTalents = { levels: {}, capBonuses: { social: 7, favor: 6 } };
    const current = rewinder();
    current.player = { ...current.player, research: 18, social: 18, favor: 18 };
    current.researchCapacityState.jointTrainingCitationCapBonus = 2;
    expect(previewPlayerAttributeChange(current, "research", 1).effectiveChange).toBe(0.4);
    const before = structuredClone(current);
    const restored = applyRewinderGrowth(current, captureRewinderGrowth(past));
    expect(restored.player).toMatchObject({ san: 48, research: 27.6, social: 25, favor: 24 });
    expect(restored.researchCapacityState).toEqual({ baseCap: 20, jointTrainingCitationCapBonus: 2, otherCapBonus: 6 });
    expect(getPlayerAttributeCap(restored, "social")).toBe(27);
    expect(getPlayerAttributeCap(restored, "favor")).toBe(26);
    expect(restored.roleTalents?.growthTotals).toBeUndefined();
    expect(current).toEqual(before);
    expect(applyRewinderGrowth(restored, captureRewinderGrowth(past))).toEqual(restored);
  });

  it("restores growth progress without granting old reading rewards, then grants only the next milestone", () => {
    const past = rewinder();
    past.readingState.readCount = 29;
    const current = rewinder();
    current.player.research = 1;
    past.player.research = 1;
    const restored = applyRewinderGrowth(current, captureRewinderGrowth(past));
    expect(restored.player.research).toBe(1);
    expect(restored.readingState.readCount).toBe(29);
    expect(getReadingIdeaBonus(restored.readingState.readCount + 1)).toBe(3);
    expect(restored.buffs).toEqual(current.buffs);
    const next = applyReadingCountProgress(restored, 1);
    expect(next.researchGain).toBe(1);
    expect(next.nextState.player.research).toBe(2);
    expect(next.nextState.readingState.readCount).toBe(30);
    const roundCount = { ...captureRewinderGrowth(past), growth: { ...captureRewinderGrowth(past).growth, readCount: 30 } };
    expect(applyReadingCountProgress(applyRewinderGrowth(current, roundCount), 1).researchGain).toBe(0);
  });

  it("keeps only permitted experience, excluding cash, items, buffs, training reward and active internship", () => {
    const past = rewinder();
    past.player.money = 999;
    past.shopState.keyboardOwned = true;
    past.coffeeState.machineOwned = true;
    past.eventSupport.hasStrongBodyTalent = true;
    past.eventSupport.hasBadmintonRacket = true;
    past.eventCounters.pokerCount = 8;
    past.eventCounters.pokerProfit = 99;
    past.eventCounters.domesticMeetingCount = 6;
    past.eventCounters.meetingCount = 8;
    past.internshipCount = 3;
    past.internshipState = { ...past.internshipState, active: true, remainingMonths: 3 };
    past.conferenceEncounterState.bigBullCooperation = true;
    past.conferenceEncounterState.jointTrainingReward = { mentorId: "past", mentorName: "Past", ideaBonus: 5, writingBonus: 5, capBonus: 2 };
    past.buffs = [{ id: "old", name: "old", source: "old", remainingMonths: null, timing: "permanent" }];
    const current = rewinder();
    current.buffs = [{ id: "current", name: "current", source: "current", remainingMonths: 2, timing: "monthly" }];
    const restored = applyRewinderGrowth(current, captureRewinderGrowth(past));
    expect(restored.eventCounters).toMatchObject({ pokerCount: 8, pokerProfit: 0, domesticMeetingCount: 6, meetingCount: 8 });
    expect(restored.internshipCount).toBe(3);
    expect(restored.conferenceCareerState.hasInternshipExperience).toBe(true);
    expect(restored.conferenceEncounterState.bigBullCooperation).toBe(true);
    expect(restored.conferenceEncounterState.jointTrainingReward).toBeUndefined();
    for (const key of ["shopState", "coffeeState", "eventSupport", "internshipState", "buffs", "papers", "externalPublications", "publicationTalentState", "achievementProgress"] as const) {
      expect(restored[key]).toEqual(current[key]);
    }
    expect(restored.player.money).toBe(current.player.money);
  });

  it("does not alter other characters or consume random state", () => {
    const current = rewinder();
    current.randomState = { seed: 123, cursor: 7 };
    const past = rewinder();
    past.readingState.readCount = 500;
    const restored = applyRewinderGrowth(current, captureRewinderGrowth(past));
    expect(restored.randomState).toEqual(current.randomState);
    current.selectedRoleId = "normal";
    expect(applyRewinderGrowth(current, captureRewinderGrowth(past))).toBe(current);
  });
});
