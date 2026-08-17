import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export type RandomRollProvider = () => number;

export interface RandomEventResultCopy {
  title: string;
  description: string;
  buttonLabel?: string;
}

export interface ThreeStageRandomEventCopy {
  introDescription: string;
  decisionTitle: string;
  decisionDescription: string;
  results: Record<string, RandomEventResultCopy>;
}

export function createThreeStageEvent(
  event: PendingEvent,
  copy: ThreeStageRandomEventCopy,
): PendingEvent {
  const choiceEvent: PendingEvent = {
    ...event,
    id: `${event.id}-choice`,
    title: `${event.title} ➜ ${copy.decisionTitle}`,
    description: copy.decisionDescription,
    stage: "act2",
    choices: event.choices.map((choice) => {
      const resultCopy = copy.results[choice.id];
      if (!resultCopy) return choice;

      const resultEvent: PendingEvent = {
        id: `${event.id}-result-${choice.id}`,
        title: `${event.title} ➜ ${copy.decisionTitle} ➜ ${resultCopy.title}`,
        description: `${resultCopy.description}\n\n机制结算\n${choice.outcome}`,
        preview: resultCopy.title,
        source: event.source,
        blocking: event.blocking,
        deadlineMonths: event.deadlineMonths,
        chainId: event.chainId,
        stage: "result",
        choices: [
          {
            id: `${choice.id}-finish`,
            label: resultCopy.buttonLabel ?? "确定",
            outcome: "事件处理完毕。",
            effects: {},
          },
        ],
      };

      return {
        ...choice,
        effects: {
          ...choice.effects,
          enqueueEvents: [...(choice.effects.enqueueEvents ?? []), resultEvent],
        },
      };
    }),
  };

  return {
    ...event,
    description: copy.introDescription,
    stage: "act1",
    choices: [
      {
        id: `${event.id}-continue`,
        label: "继续",
        outcome: "继续处理这件事。",
        effects: {
          enqueueEvents: [choiceEvent],
        },
      },
    ],
  };
}

export function createThreeStageRandomEvent(
  event: PendingEvent,
  copy: ThreeStageRandomEventCopy,
): PendingEvent {
  return createThreeStageEvent(event, copy);
}

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
    description: "一件计划外的事突然打断了这个月的安排。先把眼前的问题处理掉，原来的进度只能稍后再接上。",
    preview: "有件临时事务需要处理",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: `random-${eventId}`,
    stage: "act1",
    choices: createRandomEventChoice(serial),
  };
}
