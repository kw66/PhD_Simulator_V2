import {
  buildInternshipInviteContext,
  createInternshipInviteAct1,
} from "./v2-internship-events";
import {
  buildJointTrainingContext,
  createJointTrainingAct1,
} from "./v2-joint-training-events";
import {
  buildLoverDevelopmentContext,
  createLoverDevelopmentAct1,
} from "./v2-lover-events";
import { pushLog } from "./v2-engine-helpers";
import { enqueueEventQueueItem } from "./v2-event-queue";
import {
  shouldEnqueueInternshipInvite,
} from "./v2-internship-system";
import { shouldEnqueueLoverDevelopment } from "./v2-lover-system";
import {
  shouldEnqueueJointTrainingInvite,
} from "./v2-joint-training-system";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export function enqueueResolvedEventFollowUps(
  state: GameState,
  choice: EventChoice,
  resolvedEnqueueEvents: PendingEvent[],
): GameState {
  let nextState = state;

  for (const event of [...resolvedEnqueueEvents, ...(choice.effects.enqueueEvents ?? [])]) {
    nextState = enqueueEventQueueItem(nextState, event);
  }

  if (
    choice.effects.triggerInternshipInvite === true
    && shouldEnqueueInternshipInvite({
      conferenceCareerState: nextState.conferenceCareerState,
      internshipState: nextState.internshipState,
      eventQueue: nextState.eventQueue,
    })
  ) {
    const internshipInviteEvent = createInternshipInviteAct1(buildInternshipInviteContext(nextState));
    nextState = enqueueEventQueueItem(nextState, internshipInviteEvent);
    nextState = pushLog(nextState, `触发事件：${internshipInviteEvent.title}`);
  }

  if (
    choice.effects.triggerJointTrainingInvite === true
    && shouldEnqueueJointTrainingInvite({
      conferenceEncounterState: nextState.conferenceEncounterState,
      eventQueue: nextState.eventQueue,
    })
  ) {
    const jointTrainingEvent = createJointTrainingAct1(buildJointTrainingContext(nextState));
    nextState = enqueueEventQueueItem(nextState, jointTrainingEvent);
    nextState = pushLog(nextState, `触发事件：${jointTrainingEvent.title}`);
  }

  if (choice.effects.triggerLoverDevelopment) {
    const loverType = choice.effects.triggerLoverDevelopment;
    const encounterCount = loverType === "beautiful"
      ? nextState.conferenceEncounterState.beautifulCount
      : nextState.conferenceEncounterState.smartCount;
    const permanentlyBlocked = loverType === "beautiful"
      ? nextState.conferenceEncounterState.permanentlyBlockedBeautifulLover
      : nextState.conferenceEncounterState.permanentlyBlockedSmartLover;
    if (shouldEnqueueLoverDevelopment({
      type: loverType,
      encounterCount,
      permanentlyBlocked,
      loverState: nextState.loverState,
      eventQueue: nextState.eventQueue,
    })) {
      const loverDevelopmentEvent = createLoverDevelopmentAct1(buildLoverDevelopmentContext({
        conferenceEncounterState: nextState.conferenceEncounterState,
        totalMonths: nextState.totalMonths,
        type: loverType,
      }));
      nextState = enqueueEventQueueItem(nextState, loverDevelopmentEvent);
      nextState = pushLog(nextState, `触发事件：${loverDevelopmentEvent.title}`);
    }
  }

  return nextState;
}
