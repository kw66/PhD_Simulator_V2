import { describe, expect, it } from "vitest";
import { getRoleDefinition, getRoleOptions } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createConferenceScholarContact } from "../src/core/v2-conference-contacts";
import { createInitialState } from "../src/core/v2-engine";
import { createRunReplay, executeReplayCommand, verifyRunReplay, type ReplayCommand } from "../src/core/v2-run-replay";

const femaleRoles = ["special-fading-genius", "cursed-frail"] as const;
const oldVersions = ["20261016-r1", "20261017-r2", "20261017-r3", "20261017-r4"] as const;

describe("curse portrait gender and deterministic history", () => {
  it("provides two women and two men in the current role catalog", () => {
    const curseRoles = getRoleOptions().filter(role => [...femaleRoles, "special-finite-life", "cursed-debt"].includes(role.id));
    expect(curseRoles.filter(role => role.gender === "female").map(role => role.id).sort()).toEqual([...femaleRoles].sort());
    expect(curseRoles.filter(role => role.gender === "male").map(role => role.id).sort()).toEqual(["cursed-debt", "special-finite-life"]);
  });

  it.each(femaleRoles)("uses female honorifics and male prospective partners for %s without rewriting old events", roleId => {
    const state = createStartedGameState(roleId);
    const event = () => JSON.stringify(createRandomEventById(1, state, () => 0).event);
    const contact = () => createConferenceScholarContact("smart", { id: "curse-portrait", selectedRoleId: roleId });
    expect(event()).toContain("谢谢师姐");
    expect(contact().gender).toBe("male");
    for (const ruleset of oldVersions) {
      withGameplayRuleset(ruleset, () => {
        expect(getRoleDefinition(roleId).gender).toBe("male");
        expect(event()).toContain("谢谢师兄");
        expect(contact().gender).toBe("female");
      });
    }
    expect(getRoleDefinition(roleId).gender).toBe("female");
  });

  it.each(femaleRoles)("verifies a legacy %s opening followed by current commands", roleId => {
    const initial = createInitialState();
    initial.randomState = { seed: 1700000000, cursor: 0 };
    const first: ReplayCommand = { kind: "action", actionId: "start-game", payload: { roleId } };
    const started = executeReplayCommand(initial, first, "20261017-r4");
    const replay = createRunReplay(initial, started, first.payload);
    replay.ruleset = "20261017-r4";
    replay.commands = [first];
    expect(verifyRunReplay(replay, { state: initial, index: 0 }, started)).not.toBeNull();
    const event = started.eventQueue.find(item => item.chainId === "before-grad-school")!;
    const next: ReplayCommand = { kind: "action", actionId: "resolve-event", ruleset: "20261017-r5",
      payload: { eventId: event.id, eventChoiceId: "before-grad-school-open-advisor-info" } };
    replay.commands.push(next);
    const continued = executeReplayCommand(started, next, replay.ruleset);
    expect(verifyRunReplay(replay, { state: initial, index: 0 }, continued)).not.toBeNull();
    expect(replay.failed).toBeUndefined();
  });
});
