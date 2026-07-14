import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENT_DEFINITIONS,
  createAchievementFlags,
  getUnlockedAchievementCount,
  getUnlockedAchievementDefinitions,
  syncDerivedAchievementFlags,
} from "../src/core/v2-achievements";
import { createCoffeeState } from "../src/core/v2-coffee-system";
import { createShopState } from "../src/core/v2-shop-items";
import type { Paper } from "../src/core/v2-types";

function createPaper(overrides: Partial<Paper> & Pick<Paper, "id" | "title" | "status">): Paper {
  return {
    id: overrides.id,
    title: overrides.title,
    idea: overrides.idea ?? 0,
    experiment: overrides.experiment ?? 0,
    writing: overrides.writing ?? 0,
    status: overrides.status,
    target: overrides.target ?? null,
    reviewMonthsLeft: overrides.reviewMonthsLeft ?? 0,
    submittedIdea: overrides.submittedIdea ?? null,
    submittedExperiment: overrides.submittedExperiment ?? null,
    submittedWriting: overrides.submittedWriting ?? null,
    submittedMonth: overrides.submittedMonth ?? null,
    submittedYear: overrides.submittedYear ?? null,
    conferenceHandled: overrides.conferenceHandled,
    publication: overrides.publication,
    receivedRelationshipBonus: overrides.receivedRelationshipBonus,
  };
}

describe("v2 achievements", () => {
  it("exposes the implemented achievement definitions", () => {
    expect(ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.id)).toEqual([
      "sickly",
      "nearDeath",
      "terraria300",
      "magicTowerMaster",
      "thankYouPlaying",
      "badmintonAvoidedCold",
      "badmintonChampion",
      "pokerGod",
      "ktvKing",
      "narrowEscape",
      "learnToSayNo",
      "projectKing",
      "loveMyTeacher",
      "highScorePaper",
      "advancedEquipment",
      "cyclingMaster",
      "fullGear",
    ]);
  });

  it("counts and lists unlocked achievements from flags", () => {
    const flags = {
      sickly: false,
      nearDeath: true,
      terraria300: false,
      magicTowerMaster: false,
      thankYouPlaying: false,
      badmintonAvoidedCold: true,
      badmintonChampion: false,
      pokerGod: false,
      ktvKing: true,
      narrowEscape: false,
      learnToSayNo: false,
      projectKing: true,
      loveMyTeacher: false,
      highScorePaper: false,
      advancedEquipment: true,
      cyclingMaster: false,
      fullGear: true,
    };

    expect(getUnlockedAchievementCount(flags)).toBe(6);
    expect(getUnlockedAchievementDefinitions(flags).map((achievement) => achievement.id)).toEqual([
      "nearDeath",
      "badmintonAvoidedCold",
      "ktvKing",
      "projectKing",
      "advancedEquipment",
      "fullGear",
    ]);
  });

  it("derives bike-related achievements from decoupled state slices", () => {
    const flags = syncDerivedAchievementFlags(createAchievementFlags(), {
      shopState: {
        ...createShopState(),
        bikeUpgrade: "ebike",
        bikeSanSpent: 30,
      },
      coffeeState: createCoffeeState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: true,
        hasDownJacket: true,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      papers: [],
    });

    expect(flags.advancedEquipment).toBe(true);
    expect(flags.cyclingMaster).toBe(true);
    expect(flags.fullGear).toBe(true);
  });

  it("derives highScorePaper from a published paper without relationship bonus", () => {
    const flags = syncDerivedAchievementFlags(createAchievementFlags(), {
      shopState: createShopState(),
      coffeeState: createCoffeeState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      papers: [
        createPaper({
          id: "paper-high-score",
          title: "High Score",
          status: "published",
          idea: 42,
          experiment: 41,
          writing: 42,
        }),
      ],
    });

    expect(flags.highScorePaper).toBe(true);
  });

  it("does not derive highScorePaper when the score comes from relationship bonus", () => {
    const flags = syncDerivedAchievementFlags(createAchievementFlags(), {
      shopState: createShopState(),
      coffeeState: createCoffeeState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      papers: [
        createPaper({
          id: "paper-bonus-score",
          title: "Bonus Score",
          status: "published",
          idea: 42,
          experiment: 41,
          writing: 42,
          receivedRelationshipBonus: true,
        }),
      ],
    });

    expect(flags.highScorePaper).toBe(false);
  });

  it("does not derive highScorePaper from an unpublished paper", () => {
    const flags = syncDerivedAchievementFlags(createAchievementFlags(), {
      shopState: createShopState(),
      coffeeState: createCoffeeState(),
      eventSupport: {
        hasGameController: false,
        hasParasol: false,
        hasDownJacket: false,
        hasBadmintonRacket: false,
        hasStrongBodyTalent: false,
        hasFinanceTalent: false,
      },
      papers: [
        createPaper({
          id: "paper-draft-high-score",
          title: "Draft High Score",
          status: "draft",
          idea: 42,
          experiment: 41,
          writing: 42,
        }),
      ],
    });

    expect(flags.highScorePaper).toBe(false);
  });
});
