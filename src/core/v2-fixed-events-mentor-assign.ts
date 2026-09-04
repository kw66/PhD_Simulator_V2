import { createGeneratedFellowProfileAddition } from "./v2-fellow-progression";
import { createFixedEvent } from "./v2-fixed-events-shared";
import { createThreeStageEvent } from "./v2-random-events-core-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createMentorAssignEvent(state: GameState): PendingEvent {
  const assignedJunior = createGeneratedFellowProfileAddition("junior", state.totalMonths + state.year + state.month);
  const canAddJunior = state.relationshipState.occupiedSlots < state.relationshipState.unlockedSlots;
  const event: PendingEvent = createFixedEvent({
    id: "mentor-assign-junior",
    title: "指导新生",
    description: "",
    chainId: "mentor-assign",
    deadlineMonths: 0,
    choices: [
      {
        id: `mentor-assign-accept-y${state.year}-m${state.month}`,
        label: "接受安排",
        outcome: canAddJunior ? "接受导师安排，新增一位师弟师妹。" : "关系栏已满，改由其他同学负责带教。",
        effects: canAddJunior ? { fellowAdditions: [assignedJunior] } : {},
      },
      {
        id: `mentor-assign-decline-y${state.year}-m${state.month}`,
        label: "拒绝安排",
        outcome: "拒绝导师安排。",
        effects: {},
      },
    ],
  });

  return createThreeStageEvent(event, {
    introDescription: [
      "转博后，你被导师叫到办公室。",
      "导师说组里来了位新生，希望你负责带着熟悉代码、实验和组会流程。",
      "这不是临时帮忙，而是一段持续的带教；你可以接下，也可以把手头安排如实说清楚。",
    ].join("\n\n"),
    decisionTitle: "如何处理",
    decisionDescription: [
      "导师已经把人安排给你，具体情况等见面后再了解。",
      "接下来几个月，你要分出时间回答问题、看实验和改记录。",
      "接受就是接下这份责任，拒绝则由导师另行安排。",
    ].join("\n\n"),
    results: {
      [`mentor-assign-accept-y${state.year}-m${state.month}`]: {
        title: "接受安排",
        description: canAddJunior ? [
          "你点头接下了这项安排。",
          "导师把新生拉进实验室群，之后的代码、实验和组会流程由你带着熟悉。",
          "你先约好第一次见面的时间，带教从最基础的环境配置开始。",
        ].join("\n\n") : [
          "你愿意接下安排，但人际栏已经没有空位。",
          "导师看了看组内分工，改由其他同学负责这位新生。",
          "这次没有新增关系，你继续处理原来的任务。",
        ].join("\n\n"),
      },
      [`mentor-assign-decline-y${state.year}-m${state.month}`]: {
        title: "拒绝安排",
        description: [
          "你向导师说明近期任务排得很满，暂时接不了带教。",
          "导师听完没有多说，把新生交给了其他同学。",
          "你回到工位继续自己的安排，之后再遇到类似请求，恐怕还得重新解释一次。",
        ].join("\n\n"),
      },
    },
  });
}
