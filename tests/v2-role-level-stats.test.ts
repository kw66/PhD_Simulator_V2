import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRoleLevelStats, ROLE_LEVEL_STATS_STORAGE_KEY } from "../src/app/v2-role-level-stats";
import { renderRoleLevelStatsOverlay } from "../src/app/v2-render-role-level-stats";
import { DATA_EPOCH } from "../src/core/v2-data-epoch";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { CURSED_ROLE_IDS } from "../src/core/v2-curse-system";

const curseLevels = Object.fromEntries(CURSED_ROLE_IDS.map(id => [id, 0]));
function singleRoleAccount() {
  const account = createDefaultAccountProfile();
  for (const role of CURSED_ROLE_IDS) account.roleProgress[role].unlocked = false;
  return account;
}

const VISITOR_KEY = "phd_simulator_v2_activity_visitor_id";
const PLAYER = "71000000-0000-4000-8000-000000000001";
const OTHER = "71000000-0000-4000-8000-000000000002";
const controllers: ReturnType<typeof createRoleLevelStats>[] = [];
const snapshot = { version: 1, epoch: DATA_EPOCH, roles: { normal: { counts: [1, 0, 2, 0, 0, 1, 0, 0, 0, 0, 1] } } };
function storage() {
  const data = new Map<string, string>();
  data.set(VISITOR_KEY, PLAYER);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
function create(options: Parameters<typeof createRoleLevelStats>[0]) {
  const controller = createRoleLevelStats(options); controllers.push(controller); return controller;
}
function readSaved(saved: ReturnType<typeof storage>) {
  return JSON.parse(saved.getItem(ROLE_LEVEL_STATS_STORAGE_KEY)!);
}
function body(call: [RequestInfo | URL, RequestInit?]) {
  return JSON.parse(String(call[1]?.body));
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T06:00:00Z")); });
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("per-role player level statistics", () => {
  it("uploads only unlocked roles under the existing browser identity, then only upgrades", async () => {
    const saved = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: saved, fetch });
    const account = createDefaultAccountProfile();
    account.roleProgress.genius.level = 4; // Locked progress never enters the denominator.
    await client.syncAccount(account);
    await client.syncAccount(account);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body(fetch.mock.calls[0])).toEqual({ p_player_id: PLAYER, p_epoch: DATA_EPOCH, p_levels: { normal: 0, ...curseLevels } });
    account.roleProgress.normal.level = 2;
    account.roleProgress.genius.unlocked = true;
    await client.syncAccount(account);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body(fetch.mock.calls[1]).p_levels).toEqual({ normal: 2, genius: 4 });
    account.roleProgress.normal.level = 1;
    await client.syncAccount(account);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(readSaved(saved).pending).toEqual([]);
  });

  it("backfills missing browser records without uploading already-recorded level changes", async () => {
    const saved = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: saved, fetch });
    const account = createDefaultAccountProfile();
    account.roleProgress.normal.level = 3;
    await client.syncAccount(account, { missingOnly: true });
    expect(body(fetch.mock.calls[0]).p_levels).toEqual({ normal: 3, ...curseLevels });

    account.roleProgress.normal.level = 5;
    account.roleProgress.genius.unlocked = true;
    await client.syncAccount(account, { missingOnly: true });
    expect(body(fetch.mock.calls[1]).p_levels).toEqual({ genius: 0 });
    await client.syncAccount(account, { missingOnly: true });
    expect(fetch).toHaveBeenCalledTimes(2);

    await client.syncAccount(account);
    expect(body(fetch.mock.calls[2]).p_levels).toEqual({ normal: 5 });
    const restored = create({ storage: saved, fetch });
    account.roleProgress.normal.level = 6;
    await restored.syncAccount(account, { missingOnly: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never uploads or generates identities when disabled, while public reads still work", async () => {
    const saved = storage();
    saved.setItem(VISITOR_KEY, "");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(snapshot));
    const client = create({ storage: saved, fetch, uploadEnabled: false });
    const playgroundAccount = createDefaultAccountProfile();
    for (const progress of Object.values(playgroundAccount.roleProgress)) { progress.unlocked = true; progress.level = 10; }
    await client.syncAccount(playgroundAccount); await client.flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(saved.getItem(VISITOR_KEY)).toBe("");
    await client.load();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain("get_phd_simulator_v2_role_level_statistics");
    expect(client.read("normal").data?.players).toBe(5);
  });

  it("preserves failed snapshots across reloads with their original identity and backoff", async () => {
    const saved = storage();
    const failed = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline"); });
    const first = create({ storage: saved, fetch: failed });
    const account = singleRoleAccount(); account.roleProgress.normal.level = 3;
    await first.syncAccount(account); await first.syncAccount(account);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(readSaved(saved).pending).toEqual([{ playerId: PLAYER, roleId: "normal", level: 3 }]);
    first.dispose(); saved.setItem(VISITOR_KEY, OTHER);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const second = create({ storage: saved, fetch });
    await second.flush();
    expect(body(fetch.mock.calls[0])).toMatchObject({ p_player_id: PLAYER, p_levels: { normal: 3 } });
    expect(readSaved(saved).pending).toEqual([]);
  });

  it("merges tabs by highest level without resurrecting an acknowledged lower level", async () => {
    const saved = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const stale = create({ storage: saved, fetch });
    const newer = create({ storage: saved, fetch });
    const upgraded = singleRoleAccount(); upgraded.roleProgress.normal.level = 6;
    await newer.syncAccount(upgraded);
    const old = singleRoleAccount(); old.roleProgress.normal.level = 2;
    await stale.syncAccount(old); stale.dispose();
    const restored = create({ storage: saved, fetch }); await restored.syncAccount(old);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readSaved(saved).acknowledged).toEqual([{ playerId: PLAYER, roleId: "normal", level: 6 }]);
    expect(readSaved(saved).pending).toEqual([]);
  });

  it("keeps another tab's higher pending upgrade when the lower upload returns", async () => {
    const saved = storage();
    let accept: (response: Response) => void = () => {};
    const firstFetch = vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => { accept = resolve; }));
    const first = create({ storage: saved, fetch: firstFetch });
    const account = singleRoleAccount(); account.roleProgress.normal.level = 2;
    const uploading = first.syncAccount(account);
    const offline = create({ storage: saved, fetch: vi.fn(async () => { throw new Error("offline"); }) });
    account.roleProgress.normal.level = 5;
    const offlineUpload = offline.syncAccount(account);
    accept(Response.json(true)); await uploading;
    await offlineUpload;
    expect(readSaved(saved).pending).toEqual([{ playerId: PLAYER, roleId: "normal", level: 5 }]);
    expect(readSaved(saved).acknowledged).toEqual([{ playerId: PLAYER, roleId: "normal", level: 2 }]);
  });

  it("reads once per ten minutes and computes correct weighted mean and even/odd medians", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(snapshot));
    const onChange = vi.fn();
    const client = create({ storage: storage(), fetch, onChange });
    await Promise.all([client.load(), client.load()]);
    for (let i = 0; i < 50; i++) expect(client.read("normal")).toEqual({ status: "ready", data: {
      counts: snapshot.roles.normal.counts, players: 5, meanLevel: 3.8, medianLevel: 2, maxLevelPlayers: 1,
    } });
    await client.load(); expect(fetch).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledTimes(1);
    expect(client.read("genius")).toEqual({ status: "unavailable", data: null });
    vi.setSystemTime(Date.now() + 600_000); await client.load(); expect(fetch).toHaveBeenCalledTimes(2);
    const even = create({ storage: storage(), fetch: vi.fn(async () => Response.json({ ...snapshot,
      roles: { normal: { counts: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] } } })) });
    await even.load(); expect(even.read("normal").data?.medianLevel).toBe(1.5);
  });

  it("keeps a fresh cache after uploads and refreshes only on an open after ten minutes", async () => {
    const saved = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async input => Response.json(String(input).includes("get_") ? snapshot : true));
    const first = create({ storage: saved, fetch }); await first.load();
    const second = create({ storage: saved, fetch });
    const account = createDefaultAccountProfile(); account.roleProgress.normal.level = 3;
    await second.syncAccount(account);
    await first.load();
    expect(fetch.mock.calls.filter(call => String(call[0]).includes("get_"))).toHaveLength(1);
    const restored = create({ storage: saved, fetch }); await restored.load();
    expect(fetch.mock.calls.filter(call => String(call[0]).includes("get_"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetch.mock.calls.filter(call => String(call[0]).includes("get_"))).toHaveLength(1);
    await first.load();
    expect(fetch.mock.calls.filter(call => String(call[0]).includes("get_"))).toHaveLength(2);
    await first.load(); expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retains stale real counts offline and never substitutes fabricated zeros", async () => {
    const saved = storage();
    const first = create({ storage: saved, fetch: vi.fn(async () => Response.json(snapshot)) });
    await first.load(); first.dispose();
    vi.setSystemTime(Date.now() + 600_001);
    const failing = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline"); });
    const restored = create({ storage: saved, fetch: failing });
    await restored.load(); await restored.load();
    expect(failing).toHaveBeenCalledTimes(1); expect(restored.read("normal").data?.players).toBe(5);
    const missing = create({ storage: null, fetch: failing });
    await missing.load(); expect(missing.read("normal")).toEqual({ status: "unavailable", data: null });
  });

  it("rejects corrupt, foreign-epoch, or incomplete count arrays and invalid account levels", async () => {
    for (const value of [
      { ...snapshot, epoch: "old" },
      { ...snapshot, roles: { normal: { counts: [1] } } },
      { ...snapshot, roles: { normal: { counts: [-1, ...Array(10).fill(0)] } } },
      { ...snapshot, roles: { unknown: { counts: Array(11).fill(0) } } },
      { ...snapshot, roles: { normal: { counts: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, ...Array(9).fill(0)] } } },
    ]) {
      const client = create({ storage: null, fetch: vi.fn(async () => Response.json(value)) });
      await client.load(); expect(client.read("normal").data).toBeNull();
    }
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const invalid = create({ storage: storage(), fetch });
    const account = singleRoleAccount(); account.roleProgress.normal.level = 11;
    await invalid.syncAccount(account); expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves zero-player snapshots without claiming an average or median of zero", async () => {
    const client = create({ storage: storage(), fetch: vi.fn(async () => Response.json({ ...snapshot,
      roles: { normal: { counts: Array(11).fill(0) } } })) });
    await client.load();
    expect(client.read("normal")).toEqual({ status: "ready", data: {
      counts: Array(11).fill(0), players: 0, meanLevel: null, medianLevel: null, maxLevelPlayers: 0,
    } });
  });

  it("ignores prior-epoch outboxes and works when storage is unavailable", async () => {
    const saved = storage();
    saved.setItem(ROLE_LEVEL_STATS_STORAGE_KEY, JSON.stringify({ version: 1, epoch: "old", savedAt: new Date().toISOString(),
      pending: [{ playerId: PLAYER, roleId: "normal", level: 10 }] }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(true));
    const client = create({ storage: saved, fetch }); await client.flush(); expect(fetch).not.toHaveBeenCalled();
    const unavailable = create({ storage: null, fetch }); await unavailable.syncAccount(createDefaultAccountProfile());
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders eleven labelled columns, the selected role and an accessible own-level marker", () => {
    const account = createDefaultAccountProfile(); account.roleProgress.normal.level = 2;
    const markup = renderRoleLevelStatsOverlay(account, { status: "ready", data: {
      counts: snapshot.roles.normal.counts, players: 5, meanLevel: 3.8, medianLevel: 2, maxLevelPlayers: 1,
    } });
    expect(markup).toContain('role="dialog"'); expect(markup).toContain('aria-modal="true"');
    expect(markup.match(/class="role-level-stats-column/g)).toHaveLength(11);
    expect(markup).toContain("我的 Lv.2"); expect(markup).toContain("2级：2位玩家，我的等级");
    expect(markup).not.toContain("满级 1 人"); expect(markup).not.toContain("按浏览器去重");
    expect(markup).not.toContain("每个角色只记录最高等级"); expect(markup).not.toContain("10分钟");
    expect(markup).toContain("data-ui-close-level-stats");
    for (const status of ["loading", "unavailable"] as const) {
      const pending = renderRoleLevelStatsOverlay(account, { status, data: null });
      expect(pending).toContain("<strong>—</strong>"); expect(pending).not.toContain('class="role-level-stats-chart"');
    }
  });

  it("defines a private, epoch-bound table and an idempotent monotonically increasing RPC", () => {
    const sql = readFileSync(new URL("../supabase/migrations/20261020_kwgame_v2_role_level_stats.sql", import.meta.url), "utf8");
    expect(sql).toContain("primary key (data_epoch, player_id, role_id)");
    expect(sql).toContain("greatest(stored.level, excluded.level)");
    expect(sql).toContain("where excluded.level > stored.level");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.phd_simulator_v2_role_levels from public, anon, authenticated");
    expect(sql).toContain("security definer"); expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("pg_catalog.generate_series(0, 10)");
    expect(sql).toContain("to anon;");
  });
});
