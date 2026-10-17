import { DATA_EPOCH, isCurrentDataEpoch } from "./v2-data-epoch";
import { GAME_ACTION_IDS } from "./v2-action-ids";
import { dispatchAction } from "./v2-engine";
import { createAchievementRunProgress } from "./v2-achievement-runtime-types";
import { collectRunStatistics } from "./v2-run-statistics";
import type { DispatchPayload, GameActionId, GameState } from "./v2-types";

export type ReplayCommand = { kind: "action"; actionId: GameActionId; payload: DispatchPayload }
  | { kind: "help"; id: string; requiredIds: string[] };
/** Bump when deterministic gameplay rules change, independently of account epochs. */
export const REPLAY_RULESET = "20261017-r3";
const SUPPORTED_REPLAY_RULESETS = ["20261016-r1", "20261017-r2", REPLAY_RULESET] as const;
export interface RunReplay {
  version: 1;
  ruleset: typeof SUPPORTED_REPLAY_RULESETS[number];
  epoch: string;
  savedAt: string;
  initial: GameState;
  commands: ReplayCommand[];
  checkpoints: { index: number; digest: string; totalMonths: number }[];
  failed?: { totalMonths: number; reason: string };
}

/** A corruption/difference checksum, NOT an authentication signature. */
export function replayStateDigest(state: GameState): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key, child]) => key !== "runAchievementIds" && child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
    return value;
  };
  const json = JSON.stringify(canonical(state));
  let a = 2166136261, b = 5381;
  for (let index = 0; index < json.length; index++) {
    const code = json.charCodeAt(index);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}:${json.length}`;
}

export function applyHelpRead(state: GameState, id: string, requiredIds: readonly string[]): GameState {
  if (state.phase !== "playing" || !requiredIds.includes(id)) return state;
  const run = structuredClone(state.achievementProgress ?? createAchievementRunProgress());
  const pages = new Set(run.sets["help-pages"] ?? []);
  if (pages.has(id)) return state;
  pages.add(id);
  run.sets["help-pages"] = [...pages];
  if (requiredIds.length > 0 && requiredIds.every(key => pages.has(key)) && !run.satisfied.includes("global:help-collector")) {
    run.satisfied.push("global:help-collector");
  }
  return { ...state, achievementProgress: run };
}

export function executeReplayCommand(state: GameState, command: ReplayCommand): GameState {
  if (command.kind === "help") return applyHelpRead(state, command.id, command.requiredIds);
  const next = dispatchAction(state, command.actionId, command.payload);
  return command.actionId === "start-game" ? next : collectRunStatistics(state, next);
}

export function createRunReplay(initial: GameState, started: GameState, payload: DispatchPayload): RunReplay {
  return {
    version: 1, ruleset: REPLAY_RULESET, epoch: DATA_EPOCH, savedAt: new Date().toISOString(),
    initial: structuredClone({ ...initial, randomState: { seed: started.randomState!.seed, cursor: 0 } }),
    commands: [{ kind: "action", actionId: "start-game", payload: structuredClone(payload) }], checkpoints: [],
  };
}

export function isRunReplay(value: unknown): value is RunReplay {
  if (!value || typeof value !== "object" || !isCurrentDataEpoch(value)) return false;
  const record = value as RunReplay;
  return record.version === 1 && SUPPORTED_REPLAY_RULESETS.includes(record.ruleset) && record.initial?.phase === "setup" && !!record.initial.randomState
    && Array.isArray(record.commands) && record.commands.length > 0
    && record.commands.length <= 200_000 && record.commands.every(command => command && (
      command.kind === "help" ? typeof command.id === "string" && Array.isArray(command.requiredIds)
        && command.requiredIds.every(id => typeof id === "string")
        : command.kind === "action" && GAME_ACTION_IDS.includes(command.actionId) && !!command.payload && typeof command.payload === "object"))
    && record.commands[0]?.kind === "action" && record.commands[0].actionId === "start-game"
    && Array.isArray(record.checkpoints) && record.checkpoints.every((point, index) => point
      && Number.isSafeInteger(point.index) && point.index > 0 && point.index <= record.commands.length
      && (index === 0 || point.index > record.checkpoints[index - 1]!.index)
      && typeof point.digest === "string" && Number.isSafeInteger(point.totalMonths));
}

export interface ReplayAnchor { state: GameState; index: number }

/** Only the commands since the previous monthly checkpoint are executed. */
export function verifyRunReplay(replay: RunReplay, anchor: ReplayAnchor, actual: GameState, checkpoint = true): ReplayAnchor | null {
  if (replay.failed) return null;
  try {
    let expected = structuredClone(anchor.state);
    for (const command of replay.commands.slice(anchor.index)) {
      if (command.kind === "action" && (command.actionId.startsWith("debug-")
        || ["force-next-month", "restart-game", "reset-game"].includes(command.actionId))) throw new Error("非正常游戏操作");
      expected = executeReplayCommand(expected, command);
    }
    const digest = replayStateDigest(actual);
    if (replayStateDigest(expected) !== digest) throw new Error("操作复算与当前状态不一致");
    const index = replay.commands.length;
    if (checkpoint && replay.checkpoints.at(-1)?.index !== index) replay.checkpoints.push({ index, digest, totalMonths: actual.totalMonths });
    replay.savedAt = new Date().toISOString();
    return { state: structuredClone(actual), index };
  } catch (error) {
    replay.failed = { totalMonths: actual.totalMonths, reason: error instanceof Error ? error.message : "复算失败" };
    return null;
  }
}

/** Restoring a save discards the abandoned branch's commands and checkpoints. */
export function truncateRunReplay(replay: RunReplay, index: number): RunReplay {
  return { ...replay, commands: replay.commands.slice(0, index),
    checkpoints: replay.checkpoints.filter(point => point.index <= index) };
}
