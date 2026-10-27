import { verifyReplayRecording, type ReplayRecording, type ReplayExecutionOptions } from "../core/v2-local-replay";
import { getPlayerAttributeCap } from "../core/v2-player-attributes";
import { getAdvisorRankLabel } from "../core/v2-advisor-progress";
import { getDesignedTalentNodes } from "../core/v2-role-talent-definitions";
import { getRoleTalentLevel } from "../core/v2-role-talent-state";
import { withGameplayRuleset } from "../core/v2-rule-context";
import type { GameState } from "../core/v2-types";

export interface ReplayOutcomes {
  totalCitations: number;
  publications: Record<"A" | "B" | "C" | "nature" | "nmi" | "pami", number>;
  /** Null means no submitted, revealed blind review; zero counts are real results. */
  thesisGrades: Record<"A" | "B" | "C" | "D", number> | null;
  thesisStatus: "not-submitted" | "pending" | "revealed";
  lover: boolean;
  jointTraining: boolean;
  internships: number;
  /** A retained offer, not a claim that the player has started the job. */
  job: string | null;
  fellows: number;
  advisorRank: string | null;
  funding: number;
}

function replayOutcomes(state: GameState): ReplayOutcomes {
  // Match the ending page: include the player's first/coauthored publications,
  // deduplicate retained papers, and give journal identity precedence over A/B/C.
  const published = [...new Map([...state.papers, ...state.externalPublications]
    .filter(paper => paper.status === "published"
      && (paper.nonFirstAuthor === true || !paper.leadAuthorId || paper.leadAuthorId === "player"))
    .map(paper => [paper.id, paper])).values()];
  const publications: ReplayOutcomes["publications"] = { A: 0, B: 0, C: 0, nature: 0, nmi: 0, pami: 0 };
  for (const paper of published) {
    const venue = paper.journalTarget ?? paper.publication?.journalTarget ?? paper.target;
    if (venue) publications[venue]++;
  }
  const review = state.thesis.review;
  const thesisGrades: ReplayOutcomes["thesisGrades"] = review?.submitted && state.thesis.reviewResolved
    ? { A: 0, B: 0, C: 0, D: 0 } : null;
  if (thesisGrades && review) for (const report of review.reports) thesisGrades[report.grade]++;
  const offer = Object.values(state.careerOffers).find(entry => entry !== undefined);
  let job = offer?.name ?? null;
  const academic = offer?.type === "academic"
    ? /^academic-(non-elite|211|985|world)-(lecturer|associate|professor)$/u.exec(offer.jobId) : null;
  if (academic) {
    const school = { "non-elite": "双非高校", "211": "211 高校", "985": "985 高校", world: "世界名校" }[academic[1]!];
    const rank = academic[1] === "world" ? "长聘教授"
      : { lecturer: "讲师", associate: "副教授", professor: "教授" }[academic[2]!];
    job = `${school} · 人工智能学院 · ${rank}`;
  }
  return {
    totalCitations: state.totalCitations, publications, thesisGrades,
    thesisStatus: !review?.submitted ? "not-submitted" : state.thesis.reviewResolved ? "revealed" : "pending",
    lover: state.loverState.active,
    jointTraining: Boolean(state.conferenceEncounterState.jointTrainingReward || state.conferenceEncounterState.bigBullCooperation),
    internships: state.internshipCount, job, fellows: state.fellowProgressState.length,
    advisorRank: state.relationshipState.advisorCount > 0 && state.selectedAdvisorName
      ? getAdvisorRankLabel(state.advisorProgressState) : null,
    funding: state.advisorProgressState.funding,
  };
}

export function deriveReplayResults(state: GameState) {
  const talentNodes = getDesignedTalentNodes(state.selectedRoleId);
  // Use the run's allocation and historical prices, never the account's budget.
  // Special/challenge roles do not spend ordinary talent points.
  const talentPoints = !state.roleTalents || !talentNodes || talentNodes.every(node => node.challenge)
    ? null : talentNodes.reduce((spent, node) => spent + node.cost * getRoleTalentLevel(state, node.id), 0);
  return {
    researchScore: state.totalResearchScore,
    money: state.player.money,
    talentPoints,
    outcomes: replayOutcomes(state),
    attributes: [
      { label: "SAN", value: state.player.san, cap: state.sanCap },
      ...(["research", "social", "favor"] as const).map((stat, index) => ({
        label: ["科研能力", "社交能力", "导师好感"][index]!,
        value: state.player[stat], cap: getPlayerAttributeCap(state, stat),
      })),
    ],
  };
}

export type ReplayResults = ReturnType<typeof deriveReplayResults>;

// Existing local summaries have no outcomes. Leave them absent until that
// recording is imported/saved again and its final state has been verified.
export type ReplayMetrics = Pick<ReplayResults, "money" | "attributes"> & {
  outcomes?: ReplayOutcomes;
  /** Absent in older summaries; null for special roles or unavailable allocations. */
  talentPoints?: number | null;
};

export async function getReplayResults(recording: ReplayRecording, options: ReplayExecutionOptions = {}): Promise<ReplayResults> {
  const state = await verifyReplayRecording(recording, options);
  const finalAction = [...recording.replay.commands].reverse().find(command => command.kind === "action");
  return withGameplayRuleset(finalAction?.kind === "action" && finalAction.ruleset || recording.replay.ruleset,
    () => deriveReplayResults(state));
}
