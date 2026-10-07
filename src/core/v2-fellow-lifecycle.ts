import { ADVISOR_REQUIREMENTS } from "./v2-content";
import { getFellowAcademicYear, getFellowResearchScore } from "./v2-fellow-academic";
import { getFellowName } from "./v2-fellow-progression";
import { pushMilestoneLog } from "./v2-engine-helpers";
import type { GameState } from "./v2-types";

export function settleFellowAcademicYear(state: GameState): GameState {
  if (state.phase !== "playing" || state.month !== 10) return state;
  let nextState = state;
  for (const original of state.fellowProgressState) {
    const year = getFellowAcademicYear(state, original);
    const score = getFellowResearchScore(state, original);
    const name = getFellowName(original);
    const master = original.degree !== "phd";
    const transferTarget = year === 2 ? ADVISOR_REQUIREMENTS.phdYear2 : ADVISOR_REQUIREMENTS.phdYear3;
    if (master && (year === 2 || year === 3) && score >= transferTarget) {
      nextState = pushMilestoneLog({ ...nextState,
        fellowProgressState: nextState.fellowProgressState.map((profile) => profile.id === original.id
          ? { ...profile, degree: "phd" } : profile),
      }, `${name}转为博士：科研分${score}，达到转博要求${transferTarget}。`, "fellow-transfer");
      continue;
    }
    if (year < (master ? 3 : 6)) continue;
    const target = master ? ADVISOR_REQUIREMENTS.masterGrad : ADVISOR_REQUIREMENTS.phdGrad;
    const graduated = score >= target;
    const countKey = ({ senior: "seniorCount", peer: "peerCount", junior: "juniorCount" } as const)[original.type];
    nextState = pushMilestoneLog({ ...nextState,
      fellowProgressState: nextState.fellowProgressState.filter((profile) => profile.id !== original.id),
      relationshipState: { ...nextState.relationshipState,
        [countKey]: Math.max(0, nextState.relationshipState[countKey] - 1),
        occupiedSlots: Math.max(0, nextState.relationshipState.occupiedSlots - 1) },
      buffs: nextState.buffs.filter((buff) => buff.relationshipId !== original.id),
    }, `${name}${graduated ? `${master ? "硕士" : "博士"}毕业` : "退学"}：科研分${score}/${target}，结束合作，释放人际名额。`,
    graduated ? "fellow-graduation" : "fellow-withdrawal");
  }
  return nextState;
}
