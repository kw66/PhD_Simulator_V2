import type {
  ConferenceCareerState,
  ConferenceEncounterState,
  EventChoice,
  InternshipState,
  LoverState,
  PaperAcceptType,
  PaperTarget,
  RelationshipState,
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
  return (context.paperPresentations ?? []).map((paper) => {
    const increase = Math.round((paper.citationPromotionMultiplier - 1) * 100);
    const increaseText = increase > 0 ? `（+${increase}%）` : "";
    return `《${paper.title}》：${paper.acceptType} 展示，会后引用倍率 ×${paper.citationPromotionMultiplier.toFixed(2)}${increaseText}`;
  });
}

export function getConferenceActivityChainId(context: Pick<ConferenceActivityContext, "id">): string {
  return `${context.id}-activity`;
}

export interface ConferenceActivityBuildState {
  research: number;
  social: number;
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
