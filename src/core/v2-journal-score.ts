import type { Paper } from "./v2-types";

export type JournalScoreValues = Pick<Paper, "idea" | "experiment" | "writing">;

export function getInitialJournalScore(values: JournalScoreValues): number {
  return values.idea + values.experiment + values.writing;
}

export function getJournalRevisionScore(
  paper: Pick<Paper, "idea" | "experiment" | "writing" | "submittedIdea" | "submittedExperiment" | "submittedWriting">,
): number {
  return getInitialJournalScore(paper);
}
