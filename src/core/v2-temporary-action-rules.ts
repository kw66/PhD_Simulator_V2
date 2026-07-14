import type { PaperActionType, TemporaryActionEffect, TemporaryActionEffectUpdates, TemporaryActionEffects } from "./v2-types";

function createTemporaryActionEffect(): TemporaryActionEffect {
  return {
    bonus: 0,
    multiplier: 1,
    extraActions: 0,
  };
}

export function createTemporaryActionEffects(): TemporaryActionEffects {
  return {
    idea: createTemporaryActionEffect(),
    experiment: createTemporaryActionEffect(),
    writing: createTemporaryActionEffect(),
  };
}

function mergeTemporaryActionEffect(
  current: TemporaryActionEffect,
  update?: Partial<TemporaryActionEffect>,
): TemporaryActionEffect {
  if (!update) {
    return { ...current };
  }

  return {
    bonus: current.bonus + (update.bonus ?? 0),
    multiplier: Math.max(0, current.multiplier * (update.multiplier ?? 1)),
    extraActions: current.extraActions + (update.extraActions ?? 0),
  };
}

export function applyTemporaryActionEffectUpdates(
  current: TemporaryActionEffects,
  updates?: TemporaryActionEffectUpdates,
): TemporaryActionEffects {
  if (!updates) {
    return {
      idea: { ...current.idea },
      experiment: { ...current.experiment },
      writing: { ...current.writing },
    };
  }

  return {
    idea: mergeTemporaryActionEffect(current.idea, updates.idea),
    experiment: mergeTemporaryActionEffect(current.experiment, updates.experiment),
    writing: mergeTemporaryActionEffect(current.writing, updates.writing),
  };
}

export function consumeTemporaryActionEffect(
  current: TemporaryActionEffects,
  actionType: PaperActionType,
): TemporaryActionEffects {
  const nextState = {
    idea: { ...current.idea },
    experiment: { ...current.experiment },
    writing: { ...current.writing },
  };

  nextState[actionType] = createTemporaryActionEffect();
  return nextState;
}

export function calculateTemporaryActionGain(baseGain: number, effect: TemporaryActionEffect): number {
  const multiplier = Math.max(0, effect.multiplier);
  const firstGain = Math.max(0, Math.round((baseGain + effect.bonus) * multiplier));
  const repeatedGain = Math.max(0, Math.round(baseGain * multiplier));
  return firstGain + repeatedGain * effect.extraActions;
}

export function hasTemporaryActionEffect(effect: TemporaryActionEffect): boolean {
  return effect.bonus !== 0 || effect.multiplier !== 1 || effect.extraActions !== 0;
}
