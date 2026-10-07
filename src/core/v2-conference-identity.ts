import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import type { Paper } from "./v2-types";

export function getConferenceTripId(context: { conferenceName: string; conferenceYear: number; city: string }): string {
  return JSON.stringify([context.conferenceName, context.conferenceYear, context.city]);
}

export function getPaperConferenceTripId(
  paper: Pick<Paper, "target" | "submittedMonth" | "submittedYear" | "journalTarget">,
  seed?: number | null,
): string | null {
  if (paper.journalTarget || !paper.target || typeof paper.submittedMonth !== "number" || typeof paper.submittedYear !== "number") return null;
  const conference = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
  const location = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear, seed);
  return getConferenceTripId({ conferenceName: conference.name, conferenceYear: conference.year, city: location.city });
}
