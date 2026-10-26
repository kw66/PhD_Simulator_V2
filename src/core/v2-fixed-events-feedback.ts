import type { PendingEvent } from "./v2-types";

export const FEEDBACK_EVENT_ID = "midterm-message-y3-m4";

export function createFeedbackEvent(): PendingEvent {
  return {
    id: FEEDBACK_EVENT_ID,
    title: "游玩感想",
    description: "研究生生活已经走到第三年，你对这段旅程有什么感受？\n\n欢迎聊聊游玩体会、喜欢或不顺手的地方，也可以反馈遇到的 bug。留言会发布到公共留言板；暂时没有想说的，也可以跳过。",
    source: "fixed",
    blocking: false,
    deadlineMonths: 0,
    expiresAtMonthEnd: true,
    chainId: "midterm-message",
    stage: "act1",
    choices: [
      { id: "midterm-message-send", label: "发布留言", outcome: "已分享游玩感想。", effects: {} },
      { id: "midterm-message-skip", label: "这次先不写", outcome: "这次先不留言。", effects: {} },
    ],
  };
}
