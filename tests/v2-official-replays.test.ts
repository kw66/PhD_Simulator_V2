import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "../src/app/v2-official-replay-manifest.json";
import { deriveReplayResults } from "../src/app/v2-replay-results";
import { parseReplayRecording, verifyReplayRecording } from "../src/core/v2-local-replay";
import { CURRENT_GAMEPLAY_RULESET } from "../src/core/v2-rule-context";
import { getDesignedTalentNodes, sanitizeRoleTalentAllocation } from "../src/core/v2-role-talent-definitions";
import type { RoleId } from "../src/core/v2-types";
import { createInitialState } from "../src/core/v2-engine";

describe("published official teaching replays", () => {
  it("covers all twelve upright and reversed roles for master 10 and doctoral 10/20 routes", () => {
    const roles = ["normal", "genius", "rich", "teacher-child", "social", "chosen"];
    const expected = [...roles, ...roles.map(role => `${role}-reversed`)].sort();
    for (const route of ["master-10", "phd-10", "phd-20"]) {
      expect(manifest.filter(entry => entry.route === route).map(entry => entry.roleId).sort()).toEqual(expected);
    }
  });

  it("ships exactly the files listed in the library", async () => {
    const files = (await readdir("public/official-replays")).filter(file => file.endsWith(".json"));
    expect(files.sort()).toEqual(manifest.map(entry => entry.file).sort());
    expect(new Set(manifest.map(entry => entry.id)).size).toBe(manifest.length);
  });

  it.each(manifest)("reproduces $id with legal talents and the advertised graduation and metrics", async entry => {
    const recording = parseReplayRecording(await readFile(`public/official-replays/${entry.file}`, "utf8"));
    expect(recording.id).toBe(entry.id);
    expect(recording.replay.ruleset).toBe(CURRENT_GAMEPLAY_RULESET);
    expect(recording.replay.initial).toEqual({ ...createInitialState(), randomState: recording.replay.initial.randomState });
    expect(recording.finalDigest).toBe(entry.finalDigest);
    expect(recording.replay.commands).toHaveLength(entry.commands);
    const start = recording.replay.commands[0]!;
    expect(start.kind).toBe("action");
    if (start.kind !== "action") throw new Error("Missing enrollment");
    expect(start.actionId).toBe("start-game");
    expect(start.payload.roleId).toBe(entry.roleId);
    expect(start.payload.bonusTalentPoints ?? 0).toBe(0);
    const budget = Number(entry.route.split("-").at(-1));
    const allocation = start.payload.talentAllocation ?? {};
    const role = entry.roleId as RoleId;
    expect(sanitizeRoleTalentAllocation(role, budget === 20 ? 10 : 0, allocation, 0)).toEqual(allocation);
    expect(getDesignedTalentNodes(role)!.reduce((sum, node) => sum + node.cost * (allocation[node.id] ?? 0), 0)).toBe(budget);
    expect(recording.replay.commands.every(command => command.kind === "action" && !command.actionId.startsWith("debug-")
      && (command.ruleset ?? recording.replay.ruleset) === CURRENT_GAMEPLAY_RULESET)).toBe(true);
    const state = await verifyReplayRecording(recording, { yieldControl: async () => {} });
    expect(state.phase).toBe("finished");
    expect(state.ending).toBe(entry.degree);
    expect(state.degree).toBe(entry.degree);
    expect(state.totalMonths).toBe(entry.totalMonths);
    expect(deriveReplayResults(state)).toEqual({ researchScore: entry.score, ...entry.metrics });
  }, 30_000);
});
