import { afterEach, describe, expect, it, vi } from "vitest";
import { CAREER_JOBS, type CareerType } from "../src/core/v2-career-rules";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent, refreshPendingEventDecisions } from "../src/core/v2-engine-event-resolution";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import * as randomSource from "../src/core/v2-game-random";
import { CAREER_INTERVIEW_SAN_COST, createCareerRecruitmentEvent, refreshCareerRecruitmentEvent } from "../src/core/v2-monthly-career-events";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function ready(san = 4): GameState {
  const base = createStartedGameState("genius");
  return { ...base, degree: "phd", year: 6, month: 4, totalMonths: 64, maxMonths: 70,
    selectedAdvisorName: "王老师", eventQueue: [], buffs: [],
    player: { ...base.player, research: 20, san, money: 100 },
    actionState: { ...base.actionState, used: 0 }, randomState: { seed: 12345, cursor: 17 } };
}

function direction(root: PendingEvent, type: CareerType): PendingEvent {
  return root.choices.find(choice => choice.id === `choose-${type}`)!.effects.enqueueEvents![0]!;
}

function career(state: GameState) {
  return state.eventQueue.find(event => event.source === "career")!;
}

function choose(state: GameState, choiceId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId: career(state).id, eventChoiceId: choiceId });
}

afterEach(() => vi.restoreAllMocks());

describe("career recruitment payment refresh", () => {
  it("lets an upright genius rest from SAN 4 to 6 and complete the existing civil-service interview", () => {
    const initial = ready();
    const root = createCareerRecruitmentEvent(initial, () => 0);
    let current = choose(enqueueEventQueueItem(initial, root), "choose-civilService");
    const original = career(current);
    const job = original.choices[0]!;
    const frozenResult = structuredClone(job.effects.enqueueEvents);
    expect(job.disabledReason).toBe("SAN 不足，需要 6");

    current = dispatchAction(current, "rest");
    expect(current.player.san).toBe(6);
    const refreshed = getResolvableQueuedEvent(current, career(current));
    expect(refreshed.id).toBe(original.id);
    expect(refreshed.choices[0]!.disabledReason).toBeUndefined();
    expect(refreshed.choices[0]!.effects.enqueueEvents).toEqual(frozenResult);
    current = choose(current, job.id);
    expect(career(current).stage).toBe("result");
    expect(current.player.san).toBe(6);
    current = choose(current, "accept-offer");
    expect(current.player.san).toBe(0);
    expect(current.careerOffers.civilService?.jobId).toBe(CAREER_JOBS.civilService[0]!.id);
    expect(current.careerInterviewExperience.civilService).toBe(5);
    expect(current.careerLastRecruitmentTotalMonths).toBe(64);
  });

  it.each(["internet", "stateOwned", "academic"] as const)("updates %s eligibility in both directions without changing jobs or results", type => {
    const cost = CAREER_INTERVIEW_SAN_COST[type];
    const initial = ready(cost - 1);
    const draw = vi.fn(() => 0.9);
    const event = direction(createCareerRecruitmentEvent(initial, draw), type);
    const frozen = structuredClone(event);
    const count = draw.mock.calls.length;
    const random = vi.spyOn(randomSource, "gameRandom").mockImplementation(() => { throw new Error("refresh rerolled an interview"); });
    const enough = { ...initial, player: { ...initial.player, san: cost } };
    const refreshed = refreshCareerRecruitmentEvent(enough, event);
    expect(refreshed.choices.every(choice => !choice.disabledReason)).toBe(true);
    expect(refreshed.choices.map(choice => choice.effects)).toEqual(event.choices.map(choice => choice.effects));
    expect(refreshed.choices.map(choice => [choice.id, choice.label])).toEqual(event.choices.map(choice => [choice.id, choice.label]));
    expect(refreshCareerRecruitmentEvent(enough, refreshed)).toBe(refreshed);
    expect(refreshCareerRecruitmentEvent(initial, refreshed)).toEqual(event);
    expect(event).toEqual(frozen);
    expect(draw).toHaveBeenCalledTimes(count);
    expect(random).not.toHaveBeenCalled();
  });

  it("refreshes all nested act-one directions after recovery and serialization without advancing random state", () => {
    const initial = ready(2);
    const root = createCareerRecruitmentEvent(initial, () => 0.5);
    const queued = enqueueEventQueueItem(initial, root);
    const recovered = { ...queued, player: { ...queued.player, san: 6 } };
    const saved: GameState = JSON.parse(JSON.stringify(recovered));
    const snapshot = structuredClone(saved);
    const random = vi.spyOn(randomSource, "gameRandom").mockImplementation(() => { throw new Error("refresh consumed RNG"); });
    const refreshed = refreshPendingEventDecisions(saved);
    expect(refreshed.randomState).toEqual(snapshot.randomState);
    expect(career(refreshed)).toMatchObject({ id: career(saved).id, queueOrder: career(saved).queueOrder, stage: "act1" });
    for (const type of ["internet", "stateOwned", "civilService", "academic"] as const) {
      const before = direction(career(saved), type);
      const after = direction(career(refreshed), type);
      expect(before.choices.every(choice => Boolean(choice.disabledReason))).toBe(true);
      expect(after.choices.every(choice => !choice.disabledReason)).toBe(true);
      expect(after.choices.map(choice => choice.effects)).toEqual(before.choices.map(choice => choice.effects));
    }
    expect(refreshPendingEventDecisions(JSON.parse(JSON.stringify(refreshed)))).toEqual(refreshed);
    expect(saved).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    const selected = choose(refreshed, "choose-internet");
    expect(career(selected).choices.every(choice => !choice.disabledReason)).toBe(true);
  });

  it("uses the frozen result cost when current seasonal modifiers differ", () => {
    const initial = ready(4);
    const event = direction(createCareerRecruitmentEvent(initial, () => 0), "internet");
    const differentMonth = { ...initial, month: 12, totalMonths: 72 };
    expect(refreshCareerRecruitmentEvent(differentMonth, event).choices[0]!.disabledReason).toBe("SAN 不足，需要 6");
    const enough = { ...differentMonth, player: { ...differentMonth.player, san: 6 } };
    const refreshed = refreshCareerRecruitmentEvent(enough, event);
    expect(refreshed.choices[0]!.disabledReason).toBeUndefined();
    expect(refreshed.choices[0]!.effects.enqueueEvents).toBe(event.choices[0]!.effects.enqueueEvents);
  });

  it("updates gold payment eligibility when the switch or available coins change", () => {
    const initial = ready(0);
    initial.roleTalents = { levels: { "gold-power-alpha": 1 }, goldPowerEnabled: false };
    const event = direction(createCareerRecruitmentEvent(initial, () => 0), "internet");
    const enabled = { ...initial, roleTalents: { ...initial.roleTalents, goldPowerEnabled: true }, player: { ...initial.player, money: 6 } };
    const available = refreshCareerRecruitmentEvent(enabled, event);
    expect(available.choices[0]!.disabledReason).toBeUndefined();
    const short = { ...enabled, player: { ...enabled.player, money: 5.99 } };
    expect(refreshCareerRecruitmentEvent(short, available).choices[0]!.disabledReason).toBe("SAN 不足，需要 6");
    expect(refreshCareerRecruitmentEvent(initial, available).choices[0]!.disabledReason).toBe("SAN 不足，需要 6");
    let current = enqueueEventQueueItem(enabled, available);
    current = choose(current, available.choices[0]!.id);
    current = choose(current, "accept-offer");
    expect(current.player).toMatchObject({ money: 0, san: 0 });
    expect(current.careerInterviewExperience.internet).toBe(5);
  });

  it("updates beta eligibility as its monthly use or SAN cap changes", () => {
    const initial = ready(0);
    initial.roleTalents = { levels: { "burning-life-beta": 1 }, betaUsedMonth: initial.totalMonths };
    const event = direction(createCareerRecruitmentEvent(initial, () => 0), "internet");
    const availableState = { ...initial, roleTalents: { ...initial.roleTalents, betaUsedMonth: initial.totalMonths - 1 } };
    const available = refreshCareerRecruitmentEvent(availableState, event);
    expect(available.choices[0]!.disabledReason).toBeUndefined();
    expect(refreshCareerRecruitmentEvent(initial, available).choices[0]!.disabledReason).toBe("SAN 不足，需要 6");
    expect(refreshCareerRecruitmentEvent({ ...availableState, sanCap: 0 }, available).choices[0]!.disabledReason).toBe("SAN 不足，需要 6");
    let current = enqueueEventQueueItem(availableState, available);
    current = choose(current, available.choices[0]!.id);
    current = choose(current, "accept-offer");
    expect(current.player.san).toBe(0);
    expect(current.sanCap).toBe(availableState.sanCap - 1);
    expect(current.roleTalents?.betaUsedMonth).toBe(initial.totalMonths);
  });

  it("preserves frozen eligibility for r62 recordings through both refresh paths", () => {
    const initial = ready(4);
    const root = createCareerRecruitmentEvent(initial, () => 0);
    for (const event of [root, direction(root, "internet")]) {
      const recovered = enqueueEventQueueItem({ ...initial, player: { ...initial.player, san: 6 } }, event);
      withGameplayRuleset("20261108-r62", () => {
        expect(refreshCareerRecruitmentEvent(recovered, event)).toBe(event);
        expect(refreshPendingEventDecisions(recovered)).toBe(recovered);
        expect(getResolvableQueuedEvent(recovered, career(recovered))).toEqual(career(recovered));
      });
    }
  });
});
