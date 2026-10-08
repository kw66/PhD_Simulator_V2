import { getResearchCap } from "./v2-research-cap-system";
import { applyTierResist, formatTierResistedOutcome } from "./v2-sanity-rules";
import type {
  ConferenceCareerState,
  ConferenceEncounterState,
  EventChoice,
  InternshipState,
  LoverState,
  PaperAcceptType,
  PaperTarget,
  RelationshipState,
  ResearchCapacityState,
} from "./v2-types";

export interface ConferencePaperPresentation {
  id: string;
  title: string;
  acceptType: PaperAcceptType;
  citationPromotionMultiplier: number;
}

export interface ConferenceActivityContext {
  id: string;
  conferenceName: string;
  conferenceYear: number;
  city: string;
  country: string;
  paperCount: number;
  grade: PaperTarget;
  paperIds?: string[];
  paperPresentations?: ConferencePaperPresentation[];
}

export function getConferencePaperPresentationResults(context: ConferenceActivityContext): string[] {
  return (context.paperPresentations ?? []).map((paper, index) => {
    const multiplierText = paper.citationPromotionMultiplier === 1
      ? "" : `，会后引用倍率 ×${paper.citationPromotionMultiplier.toFixed(2)}`;
    return `论文${index + 1}：${paper.acceptType} 展示完成${multiplierText}`;
  });
}

export function getConferencePaperPresentationTitles(context: ConferenceActivityContext): string[] {
  return (context.paperPresentations ?? []).map((paper, index) => `论文${index + 1}：《${paper.title}》（${paper.acceptType}）`);
}

export function getConferenceActivityChainId(context: Pick<ConferenceActivityContext, "id">): string {
  return `${context.id}-activity`;
}

export interface ConferenceActivityBuildState {
  research: number;
  social: number;
  researchCapacityState?: ResearchCapacityState;
  relationshipState: RelationshipState;
  conferenceEncounterState: ConferenceEncounterState;
  conferenceCareerState: ConferenceCareerState;
  internshipState: InternshipState;
  loverState?: LoverState;
}

export interface ConferenceActivityOptionDefinition {
  id: string;
  label: string;
  outcome: string;
  resultDescription: string;
  effects: EventChoice["effects"];
}

export function resolveConferenceActivityAttributes(
  option: ConferenceActivityOptionDefinition,
  state: ConferenceActivityBuildState,
  getRoll: () => number = Math.random,
): ConferenceActivityOptionDefinition {
  const effects = { ...option.effects };
  let outcome = option.outcome;
  for (const attribute of ["research", "social"] as const) {
    const rawChange = effects[attribute];
    if (rawChange === undefined) continue;
    const maximum = attribute === "research" && state.researchCapacityState
      ? getResearchCap(state.researchCapacityState) : 20;
    const result = applyTierResist(rawChange, state[attribute], getRoll, maximum);
    const label = attribute === "research" ? "科研" : "社交";
    effects[attribute] = result.effectiveChange;
    outcome = outcome.replace(`${label} ${rawChange >= 0 ? "+" : ""}${rawChange}`,
      formatTierResistedOutcome(label, rawChange, result));
  }
  return { ...option, effects, outcome };
}

export function getConferenceGradeLabel(grade: PaperTarget): string {
  if (grade === "A") return "A 类";
  if (grade === "B") return "B 类";
  return "C 类";
}

export function pickDistinctRandomOptions<T>(options: T[], count: number, getRoll: () => number): T[] {
  const pool = [...options];
  const selected: T[] = [];
  const targetCount = Math.min(count, pool.length);

  while (selected.length < targetCount && pool.length > 0) {
    const rawRoll = getRoll();
    const safeRoll = Number.isFinite(rawRoll) ? Math.min(0.999999, Math.max(0, rawRoll)) : 0;
    const pickIndex = Math.min(pool.length - 1, Math.floor(safeRoll * pool.length));
    selected.push(pool.splice(pickIndex, 1)[0]);
  }

  return selected;
}
