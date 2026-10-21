import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeRemoteWrite, UPLOAD_KEEPALIVE_MAX_BYTES } from "../src/app/v2-upload-transport";
import { createStatisticsClient } from "../src/app/v2-statistics-client";
import { createAchievementStats } from "../src/app/v2-achievement-stats";
import { createRoleLevelStats } from "../src/app/v2-role-level-stats";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";

afterEach(() => vi.unstubAllGlobals());

describe("shared upload transport", () => {
  it("selects keepalive at dispatch time and bounds UTF-8 bytes", async () => {
    const page = { visibilityState: "visible" };
    vi.stubGlobal("document", page);
    let finish!: () => void;
    const first = serializeRemoteWrite("{}", async keepalive => {
      expect(keepalive).toBe(false);
      await new Promise<void>(resolve => { finish = resolve; });
    });
    const secondSend = vi.fn(async (keepalive: boolean) => keepalive);
    const second = serializeRemoteWrite("{}", secondSend);
    expect(secondSend).not.toHaveBeenCalled();
    page.visibilityState = "hidden";
    finish();
    await first;
    expect(await second).toBe(true);
    expect(await serializeRemoteWrite("字".repeat(UPLOAD_KEEPALIVE_MAX_BYTES / 3), async keepalive => keepalive)).toBe(true);
    expect(await serializeRemoteWrite("字".repeat(UPLOAD_KEEPALIVE_MAX_BYTES / 3 + 1), async keepalive => keepalive)).toBe(false);
    await expect(serializeRemoteWrite("{}", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(await serializeRemoteWrite("{}", async () => "next write")).toBe("next write");
  });

  it("serializes all three outboxes through body consumption without blocking reads", async () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    let consume!: () => void;
    const writes: RequestInit[] = [];
    const request = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).includes("/get_")) {
        expect(init?.keepalive).toBe(false);
        return Response.json({ epoch: DATA_EPOCH, value: 1 });
      }
      writes.push(init!);
      if (String(url).endsWith("stats_batch")) {
        const ids = JSON.parse(String(init?.body)).p_records.map((row: { payload: { p_id: string } }) => row.payload.p_id);
        return { ok: true, json: () => new Promise(resolve => { consume = () => resolve(ids); }) } as Response;
      }
      return Response.json(true);
    });
    const stats = createStatisticsClient({ fetch: request, storage });
    const achievements = createAchievementStats({ fetch: request, storage });
    const levels = createRoleLevelStats({ fetch: request, storage });
    try {
      stats.enqueue("journal", "run", "paper", { p_rule_version: "v2-journal-20261012", p_journal: "pami", p_score: 125, p_months: 2 });
      const writingStats = stats.flush();
      achievements.recordStartedPlayer();
      const writingAchievements = achievements.flush();
      const writingLevels = levels.syncAccount(createDefaultAccountProfile());
      await stats.load("get_phd_simulator_v2_test", {}, value => value);
      expect(writes).toHaveLength(1);
      consume();
      await Promise.all([writingStats, writingAchievements, writingLevels]);
      expect(writes).toHaveLength(3);
      expect(writes.every(init => init.keepalive === true)).toBe(true);
      expect(writes.every(init => new TextEncoder().encode(String(init.body)).byteLength <= UPLOAD_KEEPALIVE_MAX_BYTES)).toBe(true);
    } finally { stats.dispose(); achievements.dispose(); levels.dispose(); }
  });
});
