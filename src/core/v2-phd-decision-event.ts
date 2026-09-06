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
      ? "你目前还没有可计分的第一作者论文，科研分是 0。"
      : `目前计入转博的科研分是 ${state.totalResearchScore}。`;
  }

  const categoryText = (["A", "B", "C"] as const)
    .filter((target) => targetCounts[target] > 0)
    .map((target) => `${target} 类 ${targetCounts[target]} 篇`)
    .join("、");
  return `你已经发表 ${paperCount} 篇论文（${categoryText}），科研分是 ${state.totalResearchScore}。这里列的是可计分的第一作者论文。`;
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
      ? "你向老师说明，今年先不转博，把手头的研究继续做完。老师收起材料，你也不用在今天就决定往后几年的安排。\n\n明年还有一次机会。回到工位，你把这件事暂时放下，先打开了今天还没改完的文档。"
      : "你向老师说明，这次继续按硕士的安排完成学业，不再准备转博。聊完以后，手头的论文和毕业任务并没有因此少一项。\n\n回到工位，你重新看了看接下来的计划。比起反复犹豫要不要读博，现在更需要把毕业和去向逐件落实。",
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
      description: `你向老师确认了转博的决定。聊到后续研究时，问题一下多了起来：哪些结果还站得住，哪些地方值得继续做，都得重新想清楚。\n\n回到熟悉的工位，你把需要讨论的问题逐条记下。研究还是这些研究，只是不能再想着做完眼前这一篇就收工了。\n\n培养安排：总培养期仍为 68 个月，博士毕业要求调整为科研分 ${ADVISOR_REQUIREMENTS.phdGrad}。基础的每月 SAN +1 仍会生效，但读博压力也会使每月 SAN -1。`,
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
        `今年转博需要达到 ${requiredScore} 分，你已经过线。同届同门也在准备材料，但你还得决定自己是否愿意继续留在组里做研究。`,
        `转博要求：毕业科研分 ${ADVISOR_REQUIREMENTS.phdGrad}；永久效果“读博压力”：每月 SAN -1。`,
      ].join("\n\n")
    : decisionYear === 2
      ? [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分，你的成果还不够。同届同门在准备材料，你也对照着看了自己的进展。`,
          "今年暂时不能转博，明年还有一次机会。你把材料收好，先回去做完手头的研究。",
        ].join("\n\n")
      : [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分，你的成果还不够。同届同门陆续定下了去向，你也到了要作安排的时候。`,
          "这是硕士阶段最后一次转博机会。按目前的成果，你将继续准备硕士毕业，不再递交转博材料。",
        ].join("\n\n");

  return createThreeStageEvent(event, {
    introDescription: [
      `硕士第${decisionYear}年，导师找你聊起转博。你带着手头课题的记录坐下，老师先问了最近的进展，又问你愿不愿意继续做下去。`,
      "你原本只准备汇报近期结果，话题却变成了往后几年的打算。留在熟悉的组里并不陌生，是否还想继续读下去，却不能只看最近做得顺不顺。",
    ].join("\n\n"),
    decisionTitle: "转博选择",
    decisionDescription,
    results,
  });
}
