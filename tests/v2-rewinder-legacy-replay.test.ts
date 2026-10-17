import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { applyRewinderGrowth, captureRewinderGrowth, mergeRewinderGrowth } from "../src/core/v2-rewinder-growth";
import { normalizeRewinderArchive } from "../src/core/v2-rewinder";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createRunReplay, executeReplayCommand, replayStateDigest, verifyRunReplay } from "../src/core/v2-run-replay";
import type { ReplayCommand } from "../src/core/v2-run-replay";
import type { RewinderArchive } from "../src/core/v2-rewinder-state";
import type { GameState } from "../src/core/v2-types";

// Digests were generated from the original r6 rewinder modules at the recorded
// commit, not from this implementation. The fixture keeps the actual old schema.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/rewinder-r6-replay.json", import.meta.url), "utf8")) as {
  seed: number; archive: RewinderArchive;
  expectedDigests: Record<"started" | "pending" | "completed", string>;
};
const start: ReplayCommand & { kind: "action" } = {
  kind: "action", actionId: "start-game", payload: { roleId: "rewinder", rewinderArchive: fixture.archive }, ruleset: "20261017-r6",
};

function initial(): GameState {
  return { ...createInitialState(), randomState: { seed: fixture.seed, cursor: 0 } };
}

function yearEnd(started = executeReplayCommand(initial(), start)): GameState {
  return { ...started, year: 1, month: 12, totalMonths: 12, selectedAdvisorName: "测试导师",
    eventQueue: [], availableRandomEvents: [], randomState: { seed: fixture.seed, cursor: 0 },
    player: { san: 20, research: 5, social: 5, favor: 5, money: 100 } };
}

function confirmCommand(state: GameState, ruleset: "20261017-r6" | "20261018-r7"): ReplayCommand {
  return { kind: "action", actionId: "resolve-event", ruleset, payload: {
    eventId: state.eventQueue.find(event => event.rewinderPresentation)!.id, eventChoiceId: "confirm-rewinder-year",
  } };
}

describe("rewinder growth replay rules", () => {
  it("keeps the original r6 starting archive and state digest", () => {
    const started = executeReplayCommand(initial(), start);
    expect(started.rewinderState?.history).toEqual(fixture.archive);
    expect(started.rewinderState?.history.years[1]?.growth.growth).not.toHaveProperty("paperMasteryCount");
    expect(replayStateDigest(started)).toBe(fixture.expectedDigests.started);
    expect(withGameplayRuleset("20261017-r6", () => normalizeRewinderArchive(fixture.archive))).toEqual(fixture.archive);
  });

  it("reproduces the original r6 annual preview, inheritance and confirmation digests", () => {
    const started = executeReplayCommand(initial(), start);
    const before = yearEnd(started);
    const advance: ReplayCommand = { kind: "action", actionId: "next-month", payload: {}, ruleset: "20261017-r6" };
    const pending = executeReplayCommand(before, advance);
    expect(replayStateDigest(pending)).toBe(fixture.expectedDigests.pending);
    const confirmation = confirmCommand(pending, "20261017-r6");
    const completed = executeReplayCommand(pending, confirmation);
    expect(replayStateDigest(completed)).toBe(fixture.expectedDigests.completed);
    expect(completed.eventCounters).toMatchObject({ teachersDayErrandCount: 7, meetingCount: 8,
      domesticMeetingCount: 3, asiaMeetingCount: 2, westMeetingCount: 3 });
    expect(completed.internshipCount).toBe(3);
    expect(completed.conferenceCareerState.hasInternshipExperience).toBe(true);
    expect(completed.conferenceEncounterState.bigBullCooperation).toBe(true);
    expect(completed.rewinderState?.records.years[1]?.growth.growth).not.toHaveProperty("paperMasteryCount");

    const replay = createRunReplay(initial(), started, start.payload);
    replay.ruleset = "20261017-r6";
    replay.commands = [start, advance, confirmation];
    expect(verifyRunReplay(replay, { index: 1, state: before }, completed)).not.toBeNull();
  });

  it("uses only modern growth when an old run continues under r7", () => {
    const before = yearEnd();
    const original = structuredClone(before);
    const pending = executeReplayCommand(before, { kind: "action", actionId: "next-month", payload: {}, ruleset: "20261018-r7" });
    const completed = executeReplayCommand(pending, confirmCommand(pending, "20261018-r7"));
    expect(completed.player.research).toBe(18);
    expect(completed.readingState.readCount).toBe(29);
    expect(completed.eventCounters).toMatchObject({ teachersDayErrandCount: 0, meetingCount: 0,
      domesticMeetingCount: 0, asiaMeetingCount: 0, westMeetingCount: 0 });
    expect(completed.internshipCount).toBe(0);
    expect(completed.conferenceCareerState.hasInternshipExperience).not.toBe(true);
    expect(completed.conferenceEncounterState.bigBullCooperation).not.toBe(true);
    const record = completed.rewinderState!.records.years[1]!.growth.growth;
    expect(record.paperMasteryCount).toBe(0);
    for (const key of ["teachersDayErrandCount", "meetingCount", "internshipCount", "hasInternshipExperience", "hasJointTrainingExperience"]) {
      expect(record).not.toHaveProperty(key);
    }
    expect(before).toEqual(original);
  });

  it("normalizes and merges modern mastery while stripping obsolete growth fields", () => {
    const archive = structuredClone(fixture.archive);
    archive.years[1]!.growth.growth.paperMasteryCount = 8;
    const normalized = normalizeRewinderArchive(archive);
    const growth = normalized.years[1]!.growth;
    expect(growth.growth.paperMasteryCount).toBe(8);
    expect(growth.growth).not.toHaveProperty("teachersDayErrandCount");
    const current = yearEnd();
    const restored = applyRewinderGrowth(current, growth);
    expect(restored.paperMasteryState).toEqual({ count: 8, rewardedPaperIds: [] });
    expect(restored.buffs).toEqual(current.buffs);
    for (const key of ["teachersDayErrandCount", "meetingCount", "domesticMeetingCount", "asiaMeetingCount", "westMeetingCount"] as const) {
      expect(restored.eventCounters[key]).toBe(current.eventCounters[key]);
    }
    const merged = mergeRewinderGrowth(archive.years[1]!.growth, captureRewinderGrowth(current));
    expect(merged.growth).toEqual(growth.growth);
    // Legacy replay still requires its two historical experience flags.
    delete archive.years[1]!.growth.growth.hasInternshipExperience;
    expect(withGameplayRuleset("20261017-r6", () => normalizeRewinderArchive(archive))).toEqual({ years: {} });
    expect(normalizeRewinderArchive(archive).years[1]).toBeDefined();
  });
});
