import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createBaseConferenceActivityOptions } from "../src/core/v2-conference-activity-base-options";
import { createConferenceActivityDecisionEvent } from "../src/core/v2-conference-activity-events";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createBeforeGradSchoolAct1Event, resolveStudentNameConfirmation, resolveAdvisorConfirmation, resolveAdvisorReroll } from "../src/core/v2-fixed-events-before-grad-school";
import { buildLoverDevelopmentContext, createLoverDevelopmentAct1 } from "../src/core/v2-lover-events";
import { buildJointTrainingContext } from "../src/core/v2-joint-training-events";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { getKnownPersonNames, getUniquePersonName } from "../src/core/v2-person-names";
import { pickStableRandomName } from "../src/core/v2-random-name";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

const context = { id: "r59-cvpr", conferenceName: "CVPR", conferenceYear: 2025,
  city: "北京", country: "中国", grade: "A" as const, paperCount: 1 };
function state(social = 1): GameState {
  const base = createStartedGameState("normal");
  return { ...base, playerName: "玩家甲", selectedAdvisorName: "导师乙", year: 2, month: 1, totalMonths: 13,
    eventQueue: [], player: { ...base.player, social, research: 12, san: 20, money: 30 } };
}
function apply(s: GameState, effects: EventChoice["effects"]) {
  return applyChoiceEffectsToState(s, { id: "test-choice", label: "确认", outcome: "", effects }).nextState;
}
function recruit(s: GameState, affinity = 1, name = "同学丙") {
  return apply(s, { fellowAdditions: [{ type: "peer", gender: "female", research: 4, affinity, name }] });
}
function buildState(s: GameState) {
  return { ...s, playerAttributeState: s, social: s.player.social, research: s.player.research };
}
function eventTree(event: PendingEvent): PendingEvent[] {
  return [event, ...event.choices.flatMap(choice => (choice.effects.enqueueEvents ?? []).flatMap(eventTree))];
}

describe("r59 initial social benefits", () => {
  it.each([[5.99, 0], [6, 1], [11.99, 1], [12, 2], [17.99, 2], [18, 3]] as const)(
    "adds the social tier once to a recruited fellow at social %s", (social, bonus) => {
      const recruited = recruit(state(social), 3);
      expect(recruited.fellowProgressState[0]!.affinity).toBe(3 + bonus);
      const changed = apply(recruited, { rawSocial: 1, social: 1 });
      expect(changed.fellowProgressState[0]!.affinity).toBe(3 + bonus);
    });

  it.each(["beautiful", "smart"] as const)("adds a fixed bonus after existing %s intimacy initialization", type => {
    for (const [social, bonus] of [[1, 0], [6, 1], [12, 2], [18, 3]]) {
      const s = state(social);
      const initial = createLoverProgressState(type, () => 0.99, s.year);
      const joined = apply(s, { loverStateUpdates: activateLover(type, s.totalMonths, "male"),
        activateLoverProgress: type, loverProgressRolls: [0.99, 0.99], relationshipAdditions: ["lover"] });
      expect(joined.loverProgressState.intimacy).toBeCloseTo(initial.intimacy + bonus);
      expect(apply(joined, {}).loverProgressState.intimacy).toBe(joined.loverProgressState.intimacy);
    }
  });

  it("only raises A conference tea breaks and still applies resistance", () => {
    for (const grade of ["A", "B", "C"] as const) {
      const tea = createBaseConferenceActivityOptions({ ...context, grade }, buildState(state(12)), () => 0)
        .find(option => option.id === "tea-break")!;
      expect(tea.effects.rawSocial).toBe(grade === "A" ? 2 : 1);
      expect(tea.effects.social).toBeCloseTo(grade === "A" ? 1.2 : 0.6);
    }
  });

  it("keeps old replay relationship and conference results", () => withGameplayRuleset("20261027-r58", () => {
    expect(recruit(state(18), 3).fellowProgressState[0]!.affinity).toBe(3);
    const s = state(18);
    const lover = apply(s, { loverStateUpdates: activateLover("smart", 13, "male"),
      activateLoverProgress: "smart", loverProgressRolls: [0.5, 0.5], relationshipAdditions: ["lover"] });
    expect(lover.loverProgressState.intimacy).toBe(createLoverProgressState("smart", () => 0.5, 2).intimacy);
    expect(createBaseConferenceActivityOptions(context, buildState(state(1)), () => 0)
      .find(option => option.id === "tea-break")!.effects.rawSocial).toBe(1);
  }));
});

describe("r59 distinct person names", () => {
  it("prevents player/advisor collisions even when every random draw is zero", () => {
    const s = state();
    s.playerName = null;
    s.selectedAdvisorName = null;
    const event = createBeforeGradSchoolAct1Event(s, () => 0);
    const playerResolution = event.choices[0]!.effects.fixedEventResolution!;
    const advisorInfo = event.choices[0]!.effects.enqueueEvents![0]!;
    const advisorResolution = advisorInfo.choices.find(choice => choice.effects.fixedEventResolution?.kind === "advisor-confirm")!.effects.fixedEventResolution!;
    const named = resolveStudentNameConfirmation(s, playerResolution).nextState;
    const joined = resolveAdvisorConfirmation(named, advisorResolution).nextState;
    expect(joined.playerName).not.toBe(joined.selectedAdvisorName);
    const reroll = advisorInfo.choices.find(choice => choice.effects.fixedEventResolution?.kind === "advisor-reroll")!.effects.fixedEventResolution!;
    const redrawn = resolveAdvisorReroll({ ...named, eventQueue: [advisorInfo as GameState["eventQueue"][number]] }, reroll, () => 0).nextState;
    expect(redrawn.eventQueue[0]!.narrativeNames).not.toContain(named.playerName);
  });

  it("does not change old replay enrollment names", () => withGameplayRuleset("20261027-r58", () => {
    const s = state(); s.playerName = null; s.selectedAdvisorName = null;
    const event = createBeforeGradSchoolAct1Event(s, () => 0);
    const advisor = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(event.narrativeNames![0]).toBe(advisor.narrativeNames![0]);
  }));

  it("avoids every existing category of person when a new fellow joins", () => {
    const s = state(18);
    s.loverState = { ...activateLover("smart", 10, "male"), name: "恋人丁" };
    s.conferenceEncounterState.bigBull = { id: "mentor-one", name: "学者戊", level: 2, cooperationCount: 1 };
    for (const occupied of getKnownPersonNames(s)) {
      const joined = recruit(s, 1, occupied);
      expect(getKnownPersonNames(s)).not.toContain(joined.fellowProgressState[0]!.name);
    }
  });

  it("keeps all conference candidates distinct from player, advisor and fellows", () => {
    const s = state(12);
    const first = createConferenceActivityDecisionEvent(context, buildState(s), "", () => 0);
    const contacts = first.conferenceActivityPreview!.contacts!;
    const collision = { ...s, playerName: contacts.bigBull!.name, selectedAdvisorName: contacts.scholars!.beautiful!.name,
      fellowProgressState: [createCustomFellowProgressProfile({ type: "peer", gender: "male", startTotalMonths: 1,
        research: 2, affinity: 1, name: contacts.scholars!.smart!.name })] };
    const regenerated = createConferenceActivityDecisionEvent(context, buildState(collision), "", () => 0);
    const names = regenerated.narrativeNames!;
    expect(new Set(names).size).toBe(3);
    expect(names.some(name => getKnownPersonNames(collision).includes(name))).toBe(false);
    const refreshed = createConferenceActivityDecisionEvent(context, buildState(collision), "", () => 0,
      regenerated.conferenceActivityPreview);
    expect(refreshed.narrativeNames).toEqual(names);
  });

  it("retains the chosen scholar identity as lover and excludes existing people for replacements", () => {
    const s = state(12);
    s.conferenceEncounterState.scholars = { smart: { id: "scholar-picked", name: "学者己", gender: "female", encounterCount: 3 } };
    const context = buildLoverDevelopmentContext({ state: s, conferenceEncounterState: s.conferenceEncounterState,
      type: "smart", totalMonths: s.totalMonths, playerGender: "male" }, () => 0.5);
    const result = eventTree(createLoverDevelopmentAct1(context)).find(event => event.id.includes("result-accept"))!;
    const joined = apply(s, result.choices[0]!.effects);
    expect(joined.loverState.name).toBe("学者己");
    expect(joined.loverState.contactId).toBe("scholar-picked");
    expect(getKnownPersonNames(s)).not.toContain(joined.conferenceEncounterState.scholars!.smart!.name);
    const joint = buildJointTrainingContext(joined, undefined, () => 0);
    expect(getKnownPersonNames(joined)).not.toContain(joint.replacement!.name);
  });

  it("falls back after exhausting the stable alternatives without returning an occupied name", () => {
    const names = ["李旭旭", ...Array.from({ length: 64 }, (_, index) => pickStableRandomName(`person:stress:${index}`))];
    expect(names).not.toContain(getUniquePersonName("李旭旭", names, "stress"));
  });
});
