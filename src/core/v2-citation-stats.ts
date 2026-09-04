import { ENROLLMENT_CALENDAR_YEAR } from "./v2-calendar";
import type { Paper } from "./v2-types";

export interface CitationYearPoint {
  year: number;
  citations: number;
}

export interface CitationStats {
  totalCitations: number;
  hIndex: number;
  i10Index: number;
  startYear: number;
  annualCitations: CitationYearPoint[];
}

function normalizeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

export function calculateHIndex(citations: readonly number[]): number {
  return citations
    .map((value) => normalizeCount(value))
    .sort((left, right) => right - left)
    .reduce((hIndex, value, index) => value >= index + 1 ? index + 1 : hIndex, 0);
}

export function getCitationStats(
  papers: readonly Paper[],
  totalCitations: number,
  citationHistoryByYear: Readonly<Record<number, number>>,
  currentCalendarYear: number,
): CitationStats {
  const normalizedCurrentYear = Math.max(ENROLLMENT_CALENDAR_YEAR, Math.floor(currentCalendarYear));
  const normalizedTotal = normalizeCount(totalCitations);
  const paperCitations = papers
    .filter((paper) => paper.status === "published")
    .map((paper) => normalizeCount(paper.publication?.citations));
  const annualCitations: CitationYearPoint[] = [];
  let recordedTotal = 0;

  for (let year = ENROLLMENT_CALENDAR_YEAR; year <= normalizedCurrentYear; year += 1) {
    const citations = normalizeCount(citationHistoryByYear[year]);
    recordedTotal += citations;
    annualCitations.push({ year, citations });
  }

  const unattributedCitations = Math.max(0, normalizedTotal - recordedTotal);
  const currentYearPoint = annualCitations[annualCitations.length - 1];
  if (currentYearPoint) currentYearPoint.citations += unattributedCitations;

  return {
    totalCitations: normalizedTotal,
    hIndex: calculateHIndex(paperCitations),
    i10Index: paperCitations.filter((citations) => citations >= 10).length,
    startYear: ENROLLMENT_CALENDAR_YEAR,
    annualCitations,
  };
}
