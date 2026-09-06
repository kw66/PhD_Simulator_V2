import { getActiveBuffs } from "../core/v2-buffs";
import { combineEffectMultipliers } from "../core/v2-numeric-modifiers";
import type { Buff, BuffTiming, PaperActionType, PlayerStats } from "../core/v2-types";

export interface BuffDisplayItem {
  id: string;
  label: string;
  sources: string[];
  isDebuff: boolean;
}

export interface BuffDisplayBuckets {
  permanent: BuffDisplayItem[];
  monthly: BuffDisplayItem[];
  nextAction: BuffDisplayItem[];
}

type EffectOperation = "sum" | "multiplier" | "max";

interface AccumulatedEffect {
  id: string;
  timing: BuffTiming;
  value: number;
  operation: EffectOperation;
  multiplierValues?: number[];
  sources: string[];
  showWhenZero?: boolean;
  isDebuffWhenAboveOne?: boolean;
  renderLabel: (value: number) => string;
}

const ACTION_LABELS: Record<PaperActionType, string> = {
  idea: "idea",
  experiment: "实验",
  writing: "论文",
};

const STAT_LABELS: Record<keyof PlayerStats, string> = {
  san: "SAN",
  research: "科研",
  social: "社交",
  favor: "导师好感",
  money: "金币",
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

function getDurationText(buff: Buff): string {
  if (buff.timing === "permanent") return "永久";
  if (buff.timing === "next-action") return "对应效果触发后消耗";
  return buff.remainingMonths === null ? "持续生效" : `剩余 ${buff.remainingMonths} 月`;
}

function getSourceText(buff: Buff): string {
  const description = buff.description?.trim();
  return `${buff.source} · ${getDurationText(buff)}${description ? `：${description}` : ""}`;
}

/**
 * Relationship progression owns the long-term mentoring card. Keep its
 * underlying month-start cost out of the generic Buff list so the same
 * relationship is not shown twice; the next-month preview still exposes the
 * actual SAN settlement.
 */
function isRelationshipManagedMentoring(buff: Buff): boolean {
  // Scheduled publications are owned by the relationship progression panel;
  // keep their settlement details out of the generic Buff list regardless of
  // the relationship label used by a future event.
  return buff.scheduledPublication !== undefined;
}

function appendUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}

function addEffect(
  effects: Map<string, AccumulatedEffect>,
  config: Omit<AccumulatedEffect, "value" | "sources"> & { value: number; source: string },
): void {
  if (!Number.isFinite(config.value)) return;
  if ((config.operation === "sum" || config.operation === "max") && config.value === 0 && !config.showWhenZero) return;
  if (config.operation === "multiplier" && (config.value < 0 || config.value === 1)) return;

  const current = effects.get(config.id);
  if (current) {
    if (config.operation === "multiplier") {
      current.multiplierValues = [...(current.multiplierValues ?? [current.value]), config.value];
      current.value = combineEffectMultipliers(current.multiplierValues);
    } else {
      current.value = config.operation === "sum"
        ? current.value + config.value
        : Math.max(current.value, config.value);
    }
    current.showWhenZero = current.showWhenZero || config.showWhenZero;
    appendUnique(current.sources, config.source);
    return;
  }

  effects.set(config.id, {
    id: config.id,
    timing: config.timing,
    value: config.value,
    operation: config.operation,
    ...(config.operation === "multiplier" ? { multiplierValues: [config.value] } : {}),
    sources: [config.source],
    showWhenZero: config.showWhenZero,
    isDebuffWhenAboveOne: config.isDebuffWhenAboveOne,
    renderLabel: config.renderLabel,
  });
}

function addActionEffects(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  const source = getSourceText(buff);
  for (const [action, actionEffect] of Object.entries(buff.actionEffects ?? {})) {
    if (!actionEffect) continue;
    const typedAction = action as PaperActionType;
    const actionLabel = ACTION_LABELS[typedAction];

    if (actionEffect.bonus !== undefined) {
      addEffect(effects, {
        id: `${buff.timing}:action:${typedAction}:bonus${buff.id.startsWith("ai-") ? ":ai" : ""}`,
        timing: buff.timing,
        operation: "sum",
        value: actionEffect.bonus,
        source,
        renderLabel: (value) => `${actionLabel} ${formatSignedNumber(value)}分`,
      });
    }
    if (actionEffect.multiplier !== undefined) {
      addEffect(effects, {
        id: `${buff.timing}:action:${typedAction}:multiplier`,
        timing: buff.timing,
        operation: "multiplier",
        value: actionEffect.multiplier,
        source,
        renderLabel: (value) => `${actionLabel} 总分 ×${formatNumber(value)}`,
      });
    }
    if (actionEffect.extraActions !== undefined) {
      addEffect(effects, {
        id: `${buff.timing}:action:${typedAction}:extra-actions`,
        timing: buff.timing,
        operation: "sum",
        value: actionEffect.extraActions,
        source,
        renderLabel: (value) => `${actionLabel} ${formatSignedNumber(value)}次`,
      });
    }
    if (actionEffect.sanDelta !== undefined) {
      addEffect(effects, {
        id: `${buff.timing}:action:${typedAction}:san-delta`,
        timing: buff.timing,
        operation: "sum",
        value: actionEffect.sanDelta,
        source,
        showWhenZero: true,
        renderLabel: (value) => `${actionLabel} SAN ${formatSignedNumber(value)}`,
      });
    }
  }
}

function addPaperPolishEffects(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  const source = getSourceText(buff);
  for (const [action, bonus] of Object.entries(buff.paperPolishEffects ?? {})) {
    if (!Number.isFinite(bonus) || (bonus ?? 0) <= 0) continue;
    const typedAction = action as PaperActionType;
    addEffect(effects, {
      id: `${buff.timing}:paper-polish:${typedAction}`,
      timing: buff.timing,
      operation: "sum",
      value: bonus!,
      source,
      renderLabel: (value) => `自动${ACTION_LABELS[typedAction]}${formatSignedNumber(value)}分`,
    });
  }
}

function addReadingEffects(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  const source = getSourceText(buff);
  const reading = buff.readingEffect;
  if (!reading) return;
  if (reading.sanDelta !== undefined) {
    addEffect(effects, {
      id: `${buff.timing}:reading:san-delta`,
      timing: buff.timing,
      operation: "sum",
      value: reading.sanDelta,
      source,
      showWhenZero: true,
      renderLabel: (value) => `看论文 SAN ${formatSignedNumber(value)}`,
    });
  }
  if (reading.manualExtraReads !== undefined) {
    addEffect(effects, {
      id: `${buff.timing}:reading:manual-extra`,
      timing: buff.timing,
      operation: "sum",
      value: reading.manualExtraReads,
      source,
      renderLabel: (value) => `手动看论文 ${formatSignedNumber(value)}次`,
    });
  }
  if (reading.automaticReads !== undefined) {
    addEffect(effects, {
      id: `${buff.timing}:reading:automatic`,
      timing: buff.timing,
      operation: "sum",
      value: reading.automaticReads,
      source,
      renderLabel: (value) => `自动看论文 ${formatSignedNumber(value)}次`,
    });
  }
}

function addMonthlyStats(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  // This matches month-start settlement: finite monthly Buffs also apply their
  // monthly stats, while next-action Buffs do not.
  if (buff.timing === "next-action") return;
  if (isRelationshipManagedMentoring(buff)) return;
  const source = getSourceText(buff);
  for (const [stat, value] of Object.entries(buff.monthlyStats ?? {})) {
    if (value === undefined) continue;
    const typedStat = stat as keyof PlayerStats;
    addEffect(effects, {
      id: `${buff.timing}:monthly-stat:${typedStat}`,
      timing: buff.timing,
      operation: "sum",
      value,
      source,
      showWhenZero: typedStat === "san" || typedStat === "money",
      renderLabel: (total) => `每月 ${STAT_LABELS[typedStat]} ${formatSignedNumber(total)}`,
    });
  }
}

function addPublicationEffects(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  const source = getSourceText(buff);
  const publicationEffects = buff.publicationEffects;
  if (!publicationEffects) return;
  const entries = [
    ["next", publicationEffects.nextPromotionMultiplier, "下篇论文宣传"],
    ["all", publicationEffects.citationDebuffMultiplier, "引用"],
  ] as const;

  for (const [kind, value, label] of entries) {
    if (value === undefined) continue;
    addEffect(effects, {
      id: `${buff.timing}:publication:${kind}`,
      timing: buff.timing,
      operation: "multiplier",
      value,
      source,
      renderLabel: (total) => `${label}×${formatNumber(total)}`,
    });
  }
}

function addRuleEffects(effects: Map<string, AccumulatedEffect>, buff: Buff): void {
  if (buff.activeOperationSanMultiplier !== undefined) {
    addEffect(effects, {
      id: `${buff.timing}:rule:active-operation-san-multiplier`,
      timing: buff.timing,
      operation: "multiplier",
      value: buff.activeOperationSanMultiplier,
      source: getSourceText(buff),
      isDebuffWhenAboveOne: true,
      renderLabel: (value) => `主动操作 SAN ×${formatNumber(value)}`,
    });
  }
  if (buff.relationshipOperationSanDelta !== undefined) {
    addEffect(effects, {
      id: `${buff.timing}:rule:relationship-operation-san-delta`,
      timing: buff.timing,
      operation: "sum",
      value: buff.relationshipOperationSanDelta,
      source: getSourceText(buff),
      showWhenZero: true,
      renderLabel: (value) => `人际操作 SAN ${formatSignedNumber(value)}`,
    });
  }
}

export function buildBuffDisplayBuckets(buffs: readonly Buff[]): BuffDisplayBuckets {
  const effects = new Map<string, AccumulatedEffect>();
  for (const buff of getActiveBuffs(buffs)) {
    addActionEffects(effects, buff);
    addPaperPolishEffects(effects, buff);
    addReadingEffects(effects, buff);
    addMonthlyStats(effects, buff);
    addPublicationEffects(effects, buff);
    addRuleEffects(effects, buff);
  }

  const buckets: BuffDisplayBuckets = { permanent: [], monthly: [], nextAction: [] };
  for (const effect of effects.values()) {
    if (effect.operation === "sum" && effect.value === 0 && !effect.showWhenZero) continue;
    const item: BuffDisplayItem = {
      id: effect.id,
      label: effect.renderLabel(effect.value),
      sources: effect.sources,
      isDebuff: effect.operation === "multiplier"
        ? effect.isDebuffWhenAboveOne ? effect.value > 1 : effect.value < 1
        : effect.value < 0,
    };
    if (effect.timing === "permanent") buckets.permanent.push(item);
    else if (effect.timing === "monthly") buckets.monthly.push(item);
    else buckets.nextAction.push(item);
  }
  return buckets;
}
