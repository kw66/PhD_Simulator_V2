import { ADVISOR_REQUIREMENTS } from "./v2-content";
import { createThreeStageEvent, type RandomEventResultCopy } from "./v2-random-events-core-shared";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

function normalizeDecisionYear(year: number): 2 | 3 {
  return year >= 3 ? 3 : 2;
}

function describePublishedPapers(state: GameState): string {
  const targetCounts = { A: 0, B: 0, C: 0 };
  for (const paper of [...state.papers, ...state.externalPublications]) {
    if (paper.status !== "published" || paper.nonFirstAuthor || paper.target === null) continue;
    targetCounts[paper.target] += 1;
  }

  const paperCount = targetCounts.A + targetCounts.B + targetCounts.C;
  if (paperCount === 0) {
    return state.totalResearchScore === 0
      ? "你目前还没有论文发表，科研分是 0。"
      : `目前计入转博的科研分是 ${state.totalResearchScore}。`;
  }

  const categoryText = (["A", "B", "C"] as const)
    .filter((target) => targetCounts[target] > 0)
    .map((target) => `${target} 类 ${targetCounts[target]} 篇`)
    .join("、");
  return `你已经发表 ${paperCount} 篇论文（${categoryText}），科研分是 ${state.totalResearchScore}。`;
}

export function createPhdDecisionEvent(state: GameState, requestedYear = state.year): PendingEvent {
  const decisionYear = normalizeDecisionYear(requestedYear);
  const requiredScore = decisionYear === 2
    ? ADVISOR_REQUIREMENTS.phdYear2
    : ADVISOR_REQUIREMENTS.phdYear3;
  const currentScore = state.totalResearchScore;
  const canTransfer = state.degree === "master" && currentScore >= requiredScore;
  const continueLabel = "继续硕士";
  const choices: EventChoice[] = [];
  const results: Record<string, RandomEventResultCopy> = {};

  choices.push({
    id: "continue-master",
    label: continueLabel,
    outcome: decisionYear === 2
      ? "本年不转博，明年仍可重新考虑。"
      : "放弃本轮转博，继续按硕士路线毕业。",
    effects: {},
  });
  results["continue-master"] = {
    title: "转博结果",
    description: decisionYear === 2
      ? "这一次，你先按硕士路线继续。接下来的一年还有时间把手头的研究做完，也能再想清楚自己是否愿意继续读博。等明年再聊转博时，希望桌上已经多了几项拿得出手的成果。"
      : "这一次，你继续按硕士路线完成学业。读博并不是研究生阶段唯一的去向，手头的论文和毕业任务仍要认真收尾。至于毕业以后去哪里，可以从现在开始慢慢准备。",
  };

  if (canTransfer) {
    choices.push({
      id: "transfer-phd",
      label: "转为博士",
      outcome: `达到科研分门槛（${currentScore}/${requiredScore}）｜转为博士｜毕业要求：科研分 ${ADVISOR_REQUIREMENTS.phdGrad}｜获得永久效果“读博压力”：每月 SAN -1。`,
      effects: {
        transferToPhd: true,
        addBuffs: [{
          id: "phd-pressure",
          name: "读博压力",
          source: "转博",
          timing: "permanent",
          remainingMonths: null,
          monthlyStats: { san: -1 },
          description: "博士阶段的长期压力使每月 SAN -1",
        }],
      },
    });
    results["transfer-phd"] = {
      title: "转博结果",
      description: `你决定转博。总培养期仍为 68 个月，博士毕业要求调整为科研分 ${ADVISOR_REQUIREMENTS.phdGrad}。基础的每月 SAN +1 仍会生效，但读博压力也会使每月 SAN -1。`,
      buttonLabel: "开始博士阶段",
    };
  }

  const event: PendingEvent = {
    id: `phd-decision-y${decisionYear}-m${state.month}-t${state.totalMonths}`,
    title: "转博抉择",
    description: "",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "phd-decision",
    stage: "act1",
    choices,
  };

  const decisionDescription = canTransfer
    ? [
        describePublishedPapers(state),
        `今年转博需要达到 ${requiredScore} 分，你已经过线。实验室里也有同届同门在准备转博材料，最近大家聊起毕业去向时，总会绕到读博这件事上。`,
        `你可以继续按硕士路线，也可以转博。转博后毕业要求为科研分 ${ADVISOR_REQUIREMENTS.phdGrad}，并获得永久效果“读博压力”：每月 SAN -1。`,
      ].join("\n\n")
    : decisionYear === 2
      ? [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分。实验室里也有同届同门在准备转博材料，最近大家聊起毕业去向时，总会绕到读博这件事上。`,
          "按今年的标准，你暂时不能转博。明年还有一次机会，先把手头的研究继续推进。",
        ].join("\n\n")
      : [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分。实验室里也有同届同门在准备转博材料，最近大家聊起毕业去向时，总会绕到读博这件事上。`,
          "这是硕士阶段最后一次转博机会。你没有达到今年的门槛，接下来将继续按硕士路线准备毕业。",
        ].join("\n\n");

  return createThreeStageEvent(event, {
    introDescription: [
      `硕士第${decisionYear}年，导师找你聊起转博。`,
      "转博后，你会继续留在组里，把研究做得更深入。每月的基础 SAN 回复仍然保留，不过读博的要求更高，每月会因读博压力额外损失 1 点 SAN。",
    ].join("\n\n"),
    decisionTitle: "转博选择",
    decisionDescription,
    results,
  });
}
