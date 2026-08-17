import { createFixedEvent } from "./v2-fixed-events-shared";
import type { GameState, PendingEvent } from "./v2-types";

function createMidtermMessageResultEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `midterm-message-result-y${state.year}-m${state.month}`,
    title: "留言 ➜ 写下感想 ➜ 感谢分享",
    description: [
      "你把想说的话认真写了下来。",
      "你把一段真实经验留给了此刻的自己，这条路从此不只剩下模糊的感受。",
    ].join("\n\n"),
    preview: "这段研究生经历有了自己的注脚",
    chainId: "midterm-message",
    stage: "result",
    choices: [
      {
        id: `midterm-message-finish-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "感谢分享。",
        effects: {},
      },
    ],
  });
}

function createMidtermMessageWritingEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `midterm-message-writing-y${state.year}-m${state.month}`,
    title: "留言 ➜ 写下感想",
    description: [
      "“这条留言不需要漂亮修辞，只要足够真实。”",
      "“你今天写下的经验，也许会在以后最难的时候提醒自己，原来有些关口已经走过。”",
    ].join("\n\n"),
    preview: "写下一句给未来的自己",
    chainId: "midterm-message",
    stage: "act2",
    choices: [
      {
        id: `midterm-message-write-y${state.year}-m${state.month}`,
        label: "写给自己",
        outcome: "写下这段感想。",
        effects: {
          enqueueEvents: [createMidtermMessageResultEvent(state)],
        },
      },
    ],
  });
}

export function createMidtermMessageEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `midterm-message-y${state.year}-m${state.month}`,
    title: "留言",
    description: [
      "不知不觉，研究生阶段已经走过一半。",
      "你经历过熬夜赶进度，也经历过结果终于跑通的松一口气。",
      "回头看时，很多当时觉得“过不去”的节点，如今都成了可复述的经验。",
      "你想留一句话，给未来的自己，让这段路不只停在模糊的记忆里。",
    ].join("\n\n"),
    preview: "时光荏苒，分享你的感想",
    chainId: "midterm-message",
    choices: [
      {
        id: `midterm-message-open-y${state.year}-m${state.month}`,
        label: "开始留言",
        outcome: "整理这段经历。",
        effects: {
          enqueueEvents: [createMidtermMessageWritingEvent(state)],
        },
      },
    ],
  });
}
