import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { deriveReplayResults, getReplayResults } from "../src/app/v2-replay-results";
import { createInitialState } from "../src/core/v2-engine";
import { parseReplayRecording } from "../src/core/v2-local-replay";
import { replayStateDigest } from "../src/core/v2-run-replay";
import manifest from "../src/app/v2-official-replay-manifest.json";

describe("replay result facts", () => {
  it("derives final metrics and caps from a verified official run", async () => {
    const recording = parseReplayRecording(await readFile("public/official-replays/normal-phd-10.json", "utf8"));
    const before = JSON.stringify(recording);
    const result = await getReplayResults(recording);
    const entry = manifest.find(item => item.id === recording.id)!;
    expect(result.researchScore).toBe(entry.score);
    expect(result.money).toBe(entry.metrics.money);
    expect(result.attributes).toEqual(entry.metrics.attributes);
    expect(JSON.stringify(recording)).toBe(before);
  });

  it("reads unfinished metrics without modifying the state or settling achievements", () => {
    const state = createInitialState();
    state.runAchievementIds = ["global:academic-star"];
    const before = replayStateDigest(state);
    const result = deriveReplayResults(state);
    expect(result.attributes).toHaveLength(4);
    expect(result.money).toBe(state.player.money);
    expect(replayStateDigest(state)).toBe(before);
    expect(state.runAchievementIds).toEqual(["global:academic-star"]);
  });
});
