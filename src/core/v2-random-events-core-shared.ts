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
      outcome: "事情处理完了，回到原来的安排。",
      effects: {},
    },
  ];
}

export function createRandomEventSkeleton(eventId: number, state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  return {
    id: `random-${eventId}-y${state.year}-m${state.month}-n${serial}`,
    title: "临时事务",
    description: "一件计划外的事打断了安排。先处理，再继续这个月。",
    preview: "有件临时事务需要处理",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: `random-${eventId}`,
    stage: "act1",
    choices: createRandomEventChoice(serial),
  };
}
