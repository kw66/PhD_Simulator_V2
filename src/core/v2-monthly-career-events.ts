import {
  CAREER_DEFINITIONS,
  CAREER_OPTIONS,
  calculateCareerProgress,
  canTriggerCareerEventsThisMonth,
  getActiveCareerTypes,
  getCareerLevel,
  type CareerType,
} from "./v2-career-rules";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";
import { getPublishedPaperCount } from "./v2-monthly-event-shared";

function createCareerChoices(state: GameState, careerType: CareerType): EventChoice[] {
  const definition = CAREER_DEFINITIONS[careerType];
  const publishedPaperCount = getPublishedPaperCount(state);

  const choices: EventChoice[] = CAREER_OPTIONS.map((option) => {
    const progressGain = calculateCareerProgress(careerType, option, {
      research: state.player.research,
      social: state.player.social,
      publishedPaperCount,
      internshipCount: state.internshipCount,
    });

    return {
      id: option.id,
      label: option.text,
      outcome: progressGain > 0
        ? `${definition.name}进度 +${progressGain}，SAN ${option.sanCost > 0 ? `-${option.sanCost}` : "不变"}。`
        : `这次尝试没有推进 ${definition.name} 进度。`,
      effects: {
        san: -option.sanCost,
        careerType,
        careerProgress: progressGain,
      },
    };
  });

  choices.push({
    id: `abandon-${careerType}`,
    label: `放弃${definition.name}`,
    outcome: `你决定停止推进 ${definition.name} 路线，后续将不再收到这条路线的求职事件。`,
    effects: {
      careerType,
      abandonCareer: true,
    },
  });

  return choices;
}

function createCareerEvent(state: GameState, careerType: CareerType): PendingEvent {
  const definition = CAREER_DEFINITIONS[careerType];
  const progress = state.careerProgress[careerType];
  const level = getCareerLevel(careerType, progress);
  return {
    id: `career-${careerType}-y${state.year}-m${state.month}`,
    title: `${definition.name}求职推进`,
    description: `你正在持续推进${definition.name}路线。当前处于${level.name}阶段，累计进度 ${progress}；继续投入可以尝试把最好 offer 再往上推。`,
    preview: `${definition.name} · ${level.name} · 进度 ${progress}`,
    source: "career",
    blocking: true,
    deadlineMonths: 0,
    chainId: `career-${careerType}`,
    stage: "act1",
    choices: createCareerChoices(state, careerType),
  };
}

export function createCareerEventForType(state: GameState, careerType: CareerType): PendingEvent {
  return createCareerEvent(state, careerType);
}

export function collectCareerEventsForMonth(state: GameState): PendingEvent[] {
  if (!canTriggerCareerEventsThisMonth(state.year, state.degree, state.willTransferPhDYear3, state.isNatureExtensionYear)) {
    return [];
  }

  return getActiveCareerTypes(state.month)
    .filter((careerType) => state.careerAbandoned[careerType] !== true)
    .map((careerType) => createCareerEvent(state, careerType));
}
