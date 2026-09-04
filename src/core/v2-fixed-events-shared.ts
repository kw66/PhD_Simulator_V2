import { addOrReplaceBuffs } from "./v2-buffs";
import { syncRelationshipState } from "./v2-relationship-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export type RandomRollProvider = () => number;

export interface FixedStateMutation {
  san?: number;
  favor?: number;
  social?: number;
  money?: number;
  temporaryIdeaBonus?: number;
}

export interface FixedResolutionResult {
  nextState: GameState;
  outcome: string;
  enqueueEvents?: PendingEvent[];
}

/** Add the shared settlement marker used by the event result renderer. */
export function appendMechanismSettlement(description: string, settlement: string): string {
  if (/(?:^|\n)机制结算(?:\n|$)/u.test(description)) return description;
  const normalizedSettlement = settlement.trim().replace(/[。.]+$/u, "");
  return normalizedSettlement
    ? `${description}\n\n机制结算\n${normalizedSettlement}`
    : description;
}

export function createFixedEvent(params: {
  id: string;
  title: string;
  description: string;
  chainId: string;
  stage?: PendingEvent["stage"];
  deadlineMonths?: number;
  completionLog?: string;
  choices: EventChoice[];
}): PendingEvent {
  return {
    id: params.id,
    title: params.title,
    description: params.description,
    source: "fixed",
    blocking: true,
    deadlineMonths: params.deadlineMonths ?? 0,
    chainId: params.chainId,
    stage: params.stage ?? "act1",
    completionLog: params.completionLog,
    choices: params.choices,
  };
}

export function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function drawInclusiveInt(min: number, max: number, getRoll: RandomRollProvider): number {
  const normalized = clamp(0, getRoll(), 0.999999999999);
  return min + Math.floor(normalized * (max - min + 1));
}

export function applyStateMutation(
  state: GameState,
  mutation: FixedStateMutation,
  buffSource = "事件",
): GameState {
  const nextPlayer = { ...state.player };
  if (mutation.san !== undefined) {
    nextPlayer.san = Math.min(state.sanCap, nextPlayer.san + mutation.san);
  }
  if (mutation.favor !== undefined) {
    nextPlayer.favor = Math.min(20, nextPlayer.favor + mutation.favor);
  }
  if (mutation.social !== undefined) {
    nextPlayer.social = Math.min(20, nextPlayer.social + mutation.social);
  }
  if (mutation.money !== undefined) {
    nextPlayer.money += mutation.money;
  }

  const buffs = mutation.temporaryIdeaBonus !== undefined
    ? addOrReplaceBuffs(state.buffs, [{
      id: `fixed-next-idea-${state.totalMonths}-${state.buffs.length}`,
      name: `下次想 idea +${mutation.temporaryIdeaBonus}分`,
      source: buffSource,
      timing: "next-action",
      remainingMonths: null,
      actionEffects: { idea: { bonus: mutation.temporaryIdeaBonus } },
    }])
    : state.buffs;
  return {
    ...state,
    player: nextPlayer,
    relationshipState: syncRelationshipState(state.relationshipState, nextPlayer.social),
    buffs,
  };
}
