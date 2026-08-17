import { createPlaceholderFixedEvent } from "./v2-fixed-events-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createMidtermMessageEvent(state: GameState): PendingEvent {
  return createPlaceholderFixedEvent({
    id: "midterm-message",
    title: "留言",
    description: "研究生生涯已经过半。回头看，时间比想象中快得多。",
    preview: "时光荏苒，分享你的感想",
    chainId: "midterm-message",
    year: state.year,
    month: state.month,
  });
}
