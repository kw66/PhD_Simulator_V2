import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export type RandomRollProvider = () => number;

export function hasRecoverableDraftPaper(state: GameState): boolean {
  return state.papers.some((paper) =>
    paper.status === "draft" && (paper.idea > 0 || paper.experiment > 0 || paper.writing > 0)
  );
}

export function createRandomEventChoice(serial: number): EventChoice[] {
  return [
    {
      id: `random-continue-${serial}`,
      label: "继续",
      outcome: "你先把这个节点处理完，再回到当前主线节奏。",
      effects: {},
    },
  ];
}

export function createRandomEventSkeleton(eventId: number, state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  return {
    id: `random-${eventId}-y${state.year}-m${state.month}-n${serial}`,
    title: `随机事件 ${eventId}（待校对）`,
    description: `这个随机事件骨架已占位，但文案尚未完成校对。当前事件编号 ${eventId}，后续需要回旧版核对真实描述与选项。`,
    preview: `随机事件 ${eventId} 待校对`,
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: `random-${eventId}`,
    stage: "act1",
    choices: createRandomEventChoice(serial),
  };
}
