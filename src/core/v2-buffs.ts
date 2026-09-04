import type {
  ActiveOperationType,
  Buff,
  GameState,
  PaperActionType,
  ReadingEffect,
  TemporaryActionEffectUpdates,
} from "./v2-types";
import { applyMultipliersThenAdditions, combineEffectMultipliers } from "./v2-numeric-modifiers";
import { getSeasonSanModifier } from "./v2-sanity-rules";

export interface ResolvedActionEffect {
  bonus: number;
  multiplier: number;
  extraActions: number;
  sanDelta: number;
}

const ACTION_TYPES: readonly PaperActionType[] = ["idea", "experiment", "writing"];

function cloneActionEffects(actionEffects: TemporaryActionEffectUpdates | undefined): TemporaryActionEffectUpdates | undefined {
  if (!actionEffects) return undefined;
  const cloned: TemporaryActionEffectUpdates = {};
  for (const action of ACTION_TYPES) {
    const effect = actionEffects[action];
    if (!effect) continue;
    cloned[action] = { ...effect };
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function cloneBuff(buff: Buff): Buff {
  return {
    ...buff,
    monthlyStats: buff.monthlyStats ? { ...buff.monthlyStats } : undefined,
    activeOperationSanMultiplier: buff.activeOperationSanMultiplier,
    actionEffects: cloneActionEffects(buff.actionEffects),
    paperPolishEffects: buff.paperPolishEffects ? { ...buff.paperPolishEffects } : undefined,
    readingEffect: buff.readingEffect ? { ...buff.readingEffect } : undefined,
    publicationEffects: buff.publicationEffects ? { ...buff.publicationEffects } : undefined,
    scheduledPublication: buff.scheduledPublication
      ? { ...buff.scheduledPublication, targetWeights: { ...buff.scheduledPublication.targetWeights } }
      : undefined,
  };
}

function isActiveBuff(buff: Buff): boolean {
  return buff.remainingMonths === null || buff.remainingMonths > 0;
}

function hasRemainingBuffEffects(buff: Buff): boolean {
  const hasNumericRecordValue = (record: Record<string, unknown> | undefined): boolean => (
    record !== undefined && Object.values(record).some((value) => Number.isFinite(value))
  );
  const hasActionEffect = buff.actionEffects !== undefined
    && Object.values(buff.actionEffects).some((effect) => effect !== undefined
      && Object.values(effect).some((value) => Number.isFinite(value)));
  const hasReadingEffect = buff.readingEffect !== undefined
    && Object.values(buff.readingEffect).some((value) => Number.isFinite(value));
  const hasPublicationEffect = buff.publicationEffects !== undefined
    && Object.values(buff.publicationEffects).some((value) => Number.isFinite(value));
  const hasScheduledPublication = buff.scheduledPublication !== undefined
    && Number.isFinite(buff.scheduledPublication.intervalMonths)
    && buff.scheduledPublication.intervalMonths > 0;

  return hasNumericRecordValue(buff.monthlyStats as Record<string, unknown> | undefined)
    || Number.isFinite(buff.activeOperationSanMultiplier)
    || Number.isFinite(buff.relationshipOperationSanDelta)
    || hasActionEffect
    || hasNumericRecordValue(buff.paperPolishEffects as Record<string, unknown> | undefined)
    || hasReadingEffect
    || hasPublicationEffect
    || hasScheduledPublication;
}

export function getActiveOperationSanMultiplier(
  buffs: readonly Buff[],
  _operation: ActiveOperationType,
): number {
  return combineEffectMultipliers(buffs.flatMap((buff) => {
    const value = buff.activeOperationSanMultiplier;
    return isActiveBuff(buff) && Number.isFinite(value) && (value ?? -1) >= 0 ? [value] : [];
  }));
}

export function getActiveOperationSanCost(
  baseSanCost: number,
  buffs: readonly Buff[],
  operation: ActiveOperationType,
  fixedSanDelta = 0,
): number {
  const normalizedCost = Number.isFinite(baseSanCost) ? Math.max(0, baseSanCost) : 0;
  const resolvedCost = applyMultipliersThenAdditions(
    normalizedCost,
    [getActiveOperationSanMultiplier(buffs, operation)],
    [fixedSanDelta],
    "ceil",
  );
  return Math.max(0, resolvedCost);
}

export function getActiveOperationSanCostForState(
  state: Pick<GameState, "buffs" | "month" | "eventSupport">,
  baseSanCost: number,
  operation: ActiveOperationType,
  fixedSanDelta = 0,
): number {
  const seasonalCostDelta = -getSeasonSanModifier(state.month, state.eventSupport);
  return getActiveOperationSanCost(
    baseSanCost,
    state.buffs,
    operation,
    fixedSanDelta + seasonalCostDelta,
  );
}

export function addOrReplaceBuffs(current: Buff[], additions: Buff[]): Buff[] {
  const next = new Map(current.map((buff) => [buff.id, buff]));
  for (const buff of additions) {
    next.set(buff.id, cloneBuff(buff));
  }
  return [...next.values()];
}

export function removeBuffs(current: Buff[], ids: string[]): Buff[] {
  const removed = new Set(ids);
  return current.filter((buff) => !removed.has(buff.id));
}

/**
 * Read all active Buff contributions for one paper action.
 * Additive bonuses and extra actions stack; multiplier offsets stack linearly.
 */
export function getBuffActionEffect(
  buffs: readonly Buff[],
  actionType: PaperActionType,
  options: { includeNextAction?: boolean } = {},
): ResolvedActionEffect {
  const includeNextAction = options.includeNextAction ?? true;
  const result: ResolvedActionEffect = { bonus: 0, multiplier: 1, extraActions: 0, sanDelta: 0 };
  const multipliers: number[] = [];
  for (const buff of buffs) {
    if (!isActiveBuff(buff)) continue;
    if (buff.timing === "next-action" && !includeNextAction) continue;
    const effect = buff.actionEffects?.[actionType];
    if (!effect) continue;

    if (Number.isFinite(effect.bonus)) {
      result.bonus += effect.bonus ?? 0;
    }
    if (Number.isFinite(effect.multiplier) && (effect.multiplier ?? -1) >= 0) {
      multipliers.push(effect.multiplier ?? 1);
    }
    if (Number.isFinite(effect.extraActions)) result.extraActions += effect.extraActions ?? 0;
    if (Number.isFinite(effect.sanDelta)) result.sanDelta += effect.sanDelta ?? 0;
  }

  result.multiplier = combineEffectMultipliers(multipliers);

  return result;
}

/**
 * Resolve one of the three research actions. Multipliers are applied first;
 * fixed SAN adjustments are then added and the result is clamped at zero.
 */
export function getPaperActionSanCost(
  baseSanCost: number,
  buffs: readonly Buff[],
  actionType: PaperActionType,
  fixedSanDelta = 0,
): number {
  const actionEffect = getActionEffect({ buffs }, actionType);
  return getActiveOperationSanCost(
    baseSanCost,
    buffs,
    actionType,
    actionEffect.sanDelta + fixedSanDelta,
  );
}

export function getRelationshipOperationSanDelta(buffs: readonly Buff[]): number {
  return buffs.reduce((total, buff) => {
    if (!isActiveBuff(buff) || !Number.isFinite(buff.relationshipOperationSanDelta)) return total;
    return total + (buff.relationshipOperationSanDelta ?? 0);
  }, 0);
}

export function getReadingEffect(buffs: readonly Buff[]): Required<ReadingEffect> {
  return buffs.reduce<Required<ReadingEffect>>((total, buff) => {
    if (!isActiveBuff(buff) || !buff.readingEffect) return total;
    return {
      sanDelta: total.sanDelta + (buff.readingEffect.sanDelta ?? 0),
      manualExtraReads: total.manualExtraReads + (buff.readingEffect.manualExtraReads ?? 0),
      automaticReads: total.automaticReads + (buff.readingEffect.automaticReads ?? 0),
    };
  }, { sanDelta: 0, manualExtraReads: 0, automaticReads: 0 });
}

export function getActionEffect(
  state: { buffs: readonly Buff[] },
  actionType: PaperActionType,
  options: { includeNextAction?: boolean } = {},
): ResolvedActionEffect {
  return getBuffActionEffect(state.buffs, actionType, options);
}

/**
 * Consume only the next-action part for the action that just ran.
 * A multi-action Buff is retained with its unconsumed action entries.
 */
export function consumeNextActionBuffs(
  state: GameState,
  actionType: PaperActionType,
): GameState {
  const buffs = state.buffs.flatMap((buff) => {
    if (buff.timing !== "next-action" || !buff.actionEffects?.[actionType]) return [buff];

    const actionEffects = cloneActionEffects(buff.actionEffects);
    if (actionEffects) delete actionEffects[actionType];
    const nextBuff = { ...cloneBuff(buff), actionEffects };
    if (!actionEffects || Object.keys(actionEffects).length === 0) {
      nextBuff.actionEffects = undefined;
    }
    return hasRemainingBuffEffects(nextBuff) ? [nextBuff] : [];
  });

  return { ...state, buffs };
}

export function getActiveBuffs(
  buffs: readonly Buff[],
  timing?: Buff["timing"],
): Buff[] {
  return buffs.filter((buff) => isActiveBuff(buff) && (!timing || buff.timing === timing)).map(cloneBuff);
}

export function getPublicationBuffEffect(
  buffs: readonly Buff[],
): {
  nextPromotionMultiplier: number;
  citationDebuffMultiplier: number;
} {
  const nextPromotionMultipliers: number[] = [];
  const citationDebuffMultipliers: number[] = [];
  for (const buff of buffs) {
    if (!isActiveBuff(buff)) continue;
    const effect = buff.publicationEffects;
    if (!effect) continue;
    if (Number.isFinite(effect.nextPromotionMultiplier) && (effect.nextPromotionMultiplier ?? -1) >= 0) {
      nextPromotionMultipliers.push(effect.nextPromotionMultiplier ?? 1);
    }
    if (Number.isFinite(effect.citationDebuffMultiplier) && (effect.citationDebuffMultiplier ?? -1) >= 0) {
      citationDebuffMultipliers.push(effect.citationDebuffMultiplier ?? 1);
    }
  }
  return {
    nextPromotionMultiplier: combineEffectMultipliers(nextPromotionMultipliers),
    citationDebuffMultiplier: combineEffectMultipliers(citationDebuffMultipliers),
  };
}

export function consumeNextPublicationBuffs(state: GameState): GameState {
  return {
    ...state,
    buffs: state.buffs.flatMap((buff) => {
      if (buff.timing !== "next-action" || buff.publicationEffects?.nextPromotionMultiplier === undefined) return [buff];
      const publicationEffects = { ...buff.publicationEffects };
      delete publicationEffects.nextPromotionMultiplier;
      const nextBuff: Buff = {
        ...cloneBuff(buff),
        publicationEffects: Object.keys(publicationEffects).length > 0 ? publicationEffects : undefined,
      };
      return hasRemainingBuffEffects(nextBuff) ? [nextBuff] : [];
    }),
  };
}

export function advanceBuffDurations(buffs: readonly Buff[]): Buff[] {
  return buffs.flatMap((buff) => {
    if (buff.remainingMonths === null) return [buff];
    if (buff.remainingMonths <= 1) return [];
    return [{ ...cloneBuff(buff), remainingMonths: buff.remainingMonths - 1 }];
  });
}
