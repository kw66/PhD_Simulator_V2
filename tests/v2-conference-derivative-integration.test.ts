import { describe, expect, it } from "vitest";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { applyQueuedEventEffects } from "../src/core/v2-engine-event-resolution";
import { createConferenceActivityEvent } from "../src/core/v2-conference-activity-events";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { activateLover } from "../src/core/v2-lover-system";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { getInternshipMonthlyStats, getInternshipExperimentEffect, hasInternshipExperience } from "../src/core/v2-internship-system";
import { DEBUG_EVENT_GROUPS } from "../src/core/v2-debug-tools";
import type { EventChoice, GameState, InternshipOffer } from "../src/core/v2-types";

function settle(state: GameState, effects: EventChoice["effects"]): GameState {
  return applyChoiceEffectsToState(state, { id: "confirm", label: "确定", outcome: "结果", effects }).nextState;
}

function choose(state: GameState, choiceId: string): GameState {
  return applyQueuedEventEffects(state, state.eventQueue[0]!, choiceId, {
    evaluateImmediateEndings: (next) => next,
    runPostQueuePipeline: (next) => next,
  });
}

function activity(state: GameState, serial: number): GameState {
  const root = createConferenceActivityEvent({ id: `meeting-${serial}`, conferenceName: "CVPR", conferenceYear: 2026,
    city: "杭州", country: "中国", paperCount: 1, grade: "A" },
  { ...state, research: state.player.research, social: state.player.social }, [], () => 0.99);
  return { ...state, eventQueue: [createEventQueueItem(root, serial)] };
}

function withLover(intimacy: number): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state,
    loverState: { ...activateLover("smart", state.totalMonths, "male"), name: "陈星", contactId: "scholar-1" },
    loverProgressState: { ...createLoverProgressState("smart", () => 0, state.year), intimacy },
    relationshipState: { ...state.relationshipState, loverCount: 1 },
    buffs: [
      { id: "lover-support", name: "陪伴", source: "恋人", timing: "permanent", remainingMonths: null, relationshipId: "lover" },
      { id: "other", name: "其他", source: "事件", timing: "permanent", remainingMonths: null },
    ],
  };
}

describe("conference derivative settlement integration", () => {
  it("counts three confirmed meetings with the same mentor before issuing one invitation", () => {
    const initial = createStartedGameState("normal");
    let state = { ...initial, player: { ...initial.player, research: 12, social: 6 }, totalCitations: 400 };
    let mentorId: string | undefined;
    for (let meeting = 1; meeting <= 3; meeting += 1) {
      state = choose(choose(activity(state, meeting), "continue"), "big-bull-coop");
      expect(state.conferenceEncounterState.bigBull?.cooperationCount ?? 0).toBe(meeting - 1);
      expect(state.eventQueue.every((event) => event.chainId !== "joint-training")).toBe(true);
      state = choose(state, "close");
      mentorId ??= state.conferenceEncounterState.bigBull!.id;
      expect(state.conferenceEncounterState.bigBull?.id).toBe(mentorId);
      expect(state.conferenceEncounterState.bigBull?.cooperationCount).toBe(meeting);
      expect(state.eventQueue.filter((event) => event.chainId === "joint-training")).toHaveLength(meeting === 3 ? 1 : 0);
    }
    expect(state.player.social).toBe(7.6);
    expect(state.eventQueue[0]!.jointTrainingPreview?.context.invitationCitations).toBe(400);
    state = choose(choose(state, "continue"), "accept");
    state = { ...state, totalCitations: 4000 };
    state = choose(state, "close");
    expect(state.researchCapacityState.jointTrainingCitationCapBonus).toBe(4);
    expect(state.buffs.filter((buff) => buff.timing === "permanent")).toHaveLength(2);
    state = choose(choose(choose(activity(state, 4), "continue"), "big-bull-coop"), "close");
    expect(state.eventQueue).toEqual([]);
    expect(state.researchCapacityState.jointTrainingCitationCapBonus).toBe(4);
    expect(state.buffs.filter((buff) => buff.timing === "permanent")).toHaveLength(2);
  });

  it("breaks up only on confirmation and does not issue a new romance from that same flirt", () => {
    const initial = withLover(2);
    let state = { ...initial, player: { ...initial.player, social: 12 } };
    state = choose(choose(activity(state, 1), "continue"), "opposite-scholar");
    expect(state.loverState.active).toBe(true);
    expect(state.loverProgressState.intimacy).toBe(2);
    state = choose(state, "close");
    expect(state.loverState.active).toBe(false);
    expect(state.eventQueue).toEqual([]);
    expect(state.buffs.some((buff) => buff.actionEffects?.idea?.extraActions === 2)).toBe(true);
    state = choose(choose(choose(activity(state, 2), "continue"), "opposite-scholar"), "close");
    expect(state.eventQueue[0]?.chainId).toBe("lover-development");
    expect(state.conferenceEncounterState.scholars?.smart?.encounterCount).toBe(2);
  });

  it("keeps a lover at exactly zero intimacy without renaming a contact", () => {
    const state = withLover(0.3);
    const result = settle(state, { loverIntimacyDelta: -0.3 });
    expect(result.loverProgressState.intimacy).toBe(0);
    expect(result.loverState).toEqual(state.loverState);
    expect(result.relationshipState.loverCount).toBe(1);
    expect(result.buffs).toHaveLength(2);
  });

  it("ends a negative-intimacy relationship and clears only its linked buffs", () => {
    const state = withLover(0.2);
    const result = settle(state, { loverIntimacyDelta: -0.3 });
    expect(result.loverState.active).toBe(false);
    expect(result.relationshipState.loverCount).toBe(0);
    expect(result.buffs.map((buff) => buff.id)).toEqual(["other"]);
    expect(JSON.stringify(result.log)).toContain("陈星与你结束了恋爱关系");
    expect(state.loverProgressState.intimacy).toBe(0.2);
  });

  it("preserves the accepted enterprise offer in real monthly effects", () => {
    const initial = createStartedGameState("normal");
    const offer: InternshipOffer = {
      id: "company-offer", company: "测试公司", position: "研究实习生",
      baseMonthlyIncome: 2, monthlySanCost: 6, experimentBonus: 4,
    };
    const state = settle(initial, { internshipStateUpdates: { active: true, kind: "conference6", offer } });
    expect(state.internshipState.offer).toEqual(offer);
    expect(state.conferenceCareerState.lastInternshipOffer).toEqual(offer);
    expect(hasInternshipExperience(state)).toBe(true);
    expect(getInternshipMonthlyStats(state)).toEqual({ san: -6, money: 2 });
    expect(getInternshipExperimentEffect(state)).toEqual({ bonus: 4, multiplier: 1.25, moneyDiscount: 2 });
  });

  it("records remote internship experience at acceptance, including its pending month", () => {
    const initial = createStartedGameState("normal");
    const state = settle({ ...initial, totalResearchScore: 2 }, { internshipStateUpdates: { kind: "remote3", active: true } });
    expect(state.internshipState.kind).toBe("remote3");
    expect(state.internshipState.startTotalMonths).toBe(initial.totalMonths + 1);
    expect(hasInternshipExperience(state)).toBe(true);
    expect(getInternshipMonthlyStats(state)).toEqual({ san: 0, money: 0 });
  });

  it("does not replace an ongoing offer or increase its experiment multiplier", () => {
    const initial = createStartedGameState("normal");
    const state = settle(initial, { internshipStateUpdates: { active: true, kind: "conference6" } });
    const repeated = settle(state, { internshipStateUpdates: { active: true }, triggerInternshipInvite: true });
    expect(repeated.internshipState).toEqual(state.internshipState);
    expect(repeated.eventQueue).toEqual(state.eventQueue);
  });

  it("places the internship debug entry with the conference derivatives", () => {
    expect(DEBUG_EVENT_GROUPS.find((group) => group.title === "论文相关")?.buttons.map((button) => button.id))
      .toContain("internship-invite");
    expect(DEBUG_EVENT_GROUPS.find((group) => group.title === "毕业相关")?.buttons.map((button) => button.id))
      .not.toContain("internship-invite");
  });
});
