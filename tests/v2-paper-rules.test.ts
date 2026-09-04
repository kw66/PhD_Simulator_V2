import { describe, expect, it } from "vitest";

import {
  applyPrepublicationPaperDecay,
  ACCEPT_TYPE_SCORE_BY_TARGET,
  createDraftPaper,
  discardDraftPaper,
  getAvailablePaperSlotCount,
  getPaperSubmissionFailure,
  getReviewThresholds,
  getReviewerEffectiveScore,
  getAcceptanceTypeThresholds,
  getAcceptanceType,
  getUnlockedPaperSlotCount,
  rerollPaperTopic,
  resolvePaperReview,
  REVIEW_STABLE_SCORE_BY_TARGET,
  REVIEWER_DEFINITIONS,
  getReviewerWeights,
  REVIEWER_WEIGHTS,
  submitPaper,
  withdrawPaper,
} from "../src/core/v2-paper-rules";
import {
  generatePaperTopic,
  PAPER_HEAT_MULTIPLIERS,
  PAPER_TOPIC_CATALOG,
} from "../src/core/v2-paper-topics";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

function fromRolls(rolls: number[]): () => number {
  let index = 0;
  return () => rolls[index++] ?? 0;
}

describe("v2 paper rules", () => {
  it("创建草稿论文时生成稳定初始结构", () => {
    expect(createDraftPaper(7, 1, () => 0)).toEqual({
      id: "paper-7-2",
      title: "Latent Video Diffusion for Long-Horizon Video Synthesis",
      topicId: "video-generation",
      topicLabel: "视频生成",
      heatMultiplier: 0.5,
      prepublicationDecayRate: 0.05,
      idea: 0,
      experiment: 0,
      writing: 0,
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
      submittedMonth: null,
      submittedYear: null,
      conferenceHandled: false,
      publication: null,
      citationDebuffMultiplierOnPublish: 1,
      lastReview: null,
    });
  });

  it("按自然年份生成对应时期的方向，热度覆盖 0.50 到 1.50 的 20 个档位", () => {
    const topic2023 = generatePaperTopic(2023, fromRolls([0.999, 0, 0, 0, 0]));
    const topic2026 = generatePaperTopic(2026, fromRolls([0.999, 0, 0, 0, 0]));
    const coldest = generatePaperTopic(2023, () => 0);

    expect(topic2023).toMatchObject({ topicId: "diffusion", topicLabel: "扩散生成", heatMultiplier: 1.5 });
    expect(topic2026.heatMultiplier).toBe(1.5);
    expect(["vision-language", "video-understanding", "embodied-vla", "world-models", "multi-agent", "ai-science", "trustworthy-ai", "nlp-evaluation", "mixture-of-experts", "time-series"])
      .toContain(topic2026.topicId);
    expect(topic2023.title).not.toBe(topic2026.title);
    expect(topic2023.prepublicationDecayRate).toBe(0.15);
    expect(coldest.heatMultiplier).toBe(0.5);
    expect(coldest.prepublicationDecayRate).toBe(0.05);
  });

  it("方向库覆盖视觉、音频、语言、机器学习和机器人，并为每个年份保留四档候选", () => {
    expect(PAPER_TOPIC_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(PAPER_TOPIC_CATALOG.length).toBeLessThanOrEqual(50);
    for (const id of [
      "object-detection",
      "image-segmentation",
      "image-restoration",
      "contrastive-learning",
      "multimodal-foundation",
      "code-intelligence",
      "recommendation-systems",
      "continual-learning",
      "multi-agent",
      "robot-learning",
      "speech-recognition",
      "speech-enhancement",
      "language-models",
      "agents",
      "causal-learning",
      "mixture-of-experts",
      "time-series",
      "graph-learning",
      "embodied-vla",
      "world-models",
      "ai-science",
      "federated-learning",
    ]) {
      expect(PAPER_TOPIC_CATALOG.some((topic) => topic.id === id)).toBe(true);
    }

    expect(PAPER_HEAT_MULTIPLIERS).toHaveLength(20);
    expect(PAPER_HEAT_MULTIPLIERS[0]).toBe(0.5);
    expect(PAPER_HEAT_MULTIPLIERS.at(-1)).toBe(1.5);
    expect(PAPER_HEAT_MULTIPLIERS.every((value, index) => index === 0 || value > PAPER_HEAT_MULTIPLIERS[index - 1]!)).toBe(true);

    const years = [2023, 2024, 2025, 2026, 2027, 2028, 2029];
    for (const yearIndex of years.map((_year, index) => index)) {
      for (const tier of ["cold", "steady", "hot", "frontier"] as const) {
        expect(PAPER_TOPIC_CATALOG.some((topic) => topic.tiers[yearIndex] === tier)).toBe(true);
      }
    }
    expect(PAPER_TOPIC_CATALOG.find((topic) => topic.id === "agentic-science")?.tiers[0]).toBeNull();
    expect(PAPER_TOPIC_CATALOG.find((topic) => topic.id === "audio-language")?.tiers[0]).toBeNull();
  });

  it("只允许零进度草稿更换选题，丢弃草稿会释放槽位", () => {
    const paper = createDraftPaper(7, 0, () => 0);
    const state = {
      ...createStartedGameState("normal"),
      year: 1,
      month: 1,
      totalMonths: 1,
      papers: [paper],
      selectedPaperId: paper.id,
    };

    const rerolled = rerollPaperTopic(state, paper.id, fromRolls([0.999, 0, 0, 0, 0]));
    expect(rerolled.papers[0]).toMatchObject({ id: paper.id, heatMultiplier: 1.5 });
    expect(rerolled.papers[0]?.title).not.toBe(paper.title);

    const progressed = { ...rerolled.papers[0]!, idea: 1 };
    const progressedState = { ...rerolled, papers: [progressed] };
    expect(rerollPaperTopic(progressedState, progressed.id, () => 0)).toBe(progressedState);

    const discarded = discardDraftPaper(progressedState, progressed.id);
    expect(discarded.papers).toEqual([]);
    expect(discarded.selectedPaperId).toBeNull();
    expect(discarded.log[0]?.text).toContain("丢弃论文");
  });

  it("草稿和审稿中的 idea、实验、写作每月按各自热度衰减", () => {
    const draft = {
      ...createDraftPaper(7, 0, () => 0),
      idea: 20,
      experiment: 9,
      writing: 7,
      prepublicationDecayRate: 0.1,
    };
    const reviewing = {
      ...createDraftPaper(7, 1, () => 0),
      idea: 10,
      experiment: 2,
      writing: 6,
      prepublicationDecayRate: 0.2,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 2,
      submittedIdea: 10,
      submittedExperiment: 2,
      submittedWriting: 6,
    };
    const state = {
      ...createStartedGameState("normal"),
      papers: [draft, reviewing],
      selectedPaperId: draft.id,
    };

    const decayed = applyPrepublicationPaperDecay(state);
    expect(decayed.papers[0]).toMatchObject({ idea: 18, experiment: 8, writing: 6 });
    expect(decayed.papers[1]).toMatchObject({ idea: 8, experiment: 1, writing: 5 });
    expect(decayed.papers[1]).toMatchObject({ submittedIdea: 10, submittedExperiment: 2, submittedWriting: 6 });
    expect(decayed.log[0]?.text).toContain("论文时效");
  });

  it("审稿期间可以随时撤稿并完整保留三项分数", () => {
    const paper = {
      ...createDraftPaper(7, 0, () => 0),
      idea: 12,
      experiment: 9,
      writing: 8,
      status: "reviewing" as const,
      target: "B" as const,
      reviewMonthsLeft: 2,
      submittedIdea: 12,
      submittedExperiment: 9,
      submittedWriting: 8,
      submittedMonth: 7,
      submittedYear: 1,
    };
    const state = {
      ...createStartedGameState("normal"),
      papers: [paper],
      selectedPaperId: paper.id,
    };
    const withdrawn = withdrawPaper(state, paper.id);

    expect(withdrawn.papers[0]).toMatchObject({
      status: "draft",
      target: null,
      reviewMonthsLeft: 0,
      idea: 12,
      experiment: 9,
      writing: 8,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
    });
    expect(withdrawn.actionState).toEqual(state.actionState);
    expect(withdrawn.player).toEqual(state.player);
    expect(withdrawn.log[0]?.text).toContain("已从 B 类会议撤回");
  });

  it("三项均有分即可投稿，不再设置等级投稿线", () => {
    const paper = { ...createDraftPaper(7, 0), idea: 1, experiment: 1, writing: 1 };
    expect(getPaperSubmissionFailure(paper, "C")).toBeNull();
    expect(getPaperSubmissionFailure(paper, "A")).toBeNull();
    expect(getPaperSubmissionFailure({ ...paper, writing: 0 }, "C")).toContain("都要有分数");
  });

  it("投稿后自动选择下一篇可编辑草稿", () => {
    const first = { ...createDraftPaper(7, 0), idea: 1, experiment: 1, writing: 1 };
    const second = { ...createDraftPaper(7, 1), idea: 2 };
    const state = {
      ...createStartedGameState("normal"),
      papers: [first, second],
      selectedPaperId: first.id,
    };

    const submitted = submitPaper(state, first.id, "C");
    expect(submitted.papers[0]?.status).toBe("reviewing");
    expect(submitted.selectedPaperId).toBe(second.id);
  });

  it("按冻结快照生成三份审稿意见，不读取玩家科研属性", () => {
    const reviewingPaper = {
      ...createDraftPaper(7, 0),
      idea: 30,
      experiment: 30,
      writing: 30,
      status: "reviewing" as const,
      target: "A" as const,
      reviewMonthsLeft: 2,
      submittedIdea: 30,
      submittedExperiment: 30,
      submittedWriting: 30,
      submittedMonth: 7,
      submittedYear: 1,
    };

    const accepted = resolvePaperReview(
      { ...reviewingPaper, idea: 1, experiment: 1, writing: 1 },
      () => 0,
    );
    expect(accepted.nextPaper.status).toBe("published");
    expect(accepted.scoreGain).toBe(4);
    expect(accepted.acceptType).toBe("Spotlight");
    expect(accepted.nextPaper.lastReview?.reports).toHaveLength(3);
    expect(accepted.nextPaper.lastReview?.totalReviewScore).toBe(3);

    const rejected = resolvePaperReview({
      ...reviewingPaper,
      idea: 1,
      experiment: 1,
      writing: 4,
      target: "A",
      submittedIdea: 1,
      submittedExperiment: 1,
      submittedWriting: 1,
    }, () => 0);
    expect(rejected.nextPaper.status).toBe("draft");
    expect(rejected.nextPaper.target).toBeNull();
    expect(rejected.nextPaper.writing).toBe(4);
    expect(rejected.nextPaper.submittedIdea).toBeNull();
    expect(rejected.nextPaper.submittedExperiment).toBeNull();
    expect(rejected.nextPaper.submittedWriting).toBeNull();
    expect(rejected.nextPaper.submittedMonth).toBeNull();
    expect(rejected.nextPaper.submittedYear).toBeNull();
    expect(rejected.nextPaper.conferenceHandled).toBe(false);
    expect(rejected.nextPaper.lastReview?.reports).toHaveLength(3);
  });

  it("使用八类审稿人并只在边缘总评区使用录用概率", () => {
    const paper = {
      ...createDraftPaper(7, 0),
      idea: 12,
      experiment: 2,
      writing: 2,
      status: "reviewing" as const,
      target: "C" as const,
      reviewMonthsLeft: 0,
      submittedIdea: 12,
      submittedExperiment: 2,
      submittedWriting: 2,
    };
    const rolls = [0, 0.3, 0.9, 0.1];
    const accepted = resolvePaperReview(paper, () => rolls.shift() ?? 0);
    expect(accepted.nextPaper.lastReview?.reports).toHaveLength(3);
    expect(accepted.nextPaper.lastReview?.reports.every((report) => report.reviewerType)).toBe(true);
    expect(accepted.nextPaper.lastReview?.borderlineChance).not.toBeNull();
  });

  it("静态稳妥参考分按会议等级递增", () => {
    expect(REVIEW_STABLE_SCORE_BY_TARGET).toEqual({ C: 20, B: 40, A: 70 });
  });

  it("按审稿人的关注点计算有效分和拒稿反馈", () => {
    expect(getReviewerEffectiveScore("novelty", 10, 4, 2, () => 0)).toBe(23);
    expect(getReviewerEffectiveScore("experiment", 10, 4, 2, () => 0)).toBe(14);
    expect(getReviewerEffectiveScore("expert", 10, 4, 2, () => 0)).toBe(21);
    expect(getReviewerEffectiveScore("kind", 10, 4, 2, () => 0)).toBe(30);
    expect(getReviewerEffectiveScore("strict", 10, 4, 2, () => 0)).toBe(9);
    expect(getReviewerEffectiveScore("hostile", 10, 4, 2, () => 0)).toBe(6);
  });

  it("只为 A 类论文抽取 Spotlight、最佳论文候选和 Best Paper", () => {
    expect(ACCEPT_TYPE_SCORE_BY_TARGET).toEqual({
      C: { oral: 35, bestPaper: 50 },
      B: { oral: 55, bestPaper: 80 },
      A: { spotlight: 80, oral: 90, candidate: 110, bestPaper: 125 },
    });
    expect(getAcceptanceType("A", 79, () => 0)).toBe("Poster");
    expect(getAcceptanceType("A", 80, () => 0)).toBe("Spotlight");
    expect(getAcceptanceType("A", 90, () => 0)).toBe("Oral");
    expect(getAcceptanceType("A", 110, () => 0)).toBe("Best Paper Candidate");
    expect(getAcceptanceType("A", 125, () => 0)).toBe("Best Paper");
  });

  it("使用八类年度审稿人，并让会议影响力按等级平均值调整门槛", () => {
    expect(REVIEWER_DEFINITIONS.map((reviewer) => reviewer.name)).toEqual([
      "新颖性审稿人",
      "实验审稿人",
      "普通审稿人",
      "LLM审稿人",
      "资深审稿人",
      "心软审稿人",
      "严格审稿人",
      "恶意审稿人",
    ]);
    expect(REVIEWER_WEIGHTS.reduce((total, [, weight]) => total + weight, 0)).toBeCloseTo(1);
    expect(getReviewerWeights(1)).toEqual(REVIEWER_WEIGHTS);
    expect(getReviewerWeights(2).map(([, weight]) => weight)).toEqual([
      0.11, 0.11, 0.25, 0.14, 0.09, 0.09, 0.11, 0.1,
    ]);
    const strict = getReviewThresholds("A", 1.4);
    const lenient = getReviewThresholds("A", 0.4);
    expect(strict.normal.borderline).toBeGreaterThan(lenient.normal.borderline);
    expect(strict.hostile.reject).toBeGreaterThan(lenient.hostile.reject);
    expect(strict.novelty).toEqual(strict.normal);
    expect(strict.strict).toEqual(strict.hostile);
    expect(getAcceptanceTypeThresholds("A", 1.4)).toEqual({ spotlight: 93, oral: 105, candidate: 128, bestPaper: 146 });
  });

  it("基础论文槽位按科研值门槛解锁，A 类只负责槽位标记", () => {
    expect(getUnlockedPaperSlotCount(0)).toBe(1);
    expect(getUnlockedPaperSlotCount(6)).toBe(2);
    expect(getUnlockedPaperSlotCount(12)).toBe(3);
    expect(getUnlockedPaperSlotCount(18)).toBe(4);
    expect(getAvailablePaperSlotCount({ paperSlotsUnlocked: 1, player: { research: 12 } })).toBe(3);
    expect(getAvailablePaperSlotCount({ paperSlotsUnlocked: 4, player: { research: 1 } })).toBe(4);
  });
});
