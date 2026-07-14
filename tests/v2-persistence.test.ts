import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine";
import { createConferenceCareerState } from "../src/core/v2-conference-career";
import { createConferenceEncounterState } from "../src/core/v2-conference-encounters";
import { createEventCounters } from "../src/core/v2-event-counters";
import { createInternshipState } from "../src/core/v2-internship-system";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { createLoverState } from "../src/core/v2-lover-system";
import {
  clearPersistedState,
  deleteManualState,
  listManualSaveSummaries,
  loadManualState,
  loadPersistedState,
  MANUAL_SLOT_COUNT,
  saveManualState,
  savePersistedState,
} from "../src/core/v2-persistence";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key) ?? null : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

declare global {
  interface Window {
    localStorage: Storage;
  }
}

const originalWindow = globalThis.window;

beforeEach(() => {
  const windowLike = { localStorage: new MemoryStorage() } as unknown as Window;
  Object.defineProperty(globalThis, "window", {
    value: windowLike,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("manual persistence", () => {
  it("支持自动存档 roundtrip 与清理", () => {
    const state = createInitialState();
    savePersistedState({ ...state, totalMonths: 9, year: 1, month: 9 });

    const loaded = loadPersistedState();
    expect(loaded?.totalMonths).toBe(9);
    expect(loaded?.year).toBe(1);
    expect(loaded?.month).toBe(9);

    clearPersistedState();
    expect(loadPersistedState()).toBeNull();
  });

  it("支持保存和读取手动槽", () => {
    const state = createInitialState();
    saveManualState(2, state);

    const loaded = loadManualState(2);
    expect(loaded?.selectedRoleId).toBe(state.selectedRoleId);
    expect(loaded?.manualSaveSummaries).toEqual(state.manualSaveSummaries);
  });

  it("会保留具名同门资料", () => {
    const state = createInitialState();
    saveManualState(2, {
      ...state,
      fellowProgressState: [{
        id: "junior-custom",
        name: "小明",
        type: "junior",
        research: 4,
        affinity: 5,
        taskType: "idea",
        taskProgress: 12,
        taskMax: 60,
        relationProgress: 8,
        relationMax: 40,
        canInteract: false,
        taskUsedThisMonth: false,
        completedTaskCount: 1,
        interactCount: 0,
        startTotalMonths: 10,
      }],
    });

    const loaded = loadManualState(2);
    expect(loaded?.fellowProgressState[0]).toMatchObject({
      id: "junior-custom",
      name: "小明",
      type: "junior",
      research: 4,
      affinity: 5,
    });
  });

  it("会返回手动槽摘要", () => {
    const state = createInitialState();
    saveManualState(1, { ...state, totalMonths: 7, year: 1, month: 7, totalResearchScore: 2 });
    saveManualState(3, { ...state, degree: "phd", totalMonths: 20, year: 2, month: 8, totalResearchScore: 5 });

    const summaries = listManualSaveSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.slot).toBe(1);
    expect(summaries[1]?.slot).toBe(3);
    expect(summaries[1]?.degree).toBe("phd");
  });

  it("支持删除手动槽", () => {
    const state = createInitialState();
    saveManualState(MANUAL_SLOT_COUNT, state);
    expect(loadManualState(MANUAL_SLOT_COUNT)).not.toBeNull();

    deleteManualState(MANUAL_SLOT_COUNT);

    expect(loadManualState(MANUAL_SLOT_COUNT)).toBeNull();
  });

  it("在没有 window 或 localStorage 时不会抛错", () => {
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => savePersistedState(createInitialState())).not.toThrow();
    expect(() => clearPersistedState()).not.toThrow();
    expect(() => saveManualState(1, createInitialState())).not.toThrow();
    expect(() => deleteManualState(1)).not.toThrow();
    expect(loadPersistedState()).toBeNull();
    expect(loadManualState(1)).toBeNull();
    expect(listManualSaveSummaries()).toEqual([]);
  });

  it("读取旧版单事件存档时会迁移到事件队列", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      pendingEvent: {
        id: "legacy-fixed-event",
        title: "旧版事件",
        description: "旧版存档里的单事件字段。",
        preview: "旧版预览",
        source: "fixed",
        blocking: true,
        deadlineMonths: 0,
        chainId: "legacy-fixed-event",
        stage: "act1",
        choices: [{ id: "ok", label: "继续", outcome: "已迁移。", effects: {} }],
      },
      eventQueue: undefined,
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_1",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(1);
    expect(loaded?.eventQueue).toHaveLength(1);
    expect(loaded?.eventQueue[0]?.id).toBe("legacy-fixed-event");
  });
  it("fills missing random event fields when loading legacy save data", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      papers: [
        {
          id: "paper-1",
          title: "Paper 1",
          idea: 4,
          experiment: 4,
          writing: 4,
          status: "published",
          target: "C",
          reviewMonthsLeft: 0,
          submittedIdea: 4,
          submittedExperiment: 4,
          submittedWriting: 4,
        },
      ],
      availableRandomEvents: undefined,
      usedRandomEvents: undefined,
      coldWeight: undefined,
      badmintonYear: undefined,
      totalRandomEventCount: undefined,
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_2",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(2);
    expect(loaded?.availableRandomEvents).toContain(14);
    expect(loaded?.usedRandomEvents).toEqual([]);
    expect(loaded?.coldWeight).toBe(1);
    expect(loaded?.badmintonYear).toBe(-1);
    expect(loaded?.totalRandomEventCount).toBe(0);
    expect(loaded?.actionBonuses).toEqual({ idea: 0, experiment: 0, writing: 0 });
    expect(loaded?.persistentExtraActions).toEqual({ idea: 0, experiment: 0, writing: 0 });
    expect(loaded?.temporaryActionEffects).toEqual({
      idea: { bonus: 0, multiplier: 1, extraActions: 0 },
      experiment: { bonus: 0, multiplier: 1, extraActions: 0 },
      writing: { bonus: 0, multiplier: 1, extraActions: 0 },
    });
    expect(loaded?.externalPublications).toEqual([]);
    expect(loaded?.shopState).toEqual({
      gpuServersBought: 0,
      chairOwned: false,
      chairUpgrade: null,
      keyboardOwned: false,
      monitorOwned: false,
      monitorUpgrade: null,
      bikeOwned: false,
      bikeUpgrade: null,
      bikeSanSpent: 0,
      bikeSanCapGains: 0,
    });
    expect(loaded?.coffeeState).toEqual({
      machineOwned: false,
      machineUpgrade: null,
      manualCoffeeBoughtThisMonth: 0,
      totalCoffeeBought: 0,
      machineTrackedCoffeeCount: 0,
    });
    expect(loaded?.readingState).toEqual({
      readCount: 0,
      smartMonitorReadCount: 0,
      dualMonitorIdeaBonus: 0,
    });
    expect(loaded?.publicationEffects).toEqual({ nextCitationMultipliers: [], citationPenaltyMultiplier: 1 });
    expect(loaded?.relationshipState).toEqual({ unlockedSlots: 2, occupiedSlots: 0, advisorCount: 0, seniorCount: 0, juniorCount: 0, peerCount: 0, loverCount: 0, mentorshipStacks: 0 });
    expect(loaded?.conferenceEncounterState).toEqual(createConferenceEncounterState());
    expect(loaded?.conferenceCareerState).toEqual(createConferenceCareerState());
    expect(loaded?.internshipState).toEqual(createInternshipState());
    expect(loaded?.loverState).toEqual(createLoverState());
    expect(loaded?.loverProgressState).toEqual(createLoverProgressState());
    expect(loaded?.advisorProgressState).toEqual(state.advisorProgressState);
    expect(loaded?.totalCitations).toBe(0);
    expect(loaded?.sanCap).toBe(20);
    expect(loaded?.eventSupport).toEqual({ hasGameController: false, hasParasol: false, hasDownJacket: false, hasBadmintonRacket: false, hasStrongBodyTalent: false, hasFinanceTalent: false });
    expect(loaded?.eventCounters).toEqual(createEventCounters());
    expect(loaded?.achievementFlags).toEqual({ sickly: false, nearDeath: false, terraria300: false, magicTowerMaster: false, thankYouPlaying: false, badmintonAvoidedCold: false, badmintonChampion: false, pokerGod: false, ktvKing: false, narrowEscape: false, learnToSayNo: false, projectKing: false, loveMyTeacher: false, highScorePaper: false, advancedEquipment: false, cyclingMaster: false, fullGear: false });
  });
  it("backfills legacy internship fields into the decoupled internship state", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      ailabInternship: true,
      currentInternship: {
        startMonth: 8,
        remainingMonths: 4,
      },
      buffs: {
        permanent: [{ internshipBuff: true, value: 1.35 }],
      },
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.internshipState).toEqual({
      active: true,
      remainingMonths: 4,
      startTotalMonths: 8,
      experimentMultiplier: 1.35,
    });
  });

  it("backfills legacy lover fields into loverState", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      hasLover: true,
      loverType: "beautiful",
      firstLoverMonth: 6,
      beautifulLoverExtraRecoveryRate: 4,
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.loverState).toEqual({
      active: true,
      type: "beautiful",
      startTotalMonths: 6,
      beautifulExtraRecoveryRate: 4,
    });
    expect(loaded?.loverProgressState).toEqual(createLoverProgressState());
  });

  it("normalizes malformed legacy thesis and career shapes into safe defaults", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      thesis: {
        progress: "bad",
        started: "yes",
        completed: 1,
        abandoned: null,
      },
      careerProgress: {
        internet: "bad",
        stateOwned: 2,
      },
      careerAbandoned: {
        internet: "no",
        academic: true,
      },
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.thesis).toEqual({
      progress: 0,
      started: false,
      completed: false,
      abandoned: false,
    });
    expect(loaded?.careerProgress).toEqual({
      internet: 0,
      stateOwned: 2,
      civilService: 0,
      academic: 0,
    });
    expect(loaded?.careerAbandoned).toEqual({
      internet: false,
      stateOwned: false,
      civilService: false,
      academic: true,
    });
  });

  it("falls back to legacy lover activation when nested loverState is explicitly inactive", () => {
    const state = createInitialState();
    const mixedState = {
      ...state,
      hasLover: true,
      loverType: "smart",
      firstLoverMonth: 7,
      beautifulLoverExtraRecoveryRate: 0,
      loverState: {
        active: false,
        type: null,
        startTotalMonths: null,
        beautifulExtraRecoveryRate: 0,
      },
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: mixedState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.loverState).toEqual({
      active: true,
      type: "smart",
      startTotalMonths: 7,
      beautifulExtraRecoveryRate: 0,
    });
  });

  it("backfills bike-derived achievements when loading legacy save data", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      shopState: {
        ...state.shopState,
        bikeOwned: true,
        bikeUpgrade: "ebike",
        bikeSanSpent: 30,
      },
      eventSupport: {
        ...state.eventSupport,
        hasParasol: true,
        hasDownJacket: true,
      },
      achievementFlags: {
        ...state.achievementFlags,
      },
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.achievementFlags.advancedEquipment).toBe(true);
    expect(loaded?.achievementFlags.cyclingMaster).toBe(true);
    expect(loaded?.achievementFlags.fullGear).toBe(true);
  });

  it("backfills legacy joint-training cap and advisor resource fields into decoupled states", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      bigBullCooperation: true,
      bigBullCitationBonusApplied: 4,
      researchMax: 26,
      relationships: [{ type: "advisor", researchResource: 7 }],
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.conferenceEncounterState.bigBullCooperation).toBe(true);
    expect(loaded?.jointTrainingState).toEqual({ citationBonusApplied: 4 });
    expect(loaded?.researchCapacityState).toEqual({
      baseCap: 20,
      jointTrainingCitationCapBonus: 4,
      otherCapBonus: 2,
    });
    expect(loaded?.advisorProgressState).toEqual({
      ...state.advisorProgressState,
      researchResource: 7,
    });
  });

  it("lets root conference encounter fields override nested compatibility fields", () => {
    const state = createInitialState();
    const mixedState = {
      ...state,
      conferenceEncounterState: {
        ...createConferenceEncounterState(),
        metBigBull: true,
        bigBullCoopCount: 1,
        smartCount: 2,
      },
      metBigBull: false,
      bigBullCoopCount: 5,
      smartCount: 7,
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: mixedState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.conferenceEncounterState.metBigBull).toBe(false);
    expect(loaded?.conferenceEncounterState.bigBullCoopCount).toBe(5);
    expect(loaded?.conferenceEncounterState.smartCount).toBe(7);
  });

  it("backfills full legacy advisor relationship progress into advisorProgressState", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      relationships: [{
        type: "advisor",
        researchResource: 7,
        affinity: 5,
        taskProgress: 17,
        taskMax: 68,
        taskMultiplier: 6,
        relationProgress: 12,
        relationMax: 40,
        canInteract: true,
        taskUsedThisMonth: true,
        advisorTasksCompleted: 2,
        stats: { interactCount: 3 },
      }],
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_3",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(3);
    expect(loaded?.advisorProgressState).toEqual({
      researchResource: 7,
      affinity: 5,
      taskProgress: 17,
      taskMax: 68,
      taskMultiplier: 6,
      relationProgress: 12,
      relationMax: 40,
      canInteract: true,
      taskUsedThisMonth: true,
      completedProjectCount: 2,
      interactCount: 3,
    });
  });

  it("backfills legacy lover relationship progress only when a real lover object exists", () => {
    const state = createInitialState();
    const legacyState = {
      ...state,
      hasLover: true,
      loverType: "smart",
      relationships: [{
        type: "lover",
        research: 11,
        intimacy: 10,
        taskProgress: 60,
        taskMax: 100,
        relationProgress: 25,
        relationMax: 40,
        canInteract: true,
        taskUsedThisMonth: true,
        loverTasksCompleted: 2,
        stats: { interactCount: 3 },
      }],
      manualSaveSummaries: [],
    };

    window.localStorage.setItem(
      "vibe2_v2_manual_slot_2",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        state: legacyState,
      }),
    );

    const loaded = loadManualState(2);
    expect(loaded?.loverProgressState).toEqual({
      active: true,
      research: 11,
      intimacy: 10,
      taskProgress: 60,
      taskMax: 100,
      relationProgress: 25,
      relationMax: 40,
      canInteract: true,
      taskUsedThisMonth: true,
      completedTaskCount: 2,
      interactCount: 3,
    });
  });


  it("backfills legacy relationship counts and occupied slots when relationshipState is missing", () => {
  const state = createInitialState();
  const legacyState = {
    ...state,
    player: { ...state.player, social: 7 },
    relationships: [
      { type: "advisor" },
      { type: "senior" },
      { type: "peer" },
      { type: "lover" },
    ],
    relationshipState: undefined,
    manualSaveSummaries: [],
  };

  window.localStorage.setItem(
    "vibe2_v2_manual_slot_1",
    JSON.stringify({
      savedAt: new Date().toISOString(),
      state: legacyState,
    }),
  );

  const loaded = loadManualState(1);
  expect(loaded?.relationshipState).toEqual({
    unlockedSlots: 4,
    occupiedSlots: 4,
    advisorCount: 1,
    seniorCount: 1,
    juniorCount: 0,
    peerCount: 1,
    loverCount: 1,
    mentorshipStacks: 0,
  });
  });

  it("backfills legacy fellow relationship progress into fellowProgressState", () => {
  const state = createInitialState();
  const legacyState = {
    ...state,
    relationships: [{
      id: "legacy-senior",
      type: "senior",
      research: 8,
      affinity: 3,
      taskProgress: 12,
      taskMax: 60,
      relationProgress: 15,
      relationMax: 40,
      canInteract: true,
      taskUsedThisMonth: true,
      stats: { completedCount: 2, interactCount: 4 },
      addedAt: 9,
    }],
    manualSaveSummaries: [],
  };

  window.localStorage.setItem(
    "vibe2_v2_manual_slot_2",
    JSON.stringify({
      savedAt: new Date().toISOString(),
      state: legacyState,
    }),
  );

  const loaded = loadManualState(2);
  expect(loaded?.fellowProgressState).toEqual([{
    id: "legacy-senior",
    type: "senior",
    research: 8,
    affinity: 3,
    taskType: "writing",
    taskProgress: 12,
    taskMax: 60,
    relationProgress: 15,
    relationMax: 40,
    canInteract: true,
    taskUsedThisMonth: true,
    completedTaskCount: 2,
    interactCount: 4,
    startTotalMonths: 9,
  }]);
});
});
