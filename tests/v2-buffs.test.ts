import { describe, expect, it } from "vitest";

import {
  addOrReplaceBuffs,
  advanceBuffDurations,
  consumeNextActionBuffs,
  consumeNextPublicationBuffs,
  getActionEffect,
  getBuffActionEffect,
  getPaperActionSanCost,
  getPublicationBuffEffect,
  getReadingEffect,
  removeBuffs,
} from "../src/core/v2-buffs";
import { buildBuffDisplayBuckets } from "../src/app/v2-render-buffs";
import { createAiBuffs, createAiShopState } from "../src/core/v2-ai-shop";
import { createInitialState } from "../src/core/v2-engine";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";

describe("generic buffs", () => {
  it("shows Claude's paper polishing effect without turning it into a research action bonus", () => {
    const aiShopState = createAiShopState();
    aiShopState.subscriptions.claude = {
      ...aiShopState.subscriptions.claude,
      active: true,
      modelId: "claude-fable-6",
    };
    const claudeBuff = createAiBuffs(aiShopState)[0]!;

    expect(getBuffActionEffect([claudeBuff], "idea")).toEqual({
      bonus: 0,
      multiplier: 1,
      extraActions: 0,
      sanDelta: 0,
    });
    expect(buildBuffDisplayBuckets([claudeBuff]).monthly.map((item) => item.label)).toEqual([
      "自动idea+4分",
      "自动实验+4分",
      "自动论文+2分",
    ]);
  });

  it("exposes Kimi reading effects through the shared Buff system", () => {
    const aiShopState = createAiShopState();
    aiShopState.subscriptions.kimi = {
      ...aiShopState.subscriptions.kimi,
      active: true,
      modelId: "kimi-k4",
    };
    const kimiBuff = createAiBuffs(aiShopState)[0]!;

    expect(getReadingEffect([kimiBuff])).toEqual({ sanDelta: -1, manualExtraReads: 0, automaticReads: 2 });
    expect(buildBuffDisplayBuckets([kimiBuff]).monthly.map((item) => item.label)).toEqual([
      "看论文 SAN -1",
      "自动看论文 +2次",
    ]);
  });

  it("advances finite buff durations without expiring permanent buffs", () => {
    const temporary = {
      id: "stipend",
      name: "临时补贴",
      source: "测试",
      timing: "monthly" as const,
      remainingMonths: 2,
      monthlyStats: { money: 2, san: 1 },
    };
    const permanent = {
      id: "permanent",
      name: "永久效果",
      source: "测试",
      timing: "permanent" as const,
      remainingMonths: null,
    };

    const first = advanceBuffDurations([temporary, permanent]);
    expect(first[0]?.remainingMonths).toBe(1);
    expect(first[1]?.remainingMonths).toBeNull();
    expect(advanceBuffDurations(first).map((buff) => buff.id)).toEqual(["permanent"]);
  });

  it("replaces and removes buffs by stable id", () => {
    const buff = {
      id: "same",
      name: "旧效果",
      source: "测试",
      timing: "permanent" as const,
      remainingMonths: null,
    };
    const replaced = addOrReplaceBuffs([buff], [{ ...buff, name: "新效果" }]);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.name).toBe("新效果");
    expect(removeBuffs(replaced, ["same"])).toEqual([]);
  });

  it("aggregates structured action effects across timings", () => {
    const state = {
      ...createInitialState(),
      buffs: [
        {
          id: "permanent-idea",
          name: "长期积累",
          source: "测试",
          timing: "permanent" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 2, multiplier: 1.5 } },
        },
        {
          id: "monthly-idea",
          name: "本月状态",
          source: "测试",
          timing: "monthly" as const,
          remainingMonths: 2,
          actionEffects: { idea: { bonus: 1, extraActions: 1 } },
        },
        {
          id: "next-idea",
          name: "下一次灵感",
          source: "测试",
          timing: "next-action" as const,
          remainingMonths: null,
          actionEffects: { idea: { bonus: 4 }, writing: { extraActions: 1 } },
        },
      ],
    };

    expect(getActionEffect(state, "idea")).toEqual({ bonus: 7, multiplier: 1.5, extraActions: 1, sanDelta: 0 });
    expect(getActionEffect(state, "experiment")).toEqual({ bonus: 0, multiplier: 1, extraActions: 0, sanDelta: 0 });
    expect(getBuffActionEffect(state.buffs, "idea", { includeNextAction: false })).toEqual({
      bonus: 3,
      multiplier: 1.5,
      extraActions: 1,
      sanDelta: 0,
    });
  });

  it("combines action and display multipliers by percentage offsets", () => {
    const buffs = [
      {
        id: "first-half",
        name: "第一次减半",
        source: "测试一",
        timing: "next-action" as const,
        remainingMonths: null,
        actionEffects: { idea: { multiplier: 0.5 } },
      },
      {
        id: "second-half",
        name: "第二次减半",
        source: "测试二",
        timing: "next-action" as const,
        remainingMonths: null,
        actionEffects: { idea: { multiplier: 0.5 } },
      },
    ];

    expect(getBuffActionEffect(buffs, "idea").multiplier).toBe(0);
    expect(buildBuffDisplayBuckets(buffs).nextAction).toEqual([
      expect.objectContaining({ label: "idea 总分 ×0", isDebuff: true }),
    ]);
  });

  it("stacks AI research score bonuses while keeping SAN adjustments additive", () => {
    const buffs = [
      {
        id: "ai-gpt",
        name: "GPT",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        actionEffects: { writing: { bonus: 8, sanDelta: 0 } },
      },
      {
        id: "ai-doubao",
        name: "豆包",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        actionEffects: { writing: { bonus: 3, sanDelta: 1 } },
      },
      {
        id: "illness",
        name: "生病",
        source: "测试",
        timing: "monthly" as const,
        remainingMonths: 1,
        activeOperationSanMultiplier: 2,
      },
    ];

    expect(getActionEffect({ buffs }, "writing")).toMatchObject({ bonus: 11, sanDelta: 1 });
    expect(getPaperActionSanCost(4, buffs, "writing", 2)).toBe(11);
  });

  it("consumes only the executed action from a multi-action next-action buff", () => {
    const state = {
      ...createInitialState(),
      buffs: [{
        id: "multi-action",
        name: "双向奖励",
        source: "测试",
        timing: "next-action" as const,
        remainingMonths: null,
        actionEffects: {
          idea: { bonus: 3 },
          writing: { bonus: 5 },
        },
      }],
    };

    const afterIdea = consumeNextActionBuffs(state, "idea");
    expect(afterIdea.buffs[0]?.actionEffects).toEqual({ writing: { bonus: 5 } });
    const afterWriting = consumeNextActionBuffs(afterIdea, "writing");
    expect(afterWriting.buffs).toEqual([]);
  });

  it("preserves other channels when consuming a combined next-action Buff", () => {
    const combined = {
      id: "combined-next-action",
      name: "科研与引用",
      source: "测试",
      timing: "next-action" as const,
      remainingMonths: null,
      actionEffects: { idea: { bonus: 3 } },
      publicationEffects: { nextPromotionMultiplier: 2 },
    };
    const afterAction = consumeNextActionBuffs({ ...createInitialState(), buffs: [combined] }, "idea");
    expect(afterAction.buffs).toHaveLength(1);
    expect(getPublicationBuffEffect(afterAction.buffs).nextPromotionMultiplier).toBe(2);
    expect(getActionEffect(afterAction, "idea").bonus).toBe(0);

    const afterPublication = consumeNextPublicationBuffs({ ...createInitialState(), buffs: [combined] });
    expect(afterPublication.buffs).toHaveLength(1);
    expect(getActionEffect(afterPublication, "idea").bonus).toBe(3);
    expect(getPublicationBuffEffect(afterPublication.buffs).nextPromotionMultiplier).toBe(1);
  });

  it("preserves every structured Buff channel through event state merging", () => {
    const initial = createInitialState();
    const sourceBuff = {
      id: "structured-buff",
      name: "结构化效果",
      source: "测试",
      timing: "monthly" as const,
      remainingMonths: 2,
      paperPolishEffects: { idea: 2 },
      readingEffect: { sanDelta: -1, manualExtraReads: 1, automaticReads: 1 },
      relationshipOperationSanDelta: -1,
    };
    const state = { ...initial, buffs: [sourceBuff] };
    const resolved = applyChoiceEffectsToState(state, {
      id: "preserve-structured-buff",
      label: "确认",
      outcome: "继续",
      effects: { fixedEventResolution: { kind: "ccig-skip" } },
    }).nextState;

    expect(resolved.buffs[0]).toMatchObject(sourceBuff);
  });

  it("clones structured effects when replacing buffs", () => {
    const effects = { idea: { bonus: 2 } };
    const monthlyStats = { san: -1 };
    const buff = {
      id: "clone",
      name: "可复制",
      source: "测试",
      timing: "permanent" as const,
      remainingMonths: null,
      actionEffects: effects,
      monthlyStats,
    };
    const result = addOrReplaceBuffs([], [buff]);
    effects.idea.bonus = 99;
    monthlyStats.san = -9;
    expect(result[0]?.actionEffects?.idea?.bonus).toBe(2);
    expect(result[0]?.monthlyStats?.san).toBe(-1);
  });

  it("keeps a visible SAN +0 when active action modifiers cancel each other", () => {
    const buckets = buildBuffDisplayBuckets([
      {
        id: "san-up",
        name: "额外消耗",
        source: "豆包",
        timing: "monthly",
        remainingMonths: 1,
        actionEffects: { idea: { sanDelta: 1 } },
      },
      {
        id: "san-down",
        name: "固定减免",
        source: "Gemini",
        timing: "monthly",
        remainingMonths: 1,
        actionEffects: { idea: { sanDelta: -1 } },
      },
    ]);

    expect(buckets.monthly).toContainEqual(expect.objectContaining({
      label: "idea SAN +0",
      isDebuff: false,
    }));
    expect(buckets.monthly.find((item) => item.label === "idea SAN +0")?.sources).toHaveLength(2);
  });

  it("keeps explicitly declared zero SAN and money monthly effects visible", () => {
    const buckets = buildBuffDisplayBuckets([{
      id: "zero-monthly",
      name: "零值月结",
      source: "测试",
      timing: "permanent",
      remainingMonths: null,
      monthlyStats: { san: 0, money: 0 },
    }]);

    expect(buckets.permanent.map((item) => item.label)).toEqual(expect.arrayContaining([
      "每月 SAN +0",
      "每月 金币 +0",
    ]));
  });

  it("shows finite monthly stat Buffs in the monthly effect bucket", () => {
    const buckets = buildBuffDisplayBuckets([{
      id: "finite-monthly-stats",
      name: "带教压力",
      source: "导师项目",
      timing: "monthly",
      remainingMonths: 3,
      monthlyStats: { san: -2, money: 0 },
    }]);

    expect(buckets.monthly.map((item) => item.label)).toEqual(expect.arrayContaining([
      "每月 SAN -2",
      "每月 金币 +0",
    ]));
    expect(buckets.permanent).toEqual([]);
  });

  it("keeps mentoring settlement details out of the generic Buff list", () => {
    const buckets = buildBuffDisplayBuckets([{
      id: "long-mentoring",
      name: "长期带教",
      source: "指导师弟师妹",
      timing: "monthly",
      remainingMonths: null,
      monthlyStats: { san: -2 },
      scheduledPublication: {
        intervalMonths: 12,
        nonFirstAuthor: true,
        targetWeights: { A: 0.2, B: 0.3, C: 0.5 },
      },
    }]);

    expect(buckets.monthly).toEqual([]);
    expect(buckets.permanent).toEqual([]);
  });

  it("turns event action effects into readable, executable Buffs", () => {
    const state = createInitialState();
    const resolved = applyChoiceEffectsToState(state, {
      id: "buff-event",
      label: "应用",
      outcome: "下次想 idea +4，永久写论文 +1。",
      effects: {
        temporaryActionEffectUpdates: { idea: { bonus: 4, multiplier: 0.5 } },
        writingBonus: 1,
      },
    }).nextState;

    expect(getActionEffect(resolved, "idea")).toEqual({ bonus: 4, multiplier: 0.5, extraActions: 0, sanDelta: 0 });
    expect(getActionEffect(resolved, "writing")).toEqual({ bonus: 1, multiplier: 1, extraActions: 0, sanDelta: 0 });
    expect(resolved.buffs.find((buff) => buff.timing === "next-action")?.actionEffects).toEqual({
      idea: { bonus: 4, multiplier: 0.5 },
    });
    expect(resolved.buffs.map((buff) => buff.name)).toEqual([
      "下次想 idea +4分 · 总分 ×0.5",
      "每次写论文 +1分",
    ]);
  });

  it("stacks permanent and next-action bonuses, then consumes only the next action", () => {
    const resolved = applyChoiceEffectsToState(createInitialState(), {
      id: "conference-listen",
      label: "继续",
      outcome: "下次想 idea +5，永久想 idea +1。",
      effects: {
        temporaryActionEffectUpdates: { idea: { bonus: 5 } },
        ideaBonus: 1,
      },
    }).nextState;

    expect(getActionEffect(resolved, "idea").bonus).toBe(6);

    const consumed = consumeNextActionBuffs(resolved, "idea");
    expect(getActionEffect(consumed, "idea").bonus).toBe(1);
    expect(consumed.buffs.map((buff) => buff.name)).toEqual(["每次想 idea +1分"]);
  });

  it("keeps career progress out of the Buff bar until its dedicated UI is implemented", () => {
    const initial = createInitialState();
    const resolved = applyChoiceEffectsToState(initial, {
      id: "career-event",
      label: "认真准备",
      outcome: "互联网求职进度 +35。",
      effects: {
        san: -6,
        careerType: "internet",
        careerProgress: 35,
      },
    }).nextState;

    expect(resolved.player.san).toBe(initial.player.san - 6);
    expect(resolved.careerProgress.internet).toBe(35);
    expect(resolved.buffs).toHaveLength(0);
  });

  it("keeps one-time state mutations out of the Buff bar", () => {
    const initial = createInitialState();
    const resolved = applyChoiceEffectsToState(initial, {
      id: "state-event",
      label: "确认",
      outcome: "状态已更新。",
      effects: {
        relationshipAdditions: ["junior"],
        mentorshipStacks: 1,
        researchCapacityStateDeltas: { baseCap: 1 },
        advisorProgressStateDeltas: { researchResource: 2 },
        conferenceCareerUpdates: { enterpriseCount: 1 },
      },
    }).nextState;

    expect(resolved.relationshipState.juniorCount).toBe(initial.relationshipState.juniorCount + 1);
    expect(resolved.relationshipState.mentorshipStacks).toBe(1);
    expect(resolved.researchCapacityState.baseCap).toBe(initial.researchCapacityState.baseCap + 1);
    expect(resolved.advisorProgressState.researchResource).toBe(initial.advisorProgressState.researchResource + 2);
    expect(resolved.conferenceCareerState.enterpriseCount).toBe(1);
    expect(resolved.buffs).toEqual([]);
  });

  it("applies SAN cap changes without treating the attribute cap as a Buff", () => {
    const initial = createInitialState();
    const resolved = applyChoiceEffectsToState(initial, {
      id: "illness-hard",
      label: "硬撑工作",
      outcome: "SAN 上限 -2｜生病概率 ×0.5",
      effects: {
        sanCapDelta: -2,
        illnessProbabilityMultiplier: 0.5,
      },
    }).nextState;

    expect(resolved.sanCap).toBe(18);
    expect(resolved.player.san).toBe(18);
    expect(resolved.buffs).toHaveLength(0);
  });

  it("applies illness probability multipliers before fixed probability changes", () => {
    const initial = { ...createInitialState(), illnessProbability: 10 };
    const resolved = applyChoiceEffectsToState(initial, {
      id: "illness-probability-order",
      label: "应用",
      outcome: "概率变化",
      effects: {
        illnessProbabilityMultiplier: 0.5,
        illnessProbabilityDelta: 2,
      },
    }).nextState;

    expect(resolved.illnessProbability).toBe(7);
  });

  it("keeps publication multipliers structured until the paper system consumes them", () => {
    const state = applyChoiceEffectsToState(createInitialState(), {
      id: "publication-buff-event",
      label: "应用",
      outcome: "引用效果",
      effects: {
        nextPublicationPromotionMultiplier: 2,
        citationDebuffMultiplier: 0.9,
      },
    }).nextState;

    expect(getPublicationBuffEffect(state.buffs)).toEqual({
      nextPromotionMultiplier: 2,
      citationDebuffMultiplier: 0.9,
    });
    const consumed = consumeNextPublicationBuffs(state);
    expect(getPublicationBuffEffect(consumed.buffs)).toEqual({
      nextPromotionMultiplier: 1,
      citationDebuffMultiplier: 0.9,
    });
  });

  it("snapshots a citation penalty only onto current non-empty unsubmitted papers", () => {
    const initial = createInitialState();
    const firstDraft = { ...createDraftPaper(1, 0), idea: 2 };
    const emptyDraft = createDraftPaper(1, 1);
    const reviewing = {
      ...createDraftPaper(1, 2),
      status: "reviewing" as const,
      target: "C" as const,
    };
    const published = attachPaperPublication({
      ...createDraftPaper(1, 3),
      status: "published" as const,
      target: "C" as const,
    });
    const state = applyChoiceEffectsToState({
      ...initial,
      papers: [firstDraft, emptyDraft, reviewing],
      externalPublications: [published],
    }, {
      id: "scoped-publication-penalty",
      label: "应用",
      outcome: "当前草稿引用减半",
      effects: {
        draftCitationDebuffMultiplier: 0.5,
      },
    }).nextState;

    expect(state.papers[0]?.citationDebuffMultiplierOnPublish).toBe(0.5);
    expect(state.papers[1]?.citationDebuffMultiplierOnPublish).toBe(1);
    expect(state.papers[2]?.citationDebuffMultiplierOnPublish).toBe(1);
    expect(state.externalPublications[0]?.publication?.citationDebuffMultiplier).toBe(1);
    expect(getPublicationBuffEffect(state.buffs)).toEqual({
      nextPromotionMultiplier: 1,
      citationDebuffMultiplier: 1,
    });
    expect(createDraftPaper(2, 1).citationDebuffMultiplierOnPublish).toBe(1);
  });

  it("combines same-scope publication multipliers linearly and preserves zero", () => {
    const first = applyChoiceEffectsToState(createInitialState(), {
      id: "first-publication-half",
      label: "应用",
      outcome: "引用减半",
      effects: { citationDebuffMultiplier: 0.5 },
    }).nextState;
    const second = applyChoiceEffectsToState(first, {
      id: "second-publication-half",
      label: "应用",
      outcome: "引用再次减半",
      effects: { citationDebuffMultiplier: 0.5 },
    }).nextState;

    expect(getPublicationBuffEffect(second.buffs).citationDebuffMultiplier).toBe(0);
  });

  it("shows a character-bound citation penalty in the debuff bucket", () => {
    const buff = {
      id: "person-citation-penalty",
      name: "引用受损",
      source: "人物影响",
      timing: "permanent" as const,
      remainingMonths: null,
      publicationEffects: { citationDebuffMultiplier: 0.75 },
    };

    expect(buildBuffDisplayBuckets([buff]).permanent).toEqual([expect.objectContaining({
      label: "引用×0.75",
      isDebuff: true,
    })]);
  });
});
