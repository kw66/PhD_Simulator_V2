import { getRoleOptions } from "./v2-progression";
import type { GameState, RoleId } from "./v2-types";

export const RUN_SAVE_VERSION = 1;
export const MAX_RUN_MONTH_SAVES = 70;
export const RUN_SAVE_DATABASE_NAME = "phd_simulator_v2_runs";
export const RUN_SAVE_JOURNAL_PREFIX = "phd_simulator_v2_run_journal_v1:";
const ROLE_IDS = new Set(getRoleOptions().map(role => role.id));

export interface RunSaveSnapshot {
  id: string;
  savedAt: string;
  totalMonths: number;
  state: GameState;
}

export interface RunSaveRecord {
  version: typeof RUN_SAVE_VERSION;
  roleId: RoleId;
  runId: string;
  debugUsed: boolean;
  latest: RunSaveSnapshot;
  months: RunSaveSnapshot[];
}

export interface RunSaveSummary {
  id: string;
  kind: "latest" | "month";
  savedAt: string;
  totalMonths: number;
  year: number;
  month: number;
  phase: GameState["phase"];
  playerName: string | null;
  degree: GameState["degree"];
  san: number;
  sanCap: number;
  researchScore: number;
}

export interface RunSaveStorageError {
  kind: "unavailable" | "quota" | "corrupt" | "write";
  message: string;
  cause?: unknown;
}

export interface RunSaveAdapter {
  load(): Promise<unknown[]>;
  write(roleId: RoleId, record: RunSaveRecord | null): Promise<void>;
}

type JournalStorage = Pick<Storage, "getItem" | "setItem">;
interface SaveJournal {
  version: 1;
  revision: number;
  runId: string | null;
  debugUsed: boolean;
  latest: RunSaveSnapshot | null;
  /** Only monthly snapshots not yet acknowledged by IndexedDB. */
  pendingMonths: RunSaveSnapshot[];
  truncateAfter: number | null;
}

export interface RunSaveRepository {
  ready(): Promise<void>;
  get(roleId: RoleId): RunSaveRecord | undefined;
  list(roleId: RoleId): RunSaveSummary[];
  commit(state: GameState, options?: { runId?: string; debugUsed?: boolean; monthStart?: boolean }): RunSaveRecord;
  rewind(roleId: RoleId, snapshotId: string): RunSaveRecord | null;
  clear(roleId: RoleId): void;
  flush(): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Month checkpoints are immutable; only the latest state needs a defensive copy. */
const expose = (record: RunSaveRecord): RunSaveRecord => ({ ...record, latest: clone(record.latest), months: [...record.months] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function validState(value: unknown, roleId: RoleId): value is GameState {
  if (!object(value) || value.selectedRoleId !== roleId || !["playing", "finished"].includes(String(value.phase))) return false;
  if (!object(value.randomState) || !nonnegativeInteger(value.randomState.seed) || value.randomState.seed > 0xffffffff
    || !nonnegativeInteger(value.randomState.cursor)) return false;
  if (!nonnegativeInteger(value.totalMonths) || !nonnegativeInteger(value.year)
    || !Number.isInteger(value.month) || Number(value.month) < 0 || Number(value.month) > 12
    || !["master", "phd"].includes(String(value.degree))) return false;
  if (!object(value.player) || !["san", "research", "social", "favor", "money"].every(key => Number.isFinite(value.player && (value.player as Record<string, unknown>)[key]))) return false;
  return ["papers", "externalPublications", "eventQueue", "eventHistory", "log", "buffs", "availableRandomEvents", "usedRandomEvents"]
    .every(key => Array.isArray(value[key]))
    && ["thesis", "actionState", "relationshipState", "eventSupport", "shopState", "aiShopState", "advisorProgressState"]
      .every(key => object(value[key]));
}

function validSnapshot(value: unknown, roleId: RoleId): value is RunSaveSnapshot {
  return object(value) && typeof value.id === "string" && typeof value.savedAt === "string"
    && Number.isFinite(Date.parse(value.savedAt)) && nonnegativeInteger(value.totalMonths)
    && validState(value.state, roleId) && value.state.totalMonths === value.totalMonths;
}

export function validateRunSaveRecord(value: unknown): value is RunSaveRecord {
  if (!object(value) || value.version !== RUN_SAVE_VERSION || !ROLE_IDS.has(value.roleId as RoleId)
    || typeof value.runId !== "string" || !value.runId || typeof value.debugUsed !== "boolean") return false;
  const roleId = value.roleId as RoleId;
  if (!validSnapshot(value.latest, roleId) || value.latest.id !== "latest"
    || !Array.isArray(value.months) || value.months.length > MAX_RUN_MONTH_SAVES) return false;
  const months = new Set<number>();
  return value.months.every(snapshot => {
    if (!validSnapshot(snapshot, roleId) || snapshot.id !== `month:${snapshot.totalMonths}`
      || snapshot.totalMonths > (value.latest as RunSaveSnapshot).totalMonths || months.has(snapshot.totalMonths)) return false;
    months.add(snapshot.totalMonths);
    return true;
  });
}

export function createMemoryRunSaveAdapter(initial: RunSaveRecord[] = []): RunSaveAdapter {
  const records = new Map(initial.map(record => [record.roleId, clone(record)]));
  return {
    async load() { return [...records.values()].map(clone); },
    async write(roleId, record) { if (record) records.set(roleId, clone(record)); else records.delete(roleId); },
  };
}

export function createIndexedDbRunSaveAdapter(factory: IDBFactory = globalThis.indexedDB): RunSaveAdapter {
  let database: Promise<IDBDatabase> | undefined;
  const writtenMonths = new Map<RoleId, Map<string, RunSaveSnapshot>>();
  const open = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) { reject(new Error("浏览器不支持 IndexedDB")); return; }
    const request = factory.open(RUN_SAVE_DATABASE_NAME, RUN_SAVE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("runs")) request.result.createObjectStore("runs", { keyPath: "roleId" });
      if (!request.result.objectStoreNames.contains("months")) {
        request.result.createObjectStore("months", { keyPath: "key" }).createIndex("roleId", "roleId");
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { database = undefined; reject(request.error ?? new Error("存档数据库打开失败")); };
    request.onblocked = () => { database = undefined; reject(new Error("存档数据库被其他窗口占用")); };
  });
  return {
    async load() {
      const db = await open();
      return new Promise<unknown[]>((resolve, reject) => {
        const transaction = db.transaction(["runs", "months"], "readonly");
        const request = transaction.objectStore("runs").getAll();
        const checkpoints = transaction.objectStore("months").getAll();
        transaction.oncomplete = () => {
          const byKey = new Map(checkpoints.result.map((entry: { key: string; snapshot: RunSaveSnapshot }) => [entry.key, entry.snapshot]));
          resolve(request.result.map((record: RunSaveRecord & { monthKeys?: string[] }) => {
            if (!Array.isArray(record.monthKeys)) return record;
            const { monthKeys, ...rest } = record;
            const months = monthKeys.map(key => byKey.get(key));
            // Keep missing entries visible to the record validator instead of quietly losing history.
            return { ...rest, months };
          }));
        };
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? request.error);
      });
    },
    async write(roleId, record) {
      const db = await open();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(["runs", "months"], "readwrite");
        const store = transaction.objectStore("runs");
        const checkpointStore = transaction.objectStore("months");
        const nextMonths = new Map<string, RunSaveSnapshot>();
        const previousMonths = writtenMonths.get(roleId);
        for (const month of record?.months ?? []) {
          const key = `${roleId}:${record!.runId}:${month.id}`;
          nextMonths.set(key, month);
          if (previousMonths?.get(key) !== month) checkpointStore.put({ key, roleId, snapshot: month });
        }
        // Remove discarded branches atomically with their manifest. The cursor also covers records restored after reload.
        const keysRequest = checkpointStore.index("roleId").getAllKeys(roleId);
        keysRequest.onsuccess = () => {
          for (const key of keysRequest.result) if (!nextMonths.has(String(key))) checkpointStore.delete(key);
        };
        if (record) {
          const { months: _months, ...manifest } = record;
          store.put({ ...manifest, monthKeys: [...nextMonths.keys()] });
        } else store.delete(roleId);
        transaction.oncomplete = () => { writtenMonths.set(roleId, nextMonths); resolve(); };
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("存档写入失败"));
      });
    },
  };
}

export function createRunSaveRepository(options: {
  storage?: JournalStorage | null;
  adapter?: RunSaveAdapter;
  onError?: (error: RunSaveStorageError) => void;
  now?: () => string;
  createRunId?: () => string;
} = {}): RunSaveRepository {
  const report = (kind: RunSaveStorageError["kind"], message: string, cause?: unknown) => options.onError?.({
    kind: object(cause) && cause.name === "QuotaExceededError" ? "quota" : kind, message, cause,
  });
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = typeof window === "undefined" ? null : window.localStorage; }
    catch (cause) { storage = null; report("unavailable", "浏览器禁止读取本地存储，关闭页面后可能无法恢复最新进度", cause); }
  }
  const adapter = options.adapter ?? (options.storage === null || typeof window === "undefined"
    ? createMemoryRunSaveAdapter() : createIndexedDbRunSaveAdapter());
  const now = options.now ?? (() => new Date().toISOString());
  const runId = options.createRunId ?? (() => globalThis.crypto.randomUUID());
  const records = new Map<RoleId, RunSaveRecord>();
  const journals = new Map<RoleId, SaveJournal>();
  let writes = Promise.resolve();
  let readyPromise: Promise<void> | undefined;
  let revision = 0;

  function writeJournal(roleId: RoleId, journal: SaveJournal | null) {
    try { storage?.setItem(`${RUN_SAVE_JOURNAL_PREFIX}${roleId}`, JSON.stringify(journal)); }
    catch (cause) { report("write", "最新进度的关闭恢复缓存未能写入，请保持页面打开等待自动存档", cause); }
  }

  function enqueue(roleId: RoleId, record: RunSaveRecord | null, journal: SaveJournal) {
    journals.set(roleId, journal);
    writeJournal(roleId, journal);
    // Records and checkpoint references are replaced, never mutated after enqueue.
    const value = record;
    writes = writes.then(async () => {
      try {
        await adapter.write(roleId, value);
        if (journals.get(roleId)?.revision === journal.revision) {
          journals.delete(roleId);
          writeJournal(roleId, null);
        }
      } catch (cause) { report("write", "自动存档未能写入，请检查浏览器存储空间后重试", cause); }
    });
  }

  function applyJournal(roleId: RoleId, value: unknown): boolean {
    if (!object(value) || value.version !== 1 || !nonnegativeInteger(value.revision)
      || typeof value.debugUsed !== "boolean" || !Array.isArray(value.pendingMonths)
      || !(value.truncateAfter === null || nonnegativeInteger(value.truncateAfter))) return false;
    if (value.runId === null && value.latest === null && value.pendingMonths.length === 0) {
      records.delete(roleId);
      enqueue(roleId, null, { ...(value as unknown as SaveJournal), revision: ++revision });
      return true;
    }
    if (typeof value.runId !== "string" || !value.runId || !validSnapshot(value.latest, roleId)
      || value.latest.id !== "latest" || !value.pendingMonths.every(month => validSnapshot(month, roleId))) return false;
    const journal = value as unknown as SaveJournal;
    const base = records.get(roleId);
    const months = new Map((base?.runId === journal.runId ? base.months : [])
      .filter(month => journal.truncateAfter === null || month.totalMonths <= journal.truncateAfter)
      .map(month => [month.totalMonths, month]));
    for (const month of journal.pendingMonths) months.set(month.totalMonths, month);
    const record: RunSaveRecord = {
      version: RUN_SAVE_VERSION, roleId, runId: journal.runId!,
      debugUsed: journal.debugUsed || (base?.runId === journal.runId && base.debugUsed) || false,
      latest: journal.latest!, months: [...months.values()].sort((a, b) => a.totalMonths - b.totalMonths).slice(-MAX_RUN_MONTH_SAVES),
    };
    if (!validateRunSaveRecord(record)) return false;
    record.months = record.months.map(freeze);
    records.set(roleId, record);
    enqueue(roleId, record, { ...journal, revision: ++revision });
    return true;
  }

  const repository: RunSaveRepository = {
    ready() {
      return readyPromise ??= (async () => {
        try {
          for (const record of await adapter.load()) {
            if (validateRunSaveRecord(record)) {
              if (!records.has(record.roleId)) {
                const copy = clone(record);
                copy.months = copy.months.map(freeze);
                records.set(record.roleId, copy);
              }
            }
            else report("corrupt", "有一份存档格式损坏或版本不支持，已跳过，其他角色存档不受影响");
          }
        } catch (cause) { report("unavailable", "暂时无法读取存档数据库，正在尝试恢复最新进度", cause); }
        for (const roleId of ROLE_IDS) {
          if (journals.has(roleId)) continue;
          try {
            const raw = storage?.getItem(`${RUN_SAVE_JOURNAL_PREFIX}${roleId}`);
            if (!raw) continue;
            const value: unknown = JSON.parse(raw);
            if (value !== null && !applyJournal(roleId, value)) report("corrupt", "最新进度缓存损坏，保留数据库中的存档");
          } catch (cause) { report("corrupt", "最新进度缓存无法读取，保留数据库中的存档", cause); }
        }
      })();
    },
    get(roleId) { const record = records.get(roleId); return record ? expose(record) : undefined; },
    list(roleId) {
      const record = records.get(roleId);
      if (!record) return [];
      return [record.latest, ...[...record.months].reverse()].map(snapshot => ({
        id: snapshot.id, kind: snapshot.id === "latest" ? "latest" : "month", savedAt: snapshot.savedAt,
        totalMonths: snapshot.totalMonths, year: snapshot.state.year, month: snapshot.state.month,
        phase: snapshot.state.phase, playerName: snapshot.state.playerName, degree: snapshot.state.degree,
        san: snapshot.state.player.san, sanCap: snapshot.state.sanCap, researchScore: snapshot.state.totalResearchScore,
      }));
    },
    commit(state, commitOptions = {}) {
      if (!validState(state, state.selectedRoleId)) throw new Error("无法保存无效或未开始的游戏状态");
      const roleId = state.selectedRoleId;
      const previous = records.get(roleId);
      const id = commitOptions.runId ?? previous?.runId ?? runId();
      const sameRun = previous?.runId === id;
      const oldJournal = journals.get(roleId);
      const compatibleJournal = oldJournal?.runId === id ? oldJournal : undefined;
      const latest: RunSaveSnapshot = { id: "latest", savedAt: now(), totalMonths: state.totalMonths, state: clone(state) };
      const months = sameRun ? [...previous.months] : [];
      const pendingMonths = compatibleJournal ? [...compatibleJournal.pendingMonths] : [];
      if (commitOptions.monthStart && !months.some(month => month.totalMonths === state.totalMonths)) {
        const month = freeze({ ...clone(latest), id: `month:${state.totalMonths}` });
        months.push(month);
        pendingMonths.push(month);
      }
      months.sort((a, b) => a.totalMonths - b.totalMonths);
      const record: RunSaveRecord = {
        version: RUN_SAVE_VERSION, roleId, runId: id,
        debugUsed: !!commitOptions.debugUsed || (sameRun && previous.debugUsed) || false,
        latest, months: months.slice(-MAX_RUN_MONTH_SAVES),
      };
      if (!validateRunSaveRecord(record)) throw new Error("存档时间线无效，请通过读档操作回溯月份");
      records.set(roleId, record);
      enqueue(roleId, record, { version: 1, revision: ++revision, runId: id, debugUsed: record.debugUsed,
        latest, pendingMonths: pendingMonths.slice(-MAX_RUN_MONTH_SAVES), truncateAfter: compatibleJournal?.truncateAfter ?? null });
      return expose(record);
    },
    rewind(roleId, snapshotId) {
      const previous = records.get(roleId);
      if (!previous) return null;
      const snapshot = snapshotId === "latest" ? previous.latest : previous.months.find(month => month.id === snapshotId);
      if (!snapshot) return null;
      const record: RunSaveRecord = { ...previous, latest: { ...clone(snapshot), id: "latest", savedAt: now() },
        months: previous.months.filter(month => month.totalMonths <= snapshot.totalMonths) };
      const oldJournal = journals.get(roleId);
      records.set(roleId, record);
      enqueue(roleId, record, { version: 1, revision: ++revision, runId: record.runId, debugUsed: record.debugUsed,
        latest: record.latest, pendingMonths: (oldJournal?.pendingMonths ?? []).filter(month => month.totalMonths <= snapshot.totalMonths),
        truncateAfter: Math.min(oldJournal?.truncateAfter ?? Infinity, snapshot.totalMonths) });
      return expose(record);
    },
    clear(roleId) {
      records.delete(roleId);
      enqueue(roleId, null, { version: 1, revision: ++revision, runId: null, debugUsed: false, latest: null, pendingMonths: [], truncateAfter: null });
    },
    async flush() {
      await writes;
      // One retry per explicit flush; failures retain the journal without a busy retry loop.
      for (const [roleId, journal] of journals) enqueue(roleId, records.get(roleId) ?? null, journal);
      await writes;
    },
  };
  return repository;
}
