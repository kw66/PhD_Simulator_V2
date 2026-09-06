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
      "转博后的新学期，你被导师叫到办公室。组里来了位新生，老师想请你帮忙熟悉代码、实验和组会流程。",
      "你想起自己刚进组时，连共享文件夹都找不着。如今轮到别人向你问路了，但接不接下带教，还得看看手头的安排。",
    ].join("\n\n"),
    decisionTitle: "如何处理",
    decisionDescription: [
      "你先问清带教内容：从环境配置、实验记录，到组会前怎样整理问题，都需要有人领个头。",
      "老师在等你答复。你可以接受安排，也可以说明暂时顾不过来，请老师另找同学。",
    ].join("\n\n"),
    results: {
      [`mentor-assign-accept-y${state.year}-m${state.month}`]: {
        title: "接受安排",
        description: canAddJunior ? [
          "你答应下来，老师便把你介绍给新生。加上联系方式后，你先发去实验室的入门文档，约好一起看看环境配置。",
          "你提醒对方把报错信息留完整，别只发一句“跑不起来”。这话很熟悉——当初你也被这样叮嘱过。",
        ].join("\n\n") : [
          "你本想接下安排，盘点了一下平时需要照应的人，才发现自己已经顾不过来了。",
          "你把情况向老师说清楚，老师便请其他同学接手。这次没有新增关系，你也不用再惦记第一次带教的准备。",
        ].join("\n\n"),
      },
      [`mentor-assign-decline-y${state.year}-m${state.month}`]: {
        title: "拒绝安排",
        description: [
          "你向老师说明手头的实验和写作安排，坦言暂时腾不出时间带新人，怕答应了也顾不上。",
          "老师听完，另找了同学负责。你回到工位，把刚才合上的实验记录重新打开；这次没接下带教，原来的任务还得照常做。",
        ].join("\n\n"),
      },
    },
  });
}
