import { createGeneratedFellowProfileAddition, getFellowRoleLabel } from "./v2-fellow-progression";
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

export function createMentorAssignEvent(state: GameState): PendingEvent {
  const canAddJunior = canAddRelationship(state.relationshipState, "junior");
  const candidates = Array.from({ length: 4 }, (_, index) => {
    const addition = createGeneratedFellowProfileAddition(
      "junior",
      state.totalMonths * 1000 + state.year * 10 + state.month + (index + 1) * 97,
    );
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
      "转博后的新学期，导师告诉你组里来了四位新生，希望你帮他们熟悉代码、实验和组会流程。",
      "导师把四份材料推到你面前，让你先看看各自的情况，再从中选一位认识。之后具体怎么熟悉课题，可以等见面后再慢慢安排。",
    ].join("\n\n"),
    decisionTitle: "选择一位新生",
    decisionDescription: "导师把四位新生的基本情况发给你。你逐份看过材料，准备先找一位聊聊。",
    results: Object.fromEntries(candidates.map((candidate) => [candidate.choiceId, {
      title: candidate.label,
      description: canAddJunior
        ? `你和${candidate.label}约好在实验室见面，先从最近读的一篇论文聊起。`
        : "无事发生",
    }])),
  });
}
