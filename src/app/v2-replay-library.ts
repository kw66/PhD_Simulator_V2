import { ENABLE_LOCAL_PLAYGROUND } from "../core/v2-development-flags";
import { parseReplayRecording, serializeReplayRecording, validateReplayRecording, verifyReplayRecording, type ReplayRecording } from "../core/v2-local-replay";
import type { GameState, RoleId } from "../core/v2-types";

export interface ReplaySummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  roleId: RoleId;
  playerName: string | null;
  totalMonths: number;
  degree: GameState["degree"];
  phase: GameState["phase"];
  ending: GameState["ending"];
  researchScore: number;
  commandCount: number;
  academicYear?: number;
}
export interface ReplayLibraryEntry { id: string; recording: ReplayRecording; summary: ReplaySummary }
export interface ReplayLibraryAdapter {
  list(): Promise<ReplayLibraryEntry[]>;
  get(id: string): Promise<ReplayLibraryEntry | null>;
  put(entry: ReplayLibraryEntry): Promise<void>;
  remove(id: string): Promise<void>;
}
export function createMemoryReplayAdapter(): ReplayLibraryAdapter {
  const entries = new Map<string, ReplayLibraryEntry>();
  return {
    async list() { return structuredClone([...entries.values()]); },
    async get(id) { return structuredClone(entries.get(id) ?? null); },
    async put(entry) { entries.set(entry.id, structuredClone(entry)); },
    async remove(id) { entries.delete(id); },
  };
}
export const REPLAY_LIBRARY_DATABASE = "phd_simulator_v2_replays";
export function createIndexedDbReplayAdapter(options: { playground?: boolean; indexedDB?: IDBFactory } = {}): ReplayLibraryAdapter {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  const name = REPLAY_LIBRARY_DATABASE + ((options.playground ?? ENABLE_LOCAL_PLAYGROUND) ? "_local_playground" : "");
  let database: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error("当前浏览器不支持本地回放存储"));
    if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("recordings", { keyPath: "id" }); };
      request.onerror = () => { database = undefined; reject(request.error ?? new Error("无法打开回放库")); };
      request.onblocked = () => { database = undefined; reject(new Error("回放库被其他页面占用，请关闭其他游戏页面后重试")); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
    });
    return database;
  }
  async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("recordings", mode);
      const request = operation(tx.objectStore("recordings"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error("本地回放存储失败"));
    });
  }
  return {
    list: () => transaction("readonly", store => store.getAll()),
    async get(id) { return (await transaction("readonly", store => store.get(id))) ?? null; },
    async put(entry) { await transaction("readwrite", store => store.put(entry)); },
    async remove(id) { await transaction("readwrite", store => store.delete(id)); },
  };
}
function summarize(recording: ReplayRecording, state: GameState): ReplaySummary {
  return { id: recording.id, createdAt: recording.createdAt, updatedAt: recording.updatedAt,
    roleId: state.selectedRoleId, playerName: state.playerName, totalMonths: state.totalMonths,
    degree: state.degree, phase: state.phase, ending: state.ending, researchScore: state.totalResearchScore,
    commandCount: recording.replay.commands.length,
    ...(state.rewinderState?.academic?.completed ? { academicYear: state.rewinderState.academic.completed.year } : {}) };
}
export function createReplayLibrary(options: { adapter?: ReplayLibraryAdapter; playground?: boolean } = {}) {
  const adapter = options.adapter ?? createIndexedDbReplayAdapter(options);
  /** This library owns only recordings; it never reads or writes account/game statistics. */
  async function save(input: ReplayRecording): Promise<ReplaySummary> {
    const recording = validateReplayRecording(input);
    const final = await verifyReplayRecording(recording);
    // Preserve the original creation time when an ongoing run is saved again.
    const previous = await adapter.get(recording.id);
    if (previous) recording.createdAt = previous.recording.createdAt;
    const summary = summarize(recording, final);
    await adapter.put({ id: recording.id, recording, summary });
    return structuredClone(summary);
  }
  async function get(id: string): Promise<ReplayRecording | null> {
    const entry = await adapter.get(id);
    return entry ? validateReplayRecording(entry.recording) : null;
  }
  return {
    async list(): Promise<ReplaySummary[]> {
      const entries = await adapter.list();
      const valid: ReplaySummary[] = [];
      for (const entry of entries) {
        try {
          const recording = validateReplayRecording(entry.recording);
          const summary = entry.summary;
          if (summary.id !== recording.id || summary.commandCount !== recording.replay.commands.length
            || !Number.isFinite(summary.totalMonths) || typeof summary.roleId !== "string") continue;
          valid.push(structuredClone(summary));
        } catch { /* One damaged file must not hide the other local recordings. */ }
      }
      return valid.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    get, save,
    remove: (id: string) => adapter.remove(id),
    import: (text: string) => save(parseReplayRecording(text)),
    async export(id: string): Promise<string> {
      const recording = await get(id);
      if (!recording) throw new Error("找不到这份本地回放");
      return serializeReplayRecording(recording);
    },
  };
}
export type ReplayLibrary = ReturnType<typeof createReplayLibrary>;
