import manifest from "./v2-official-replay-manifest.json";
import { isRemoteWriteEnabled } from "./v2-remote-access";

const RPC_URL = "https://rffmgeacueokudwreyeb.supabase.co/rest/v1/rpc";
const PUBLIC_KEY = "sb_publishable_TRVbO2x2mmuoRw592EqtvQ_FHpqUMkJ";
const ids = new Set(manifest.map(entry => entry.id));

/** Aggregate counters only: no account, recording, or viewing-history uploads. */
export function createOfficialReplayStats(options: {
  fetch?: typeof fetch; enabled?: boolean; writeEnabled?: boolean; onChange?: () => void;
} = {}) {
  const enabled = options.enabled ?? import.meta.env.PROD;
  const writes = enabled && (options.writeEnabled ?? isRemoteWriteEnabled());
  const request = options.fetch ?? globalThis.fetch;
  const counts = new Map<string, number>();
  const counted = new Set<string>();
  const abort = new AbortController();
  let loading: Promise<void> | undefined;

  function set(id: string, value: unknown): void {
    if (ids.has(id) && typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      counts.set(id, Math.max(counts.get(id) ?? 0, value));
    }
  }
  async function rpc(name: string, payload: object): Promise<unknown> {
    const response = await request(`${RPC_URL}/${name}`, { method: "POST",
      headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) throw new Error(`Replay statistics HTTP ${response.status}`);
    return response.json();
  }
  return {
    get(id: string): number | undefined { return counts.get(id); },
    load(): Promise<void> {
      if (!enabled || abort.signal.aborted) return Promise.resolve();
      return loading ??= (async () => {
        try {
          const result = await rpc("get_phd_simulator_v2_replay_plays", {});
          if (!result || typeof result !== "object" || Array.isArray(result)) return;
          for (const [id, count] of Object.entries(result)) set(id, count);
          if (!abort.signal.aborted) options.onChange?.();
        } catch { /* Statistics never block browsing or playback. */ }
      })();
    },
    async track(id: string): Promise<void> {
      if (!writes || abort.signal.aborted || !ids.has(id) || counted.has(id)) return;
      // Reopening, seeking and pausing on this page do not inflate the count.
      counted.add(id);
      try {
        set(id, await rpc("record_phd_simulator_v2_replay_play", { p_replay_id: id }));
        if (!abort.signal.aborted) options.onChange?.();
      } catch { /* No automatic retry: an unacknowledged increment may have succeeded. */ }
    },
    dispose() { abort.abort(); },
  };
}
