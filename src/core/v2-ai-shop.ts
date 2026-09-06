import { getAcademicCalendarMonth, getAcademicCalendarYear } from "./v2-calendar";
import { getCalendarForTotalMonths } from "./v2-progression";
import type { ActiveOperationType, Buff, GameState, Paper, PaperActionType, ReadingEffect } from "./v2-types";
import type { AiShopState, AiSlotId, AiSubscriptionState } from "./v2-types-economy";

export interface AiModelActionEffect {
  bonus?: number;
  extraActions?: number;
  sanDelta?: number;
}

export interface AiModelOffer {
  id: string;
  slot: AiSlotId;
  name: string;
  provider: string;
  releaseYear: number;
  releaseMonth: number;
  price: number;
  description: string;
  researchEffects: Partial<Record<PaperActionType, AiModelActionEffect>>;
  relationshipOperationSanDelta?: number;
  readingEffect?: ReadingEffect;
}

export const AI_SLOT_IDS: readonly AiSlotId[] = ["gpt", "claude", "gemini", "deepseek", "doubao", "kimi"];

const RESEARCH_ACTIONS: readonly PaperActionType[] = ["idea", "experiment", "writing"];

/* Models advance at the start of each academic year. */
const AI_MODEL_TIMELINE: readonly AiModelOffer[] = [
  { id: "gpt-3.5", slot: "gpt", name: "GPT-3.5", provider: "OpenAI", releaseYear: 2023, releaseMonth: 9, price: 2, description: "早期通用模型，适合整理思路和起草文字。", researchEffects: { idea: { bonus: 3 }, experiment: { bonus: 3 }, writing: { bonus: 3 } } },
  { id: "gpt-4o", slot: "gpt", name: "GPT-4o", provider: "OpenAI", releaseYear: 2024, releaseMonth: 9, price: 2, description: "帮你梳理研究思路、检查实验方案和起草论文。", researchEffects: { idea: { bonus: 4 }, experiment: { bonus: 4 }, writing: { bonus: 4 } } },
  { id: "gpt-5", slot: "gpt", name: "GPT-5", provider: "OpenAI", releaseYear: 2025, releaseMonth: 9, price: 3, description: "为你想 idea、做实验和写论文提供更高的得分加成。", researchEffects: { idea: { bonus: 5 }, experiment: { bonus: 5 }, writing: { bonus: 5 } } },
  { id: "gpt-5.6-sol", slot: "gpt", name: "GPT-6-Astra", provider: "OpenAI", releaseYear: 2026, releaseMonth: 9, price: 3, description: "想 idea、做实验、写论文时，都能帮你提高得分。", researchEffects: { idea: { bonus: 6 }, experiment: { bonus: 6 }, writing: { bonus: 6 } } },
  { id: "gpt-6", slot: "gpt", name: "GPT-7", provider: "OpenAI", releaseYear: 2027, releaseMonth: 9, price: 4, description: "你想 idea、做实验和写论文时，能获得更高的得分加成。", researchEffects: { idea: { bonus: 7 }, experiment: { bonus: 7 }, writing: { bonus: 7 } } },
  { id: "gpt-7", slot: "gpt", name: "GPT-8", provider: "OpenAI", releaseYear: 2028, releaseMonth: 9, price: 4, description: "三项科研操作的得分加成继续提高，不过论文还得你来做。", researchEffects: { idea: { bonus: 8 }, experiment: { bonus: 8 }, writing: { bonus: 8 } } },

  { id: "claude-2", slot: "claude", name: "Claude 2", provider: "Anthropic", releaseYear: 2023, releaseMonth: 9, price: 2, description: "订购或续费时，帮你梳理论文思路，提高现有可修改论文的 idea 分数。", researchEffects: { idea: { bonus: 2 } } },
  { id: "claude-3.5-sonnet", slot: "claude", name: "Claude 3.5 Sonnet", provider: "Anthropic", releaseYear: 2024, releaseMonth: 9, price: 2, description: "订购或续费时，帮你梳理思路和实验方案，提高现有可修改论文的 idea 与实验分数。", researchEffects: { idea: { bonus: 2 }, experiment: { bonus: 2 } } },
  { id: "claude-opus-4.6", slot: "claude", name: "Claude Opus 4.6", provider: "Anthropic", releaseYear: 2025, releaseMonth: 9, price: 4, description: "订购或续费时，帮你润色现有可修改论文，提高 idea、实验和写作分数。", researchEffects: { idea: { bonus: 2 }, experiment: { bonus: 2 }, writing: { bonus: 2 } } },
  { id: "claude-fable-5", slot: "claude", name: "Claude Fable 5", provider: "Anthropic", releaseYear: 2026, releaseMonth: 9, price: 4, description: "订购或续费时，提高你现有可修改论文的三项分数，idea 加成更高。", researchEffects: { idea: { bonus: 4 }, experiment: { bonus: 2 }, writing: { bonus: 2 } } },
  { id: "claude-fable-6", slot: "claude", name: "Claude Fable 6", provider: "Anthropic", releaseYear: 2027, releaseMonth: 9, price: 6, description: "订购或续费时，提高你现有可修改论文的三项分数，idea 和实验加成更高。", researchEffects: { idea: { bonus: 4 }, experiment: { bonus: 4 }, writing: { bonus: 2 } } },
  { id: "claude-fable-7", slot: "claude", name: "Claude Fable 7", provider: "Anthropic", releaseYear: 2028, releaseMonth: 9, price: 6, description: "订购或续费时，提高你现有可修改论文的三项分数，写作加成也跟上了。", researchEffects: { idea: { bonus: 4 }, experiment: { bonus: 4 }, writing: { bonus: 4 } } },

  { id: "gemini-1.5", slot: "gemini", name: "Gemini 1.5", provider: "Google", releaseYear: 2023, releaseMonth: 9, price: 1, description: "帮你减少科研操作的消耗，每次固定少耗 1 SAN。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } } },
  { id: "gemini-2.0", slot: "gemini", name: "Gemini 2.0", provider: "Google", releaseYear: 2024, releaseMonth: 9, price: 1, description: "科研操作固定少耗 1 SAN，不改变得分和执行次数。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } } },
  { id: "gemini-2.5", slot: "gemini", name: "Gemini 2.5", provider: "Google", releaseYear: 2025, releaseMonth: 9, price: 1, description: "科研操作固定少耗 1 SAN。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } } },
  { id: "gemini-3", slot: "gemini", name: "Gemini 3", provider: "Google", releaseYear: 2026, releaseMonth: 9, price: 3, description: "科研操作与人际操作固定少耗 1 SAN。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } }, relationshipOperationSanDelta: -1 },
  { id: "gemini-4", slot: "gemini", name: "Gemini 4", provider: "Google", releaseYear: 2027, releaseMonth: 9, price: 3, description: "科研操作与人际操作固定少耗 1 SAN。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } }, relationshipOperationSanDelta: -1 },
  { id: "gemini-5", slot: "gemini", name: "Gemini 5", provider: "Google", releaseYear: 2028, releaseMonth: 9, price: 3, description: "科研操作与人际操作固定少耗 1 SAN。", researchEffects: { idea: { sanDelta: -1 }, experiment: { sanDelta: -1 }, writing: { sanDelta: -1 } }, relationshipOperationSanDelta: -1 },

  { id: "deepseek-v2", slot: "deepseek", name: "DeepSeek-V2", provider: "DeepSeek", releaseYear: 2023, releaseMonth: 9, price: 1, description: "想 idea、做实验、写论文时，每次多执行 1 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 1 }, experiment: { extraActions: 1 }, writing: { extraActions: 1 } } },
  { id: "deepseek-v3.2", slot: "deepseek", name: "DeepSeek-V3.2", provider: "DeepSeek", releaseYear: 2024, releaseMonth: 9, price: 1, description: "和 V2 一样，每次想 idea、做实验或写论文时多执行 1 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 1 }, experiment: { extraActions: 1 }, writing: { extraActions: 1 } } },
  { id: "deepseek-r1", slot: "deepseek", name: "DeepSeek-R1", provider: "DeepSeek", releaseYear: 2025, releaseMonth: 9, price: 1, description: "想 idea、做实验、写论文时，每次多执行 2 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 2 }, experiment: { extraActions: 2 }, writing: { extraActions: 2 } } },
  { id: "deepseek-v4", slot: "deepseek", name: "DeepSeek-V4", provider: "DeepSeek", releaseYear: 2026, releaseMonth: 9, price: 2, description: "想 idea、做实验、写论文时，每次多执行 2 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 2 }, experiment: { extraActions: 2 }, writing: { extraActions: 2 } } },
  { id: "deepseek-v5", slot: "deepseek", name: "DeepSeek-V5", provider: "DeepSeek", releaseYear: 2027, releaseMonth: 9, price: 2, description: "想 idea、做实验、写论文时，每次多执行 3 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 3 }, experiment: { extraActions: 3 }, writing: { extraActions: 3 } } },
  { id: "deepseek-v6", slot: "deepseek", name: "DeepSeek-V6", provider: "DeepSeek", releaseYear: 2028, releaseMonth: 9, price: 2, description: "想 idea、做实验、写论文时，每次多执行 3 次，不额外占用行动点。", researchEffects: { idea: { extraActions: 3 }, experiment: { extraActions: 3 }, writing: { extraActions: 3 } } },

  { id: "doubao-seed-1", slot: "doubao", name: "豆包 Seed 1", provider: "豆包", releaseYear: 2023, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +1 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 1, sanDelta: 1 }, experiment: { bonus: 1, sanDelta: 1 }, writing: { bonus: 1, sanDelta: 1 } } },
  { id: "doubao-seed-2", slot: "doubao", name: "豆包 Seed 2", provider: "豆包", releaseYear: 2024, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +1 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 1, sanDelta: 1 }, experiment: { bonus: 1, sanDelta: 1 }, writing: { bonus: 1, sanDelta: 1 } } },
  { id: "doubao-seed-3", slot: "doubao", name: "豆包 Seed 3", provider: "豆包", releaseYear: 2025, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +2 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 2, sanDelta: 1 }, experiment: { bonus: 2, sanDelta: 1 }, writing: { bonus: 2, sanDelta: 1 } } },
  { id: "doubao-seed-4", slot: "doubao", name: "豆包 Seed 4", provider: "豆包", releaseYear: 2026, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +2 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 2, sanDelta: 1 }, experiment: { bonus: 2, sanDelta: 1 }, writing: { bonus: 2, sanDelta: 1 } } },
  { id: "doubao-seed-5", slot: "doubao", name: "豆包 Seed 5", provider: "豆包", releaseYear: 2027, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +3 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 3, sanDelta: 1 }, experiment: { bonus: 3, sanDelta: 1 }, writing: { bonus: 3, sanDelta: 1 } } },
  { id: "doubao-seed-6", slot: "doubao", name: "豆包 Seed 6", provider: "豆包", releaseYear: 2028, releaseMonth: 9, price: 0, description: "免费模型，科研三项各 +3 分，但每次多耗 1 SAN。", researchEffects: { idea: { bonus: 3, sanDelta: 1 }, experiment: { bonus: 3, sanDelta: 1 }, writing: { bonus: 3, sanDelta: 1 } } },

  { id: "kimi-chat", slot: "kimi", name: "Kimi Chat", provider: "月之暗面", releaseYear: 2023, releaseMonth: 9, price: 1, description: "长文本阅读助手，看论文固定少耗 1 SAN。", researchEffects: {}, readingEffect: { sanDelta: -1 } },
  { id: "kimi-k1.5", slot: "kimi", name: "Kimi k1.5", provider: "月之暗面", releaseYear: 2024, releaseMonth: 9, price: 1, description: "一次手动看论文可完成两次阅读，共用行动点，SAN 按阅读次数消耗。", researchEffects: {}, readingEffect: { sanDelta: -1, manualExtraReads: 1 } },
  { id: "kimi-k2", slot: "kimi", name: "Kimi K2", provider: "月之暗面", releaseYear: 2025, releaseMonth: 9, price: 2, description: "每月订购或续费时自动看论文 1 次，照常计算 SAN 消耗，不占行动点；SAN 不足时不执行。", researchEffects: {}, readingEffect: { sanDelta: -1, automaticReads: 1 } },
  { id: "kimi-k3", slot: "kimi", name: "Kimi K3", provider: "月之暗面", releaseYear: 2026, releaseMonth: 9, price: 2, description: "每月订购或续费时自动看论文 1 次，照常计算 SAN 消耗，不占行动点；SAN 不足时不执行。", researchEffects: {}, readingEffect: { sanDelta: -1, automaticReads: 1 } },
  { id: "kimi-k4", slot: "kimi", name: "Kimi K4", provider: "月之暗面", releaseYear: 2027, releaseMonth: 9, price: 3, description: "每月订购或续费时自动看论文 2 次，照常计算 SAN 消耗，不占行动点；SAN 不足时提前停止。", researchEffects: {}, readingEffect: { sanDelta: -1, automaticReads: 2 } },
  { id: "kimi-k5", slot: "kimi", name: "Kimi K5", provider: "月之暗面", releaseYear: 2028, releaseMonth: 9, price: 3, description: "每月订购或续费时自动看论文 2 次，照常计算 SAN 消耗，不占行动点；SAN 不足时提前停止。", researchEffects: {}, readingEffect: { sanDelta: -1, automaticReads: 2 } },
];

function compareDate(leftYear: number, leftMonth: number, rightYear: number, rightMonth: number): number {
  return leftYear !== rightYear ? leftYear - rightYear : leftMonth - rightMonth;
}

function getCurrentAcademicDate(totalMonths: number): { year: number; month: number } {
  const calendar = getCalendarForTotalMonths(Math.max(1, totalMonths));
  return { year: getAcademicCalendarYear(calendar.year, calendar.month), month: getAcademicCalendarMonth(calendar.month) };
}

export function getAiModelTimeline(): readonly AiModelOffer[] {
  return AI_MODEL_TIMELINE;
}

export function getAiModelForTotalMonths(totalMonths: number, slot: AiSlotId): AiModelOffer {
  const date = getCurrentAcademicDate(totalMonths);
  const candidates = AI_MODEL_TIMELINE.filter((model) => model.slot === slot);
  return candidates.reduce((current, candidate) => (
    compareDate(candidate.releaseYear, candidate.releaseMonth, date.year, date.month) <= 0 ? candidate : current
  ), candidates[0]!);
}

export function getAiModelById(modelId: string | null | undefined): AiModelOffer | null {
  return AI_MODEL_TIMELINE.find((model) => model.id === modelId) ?? null;
}

export function getAiSlotLabel(slot: AiSlotId): string {
  return slot === "gpt" ? "GPT"
    : slot === "claude" ? "Claude"
      : slot === "gemini" ? "Gemini"
        : slot === "deepseek" ? "DeepSeek"
          : slot === "doubao" ? "豆包"
            : "Kimi";
}

function createSubscriptionState(): AiSubscriptionState {
  return { enabled: false, active: false, paused: false, modelId: null, lastRenewalTotalMonths: null };
}

export function createAiShopState(): AiShopState {
  return { subscriptions: Object.fromEntries(AI_SLOT_IDS.map((slot) => [slot, createSubscriptionState()])) as AiShopState["subscriptions"] };
}

export interface AiRenewalItem {
  slot: AiSlotId;
  model: AiModelOffer;
  paid: boolean;
  price: number;
  reason: "paid" | "insufficient-money" | "model-updated";
}

export interface AiRenewalResolution {
  state: AiShopState;
  money: number;
  items: AiRenewalItem[];
}

export function getAiRenewalPrice(totalMonths: number, slot: AiSlotId, reimbursement = false): number {
  return reimbursement ? 0 : getAiModelForTotalMonths(totalMonths, slot).price;
}

export function renewAiSubscriptionSlot(
  aiShopState: AiShopState,
  totalMonths: number,
  money: number,
  slot: AiSlotId,
  reimbursement = false,
): AiRenewalResolution {
  const subscription = aiShopState.subscriptions[slot];
  const model = getAiModelForTotalMonths(totalMonths, slot);
  if (subscription.lastRenewalTotalMonths === totalMonths) {
    return { state: aiShopState, money, items: [] };
  }

  const modelUpdated = subscription.enabled
    && subscription.modelId !== null
    && subscription.modelId !== model.id;
  if (modelUpdated) {
    return {
      state: {
        subscriptions: {
          ...aiShopState.subscriptions,
          [slot]: {
            ...subscription,
            enabled: false,
            active: false,
            paused: false,
            modelId: model.id,
            lastRenewalTotalMonths: totalMonths,
          },
        },
      },
      money,
      items: [{ slot, model, paid: false, price: model.price, reason: "model-updated" }],
    };
  }

  const renewalPrice = getAiRenewalPrice(totalMonths, slot, reimbursement);
  if (subscription.enabled && money >= renewalPrice) {
    return {
      state: {
        subscriptions: {
          ...aiShopState.subscriptions,
          [slot]: {
            ...subscription,
            active: true,
            paused: false,
            modelId: model.id,
            lastRenewalTotalMonths: totalMonths,
          },
        },
      },
      money: money - renewalPrice,
      items: [{ slot, model, paid: true, price: renewalPrice, reason: "paid" }],
    };
  }

  return {
    state: {
      subscriptions: {
        ...aiShopState.subscriptions,
        [slot]: {
          ...subscription,
          active: false,
          paused: subscription.enabled,
          modelId: model.id,
          lastRenewalTotalMonths: totalMonths,
        },
      },
    },
    money,
    items: subscription.enabled
      ? [{ slot, model, paid: false, price: model.price, reason: "insufficient-money" }]
      : [],
  };
}

export function getActiveAiModels(aiShopState: AiShopState): AiModelOffer[] {
  return AI_SLOT_IDS
    .map((slot) => aiShopState.subscriptions[slot])
    .filter((subscription) => subscription.active)
    .map((subscription) => getAiModelById(subscription.modelId))
    .filter((model): model is AiModelOffer => model !== null);
}

export interface AiCollaborationStatus {
  activeAiCount: number;
  hasCoreModel: boolean;
  active: boolean;
}

export function getAiCollaborationStatus(aiShopState: AiShopState): AiCollaborationStatus {
  const activeModels = getActiveAiModels(aiShopState);
  const hasCoreModel = activeModels.some((model) => model.slot === "gpt" || model.slot === "claude");
  return {
    activeAiCount: activeModels.length,
    hasCoreModel,
    active: activeModels.length >= 3 && hasCoreModel,
  };
}

export function hasAiCollaboration(aiShopState: AiShopState): boolean {
  return getAiCollaborationStatus(aiShopState).active;
}

export interface ActiveOperationAllowance {
  allowed: boolean;
  consumesAction: boolean;
  usesAiResearchBonus: boolean;
}

/**
 * Resolve action-point usage in one place. Regular action points are always
 * spent first; after they are exhausted, AI collaboration grants one extra
 * idea, experiment or writing operation for the month.
 */
export function getActiveOperationAllowance(
  state: Pick<GameState, "aiShopState" | "actionState">,
  operation: ActiveOperationType,
): ActiveOperationAllowance {
  const isResearch = operation === "idea" || operation === "experiment" || operation === "writing";
  const hasRegularAction = state.actionState.used < state.actionState.limit;
  const usesAiResearchBonus = !hasRegularAction
    && isResearch
    && hasAiCollaboration(state.aiShopState)
    && !state.actionState.aiResearchBonusUsed;
  return {
    allowed: hasRegularAction || usesAiResearchBonus,
    consumesAction: hasRegularAction,
    usesAiResearchBonus,
  };
}

/** Convert the active model set into the regular Buff representation. */
export function createAiBuffs(aiShopState: AiShopState): Buff[] {
  return getActiveAiModels(aiShopState).map((model) => {
    const actionEffects = model.slot === "claude"
      ? undefined
      : Object.fromEntries(
        RESEARCH_ACTIONS
          .filter((action) => model.researchEffects[action])
          .map((action) => [action, { ...model.researchEffects[action] }]),
      ) as Buff["actionEffects"];
    const paperPolishEffects = model.slot === "claude"
      ? Object.fromEntries(
        RESEARCH_ACTIONS
          .map((action) => [action, model.researchEffects[action]?.bonus ?? 0] as const)
          .filter(([, bonus]) => bonus > 0),
      ) as Buff["paperPolishEffects"]
      : undefined;
    return {
      id: `ai-${model.slot}`,
      name: `${model.name}（本月）`,
      source: `商店 ${model.name}`,
      timing: "monthly" as const,
      remainingMonths: 1,
      ...(actionEffects ? { actionEffects } : {}),
      ...(paperPolishEffects ? { paperPolishEffects } : {}),
      ...(model.readingEffect ? { readingEffect: { ...model.readingEffect } } : {}),
      ...(model.relationshipOperationSanDelta ? { relationshipOperationSanDelta: model.relationshipOperationSanDelta } : {}),
      description: model.description,
    };
  });
}

export interface ClaudePolishResolution {
  papers: Paper[];
  changedPaperCount: number;
  changedScoreCount: number;
}

/** Claude polishes every score on editable drafts and journal revisions once acquired. */
export function polishUnsubmittedPapers(papers: readonly Paper[], model: AiModelOffer): ClaudePolishResolution {
  if (model.slot !== "claude") return { papers: [...papers], changedPaperCount: 0, changedScoreCount: 0 };
  let changedPaperCount = 0;
  let changedScoreCount = 0;
  const nextPapers = papers.map((paper) => {
    if (paper.status !== "draft" && paper.status !== "journal-reviewing") return paper;
    let nextPaper = paper;
    let changed = false;
    for (const action of RESEARCH_ACTIONS) {
      const bonus = model.researchEffects[action]?.bonus ?? 0;
      if (bonus <= 0) continue;
      nextPaper = { ...nextPaper, [action]: paper[action] + bonus };
      changed = true;
      changedScoreCount += 1;
    }
    if (changed) changedPaperCount += 1;
    return nextPaper;
  });
  return { papers: nextPapers, changedPaperCount, changedScoreCount };
}
