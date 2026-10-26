import { describe, expect, it, vi } from "vitest";
import { createOfficialReplayStats } from "../src/app/v2-official-replay-stats";

const id = "official-normal-phd-10";
describe("official replay aggregate plays", () => {
  it("loads once, counts each opened recording once and keeps newer counts", async () => {
    let finishRead!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>((url) => String(url).includes("/get_")
      ? new Promise(resolve => { finishRead = resolve; })
      : Promise.resolve(Response.json(4)));
    const stats = createOfficialReplayStats({ fetch, enabled: true, writeEnabled: true });
    const loading = stats.load();
    expect(stats.load()).toBe(loading);
    await stats.track(id);
    await stats.track(id);
    finishRead(Response.json({ [id]: 2, "unknown-id": 900 }));
    await loading;
    expect(stats.get(id)).toBe(4);
    expect(stats.get("unknown-id")).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ p_replay_id: id });
  });
  it("does not count downloads, unknown/retired recordings or local previews", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ [id]: 9 }));
    const stats = createOfficialReplayStats({ fetch, enabled: true, writeEnabled: false });
    await stats.track(id);
    expect(fetch).not.toHaveBeenCalled();
    await stats.load();
    expect(stats.get(id)).toBe(9);
    const live = createOfficialReplayStats({ fetch, enabled: true, writeEnabled: true });
    await live.track("official-normal-phd-20");
    await live.track("untrusted-id");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps failures unknown without blocking or retrying increments", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline"); });
    const stats = createOfficialReplayStats({ fetch, enabled: true, writeEnabled: true });
    await stats.load(); await stats.track(id); await stats.track(id);
    expect(stats.get(id)).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    stats.dispose(); await stats.track("official-genius-phd-10");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
