import { describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { settleFellowAcademicYear } from "../src/core/v2-fellow-lifecycle";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createRandomEventPool } from "../src/core/v2-random-event-rules";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { createSocialCampusRandomEvent } from "../src/core/v2-random-events-campus-social";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { FellowProgressProfile, GameState, PendingEvent, RoleId } from "../src/core/v2-types";

function fellow(index: number, type: FellowProgressProfile["type"] = "junior", affinity = 1) {
  return createCustomFellowProgressProfile({ type, gender: "female", name: `Fellow ${index}`, startTotalMonths: 1,
    research: 4, affinity, academicYear: 1, academicStartTotalMonths: 1, identitySeed: String(index) });
}

function state(role: RoleId, levels: Record<string, number>, fellows: FellowProgressProfile[] = []): GameState {
  const initial = createStartedGameState(role);
  return { ...initial, roleTalents: { levels }, totalMonths: 6, year: 1, month: 6, eventQueue: [],
    selectedAdvisorName: "Advisor", player: { ...initial.player, social: 3, research: 3, favor: 3, money: 30, san: 20 },
    fellowProgressState: fellows, relationshipState: { ...initial.relationshipState,
      occupiedSlots: fellows.length, juniorCount: fellows.filter((item) => item.type === "junior").length,
      seniorCount: fellows.filter((item) => item.type === "senior").length, peerCount: fellows.filter((item) => item.type === "peer").length } };
}

function toResult(initial: GameState, root: PendingEvent, branch: string) {
  let next = { ...initial, eventQueue: [createEventQueueItem(root, 1)] };
  next = dispatchAction(next, "resolve-event", { eventId: root.id, eventChoiceId: root.choices[0]!.id });
  const decision = next.eventQueue.find((event) => event.chainId === root.chainId)!;
  const choice = decision.choices.find((entry) => entry.id.includes(branch))!;
  expect(choice, branch).toBeDefined();
  next = dispatchAction(next, "resolve-event", { eventId: decision.id, eventChoiceId: choice.id });
  return next;
}

function confirm(state: GameState, chain: string) {
  const result = state.eventQueue.find((event) => event.chainId === chain)!;
  return dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
}

describe("relationship role talent settlements", () => {
  it.each([[1, "-delegate-"], [2, "-delegate-"], [4, "-share-"], [12, "-transfer-"]] as const)(
    "applies delegation talents once at the final confirmation of random-%i", (id, branch) => {
      const initial = state("social", { "junior-delegation": 1, "junior-bond": 2 }, [fellow(1, "junior", 6), fellow(2, "junior", 6), fellow(3, "peer", 6)]);
      initial.papers = [{ ...createDraftPaper(6, 0, () => 0), idea: 3 }];
      const root = createRandomEventById(id, initial, () => 0.9).event!;
      const preview = toResult(initial, root, branch);
      expect(preview.player.social).toBe(3);
      expect(preview.fellowProgressState.map((item) => item.affinity)).toEqual([6, 6, 6]);
      const resultEvent = preview.eventQueue.find((event) => event.chainId === root.chainId)!;
      const result = confirm(preview, root.chainId!);
      expect(result.player.social).toBe(3);
      expect(result.fellowProgressState.map((item) => item.affinity)).toEqual([6, 7.6, 6]);
      const repeated = dispatchAction(result, "resolve-event", { eventId: resultEvent.id, eventChoiceId: resultEvent.choices[0]!.id });
      expect(repeated.fellowProgressState).toEqual(result.fellowProgressState);
    });

  it("does not grant delegation immunity or affinity without a junior", () => {
    const initial = state("social", { "junior-delegation": 1, "junior-bond": 3 }, [fellow(1, "peer")]);
    const root = createRandomEventById(2, initial, () => 0).event!;
    const result = confirm(toResult(initial, root, "-delegate-"), root.chainId!);
    expect(result.player.social).toBe(1);
    expect(result.fellowProgressState[0]!.affinity).toBe(1);
  });

  it.each([[10, "-short-term-"], [11, "-deep-"], [14, "-idea-"]] as const)(
    "converts actual full-capacity recruitment to social once for random-%i", (id, branch) => {
      const initial = state("social", { "overflow-social": 1 }, [fellow(1), fellow(2), fellow(3), fellow(4)]);
      initial.player.research = 6;
      initial.player.social = 6;
      const root = createRandomEventById(id, initial, () => 0).event!;
      const preview = toResult(initial, root, branch);
      expect(preview.player.social).toBe(6);
      const resultEvent = preview.eventQueue.find((event) => event.chainId === root.chainId)!;
      const result = confirm(preview, root.chainId!);
      expect(result.player.social).toBe(6.8);
      expect(result.player.san).toBe(initial.player.san);
      expect(result.fellowProgressState).toHaveLength(4);
      expect(dispatchAction(result, "resolve-event", { eventId: resultEvent.id, eventChoiceId: resultEvent.choices[0]!.id }).player.social).toBe(6.8);
    });

  it("only rewards an attempted new recruit, not declining the event", () => {
    const initial = state("social", { "overflow-social": 1 }, [fellow(1), fellow(2), fellow(3), fellow(4)]);
    const root = createRandomEventById(14, initial, () => 0).event!;
    const result = confirm(toResult(initial, root, "-decline-"), root.chainId!);
    expect(result.player.social).toBe(3);
    const assigned = createMentorAssignEvent(initial, () => 0);
    expect(confirm(toResult(initial, assigned, "select-1"), assigned.chainId!).player.social).toBe(4);
  });

  it("rank two overflow social grants two raw points through final event settlement", () => {
    const initial = state("social", { "overflow-social": 2 }, [fellow(1), fellow(2), fellow(3), fellow(4)]);
    initial.player.social = 18;
    const root = createRandomEventById(14, initial, () => 0).event!;
    const preview = toResult(initial, root, "-idea-");
    expect(preview.player.social).toBe(18);
    const result = confirm(preview, root.chainId!);
    expect(result.player.social).toBe(18.8);
  });

  it.each([0, 1, 2])("cancels a full-capacity reward when its recruit graduates after %i scenes", (scenes) => {
    let initial = state("social", { "overflow-social": 1 }, [fellow(1), fellow(2), fellow(3), fellow(4)]);
    initial = { ...initial, month: 10, totalMonths: 10, totalRandomEventCount: 4,
      player: { ...initial.player, social: 6, research: 6 }, relationshipState: { ...initial.relationshipState, unlockedSlots: 5 } };
    const rolls: number[] = [];
    const built = createRandomEventById(11, initial, () => { rolls.push(0); return 0; }).event!;
    const root = { ...built, randomReplay: { eventId: 11, serial: 4, rolls } };
    const candidate = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id.includes("-deep-"))!.effects.fellowOverflowCandidates![0]!;
    expect(candidate).toMatchObject({ academicYear: 6, degree: "phd", academicStartTotalMonths: 1 });
    let current = { ...initial, eventQueue: [createEventQueueItem(root, 1)] };
    for (let step = 0; step < 3; step++) {
      if (step === scenes) current = { ...current, month: 11, totalMonths: 11 };
      const event = current.eventQueue.find((entry) => entry.chainId === root.chainId)!;
      const choice = step === 1 ? event.choices.find((entry) => entry.id.includes("-deep-"))! : event.choices[0]!;
      current = dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
    }
    expect(current.fellowProgressState).toHaveLength(4);
    expect(current.player.social).toBe(6);
    expect(current.log.some((entry) => entry.text.includes("已离校"))).toBe(true);
  });

  it("rewards an actually added fellow and never a full-capacity attempt", () => {
    const initial = state("social-reversed", { "fellow-add-social": 2 });
    const root = createRandomEventById(14, initial, () => 0).event!;
    const preview = toResult(initial, root, "-idea-");
    expect(preview.player.social).toBe(3);
    const result = confirm(preview, root.chainId!);
    expect(result.fellowProgressState).toHaveLength(1);
    expect(result.player.social).toBe(5);
    const full = state("social-reversed", { "fellow-add-social": 2 }, [fellow(1), fellow(2), fellow(3), fellow(4)]);
    const fullRoot = createRandomEventById(14, full, () => 0).event!;
    expect(confirm(toResult(full, fullRoot, "-idea-"), fullRoot.chainId!).player.social).toBe(3);
  });

  it("converts seven whole affinity points and discards the fraction only on explicit removal", () => {
    const initial = state("social-reversed", { "fellow-remove-social": 1, "affinity-conversion": 1 }, [fellow(1, "peer", 7.6)]);
    initial.player.favor = 20;
    initial.player.research = 20;
    const removed = dispatchAction(initial, "end-relationship", { relationshipId: initial.fellowProgressState[0]!.id });
    expect(removed.fellowProgressState).toHaveLength(0);
    expect(removed.player.social).toBe(2);
    expect(removed.player.favor).toBe(20.8);
    expect(removed.player.research).toBe(20.8);
    expect(removed.sanCap).toBe(21);
    expect(removed.roleTalents?.capBonuses?.favor).toBe(1);
    expect(removed.researchCapacityState.otherCapBonus).toBe(1);
    expect(dispatchAction(removed, "end-relationship", { relationshipId: initial.fellowProgressState[0]!.id }).player).toEqual(removed.player);
  });

  it("does not treat natural graduation, the advisor or the lover as abandoning a fellow", () => {
    const initial = state("social-reversed", { "fellow-remove-social": 1, "affinity-conversion": 1 }, [fellow(1, "peer", 7.6)]);
    initial.fellowProgressState[0] = { ...initial.fellowProgressState[0]!, academicYear: 6, degree: "phd" };
    const departed = settleFellowAcademicYear({ ...initial, month: 10 });
    expect(departed.fellowProgressState).toHaveLength(0);
    expect(departed.player).toEqual(initial.player);
    expect(departed.sanCap).toBe(initial.sanCap);
    expect(dispatchAction(initial, "end-relationship", { relationshipId: "advisor" }).player).toEqual(initial.player);
    expect(dispatchAction(initial, "end-relationship", { relationshipId: "lover" }).player).toEqual(initial.player);
  });

  it("keeps removal talents inactive during the actual month-end graduation pipeline", () => {
    const initial = state("social-reversed", { "fellow-remove-social": 2, "affinity-conversion": 1 }, [fellow(1, "peer", 7.6)]);
    initial.month = 10;
    initial.totalMonths = 10;
    initial.fellowProgressState[0] = { ...initial.fellowProgressState[0]!, academicYear: 6, degree: "phd", initialResearchScore: 100 };
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const next = dispatchAction(initial, "next-month");
      expect(next.totalMonths).toBe(11);
      expect(next.fellowProgressState).toHaveLength(0);
      expect(next.player.social).toBe(initial.player.social);
      expect(next.roleTalents?.capBonuses?.favor ?? 0).toBe(0);
      expect(next.researchCapacityState.otherCapBonus).toBe(initial.researchCapacityState.otherCapBonus);
      expect(next.sanCap).toBe(initial.sanCap);
    } finally { random.mockRestore(); }
  });

  it("adds each role's annual tickets with the correct event IDs", () => {
    const social = createRandomEventPool(state("social", { "supporting-juniors": 1, "peer-camaraderie": 1, "senior-mentorship": 1 }));
    for (const id of [14, 10, 11]) expect(social.filter((entry) => entry === id)).toHaveLength(2);
    const jealous = createRandomEventPool(state("social-reversed", { "junior-event-focus": 4, "peer-event-focus": 3, "senior-event-focus": 2 }));
    expect(jealous.filter((id) => id === 14)).toHaveLength(5);
    expect(jealous.filter((id) => id === 10)).toHaveLength(4);
    expect(jealous.filter((id) => id === 11)).toHaveLength(3);
    const spoiled = createRandomEventPool(state("teacher-child-reversed", { "advisor-meeting-focus": 4, "group-meeting-focus": 3 }));
    expect(spoiled.filter((id) => id === 5)).toHaveLength(5);
    expect(spoiled.filter((id) => id === 6)).toHaveLength(4);
  });

  it("lets family host guarantee the advisor treats dinner with unchanged rewards", () => {
    const initial = state("teacher-child", { "family-host": 1 });
    const root = createSocialCampusRandomEvent(initial, () => 0.9999);
    const dinner = root.choices[0]!.effects.enqueueEvents![0]!.choices.find((choice) => choice.id.includes("-dinner-"))!;
    expect(dinner.outcome).toContain("100%");
    const result = confirm(toResult(initial, root, "-dinner-"), root.chainId!);
    expect(result.player.money).toBe(initial.player.money);
    expect(result.player.favor).toBe(4);
  });
});
