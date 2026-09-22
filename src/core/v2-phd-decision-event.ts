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
      ? "你跟老师说，今年先按硕士的安排继续做。话题回到手头课题上，你终于翻到了原本准备汇报的那一页。\n\n明年还有一次机会。回到工位，屏幕上还停着出门前的文档。刚才想了那么远，眼下先接着做今天的事。"
      : "你跟老师说，这次继续读完硕士，不再准备转博。老师把转博材料收到一边，你们接着核对起毕业安排。\n\n回到工位，你在日程里记下接下来要做的事。刚才说出决定只用了一句话，剩下的毕业准备，却还得占上好几行。",
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
      description: `你点头确认了转博的决定。老师把话题转到后续研究上，你翻开记录本，本来留给近期安排的几行空白，很快就写到了页脚。\n\n回到工位，椅子还是那把椅子，待解决的问题却像是忽然排远了。你往后翻了一页继续记，心里有点发怵，也有点想看看自己到底能做到哪一步。\n\n培养安排：总培养期仍为 68 个月，博士毕业要求调整为科研分 ${ADVISOR_REQUIREMENTS.phdGrad}。基础的每月 SAN +1 仍会生效，但读博压力也会使每月 SAN -1。`,
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
        `今年转博需要达到 ${requiredScore} 分，你已经过线。同届同门在聊材料怎么填，你看着眼前的课题记录，想的却是：熟悉的工位再坐几年，自己还愿不愿意？`,
        `转博要求：毕业科研分 ${ADVISOR_REQUIREMENTS.phdGrad}；永久效果“读博压力”：每月 SAN -1。`,
      ].join("\n\n")
    : decisionYear === 2
      ? [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分，你的成果还不够。同届同门在核对材料，你低头看看记录，几处工作还没做完。`,
          "今年暂时不能转博，明年还有一次机会。你翻回课题记录，盘算着接下来先往哪处使劲。",
        ].join("\n\n")
      : [
          describePublishedPapers(state),
          `今年转博需要达到 ${requiredScore} 分，你的成果还不够。同届同门聊起去向，你看着面前的材料，开始重排毕业前的日程。`,
          "这是硕士阶段最后一次转博机会。按目前的成果，你将继续准备硕士毕业，不再递交转博材料。",
        ].join("\n\n");

  return createThreeStageEvent(event, {
    introDescription: [
      `硕士第${decisionYear}年，导师叫你去办公室聊聊。你带着课题记录坐下，刚讲完最近的进展，老师便问起了转博的打算。`,
      "你出门前还在琢磨那几页记录够不够汇报，这会儿老师已经问到了往后几年。笔还夹在刚才那页，你一时没顾上往下翻。",
    ].join("\n\n"),
    decisionTitle: "转博选择",
    decisionDescription,
    results,
  });
}
