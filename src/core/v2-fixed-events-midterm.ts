import { createPlaceholderFixedEvent } from "./v2-fixed-events-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createMidtermMessageEvent(state: GameState): PendingEvent {
  return createPlaceholderFixedEvent({
    id: "midterm-message",
    title: "留言",
    description: "旧版真实事件已审计：第 3 年第 3 月触发“研究生生涯过半”留言事件，真实实现依赖自由文本输入、localStorage 昵称草稿和 Supabase 公共留言板同步。当前 V2 核心层尚未接入这类外部输入与远端留言板，因此这里只保留事件身份占位，不伪造简化版机制。",
    preview: "时光荏苒，分享你的感想",
    chainId: "midterm-message",
    year: state.year,
    month: state.month,
  });
}
