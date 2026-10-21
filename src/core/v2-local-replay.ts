import { createInitialState } from "./v2-engine";
import { getRoleOptions } from "./v2-progression";
import { normalizeAcademicArchive } from "./v2-rewinder-academic-record";
import { normalizeRewinderArchive } from "./v2-rewinder";
import { withGameplayRuleset } from "./v2-rule-context";
import { AI_SLOT_IDS } from "./v2-ai-shop";
import { executeReplayCommand, isRunReplay, replayStateDigest, type RunReplay } from "./v2-run-replay";
import type { GameState, PaperPromotionId } from "./v2-types";

export const MAX_LOCAL_REPLAY_BYTES = 20 * 1024 * 1024;
export interface ReplayRecording {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  replay: RunReplay;
  finalDigest: string;
}
export interface ReplayExecutionOptions {
  signal?: AbortSignal;
  yieldControl?: () => Promise<void>;
}
export interface ReplayMonth { index: number; totalMonths: number }
const roles = new Set<string>(getRoleOptions().map(role => role.id));
const digestPattern = /^[0-9a-f]{1,8}:[0-9a-f]{1,8}:\d{1,9}$/;
const forbiddenActions = new Set(["force-next-month", "restart-game", "reset-game", "settle-and-return", "select-role",
  "change-lobby-role-page", "change-role-achievement-page"]);
const payloadKeys = new Set([
  "rewinderAcademicArchive", "rewinderStartYear", "rewinderPaperSource", "rewinderCoffeeSource", "rewinderArchive",
  "rewinderCycleNumber", "rewinderPersonKey", "captainTagLevels", "curseDifficulty", "debtRepayment", "bonusTalentPoints",
  "talentAllocation", "blockLinearEvents", "skipBranchEventIntro", "roleId", "paperId", "paperSlotIndex", "thesisPointIndex",
  "careerType", "paperActionType", "paperTarget", "journalTarget", "promotionId", "eventId", "eventChoiceId",
  "eventHistoryIndex", "relationshipId", "projectType", "delta", "dateDisplayMode", "shopItemId", "shopUpgradeId",
  "aiSlotId", "supportItemId",
]);
// Record requires every supported promotion to be listed when the engine adds one.
const promotionIds = { arxiv: true, github: true, xiaohongshu: true, quantum: true } satisfies Record<PaperPromotionId, true>;
const enumFields: Record<string, readonly unknown[]> = {
  rewinderPaperSource: ["current", "previous"], rewinderCoffeeSource: ["current", "previous"], curseDifficulty: [1, 2, 3, 4],
  careerType: ["internet", "stateOwned", "civilService", "academic"], paperActionType: ["idea", "experiment", "writing"],
  paperTarget: ["A", "B", "C"], journalTarget: ["nature", "nmi", "pami"], promotionId: Object.keys(promotionIds),
  projectType: ["horizontal", "vertical"], dateDisplayMode: ["academic", "calendar"], aiSlotId: AI_SLOT_IDS,
};
function invalid(message: string): never { throw new Error(`回放无效：${message}`); }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function finiteTree(value: unknown): void {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (++nodes > 600_000 || entry.depth > 40) invalid("数据结构过大");
    const child = entry.value;
    if (typeof child === "number" && (!Number.isFinite(child) || Math.abs(child) > 1e12)) invalid("数值超出范围");
    if (typeof child === "string" && child.length > 100_000) invalid("文本过长");
    if (child === null || child === undefined || ["string", "boolean", "number"].includes(typeof child)) continue;
    if (!Array.isArray(child) && !record(child)) invalid("数据类型错误");
    if (Array.isArray(child) && child.length > 50_000) invalid("列表过长");
    for (const [key, item] of Object.entries(child as object)) {
      if (["__proto__", "constructor", "prototype"].includes(key) || key.length > 200) invalid("字段错误");
      stack.push({ value: item, depth: entry.depth + 1 });
    }
  }
}
function sameData(a: unknown, b: unknown): boolean {
  return replayStateDigest(a as GameState) === replayStateDigest(b as GameState);
}
function validatePayload(payload: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(payload)) {
    // The button dispatcher includes all optional fields, including undefined debug fields.
    if (value === undefined) continue;
    if (!payloadKeys.has(key)) invalid(`未知操作参数 ${key}`);
    if (enumFields[key]) { if (!enumFields[key]!.includes(value)) invalid(`操作参数 ${key}`); continue; }
    if (key === "roleId") { if (typeof value !== "string" || !roles.has(value)) invalid("角色错误"); continue; }
    if (key === "rewinderAcademicArchive") {
      if (!record(value) || !sameData(value, normalizeAcademicArchive(value))) invalid("学年档案错误"); continue;
    }
    if (key === "rewinderArchive") {
      if (!record(value) || !sameData(value, normalizeRewinderArchive(value))) invalid("轮回档案错误"); continue;
    }
    if (key === "talentAllocation" || key === "captainTagLevels") {
      if (!record(value) || Object.entries(value).some(([name, level]) => name.length > 100 || typeof level !== "number"
        || !Number.isSafeInteger(level) || level < 0 || level > 1000)) invalid("天赋等级错误");
      continue;
    }
    if (key === "blockLinearEvents" || key === "skipBranchEventIntro") {
      if (typeof value !== "boolean") invalid("事件设置错误"); continue;
    }
    if (["rewinderStartYear", "rewinderCycleNumber", "bonusTalentPoints", "paperSlotIndex", "thesisPointIndex", "eventHistoryIndex"].includes(key)) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 100_000) invalid(`操作参数 ${key}`);
      continue;
    }
    if (key === "debtRepayment" || key === "delta") {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e9) invalid(`操作参数 ${key}`); continue;
    }
    if (typeof value !== "string" || value.length > 1000) invalid(`操作参数 ${key}`);
  }
}
/** Rebuild the trusted setup state; imported gameplay state is never executed directly. */
function initialState(replay: RunReplay): GameState {
  const source = replay.initial;
  const seed = source.randomState?.seed;
  if (!Number.isInteger(seed) || seed! < 0 || seed! > 0xffffffff || source.randomState?.cursor !== 0) invalid("随机种子错误");
  if (!roles.has(source.selectedRoleId) || (source.setupSelectedRoleId != null && !roles.has(source.setupSelectedRoleId))) invalid("初始角色错误");
  for (const key of ["blockLinearEvents", "skipBranchEventIntro", "debugEventReplayEnabled"] as const) {
    if (source[key] !== undefined && typeof source[key] !== "boolean") invalid("初始设置错误");
  }
  return { ...createInitialState(), selectedRoleId: source.selectedRoleId, setupSelectedRoleId: source.setupSelectedRoleId,
    blockLinearEvents: source.blockLinearEvents, skipBranchEventIntro: source.skipBranchEventIntro,
    debugEventReplayEnabled: source.debugEventReplayEnabled, randomState: { seed: seed!, cursor: 0 } };
}
export function validateReplayRecording(value: unknown): ReplayRecording {
  finiteTree(value);
  if (!record(value) || value.version !== 1 || typeof value.id !== "string" || !/^[\w-]{1,120}$/.test(value.id)
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
    || typeof value.finalDigest !== "string" || !digestPattern.test(value.finalDigest) || !isRunReplay(value.replay)) invalid("文件格式错误或规则版本不兼容");
  const result = value as unknown as ReplayRecording;
  const replay = result.replay;
  if (replay.failed || replay.commands.length > 50_000) invalid("记录不完整或操作过多");
  initialState(replay);
  for (const [index, command] of replay.commands.entries()) {
    if (command.kind === "help") {
      if (!command.id || command.id.length > 200 || command.requiredIds.length > 200
        || command.requiredIds.some(id => id.length > 200)) invalid("帮助记录错误");
      continue;
    }
    if (command.actionId.startsWith("debug-") || forbiddenActions.has(command.actionId)
      || (command.actionId === "start-game" && index !== 0) || !record(command.payload)) invalid("包含非游戏操作");
    withGameplayRuleset(command.ruleset ?? replay.ruleset, () => validatePayload(command.payload as Record<string, unknown>));
  }
  for (const point of replay.checkpoints) {
    if (!digestPattern.test(point.digest) || point.totalMonths < 0 || point.totalMonths > 1000) invalid("校验点错误");
  }
  return structuredClone(result);
}
export function parseReplayRecording(text: string): ReplayRecording {
  if (new TextEncoder().encode(text).byteLength > MAX_LOCAL_REPLAY_BYTES) invalid("文件超过 20 MiB");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { invalid("不是 JSON 文件"); }
  return validateReplayRecording(parsed);
}
export function serializeReplayRecording(recording: ReplayRecording): string {
  const result = JSON.stringify(validateReplayRecording(recording));
  if (new TextEncoder().encode(result).byteLength > MAX_LOCAL_REPLAY_BYTES) invalid("文件超过 20 MiB");
  return result;
}
export function captureReplayRecording(replay: RunReplay, state: GameState,
  options: { id?: string; createdAt?: string; now?: string } = {}): ReplayRecording {
  const now = options.now ?? new Date().toISOString();
  return validateReplayRecording({ version: 1, id: options.id ?? crypto.randomUUID(), createdAt: options.createdAt ?? now,
    updatedAt: now, replay, finalDigest: replayStateDigest(state) });
}
function cancelled(): never { throw new DOMException("回放操作已取消", "AbortError"); }
export function createReplaySession(input: ReplayRecording, options: Pick<ReplayExecutionOptions, "yieldControl"> = {}) {
  const recording = validateReplayRecording(input);
  const replay = recording.replay;
  const initial = initialState(replay);
  const checkpoints = new Map(replay.checkpoints.map(point => [point.index, point]));
  const cache = new Map<number, GameState>();
  const months = new Map<number, number>();
  let current = structuredClone(initial), index = 0, token = 0, disposed = false;
  const yieldControl = options.yieldControl ?? (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  async function seek(target: number, execution: Pick<ReplayExecutionOptions, "signal"> = {}): Promise<GameState> {
    if (!Number.isSafeInteger(target) || target < 0 || target > replay.commands.length) throw new RangeError("回放位置超出范围");
    const operation = ++token;
    const check = () => { if (disposed || operation !== token || execution.signal?.aborted) cancelled(); };
    check();
    let at = index <= target ? index : 0;
    let state = structuredClone(at === index ? current : initial);
    for (const [anchor, value] of cache) if (anchor <= target && anchor > at) { at = anchor; state = structuredClone(value); }
    let sliceStart = performance.now(), sliceCommands = 0;
    const pending = new Map<number, GameState>();
    const discoveredMonths = new Map<number, number>();
    while (at < target) {
      check();
      const month = state.totalMonths;
      state = executeReplayCommand(state, replay.commands[at]!, replay.ruleset);
      at++;
      if (at === 1 || state.totalMonths !== month) discoveredMonths.set(state.totalMonths, at);
      const point = checkpoints.get(at);
      if (point && (point.totalMonths !== state.totalMonths || point.digest !== replayStateDigest(state))) invalid(`第 ${at} 步校验失败`);
      if (state.totalMonths !== month || at === replay.commands.length) {
        pending.set(at, structuredClone(state));
        if (pending.size > 8) pending.delete(pending.keys().next().value!);
      }
      if (++sliceCommands >= 50 || performance.now() - sliceStart >= 8) {
        await yieldControl(); check(); sliceCommands = 0; sliceStart = performance.now();
      }
    }
    if (at === replay.commands.length && replayStateDigest(state) !== recording.finalDigest) invalid("最终结果校验失败");
    check();
    current = state; index = at;
    for (const [month, position] of discoveredMonths) {
      const previous = months.get(month);
      if (previous === undefined || position < previous) months.set(month, position);
    }
    for (const [anchor, value] of pending) { cache.delete(anchor); cache.set(anchor, value); }
    while (cache.size > 8) cache.delete(cache.keys().next().value!);
    return structuredClone(current);
  }
  return {
    seek,
    step: (delta: number, execution?: Pick<ReplayExecutionOptions, "signal">) => seek(Math.max(0, Math.min(replay.commands.length, index + delta)), execution),
    getState: () => structuredClone(current), getIndex: () => index, getLength: () => replay.commands.length,
    getMonths: (): ReplayMonth[] => [...months].map(([totalMonths, index]) => ({ index, totalMonths })).sort((a, b) => a.index - b.index),
    dispose: () => { disposed = true; token++; cache.clear(); },
  };
}
export async function verifyReplayRecording(recording: ReplayRecording, options: ReplayExecutionOptions = {}): Promise<GameState> {
  const session = createReplaySession(recording, options);
  try { return await session.seek(session.getLength(), options); } finally { session.dispose(); }
}
export type ReplaySession = ReturnType<typeof createReplaySession>;
