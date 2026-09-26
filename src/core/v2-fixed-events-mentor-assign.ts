import { createGeneratedFellowProfileAddition, getFellowName, getFellowRoleLabel } from "./v2-fellow-progression";
import { createFixedEvent } from "./v2-fixed-events-shared";
import { createThreeStageEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";
import { canAddRelationship } from "./v2-relationship-rules";

const CANDIDATE_DESCRIPTIONS = [
  "刚接触科研，读论文和跑实验都要从头学起。",
  "读过几篇入门论文，正跟着教程尝试复现。",
  "有过课程项目经验，能照着论文跑通基础实验。",
  "做过简单的课题，能独立复现实验、整理结果。",
] as const;

export function createMentorAssignEvent(state: GameState, getNameRoll: () => number = Math.random): PendingEvent {
  const canAddJunior = canAddRelationship(state.relationshipState, "junior");
  const generatedNames = state.fellowProgressState.map((profile) => getFellowName(profile));
  const candidates = Array.from({ length: 4 }, (_, index) => {
    const addition = createGeneratedFellowProfileAddition(
      "junior",
      state.totalMonths * 1000 + state.year * 10 + state.month + (index + 1) * 97,
      undefined,
      generatedNames,
      getNameRoll,
    );
    generatedNames.push(addition.name ?? "");
    const roleLabel = getFellowRoleLabel(addition.type, addition.gender);
    const label = `${roleLabel} ${addition.name ?? "新生"}`;
    const description = CANDIDATE_DESCRIPTIONS[addition.research]!;
    return {
      addition,
      label,
      description,
      outcome: canAddJunior
        ? `${roleLabel}+1`
        : "无事发生",
      choiceId: `mentor-assign-select-${index + 1}-y${state.year}-m${state.month}`,
    };
  });
  const event: PendingEvent = createFixedEvent({
    id: "mentor-assign-junior",
    title: "指导新生",
    description: "",
    chainId: "mentor-assign",
    deadlineMonths: 0,
    choices: candidates.map((candidate) => ({
      id: candidate.choiceId,
      label: candidate.label,
      outcome: candidate.outcome,
      fellowCandidate: {
        description: candidate.description,
        research: candidate.addition.research,
        affinity: candidate.addition.affinity,
      },
      effects: canAddJunior ? { fellowAdditions: [candidate.addition] } : {},
    })),
  });

  return createThreeStageEvent(event, {
    introDescription: [
      "转博后的新学期，导师发来四位新生的材料，希望你带其中一位熟悉代码、实验和组会流程。群里刚拉进来的几个头像还很陌生，已经有人在问实验室怎么走。",
      "你翻开材料，入学照片一张比一张精神。电脑右下角又弹出导师的消息：“先认识一下，有问题多帮帮忙。”",
    ].join("\n\n"),
    decisionTitle: "选择一位新生",
    decisionDescription: [
      "四份材料摊在眼前，有人已经做过小课题，有人还在跟着教程跑代码。那些入门时卡住自己的问题又冒了出来，你忽然很想告诉新生几条少走弯路的办法。可想到以后也有人追着自己问“这个报错怎么办”，刚冒头的成就感里又添了一点紧张。",
      canAddJunior
        ? "你翻过现有的合作安排，还能接下一位新生。材料里写着各自的研究基础，相处是否投缘，也值得一起看看。"
        : "再看现有的合作安排，你已经顾不过来了。材料可以继续看，这次却接不下任何一位，只能请导师另作安排。",
    ].join("\n\n"),
    results: Object.fromEntries(candidates.map((candidate) => [candidate.choiceId, {
      title: candidate.label,
      description: canAddJunior
        ? `你和${candidate.label}约好在实验室见面，发去门牌号，又补了句“找不到就发消息”。原来现在也轮到你给别人指路了。`
        : "你看完材料，还是没接下这次指导。眼下已有的合作还要顾，新生的安排只能请导师另找人选。",
    }])),
  });
}
