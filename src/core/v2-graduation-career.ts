import { CAREER_DEFINITIONS, CAREER_OPTIONS, calculateCareerProgress, type CareerType } from "./v2-career-rules";
import { pushLog } from "./v2-engine-helpers";
import { createCareerEventForType } from "./v2-monthly-career-events";
import { getPublishedPaperCount } from "./v2-publication-rules";
import { isGraduationPreparationUnlocked } from "./v2-thesis-rules";
import type { GameState, PendingEvent } from "./v2-types";

export const CAREER_PREPARATION_SAN_COST: Record<CareerType, number> = {
  internet: 4,
  stateOwned: 2,
  civilService: 3,
  academic: 2,
};

export function getCareerPreparationFailure(state: GameState, type?: CareerType): string | null {
  if (state.phase !== "playing" || state.ending !== null) return "当前无法准备求职。";
  if (!isGraduationPreparationUnlocked(state)) {
    return state.degree === "master" ? "硕士第三年九月开放求职准备。" : "博士第六年九月开放求职准备。";
  }
  if (type !== undefined && !Object.hasOwn(CAREER_DEFINITIONS, type)) return "未知求职方向。";
  if (type !== undefined ? state.careerPreparedMonths[type] === state.totalMonths
    : state.careerLastPreparedTotalMonths === state.totalMonths) return "本月已安排求职准备，下个月可以继续。";
  if (state.eventQueue.some((event) => event.source === "career")) return "请先处理当前求职准备事件。";
  return null;
}

export function prepareCareer(state: GameState, type: CareerType): GameState {
  if (getCareerPreparationFailure(state, type)) return state;
  const progressGain = calculateCareerProgress(type, CAREER_OPTIONS.find((option) => option.id === "normal")!, {
    research: state.player.research,
    social: state.player.social,
    publishedPaperCount: getPublishedPaperCount(state),
    internshipCount: state.internshipCount,
  });
  const sanCost = CAREER_PREPARATION_SAN_COST[type];
  return pushLog({
    ...state,
    player: { ...state.player, san: state.player.san - sanCost },
    careerProgress: { ...state.careerProgress, [type]: state.careerProgress[type] + progressGain },
    careerPreparedMonths: { ...state.careerPreparedMonths, [type]: state.totalMonths },
  }, `${CAREER_DEFINITIONS[type].name}求职推进：进度 +${progressGain}，SAN -${sanCost}。`);
}

export function refreshCareerPreparation(state: GameState, event: PendingEvent): PendingEvent {
  const preparation = event.careerPreparation;
  if (event.source !== "career" || !preparation
    || preparation.totalMonths !== state.totalMonths || preparation.degree !== state.degree
    || state.careerLastPreparedTotalMonths === preparation.totalMonths) return event;

  let fresh = createCareerEventForType(state, preparation.type);
  if (event.stage === "act2" || event.stage === "act3" || event.stage === "result") {
    fresh = fresh.choices[0]!.effects.enqueueEvents![0]!;
  }
  if (event.stage === "act3" || event.stage === "result") {
    const result = fresh.choices.flatMap((choice) => choice.effects.enqueueEvents ?? [])
      .find((candidate) => candidate.choices[0]?.id === event.choices[0]?.id);
    if (!result) return event;
    fresh = result;
  }

  const merge = (current: PendingEvent, rebuilt: PendingEvent): PendingEvent => ({
    ...current,
    title: rebuilt.title,
    description: rebuilt.description,
    completionLog: rebuilt.completionLog,
    deferredStatePatch: undefined,
    choices: rebuilt.choices.map((choice) => {
      const previous = current.choices.find((entry) => entry.id === choice.id);
      return {
        ...choice,
        effects: {
          ...choice.effects,
          ...(choice.effects.enqueueEvents ? {
            enqueueEvents: choice.effects.enqueueEvents.map((next) => {
              const old = previous?.effects.enqueueEvents?.find((entry) => entry.id === next.id);
              return old ? merge(old, next) : next;
            }),
          } : {}),
        },
      };
    }),
  });
  return merge(event, fresh);
}
