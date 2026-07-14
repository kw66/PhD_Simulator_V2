import { applyTemporaryActionEffectUpdates } from "./v2-temporary-action-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export type RandomRollProvider = () => number;

export interface FixedStateMutation {
  san?: number;
  favor?: number;
  social?: number;
  money?: number;
  temporaryIdeaBonus?: number;
  consecutiveStampGiftCount?: number;
  unlockLoveMyTeacher?: boolean;
}

export interface FixedResolutionResult {
  nextState: GameState;
  outcome: string;
  enqueueEvents?: PendingEvent[];
}

export function createFixedEvent(params: {
  id: string;
  title: string;
  description: string;
  preview: string;
  chainId: string;
  stage?: PendingEvent["stage"];
  choices: EventChoice[];
}): PendingEvent {
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    preview: params.preview,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: params.chainId,
    stage: params.stage ?? "act1",
    choices: params.choices,
  };
}

export function createPlaceholderFixedEvent(params: {
  id: string;
  title: string;
  description: string;
  preview: string;
  chainId: string;
  year: number;
  month: number;
}): PendingEvent {
  return createFixedEvent({
    id: params.id,
    title: params.title,
    description: params.description,
    preview: params.preview,
    chainId: params.chainId,
    choices: [
      {
        id: `${params.chainId}-continue-y${params.year}-m${params.month}`,
        label: "继续",
        outcome: "当前只保留旧版事件身份占位，具体链路将在后续轮次继续迁移。",
        effects: {},
      },
    ],
  });
}

export function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function drawWeightedTriplet(low: number, high: number, getRoll: RandomRollProvider): number {
  const normalized = clamp(0, getRoll(), 0.999999999999);
  if (normalized < 0.25) return low;
  if (normalized < 0.75) return low + 1;
  return high;
}

export function drawInclusiveInt(min: number, max: number, getRoll: RandomRollProvider): number {
  const normalized = clamp(0, getRoll(), 0.999999999999);
  return min + Math.floor(normalized * (max - min + 1));
}

export function applyStateMutation(state: GameState, mutation: FixedStateMutation): GameState {
  const nextPlayer = { ...state.player };
  if (mutation.san !== undefined) {
    nextPlayer.san = clamp(0, nextPlayer.san + mutation.san, state.sanCap);
  }
  if (mutation.favor !== undefined) {
    nextPlayer.favor += mutation.favor;
  }
  if (mutation.social !== undefined) {
    nextPlayer.social += mutation.social;
  }
  if (mutation.money !== undefined) {
    nextPlayer.money += mutation.money;
  }

  const nextTemporaryActionEffects = mutation.temporaryIdeaBonus !== undefined
    ? applyTemporaryActionEffectUpdates(state.temporaryActionEffects, { idea: { bonus: mutation.temporaryIdeaBonus } })
    : state.temporaryActionEffects;
  const nextEventCounters = mutation.consecutiveStampGiftCount !== undefined
    ? { ...state.eventCounters, consecutiveStampGiftCount: mutation.consecutiveStampGiftCount }
    : state.eventCounters;
  const nextAchievementFlags = mutation.unlockLoveMyTeacher === true
    ? { ...state.achievementFlags, loveMyTeacher: true }
    : state.achievementFlags;

  return {
    ...state,
    player: nextPlayer,
    temporaryActionEffects: nextTemporaryActionEffects,
    eventCounters: nextEventCounters,
    achievementFlags: nextAchievementFlags,
  };
}
