import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "../src/core/v2-internship-events";
import { buildJointTrainingContext, createJointTrainingAct1 } from "../src/core/v2-joint-training-events";
import type { EventQueueItem, GameState, RoleId } from "../src/core/v2-types";

function started(roleId: RoleId = "normal"): GameState {
  return dispatchAction({ ...createInitialState(), randomState: { seed: 123, cursor: 0 } }, "start-game", { roleId });
}

function base(): GameState {
  const initial = started();
  return dispatchAction({
    ...initial, month: 6, totalMonths: 6, selectedAdvisorName: "测试导师", eventQueue: [], pendingRandomEvents: [],
    player: { ...initial.player, san: 20, money: 30 },
  }, "resolve-event", { eventId: "fixture-initialize" });
}

function current(state: GameState, chainId: string): EventQueueItem {
  const event = state.eventQueue.find((entry) => entry.chainId === chainId);
  if (!event) throw new Error(`Missing event: ${chainId}`);
  return event;
}

function choose(state: GameState, chainId: string, eventChoiceId: string): GameState {
  return dispatchAction(state, "resolve-event", { eventId: current(state, chainId).id, eventChoiceId });
}

function rewind(state: GameState, chainId: string, eventHistoryIndex: number): GameState {
  return dispatchAction(state, "replay-event", { eventId: current(state, chainId).id, eventHistoryIndex });
}

describe("universal event replay invitation randomness", () => {
  it("keeps the internship company, direction and every option's offer fixed across rewinds and reloads", () => {
    const original = base();
    const chain = "internship-invite";
    const root = createInternshipInviteAct1(buildInternshipInviteContext(original));
    let state = choose({ ...original, eventQueue: [createEventQueueItem(root, 1)] }, chain, "continue");
    const decision = structuredClone(current(state, chain));
    const stream = structuredClone(original.randomState);
    expect(state.randomState).toEqual(stream);
    expect(decision.internshipInvitePreview?.context.lead).toBeDefined();
    const offers = new Map<string, unknown>();

    for (let round = 0; round < 4; round++) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      state = choose(rewind(state, chain, 0), chain, "continue");
      expect(current(state, chain).internshipInvitePreview?.context.lead)
        .toEqual(decision.internshipInvitePreview?.context.lead);
      for (const id of ["accept", "decline"]) {
        state = choose(state, chain, id);
        const offer = current(state, chain).internshipInvitePreview!.context.offer;
        expect(offer.id).not.toBe("pending");
        if (!offers.has(id)) offers.set(id, structuredClone(offer));
        expect(offer).toEqual(offers.get(id));
        expect(state.randomState).toEqual(stream);
        expect(state.internshipState).toEqual(original.internshipState);
        expect(state.conferenceCareerState).toEqual(original.conferenceCareerState);
        expect(state.player).toEqual(original.player);
        expect(state.eventHistory).toEqual(original.eventHistory);
        state = rewind(state, chain, 1);
      }
    }

    state = choose(state, chain, "accept");
    state = choose(state, chain, "close");
    expect(state.internshipState.active).toBe(true);
    expect(state.internshipState.offer).toEqual(offers.get("accept"));
    expect(state.eventHistory.filter((event) => event.chainId === chain)).toHaveLength(1);
  });

  it("keeps joint training support fixed without consuming the run stream or stacking preview rewards", () => {
    const original = base();
    const chain = "joint-training";
    const root = createJointTrainingAct1(buildJointTrainingContext(original, undefined, () => 0.5));
    let state = choose({ ...original, eventQueue: [createEventQueueItem(root, 1)] }, chain, "continue");
    const stream = structuredClone(original.randomState);
    let expected: EventQueueItem["jointTrainingPreview"];

    for (let round = 0; round < 6; round++) {
      state = choose(state, chain, "accept");
      const preview = current(state, chain).jointTrainingPreview!;
      expected ??= structuredClone(preview);
      expect(preview).toEqual(expected);
      expect(preview.context.supportLevel).toBeDefined();
      expect(state.randomState).toEqual(stream);
      expect(state.buffs).toEqual(original.buffs);
      expect(state.researchCapacityState).toEqual(original.researchCapacityState);
      expect(state.conferenceEncounterState).toEqual(original.conferenceEncounterState);
      expect(state.eventHistory).toEqual(original.eventHistory);
      state = rewind(JSON.parse(JSON.stringify(state)) as GameState, chain, 1);
      state = choose(state, chain, "decline");
      state = rewind(state, chain, 1);
    }

    state = choose(state, chain, "accept");
    const result = current(state, chain);
    state = choose(state, chain, "close");
    expect(state.conferenceEncounterState.jointTrainingReward?.ideaBonus).toBe(4 + expected!.context.supportLevel!);
    expect(state.eventHistory.filter((event) => event.chainId === chain)).toHaveLength(1);
    expect(dispatchAction(state, "replay-event", { eventId: result.id, eventHistoryIndex: 1 })).toEqual(state);
  });

  it.each(["normal", "research-captain"] as const)("preserves intentional name and advisor rerolls for %s", (roleId) => {
    let state = started(roleId);
    const chain = "before-grad-school";
    const names = new Set<string>();
    for (let attempt = 0; attempt < 10; attempt++) {
      state = choose(state, chain, "before-grad-school-reroll-name");
      const choice = current(state, chain).choices.find((entry) => entry.id === "before-grad-school-open-advisor-info")!;
      names.add(choice.effects.fixedEventResolution!.studentName!);
    }
    expect(names.size).toBeGreaterThan(2);

    state = choose(state, chain, "before-grad-school-open-advisor-info");
    const advisors = new Set<string>();
    const tags = new Set<string>();
    for (let attempt = 0; attempt < 10; attempt++) {
      state = choose(state, chain, "before-grad-school-reroll");
      const choice = current(state, chain).choices.find((entry) => entry.id === "before-grad-school-confirm")!;
      const candidate = choice.effects.fixedEventResolution!.advisorCandidate!;
      advisors.add(candidate.advisorName);
      if (candidate.captainTag) tags.add(candidate.captainTag);
    }
    expect(advisors.size).toBeGreaterThan(2);
    if (roleId === "research-captain") expect(tags.size).toBeGreaterThan(1);
  });
});
