import { SCORE_BY_TARGET } from "./v2-content";
import { getJournalDefinition } from "./v2-journal-system";
import type { Degree, FellowProgressProfile, GameState, Paper } from "./v2-types";

export function getFellowAcademicYear(state: Pick<GameState, "year">, profile: FellowProgressProfile): number {
  const joinedYear = Math.floor((Math.max(1, profile.academicStartTotalMonths ?? profile.startTotalMonths) - 1) / 12) + 1;
  return Math.max(0, (profile.academicYear ?? 1) + state.year - joinedYear);
}

export function getFellowAcademicLabel(state: Pick<GameState, "year">, profile: FellowProgressProfile): string {
  return getStudentAcademicLabel(getFellowAcademicYear(state, profile), profile.degree ?? "master");
}

export function getStudentAcademicLabel(year: number, degree: Degree): string {
  if (year === 0) return "大四";
  return `第${["零", "一", "二", "三", "四", "五", "六"][year] ?? year}年${degree === "phd" ? "博士" : "硕士"}`;
}

export function getFellowPublishedPapers(state: Pick<GameState, "papers" | "externalPublications" | "fellowPapers">, profile: FellowProgressProfile): Paper[] {
  return [...new Map([...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .filter((paper) => paper.leadAuthorId === profile.id && paper.status === "published")
    .map((paper) => [paper.id, paper])).values()];
}

export function getFellowResearchScore(state: Pick<GameState, "papers" | "externalPublications" | "fellowPapers">, profile: FellowProgressProfile): number {
  return (profile.initialResearchScore ?? 0) + getFellowPublishedPapers(state, profile).reduce((total, paper) => {
    const journal = paper.journalTarget ?? paper.publication?.journalTarget;
    return total + (journal ? getJournalDefinition(journal).researchScore : paper.target ? SCORE_BY_TARGET[paper.target] : 0);
  }, 0);
}
