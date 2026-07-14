import {
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { createCcigEvent, resolveCcigFixedEvent } from "./v2-fixed-events-ccig";
import { createMidtermMessageEvent } from "./v2-fixed-events-midterm";
import { createMentorAssignEvent, resolveMentorAssignCandidate } from "./v2-fixed-events-mentor-assign";
import { createScholarshipEvent } from "./v2-fixed-events-scholarship";
import {
  createSummerVacationEvent,
  createWinterVacationEvent,
  createYearSummaryEvent,
  resolveSeasonalFixedEvent,
} from "./v2-fixed-events-seasonal";
import {
  createAdvisorSelectionAct1Event,
  resolveAdvisorSelection,
} from "./v2-fixed-events-advisor-selection";
import { createTeachersDayEvent, resolveTeachersDayFixedEvent } from "./v2-fixed-events-teachers-day";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

export function applyFixedEventResolution(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider = Math.random,
): FixedResolutionResult {
  switch (resolution.kind) {
    case "advisor-select-tier":
      return resolveAdvisorSelection(state, resolution);
    case "teachers-day-message":
    case "teachers-day-tea":
    case "teachers-day-flower":
    case "teachers-day-stamp":
      return resolveTeachersDayFixedEvent(state, resolution, getRoll);
    case "winter-vacation-rest":
    case "summer-vacation-home":
    case "summer-vacation-research":
    case "summer-vacation-travel":
    case "year-summary-open":
    case "year-summary-sleep":
    case "year-summary-social":
    case "year-summary-favor":
    case "year-summary-intern":
      return resolveSeasonalFixedEvent(state, resolution, getRoll);
    case "ccig-open":
    case "ccig-skip":
    case "ccig-advisor":
    case "ccig-self":
    case "ccig-activity-listen":
    case "ccig-activity-travel":
    case "ccig-activity-food":
      return resolveCcigFixedEvent(state, resolution, getRoll);
    case "mentor-assign-candidate":
      return resolveMentorAssignCandidate(state, resolution);
    default: {
      return {
        nextState: state,
        outcome: "固定事件结算完成。",
      };
    }
  }
}

export function collectFixedEventsForState(
  state: GameState,
  getRoll: RandomRollProvider = Math.random,
): PendingEvent[] {
  const events: PendingEvent[] = [];

  if (state.totalMonths === 0 && state.selectedAdvisorId === null) {
    events.push(createAdvisorSelectionAct1Event(state));
    return events;
  }

  if (state.month === 1) {
    events.push(createTeachersDayEvent(state));
  }
  if (state.month === 2 && state.year >= 2 && !state.isNatureExtensionYear) {
    events.push(createScholarshipEvent(state, getRoll));
  }
  if (state.month === 3 && state.year === 3) {
    events.push(createMidtermMessageEvent(state));
  }
  if (state.month === 3 && state.year === 4) {
    events.push(createMentorAssignEvent(state, getRoll));
  }
  if (state.month === 5) {
    events.push(createWinterVacationEvent(state));
  }
  if (state.month === 9) {
    events.push(createCcigEvent(state));
  }
  if (state.month === 11) {
    events.push(createSummerVacationEvent(state));
    events.push(createYearSummaryEvent(state));
  }

  return events;
}
