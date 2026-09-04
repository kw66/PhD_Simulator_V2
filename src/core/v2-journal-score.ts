import type { Paper } from "./v2-types";

export type JournalScoreValues = Pick<Paper, "idea" | "experiment" | "writing">;

/** The initial journal score represents the novelty accepted at submission. */
export function getInitialJournalScore(values: JournalScoreValues): number {
  if (values.idea <= 0 || values.experiment <= 0 || values.writing <= 0) return 0;
  return Math.floor(3 * Math.cbrt(values.idea * values.experiment * values.writing));
}

/** After submission, each additional score point stacks as revision work. */
export function getJournalRevisionScore(
  paper: Pick<Paper, "idea" | "experiment" | "writing" | "submittedIdea" | "submittedExperiment" | "submittedWriting">,
): number {
  const submitted = {
    idea: paper.submittedIdea ?? paper.idea,
    experiment: paper.submittedExperiment ?? paper.experiment,
    writing: paper.submittedWriting ?? paper.writing,
  };
  const initialScore = getInitialJournalScore(submitted);
  const revisionWork = Math.max(0, paper.idea - submitted.idea)
    + Math.max(0, paper.experiment - submitted.experiment)
    + Math.max(0, paper.writing - submitted.writing);
  return initialScore + revisionWork;
}
