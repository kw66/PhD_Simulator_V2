import { createConferenceActivityEvent } from "./v2-conference-activity-events";
import { getConferencePaperPresentationResults } from "./v2-conference-activity-shared";
import { getConferenceTripId } from "./v2-conference-identity";
import { enqueueEventQueueItem } from "./v2-event-queue";
import { pushMilestoneLog } from "./v2-engine-helpers";
import type { ConferenceAttendancePlan, GameState } from "./v2-types";

export function scheduleConferenceAttendance(state: GameState, plan: ConferenceAttendancePlan): GameState {
  const tripId = getConferenceTripId(plan.context);
  const plans = state.conferenceAttendancePlans ?? [];
  if (plans.some((existing) => getConferenceTripId(existing.context) === tripId)) return state;
  return { ...state, conferenceAttendancePlans: [...plans, plan] };
}

export function settleDueConferenceAttendance(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const due = (state.conferenceAttendancePlans ?? []).filter((plan) => (plan.context.availableAtTotalMonths ?? state.totalMonths) <= state.totalMonths);
  if (due.length === 0) return state;
  let nextState: GameState = { ...state, conferenceAttendancePlans: (state.conferenceAttendancePlans ?? []).filter((plan) => !due.includes(plan)) };
  for (const plan of due) {
    const { context } = plan;
    const paperIds = new Set(context.paperIds);
    const markHandled = (papers: GameState["papers"]) => papers.map((paper) => paperIds.has(paper.id)
      ? { ...paper, conferenceHandled: true, conferenceHandledAtTotalMonths: state.totalMonths } : paper);
    nextState = { ...nextState, papers: markHandled(nextState.papers), externalPublications: markHandled(nextState.externalPublications) };
    if (plan.mode === "proxy") {
      nextState = pushMilestoneLog(nextState, `${context.conferenceName}代贴完成：${getConferencePaperPresentationResults(context).join("；")}`, "conference-proxy");
      continue;
    }
    const regionCounter = context.region === "domestic" ? "domesticMeetingCount" : context.region === "asia" ? "asiaMeetingCount" : "westMeetingCount";
    nextState = { ...nextState, eventCounters: { ...nextState.eventCounters,
      meetingCount: nextState.eventCounters.meetingCount + 1,
      [regionCounter]: nextState.eventCounters[regionCounter] + 1,
    } };
    let rollIndex = 0;
    const activity = createConferenceActivityEvent(context, { ...nextState,
      research: nextState.player.research, social: nextState.player.social,
    }, [], () => plan.rolls[rollIndex++] ?? plan.rolls.at(-1) ?? 0);
    nextState = enqueueEventQueueItem(nextState, activity);
  }
  return nextState;
}
